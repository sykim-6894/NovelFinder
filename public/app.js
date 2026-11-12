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
const facts = (n) => [n.r ? `★ ${n.r.toFixed(1)}` : '', n.e ? `${n.e.toLocaleString('ko-KR')}화` : '', n.f ? '완결' : ''].filter(Boolean).join(' · ');

function card(n) {
  return `<button class="card" type="button" data-id="${esc(n.id)}">
  ${cover(n)}
  <span class="body">
    <span class="genre">${esc(data.cats[n.c] ?? '')}</span>
    <strong class="name">${esc(n.t)}</strong>
    <span class="author">${esc(n.a)}</span>
    <span class="facts">${esc(facts(n))}</span>
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
<p class="desc">${n.d ? esc(n.d) : '<span class="muted">소개글은 연재처에서 확인해 주세요.</span>'}</p>
<div class="linklist">${links(n)}</div>`;
  d.showModal();
  d.querySelector('.close').blur(); // 열자마자 닫기 버튼에 테두리가 생기지 않게
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
