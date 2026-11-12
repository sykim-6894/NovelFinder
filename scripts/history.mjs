// 날짜별 순위 기록. data/history/<날짜>.json 에 { "플랫폼:작품ID": 장르 순위 } 를 하루 하나씩 저장한다.
// 하루 파일로 나눠 두면 매일 커밋되는 변경이 그날 파일 하나뿐이라 저장소가 덜 불어난다.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const HIST = join(ROOT, 'data', 'history');
const PUBLIC = join(ROOT, 'public', 'data', 'history.json');
const KEEP_PUBLIC = 30; // 화면 그래프에 쓰는 최근 일수
const TREND_DAYS = 7;   // 급상승을 계산할 때 비교하는 기간

export const kstDate = (ts = Date.now()) => new Date(ts + 9 * 3600e3).toISOString().slice(0, 10);
const addDays = (date, n) => new Date(Date.parse(date) + n * 86400e3).toISOString().slice(0, 10);

// 수집 결과 → 하루치 기록. 같은 작품이 여러 순위표에 있으면 높은 순위만
export function snapshot(entries) {
  const out = {};
  for (const e of entries) {
    const k = `${e.pf}:${e.id}`;
    if (e.rank && (!out[k] || e.rank < out[k])) out[k] = e.rank;
  }
  return out;
}

export async function saveDay(date, snap) {
  await mkdir(HIST, { recursive: true });
  // 키 순서를 고정해 두면 다시 실행해도 내용이 같을 때 파일이 바뀌지 않는다
  const sorted = Object.fromEntries(Object.entries(snap).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  await writeFile(join(HIST, `${date}.json`), JSON.stringify(sorted));
}

export async function loadDays(limit = KEEP_PUBLIC) {
  let files = [];
  try { files = (await readdir(HIST)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort(); } catch {}
  const days = [];
  for (const f of files.slice(-limit)) {
    try { days.push({ date: f.slice(0, 10), r: JSON.parse(await readFile(join(HIST, f), 'utf8')) }); } catch {}
  }
  return days;
}

const keysOf = (n) => Object.entries(n.p).map(([pf, v]) => `${pf}:${v.i}`);

// 최근 7일 안의 가장 오래된 기록과 오늘을 비교해 작품마다 순위 변동(m)과 새로 진입(nw)을 붙인다
export function addTrend(novels, days, today) {
  const todayRec = days.find((d) => d.date === today);
  const prior = days.filter((d) => d.date < today && d.date >= addDays(today, -TREND_DAYS));
  if (!todayRec || !prior.length) return null;
  const base = prior[0];
  // 그날 수집된 플랫폼만 비교한다 (수집 실패한 날의 플랫폼까지 '새로 진입'으로 보지 않게)
  const covered = (d) => new Set(Object.keys(d.r).map((k) => k.split(':')[0]));
  const baseCovered = covered(base);
  const allCovered = prior.map(covered);
  for (const n of novels) {
    let best = null;
    let fresh = true;
    let comparable = false;
    for (const k of keysOf(n)) {
      const pf = k.split(':')[0];
      const now = todayRec.r[k];
      if (!now) continue;
      if (allCovered.every((s) => s.has(pf))) comparable = true;
      if (prior.some((d) => d.r[k])) fresh = false;
      const was = baseCovered.has(pf) ? base.r[k] : undefined;
      if (!was) continue;
      const score = Math.log(was / now); // 90→45위와 10→5위를 비슷하게 본다
      if (!best || score > best.score) best = { delta: was - now, score };
    }
    if (best && best.delta >= 3) Object.assign(n, { m: best.delta, ms: Math.round(best.score * 100) / 100 });
    if (fresh && comparable) n.nw = 1;
  }
  return { from: base.date, to: today };
}

// 상세 창 그래프용: 지금 목록에 있는 작품만, 최근 30일치
export async function writePublic(novels, days) {
  const keys = new Set(novels.flatMap(keysOf));
  const r = {};
  for (const k of keys) {
    const series = days.map((d) => d.r[k] ?? 0);
    if (series.filter(Boolean).length) r[k] = series;
  }
  await writeFile(PUBLIC, JSON.stringify({ dates: days.map((d) => d.date), r }));
}
