const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let data = { boards: {}, platforms: {}, cats: {} };
const state = { pf: '', period: 'daily', sub: '', ...JSON.parse(localStorage.getItem('nf-rank') || '{}') };

// 표지를 못 불러오면 빈 표지로 둔다
window.addEventListener('error', (e) => {
  const img = e.target;
  if (img?.tagName === 'IMG' && img.closest('.cover')) img.closest('.cover').classList.add('noimg'), img.remove();
}, true);

const chip = (attr, key, label, on) => `<button class="chip${on ? ' on' : ''}" type="button" data-${attr}="${esc(key)}" aria-pressed="${on}">${esc(label)}</button>`;

// 순위 변동 표시: 숫자면 오르내린 칸 수, 'new' 면 새로 진입
function move(m) {
  if (m === 'new') return '<span class="move new">NEW</span>';
  if (!m) return '<span class="move">–</span>';
  return `<span class="move ${m > 0 ? 'up' : 'down'}" aria-label="${Math.abs(m)}계단 ${m > 0 ? '상승' : '하락'}">${m > 0 ? '▲' : '▼'}${Math.abs(m)}</span>`;
}

function row(n, hasMove) {
  return `<li><a class="rank-item" href="${esc(n.u)}" target="_blank" rel="noopener">
  <span class="rank-no${n.r <= 3 ? ' top' : ''}">${n.r}</span>
  ${hasMove ? move(n.m) : ''}
  <span class="cover${n.img ? '' : ' noimg'}">${n.img ? `<img src="${esc(n.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span>
  <span class="rank-body">
    <strong class="name">${esc(n.t)}</strong>
    <span class="author">${esc([n.a, data.cats[n.c]].filter(Boolean).join(' · '))}</span>
  </span>
</a></li>`;
}

function render() {
  const all = data.boards[state.pf] ?? [];
  // 고른 값이 이 사이트에 없으면 있는 것 중 첫 번째로 맞춘다
  if (!all.some((b) => b.period === state.period)) state.period = all[0]?.period ?? 'daily';
  const inPeriod = all.filter((b) => b.period === state.period);
  const board = inPeriod.find((b) => (b.sub ?? '') === state.sub) ?? inPeriod[0];
  state.sub = board?.sub ?? '';
  localStorage.setItem('nf-rank', JSON.stringify(state));

  $('pfs').innerHTML = Object.keys(data.boards).map((k) => chip('pf', k, data.platforms[k] ?? k, k === state.pf)).join('');
  const periods = [...new Map(all.map((b) => [b.period, b.label])).entries()];
  $('periods').innerHTML = periods.map(([k, label]) => chip('period', k, label, k === state.period)).join('');
  $('subRow').hidden = inPeriod.length < 2;
  $('subs').innerHTML = inPeriod.map((b) => chip('sub', b.sub ?? '', b.sub ?? '', b === board)).join('');

  $('empty').hidden = !!board;
  $('note').hidden = !board?.note;
  $('note').textContent = board?.note ?? '';
  $('src').hidden = !board?.src;
  if (board?.src) $('src').href = board.src;
  if (!board) return ($('list').innerHTML = '', $('count').textContent = '');

  const u = new Date(board.updated);
  $('count').textContent = `${data.platforms[state.pf]} ${board.label}${board.sub ? ' ' + board.sub : ''} · ${board.items.length}편`;
  $('updated').textContent = `${u.getMonth() + 1}월 ${u.getDate()}일 ${String(u.getHours()).padStart(2, '0')}:${String(u.getMinutes()).padStart(2, '0')} 수집`;
  const hasMove = board.items.some((n) => n.m);
  $('list').innerHTML = board.items.map((n) => row(n, hasMove)).join('');
}

async function main() {
  try {
    data = await (await fetch('../data/ranks.json', { cache: 'no-cache' })).json();
  } catch {
    $('empty').hidden = false;
    return;
  }
  if (!data.boards[state.pf]) state.pf = Object.keys(data.boards)[0] ?? '';
  render();
  for (const [id, key] of [['pfs', 'pf'], ['periods', 'period'], ['subs', 'sub']]) {
    $(id).onclick = (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      state[key] = b.dataset[key];
      render();
    };
  }
}

main();
