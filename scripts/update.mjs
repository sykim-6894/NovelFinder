// 플랫폼별 인기 순위를 모아 public/data/novels.json 을 만든다. (Node 22+, 의존성 없음)
// 어떤 플랫폼 수집이 실패하면 지난번에 받아 둔 data/raw/<플랫폼>.json 을 그대로 쓴다.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, PLATFORMS, CATS, munpiaDetail, novelpiaDetail } from './sources.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data', 'raw');
const META = join(ROOT, 'data', 'meta.json');
const OUT = join(ROOT, 'public', 'data', 'novels.json');
// 한 번 실행할 때 상세 정보를 새로 받는 최대 건수 (--enrich=숫자 로 바꿀 수 있음)
const ENRICH = +(process.argv.find((a) => a.startsWith('--enrich='))?.split('=')[1] ?? 150);

const readJson = async (f, fallback) => {
  try { return JSON.parse(await readFile(f, 'utf8')); } catch { return fallback; }
};

// 제목 정리: "[독점]", "(연재)", "[단행본]" 같은 꼬리표 제거
const TAG = /\s*[\[(（〈<][^\])）〉>]*(독점|연재|완결|단행본|개정|외전|특별|선공개|합본|세트|e북|이북|전\s*\d+\s*권|\d+\s*세|리마스터|무삭제)[^\])）〉>]*[\])）〉>]/g;
const cleanTitle = (t) => t.replace(TAG, '').replace(/\s+/g, ' ').trim() || t.trim();
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const authorKey = (a) => norm(a.split(/[,/&]/)[0] ?? '');
const sameAuthor = (a, b) => !a || !b || a === b || a.includes(b) || b.includes(a);

const PF_ORDER = Object.keys(PLATFORMS);
const rankScore = (rank) => 100 * Math.exp(-(rank - 1) / 45);

async function collect() {
  await mkdir(RAW, { recursive: true });
  const all = [];
  const status = {};
  for (const pf of PF_ORDER) {
    const file = join(RAW, `${pf}.json`);
    try {
      const list = await SOURCES[pf]();
      if (list.length < 20) throw new Error(`결과가 너무 적음 (${list.length}편)`);
      // 이번에 통째로 빠진 장르는 지난번 수집분을 유지한다 (일시적인 빈 응답 대비)
      const got = new Set(list.map((n) => n.cat));
      const kept = (await readJson(file, [])).filter((n) => !got.has(n.cat));
      if (kept.length) {
        list.push(...kept);
        console.warn(`  ${PLATFORMS[pf]}: 빠진 장르 ${[...new Set(kept.map((n) => n.cat))].join(', ')} — 이전 데이터 ${kept.length}편 유지`);
      }
      await writeFile(file, JSON.stringify(list));
      status[pf] = { ok: true, n: list.length };
      all.push(...list);
      console.log(`✔ ${PLATFORMS[pf]}: ${list.length}편`);
    } catch (e) {
      const old = await readJson(file, []);
      status[pf] = { ok: false, n: old.length };
      all.push(...old);
      console.warn(`✘ ${PLATFORMS[pf]} 실패 (${e.message}) — 이전 데이터 ${old.length}편 사용`);
    }
  }
  return { all, status };
}

function merge(all) {
  const byTitle = new Map();
  for (const e of all) {
    const title = cleanTitle(e.title);
    const tk = norm(title);
    if (!tk) continue;
    const ak = authorKey(e.author ?? '');
    const groups = byTitle.get(tk) ?? byTitle.set(tk, []).get(tk);
    let g = groups.find((x) => sameAuthor(x.ak, ak));
    if (!g) groups.push((g = { title, ak, entries: [] }));
    if (!g.ak) g.ak = ak;
    // 같은 플랫폼에서 여러 순위표에 나온 작품은 순위가 높은 쪽만
    const dup = g.entries.findIndex((x) => x.pf === e.pf);
    if (dup < 0) g.entries.push(e);
    else if (e.rank < g.entries[dup].rank) g.entries[dup] = e;
  }
  return [...byTitle.values()].flat();
}

function build(groups, meta) {
  const novels = [];
  for (const g of groups) {
    const es = g.entries.sort((a, b) => PF_ORDER.indexOf(a.pf) - PF_ORDER.indexOf(b.pf));
    for (const e of es) Object.assign(e, Object.fromEntries(Object.entries(meta[`${e.pf}:${e.id}`] ?? {}).filter(([k, v]) => v != null && v !== '' && e[k] == null || (k === 'desc' && v && !e.desc))));
    const pick = (k) => es.find((e) => e[k] != null && e[k] !== '')?.[k];
    const longest = es.map((e) => e.desc ?? '').sort((a, b) => b.length - a.length)[0];
    const best = Math.max(...es.map((e) => rankScore(e.rank)));
    const rating = pick('rating');
    let score = best * 0.86 + Math.min(es.length - 1, 2) * 5;
    if (rating) score += Math.max(-4, Math.min(4, (rating - 9.2) * 8));
    const p = {};
    for (const e of es) p[e.pf] = { u: e.url, r: e.rank, ...(e.free ? { f: 1 } : {}) };
    const first = es.slice().sort((a, b) => a.rank - b.rank)[0];
    novels.push({
      id: `${first.pf[0]}${first.id}`,
      t: g.title,
      a: pick('author') ?? '',
      c: es[0].cat, // 장르 분류가 세밀한 플랫폼(목록 앞쪽) 기준
      img: pick('img'),
      d: longest ? (longest.length > 260 ? longest.slice(0, 258).trimEnd() + '…' : longest) : undefined,
      s: Math.round(Math.max(1, Math.min(100, score)) * 10) / 10,
      r: rating,
      v: Math.max(0, ...es.map((e) => (e.pf !== 'novelpia' && e.views) || 0)) || undefined,
      e: pick('eps'),
      f: es.some((e) => e.done) ? 1 : undefined,
      p,
    });
  }
  return novels.sort((a, b) => b.s - a.s);
}

// 표지·소개글이 없는 작품(문피아·노벨피아)의 상세 정보를 조금씩 채운다
async function enrich(groups, meta) {
  const need = [];
  for (const g of groups) {
    const hasImg = g.entries.some((e) => e.img || meta[`${e.pf}:${e.id}`]?.img);
    const hasDesc = g.entries.some((e) => e.desc || meta[`${e.pf}:${e.id}`]?.desc);
    if (hasImg && hasDesc) continue;
    const e = g.entries.find((x) => x.pf === 'munpia') ?? g.entries.find((x) => x.pf === 'novelpia');
    if (!e || meta[`${e.pf}:${e.id}`]) continue;
    need.push(e);
  }
  // 표지까지 없는 문피아 작품을 먼저, 그다음 순위가 높은 순으로
  need.sort((a, b) => (a.pf === 'munpia' ? 0 : 1) - (b.pf === 'munpia' ? 0 : 1) || a.rank - b.rank);
  let done = 0;
  for (const e of need.slice(0, ENRICH)) {
    try {
      const d = e.pf === 'munpia' ? await munpiaDetail(e.id) : await novelpiaDetail(e.id);
      meta[`${e.pf}:${e.id}`] = { ...(d ?? {}), ts: Date.now() };
      done++;
    } catch (err) {
      console.warn(`상세 실패 ${e.pf}:${e.id} — ${err.message}`);
    }
  }
  console.log(`상세 정보 ${done}건 추가 (남은 ${Math.max(0, need.length - done)}건은 다음 실행에서)`);
}

async function main() {
  const { all, status } = await collect();
  if (!all.length) throw new Error('수집된 작품이 없습니다');
  const groups = merge(all);
  const meta = await readJson(META, {});
  await enrich(groups, meta);
  await writeFile(META, JSON.stringify(meta));

  const novels = build(groups, meta);
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ updated: Date.now(), platforms: PLATFORMS, cats: CATS, status, novels }));
  const multi = novels.filter((n) => Object.keys(n.p).length > 1).length;
  console.log(`총 ${novels.length}편 (여러 플랫폼 연재 ${multi}편) → public/data/novels.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
