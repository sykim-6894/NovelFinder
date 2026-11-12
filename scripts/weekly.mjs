// 주간 추천: 매주 월요일(KST) 기준으로 서로 다른 장르의 작품 3편을 골라
// public/weekly/<날짜>.html 글과 목록(index.html), posts.json 을 만든다.
// 그 주의 글이 이미 있으면 건너뛴다. 다시 만들려면 --force
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'public', 'weekly');
const POSTS = join(DIR, 'posts.json');
const force = process.argv.includes('--force');
const COUNT = 3;
const SKIP_WEEKS = 12; // 최근 12주 안에 소개한 작품은 다시 고르지 않는다

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (n) => (n >= 1e8 ? (n / 1e8).toFixed(1).replace(/\.0$/, '') + '억' : n >= 1e4 ? Math.round(n / 1e4) + '만' : n.toLocaleString('ko-KR'));

function weekMonday() {
  const kst = new Date(Date.now() + 9 * 3600e3);
  kst.setUTCDate(kst.getUTCDate() - ((kst.getUTCDay() + 6) % 7));
  return kst;
}

// 날짜를 씨앗으로 쓰는 난수 — 같은 주에는 항상 같은 결과가 나온다
function seeded(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function choose(novels, posts, date) {
  const rand = seeded(date);
  const recent = new Set(posts.slice(0, SKIP_WEEKS).flatMap((p) => p.picks.map((n) => n.id)));
  const recentTitles = new Set(posts.slice(0, SKIP_WEEKS).flatMap((p) => p.picks.map((n) => n.t)));
  const lastCats = new Set(posts[0]?.picks.map((n) => n.c) ?? []);
  const cands = novels
    .filter((n) => n.img && (n.d?.length ?? 0) >= 40 && !recent.has(n.id) && !recentTitles.has(n.t))
    .map((n) => ({ n, v: n.s + rand() * 22 - (lastCats.has(n.c) ? 7 : 0) }))
    .sort((a, b) => b.v - a.v);
  const picks = [];
  const used = new Set();
  for (const { n } of cands) {
    if (used.has(n.c)) continue; // 장르가 겹치지 않게
    picks.push(n);
    used.add(n.c);
    if (picks.length === COUNT) break;
  }
  return picks;
}

// 추천 근거 한 줄: 어디서 몇 위인지, 평점, 화수, 다른 연재처
function why(n, data) {
  const { platforms, cats } = data;
  const [bestPf, best] = Object.entries(n.p).sort((a, b) => a[1].r - b[1].r)[0];
  const place = bestPf === 'munpia'
    ? `문피아 ${best.f ? '무료' : '유료'} 베스트 ${best.r}위`
    : `${platforms[bestPf]} ${cats[n.c] === '그 외 장르' ? '' : cats[n.c] + ' '}${best.r}위`;
  const bits = [place];
  if (n.r) bits.push(`평점 ${n.r.toFixed(1)}`);
  if (n.e) bits.push(n.f ? `${n.e.toLocaleString('ko-KR')}화 완결` : `${n.e.toLocaleString('ko-KR')}화 연재 중`);
  else if (n.v) bits.push(`조회 ${num(n.v)}`);
  const others = Object.keys(n.p).filter((k) => k !== bestPf).map((k) => platforms[k]);
  if (others.length) bits.push(`${others.join('·')}에서도 연재`);
  return bits.join(' · ');
}

const novelHtml = (n, i, data) => `      <section class="post-novel">
        ${coverHtml(n)}
        <div>
          <div class="pick-no">${i + 1}</div>
          <h2>${esc(n.t)}</h2>
          <p class="author">${esc([n.a, data.cats[n.c]].filter(Boolean).join(' · '))}</p>
          <p class="facts">${esc(n.why)}</p>
          <p class="synopsis">${esc(n.d)}</p>
          <div class="linklist">${Object.entries(n.p).map(([k, v], j) => `<a class="btn${j ? ' ghost' : ''}" href="${esc(v.u)}" target="_blank" rel="noopener">${esc(data.platforms[k])}에서 보기</a>`).join('')}</div>
        </div>
      </section>`;

const postBody = ({ date, title, picks }, data) => `    <article>
      <h1>${esc(title)}</h1>
      <p class="post-meta">${date} 주 · 매주 월요일에 새 글</p>
      <p>네 플랫폼의 장르별 순위와 평점을 바탕으로, 장르가 겹치지 않게 ${COUNT}편을 골랐습니다. 최근 ${SKIP_WEEKS}주 안에 소개한 작품은 뺐습니다.</p>
${picks.map((n, i) => novelHtml(n, i, data)).join('\n')}
    </article>
    <p><a class="btn ghost" href="./">지난 주간 추천</a> <a class="btn ghost" href="../">전체 작품에서 찾기</a></p>`;

const coverHtml = (n) => `<div class="cover${n.img ? '' : ' noimg'}" data-t="${esc(n.t)}">${n.img ? `<img src="${esc(n.img)}" alt="${esc(n.t)} 표지" loading="lazy" referrerpolicy="no-referrer">` : ''}</div>`;

const page = ({ title, desc, body }) => `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} — NovelFinder</title>
  <meta name="description" content="${esc(desc)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:type" content="article">
  <meta name="referrer" content="no-referrer">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%231f1b16'/><text x='16' y='23' font-family='Georgia,serif' font-size='20' text-anchor='middle' fill='%23f7f4ee'>N</text></svg>">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500&display=swap">
  <link rel="stylesheet" href="../style.css">
</head>
<body>
  <header class="top">
    <div class="wrap top-row">
      <a class="brand" href="../">NovelFinder</a>
      <nav class="tabs"><a href="../">추천 목록</a><a href="../rank/">인기순위</a><a class="on" href="./">주간 추천</a></nav>
    </div>
  </header>
  <main class="wrap post">
${body}
  </main>
  <footer class="wrap foot">
    <p>순위·평점·화수는 글 작성 시점 기준입니다. 표지와 소개글의 권리는 각 작가·플랫폼에 있습니다.</p>
  </footer>
</body>
</html>
`;

async function main() {
  const data = JSON.parse(await readFile(join(ROOT, 'public', 'data', 'novels.json'), 'utf8'));
  let posts = [];
  try { posts = JSON.parse(await readFile(POSTS, 'utf8')); } catch {}

  const monday = weekMonday();
  const date = monday.toISOString().slice(0, 10);
  const exists = posts.some((p) => p.date === date);
  if (exists && force) posts = posts.filter((p) => p.date !== date);

  if (!exists || force) {
    const picks = choose(data.novels, posts, date);
    if (picks.length < COUNT) throw new Error(`추천할 작품이 부족합니다 (${picks.length}편)`);
    const label = `${monday.getUTCFullYear()}년 ${monday.getUTCMonth() + 1}월 ${Math.ceil(monday.getUTCDate() / 7)}주차`;
    const title = `${label} 웹소설 추천 ${COUNT}편`;
    const desc = `${picks.map((n) => `${n.t}(${data.cats[n.c]})`).join(', ')} — 이번 주에 읽어 볼 만한 웹소설.`;
    posts.unshift({ date, label, title, desc, picks });
    console.log(`주간 추천 생성: weekly/${date}.html — ${picks.map((n) => n.t).join(' / ')}`);
  } else {
    console.log(`주간 추천 ${date} 이미 있음 — 지난 글만 다시 그림`);
  }

  // 글 모양이 바뀌어도 지난 글이 같은 모양이 되도록 매번 모든 글을 다시 그린다
  // (작품 선정과 순위·평점은 글을 쓴 시점 그대로 둔다)
  for (const p of posts) p.picks = p.picks.map((n) => ({ ...n, why: why(n, data) }));
  await mkdir(DIR, { recursive: true });
  for (const p of posts) await writeFile(join(DIR, `${p.date}.html`), page({ title: p.title, desc: p.desc, body: postBody(p, data) }));
  await writeFile(POSTS, JSON.stringify(posts, null, 1));

  const list = posts
    .map((p) => `      <a class="post-item" href="${p.date}.html"><div class="covers">${p.picks.map(coverHtml).join('')}</div><span><strong>${esc(p.title)}</strong><small>${esc(p.picks.map((n) => n.t).join(' · '))}</small></span></a>`)
    .join('\n');
  await writeFile(
    join(DIR, 'index.html'),
    page({
      title: '주간 웹소설 추천',
      desc: '매주 월요일, 장르가 다른 웹소설 3편을 골라 소개합니다.',
      body: `    <h1>주간 추천</h1>\n    <p class="muted">매주 월요일, 장르가 다른 웹소설 ${COUNT}편을 골라 소개합니다.</p>\n    <div class="post-list">\n${list}\n    </div>`,
    }),
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
