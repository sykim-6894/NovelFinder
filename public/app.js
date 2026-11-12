const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (n) => (n >= 1e8 ? (n / 1e8).toFixed(1).replace(/\.0$/, '') + '억' : n >= 1e4 ? Math.round(n / 1e4) + '만' : n.toLocaleString('ko-KR'));
const PAGE = 48;

let data = { novels: [], platforms: {}, cats: {} };
const saved = JSON.parse(localStorage.getItem('nf-filter') || '{}');
const state = { cat: saved.cat || '', pfs: new Set(saved.pfs || []), sort: saved.sort || 's', done: !!saved.done, q: '', shown: PAGE };

const save = () => localStorage.setItem('nf-filter', JSON.stringify({ cat: state.cat, pfs: [...state.pfs], sort: state.sort, done: state.done }));

// 표지를 못 불러오면 제목이 적힌 대체 표지를 보여 준다
window.addEventListener('error', (e) => {
  const img = e.target;
  if (img?.tagName === 'IMG' && img.closest('.cover')) img.closest('.cover').classList.add('noimg'), img.remove();
}, true);

const cover = (n) => `<div class="cover${n.img ? '' : ' noimg'}" data-t="${esc(n.t)}">${n.img ? `<img src="${esc(n.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</div>`;
const pfNames = (n) => Object.keys(n.p).map((k) => esc(data.platforms[k] ?? k)).join(' · ');
// 최근 7일 장르 순위 변동: ▲오른 칸 수, 또는 새로 진입
const trendTag = (n) => (n.m ? `<span class="move up">▲${n.m}</span>` : n.nw ? '<span class="move new">새 진입</span>' : '');
const fmtDate = (d) => `${+d.slice(5, 7)}월 ${+d.slice(8, 10)}일`;
const facts = (n) => [n.r ? `★ ${n.r.toFixed(1)}` : '', n.e ? `${n.e.toLocaleString('ko-KR')}화` : '', n.f ? '완결' : ''].filter(Boolean).join(' · ');

function card(n) {
  return `<button class="card" type="button" data-id="${esc(n.id)}">
  ${cover(n)}
  <span class="body">
    <span class="genre">${esc(data.cats[n.c] ?? '')}</span>
    <strong class="name">${esc(n.t)}</strong>
    <span class="author">${esc(n.a)}</span>
    <span class="facts">${esc(facts(n))} ${trendTag(n)}</span>
    <span class="pfs">${pfNames(n)}</span>
  </span>
</button>`;
}

function filtered() {
  const q = state.q.trim().toLowerCase().replace(/\s+/g, '');
  const list = data.novels.filter((n) => {
    if (state.cat && n.c !== state.cat) return false;
    if (state.pfs.size && ![...state.pfs].some((k) => n.p[k])) return false;
    if (state.done && !n.f) return false;
    if (q && !(n.t + n.a).toLowerCase().replace(/\s+/g, '').includes(q)) return false;
    return true;
  });
  // 플랫폼을 골랐으면 그 플랫폼 안에서의 순위를 우선한다
  const pfRank = (n) => Math.min(...[...state.pfs].map((k) => n.p[k]?.r ?? 999));
  if (state.sort === 'r') list.sort((a, b) => (b.r ?? 0) - (a.r ?? 0) || b.s - a.s);
  else if (state.sort === 'm') list.sort((a, b) => (b.ms ?? (b.nw ? 0 : -1)) - (a.ms ?? (a.nw ? 0 : -1)) || b.s - a.s);
  else if (state.sort === 'e') list.sort((a, b) => (b.e ?? 0) - (a.e ?? 0) || b.s - a.s);
  else if (state.pfs.size === 1) list.sort((a, b) => pfRank(a) - pfRank(b) || b.s - a.s);
  else list.sort((a, b) => b.s - a.s);
  return list;
}

function render() {
  const list = filtered();
  $('count').textContent = `${list.length.toLocaleString('ko-KR')}편`;
  $('grid').innerHTML = list.slice(0, state.shown).map(card).join('');
  $('empty').hidden = list.length > 0;
  $('more').hidden = list.length <= state.shown;
}

function chips() {
  const counts = {};
  for (const n of data.novels) counts[n.c] = (counts[n.c] || 0) + 1;
  $('cats').innerHTML = [['', '전체'], ...Object.entries(data.cats).filter(([k]) => counts[k])]
    .map(([k, v]) => `<button class="chip${state.cat === k ? ' on' : ''}" type="button" data-cat="${k}" aria-pressed="${state.cat === k}">${esc(v)}</button>`)
    .join('');
  $('pfs').innerHTML = Object.entries(data.platforms)
    .map(([k, v]) => `<button class="chip${state.pfs.has(k) ? ' on' : ''}" type="button" data-pf="${k}" aria-pressed="${state.pfs.has(k)}">${esc(v)}</button>`)
    .join('');
}

function links(n) {
  return Object.entries(n.p)
    .map(([k, v], i) => `<a class="btn pfbtn${i ? ' ghost' : ''}" href="${esc(v.u)}" target="_blank" rel="noopener">${esc(data.platforms[k] ?? k)}에서 보기<small>${v.f ? '무료 ' : ''}${v.r}위</small></a>`)
    .join('');
}

function open(n) {
  const d = $('detail');
  d.innerHTML = `<button class="close" type="button" aria-label="닫기">✕</button>
<div class="detail-head">
  ${cover(n)}
  <div>
    <span class="genre">${esc(data.cats[n.c] ?? '')}</span>
    <h2>${esc(n.t)}</h2>
    <p class="author">${esc(n.a)}</p>
    <p class="facts">${esc([facts(n), n.v ? `조회 ${num(n.v)}` : ''].filter(Boolean).join(' · '))}</p>
    <p class="pfs">${pfNames(n)}</p>
  </div>
</div>
${n.why ? `<p class="why">${esc(n.why)}</p>` : ''}
<div class="trend" id="trend"></div>
<p class="desc">${n.d ? esc(n.d) : '<span class="muted">소개글은 연재처에서 확인해 주세요.</span>'}</p>
<div class="linklist">${links(n)}</div>`;
  d.showModal();
  d.querySelector('.close').blur(); // 열자마자 닫기 버튼에 테두리가 생기지 않게
  // 주간 추천 글에 담긴 작품은 지난 시점 정보라, 지금 목록의 같은 작품으로 그래프를 그린다
  const cur = data.novels.find((x) => x.id === n.id) ?? n;
  loadHistory().then((h) => { if (h && $('detail').open && $('trend')) $('trend').outerHTML = trendChart(cur, h); });
}

let historyReq;
const loadHistory = () => (historyReq ??= fetch('data/history.json', { cache: 'no-cache' }).then((r) => r.json()).catch(() => null));

// 순위 추이 그래프. 위로 갈수록 높은 순위, 연재처마다 선 하나
function trendChart(n, h) {
  const series = Object.entries(n.p)
    .map(([pf, v]) => ({ pf, now: v.r, s: v.i && h.r[`${pf}:${v.i}`] }))
    .filter((x) => x.s?.some(Boolean))
    .sort((a, b) => a.now - b.now);
  if (!series.length) return '';
  const head = n.m && data.trend
    ? `${fmtDate(data.trend.from)}보다 ${n.m}계단 올랐습니다`
    : n.nw ? '최근 일주일 사이 새로 순위에 올랐습니다' : '';
  const days = h.dates.length;
  const points = series.reduce((a, x) => a + x.s.filter(Boolean).length, 0);
  if (days < 2 || points <= series.length) {
    return `<div class="trend"><p class="trend-head">순위 추이<span>기록을 모으는 중입니다. 며칠 뒤부터 그래프가 보입니다</span></p></div>`;
  }
  const W = 560, H = 132, L = 36, R = 104, T = 12, B = 24;
  const max = Math.max(10, ...series.flatMap((x) => x.s.filter(Boolean)));
  const X = (i) => L + (i / (days - 1)) * (W - L - R);
  const Y = (r) => T + ((r - 1) / (max - 1)) * (H - T - B);
  const lines = series.map((x, si) => {
    const color = si ? 'var(--muted)' : 'var(--text)';
    let path = '';
    x.s.forEach((r, i) => { if (r) path += `${path && x.s[i - 1] ? 'L' : 'M'}${X(i).toFixed(1)},${Y(r).toFixed(1)}`; });
    const dots = x.s.map((r, i) => (r ? `<circle cx="${X(i).toFixed(1)}" cy="${Y(r).toFixed(1)}" r="2.5" fill="${color}"/>` : '')).join('');
    const li = x.s.findLastIndex(Boolean);
    const label = `<text x="${(X(li) + 8).toFixed(1)}" y="${(Y(x.s[li]) + 4).toFixed(1)}" fill="${color}">${esc(data.platforms[x.pf])} ${x.s[li]}위</text>`;
    return `<path d="${path}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>${dots}${label}`;
  }).join('');
  const grid = [1, max].map((r) => `<line x1="${L}" x2="${W - R}" y1="${Y(r)}" y2="${Y(r)}" stroke="var(--line)"/><text x="${L - 8}" y="${Y(r) + 4}" text-anchor="end">${r}위</text>`).join('');
  const dates = [0, days - 1].map((i) => `<text x="${X(i)}" y="${H - 4}" text-anchor="${i ? 'end' : 'start'}">${+h.dates[i].slice(5, 7)}/${+h.dates[i].slice(8, 10)}</text>`).join('');
  return `<div class="trend"><p class="trend-head">순位 추이<span>${head ? esc(head) + ' · ' : ''}장르 순위, 최근 ${days}일</span></p>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 ${days}일 순위 추이">${grid}${dates}${lines}</svg></div>`;
}

// 홈: 최근 일주일 사이 장르 순위가 많이 오른 작품
function rising() {
  const list = data.novels.filter((n) => n.m).sort((a, b) => b.ms - a.ms || a.s - b.s).slice(0, 10);
  if (!data.trend || list.length < 4) return;
  $('risingLabel').textContent = `${fmtDate(data.trend.from)}보다 장르 순위가 많이 오른 작품`;
  $('risingList').innerHTML = list.map((n, i) => {
    const [pf, v] = Object.entries(n.p).sort((a, b) => a[1].r - b[1].r)[0];
    return `<li><button class="rank-item" type="button" data-id="${esc(n.id)}">
  <span class="rank-no">${i + 1}</span>
  <span class="move up">▲${n.m}</span>
  <span class="cover${n.img ? '' : ' noimg'}">${n.img ? `<img src="${esc(n.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span>
  <span class="rank-body">
    <strong class="name">${esc(n.t)}</strong>
    <span class="author">${esc([data.cats[n.c], `${data.platforms[pf]} ${v.r}위`].filter(Boolean).join(' · '))}</span>
  </span>
</button></li>`;
  }).join('');
  $('risingList').onclick = (e) => {
    const b = e.target.closest('[data-id]');
    const n = b && data.novels.find((x) => x.id === b.dataset.id);
    if (n) open(n);
  };
  $('rising').hidden = false;
}

async function weekly() {
  let posts;
  try { posts = await (await fetch('weekly/posts.json', { cache: 'no-cache' })).json(); } catch { return; }
  const post = posts?.[0];
  if (!post?.picks?.length) return;
  $('weeklyLabel').textContent = post.label;
  $('weeklyLink').href = `weekly/${post.date}.html`;
  $('picks').innerHTML = post.picks
    .map((n, i) => `<button class="pick" type="button" data-pick="${i}">
  ${cover(n)}
  <span class="body">
    <span class="pick-no">${i + 1}</span>
    <strong class="name">${esc(n.t)}</strong>
    <span class="author">${esc([n.a, data.cats[n.c]].filter(Boolean).join(' · '))}</span>
    <span class="synopsis">${esc(n.d ?? '')}</span>
  </span>
</button>`)
    .join('');
  $('picks').onclick = (e) => {
    const b = e.target.closest('[data-pick]');
    if (b) open(post.picks[+b.dataset.pick]);
  };
  $('weekly').hidden = false;
}

async function main() {
  try {
    data = await (await fetch('data/novels.json', { cache: 'no-cache' })).json();
  } catch {
    $('empty').hidden = false;
    $('empty').textContent = '데이터를 불러오지 못했습니다. 잠시 후 새로 고침해 주세요.';
    return;
  }
  for (const k of [...state.pfs]) if (!data.platforms[k]) state.pfs.delete(k);
  if (state.cat && !data.cats[state.cat]) state.cat = '';
  const u = new Date(data.updated);
  $('updated').textContent = `${u.getMonth() + 1}월 ${u.getDate()}일 갱신`;
  $('sort').value = state.sort;
  $('done').checked = state.done;
  chips();
  render();
  weekly();
  rising();

  const reset = () => { state.shown = PAGE; save(); chips(); render(); };
  $('cats').onclick = (e) => { const b = e.target.closest('[data-cat]'); if (b) { state.cat = b.dataset.cat; reset(); } };
  $('pfs').onclick = (e) => {
    const b = e.target.closest('[data-pf]');
    if (!b) return;
    state.pfs.has(b.dataset.pf) ? state.pfs.delete(b.dataset.pf) : state.pfs.add(b.dataset.pf);
    reset();
  };
  $('sort').onchange = (e) => { state.sort = e.target.value; reset(); };
  $('done').onchange = (e) => { state.done = e.target.checked; reset(); };
  $('q').oninput = (e) => { state.q = e.target.value; state.shown = PAGE; render(); };
  $('more').onclick = () => { state.shown += PAGE; render(); };
  $('grid').onclick = (e) => {
    const b = e.target.closest('[data-id]');
    const n = b && data.novels.find((x) => x.id === b.dataset.id);
    if (n) open(n);
  };
  $('detail').onclick = (e) => { if (e.target === $('detail') || e.target.closest('.close')) $('detail').close(); };
}

main();
