// 사이트별 인기순위(일간·주간)를 모아 public/data/ranks.json 을 만든다. (Node 22+, 의존성 없음)
// 어떤 순위표 수집이 실패하면 지난번에 받아 둔 내용을 그대로 둔다.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLATFORMS, CATS, cleanTitle, naverPage, kakaoPage, munpiaPage, munpiaDetail, novelpiaPage, novelpiaWeekly } from './sources.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data', 'ranks.json');
const TOP = 100;

const readJson = async (f, fallback) => {
  try { return JSON.parse(await readFile(f, 'utf8')); } catch { return fallback; }
};

async function naverBoard(type) {
  const out = [];
  for (let page = 1; page <= 5; page++) {
    const { list, more } = await naverPage(type, 'ALL', page);
    out.push(...list);
    if (!more) break;
  }
  return out;
}
async function kakaoBoard(type) {
  const out = [];
  for (let page = 0; page < 2; page++) {
    const { list, more } = await kakaoPage(type, 0, page);
    out.push(...list);
    if (!more) break;
  }
  return out;
}

// period: 화면의 기간 탭(daily | weekly), label: 그 탭에 적을 이름, sub: 같은 기간 안에서 나뉘는 순위표 이름
const BOARDS = {
  naver: [
    { key: 'daily', period: 'daily', label: '일간', src: 'https://series.naver.com/novel/top100List.series?rankingTypeCode=DAILY&categoryCode=ALL', load: () => naverBoard('DAILY') },
    { key: 'weekly', period: 'weekly', label: '주간', src: 'https://series.naver.com/novel/top100List.series?rankingTypeCode=WEEKLY&categoryCode=ALL', load: () => naverBoard('WEEKLY') },
  ],
  kakao: [
    { key: 'daily', period: 'daily', label: '일간', src: 'https://page.kakao.com/menu/10011/screen/94', load: () => kakaoBoard('daily') },
    { key: 'weekly', period: 'weekly', label: '주간', src: 'https://page.kakao.com/menu/10011/screen/94', load: () => kakaoBoard('weekly') },
  ],
  munpia: [
    { key: 'daily-paid', period: 'daily', label: '일간', sub: '유료', src: 'https://www.munpia.com/best/plsa.eachtoday', load: () => munpiaPage('plsa.eachtoday') },
    { key: 'daily-free', period: 'daily', label: '일간', sub: '무료', src: 'https://www.munpia.com/best/today', load: () => munpiaPage('today') },
    { key: 'weekly-paid', period: 'weekly', label: '주간', sub: '유료', src: 'https://www.munpia.com/best/plsa.weekly', load: () => munpiaPage('plsa.weekly') },
  ],
  novelpia: [
    { key: 'realtime', period: 'daily', label: '실시간', note: '노벨피아는 일간 순위 대신 실시간 순위를 제공합니다.', src: 'https://novelpia.com/top100/all/today/view/all/all', load: () => novelpiaPage() },
    { key: 'weekly', period: 'weekly', label: '주간', src: 'https://novelpia.com/novel_ranking', load: novelpiaWeekly },
  ],
};

async function main() {
  const prev = await readJson(OUT, { boards: {} });
  // 표지·장르가 목록에 없는 작품은 추천 목록 쪽에서 받아 둔 정보로 채운다
  const META = join(ROOT, 'data', 'meta.json');
  const meta = await readJson(META, {});
  let fetched = 0;
  const known = {};
  for (const pf of Object.keys(PLATFORMS)) {
    for (const n of await readJson(join(ROOT, 'data', 'raw', `${pf}.json`), [])) known[`${pf}:${n.id}`] = n;
  }

  const boards = {};
  for (const [pf, defs] of Object.entries(BOARDS)) {
    boards[pf] = [];
    for (const { load, ...def } of defs) {
      const old = prev.boards?.[pf]?.find((b) => b.key === def.key);
      try {
        const list = await load();
        if (list.length < 10) throw new Error(`결과가 너무 적음 (${list.length}편)`);
        // 문피아 목록에는 표지가 없는 작품이 많아 상세 정보에서 받아 둔다 (한 번 실행에 최대 80건)
        for (const n of pf === 'munpia' ? list.slice(0, TOP) : []) {
          const id = `munpia:${n.id}`;
          if (n.img || meta[id] || fetched >= 80) continue;
          fetched++;
          try { meta[id] = { ...((await munpiaDetail(n.id)) ?? {}), ts: Date.now() }; } catch {}
        }
        const items = list.slice(0, TOP).map((n, i) => {
          const k = known[`${pf}:${n.id}`];
          return {
            r: n.rank || i + 1,
            t: cleanTitle(n.title),
            a: n.author || undefined,
            c: n.cat ?? k?.cat,
            img: n.img ?? k?.img ?? meta[`${pf}:${n.id}`]?.img,
            u: n.url,
            m: n.move,
          };
        });
        boards[pf].push({ ...def, updated: Date.now(), items });
        console.log(`✔ ${PLATFORMS[pf]} ${def.label}${def.sub ? ' ' + def.sub : ''}: ${items.length}편`);
      } catch (e) {
        if (old) boards[pf].push({ ...def, updated: old.updated, items: old.items });
        console.warn(`✘ ${PLATFORMS[pf]} ${def.label}${def.sub ? ' ' + def.sub : ''} 실패 (${e.message}) — ${old ? '이전 순위 유지' : '건너뜀'}`);
      }
    }
    if (!boards[pf].length) delete boards[pf];
  }
  if (!Object.keys(boards).length) throw new Error('수집된 순위가 없습니다');

  if (fetched) await writeFile(META, JSON.stringify(meta));
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ updated: Date.now(), platforms: PLATFORMS, cats: CATS, boards }));
  console.log('→ public/data/ranks.json');
}

main().catch((e) => { console.error(e); process.exit(1); });
