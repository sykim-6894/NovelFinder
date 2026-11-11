// 플랫폼별 인기 순위 수집기. 각 함수는 아래 모양의 배열을 돌려준다.
// { pf, id, title, author, cat, rank, url, img?, desc?, rating?, votes?, views?, eps?, done? }
// cat: fantasy | modern | wuxia | romance | rofan | etc
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function get(url, { json = false, headers = {}, tries = 3 } = {}) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9', ...headers },
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const out = json ? await res.json() : await res.text();
      await sleep(350); // 서버에 부담을 주지 않도록 요청 사이에 쉰다
      return out;
    } catch (e) {
      err = e;
      await sleep(1500 * (i + 1));
    }
  }
  throw new Error(`${url} — ${err.message}`);
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export const text = (s) =>
  String(s ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1));
      return ENT[e] ?? m;
    })
    .replace(/\r/g, '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
const int = (s) => parseInt(String(s ?? '').replace(/[^\d]/g, ''), 10) || 0;
// "32.5K", "1.2M" 같은 표기
const short = (s) => {
  const m = String(s ?? '').match(/([\d.]+)\s*([KM])?/i);
  if (!m) return 0;
  return Math.round(parseFloat(m[1]) * ({ K: 1e3, M: 1e6 }[m[2]?.toUpperCase()] ?? 1));
};

/* ---------- 네이버 시리즈 ---------- */
const NAVER = { 202: 'fantasy', 208: 'modern', 206: 'wuxia', 201: 'romance', 207: 'rofan', 203: 'etc', 205: 'etc' };
export async function naver() {
  const out = [];
  for (const [code, cat] of Object.entries(NAVER)) {
    for (let page = 1; page <= 3; page++) {
      const html = await get(`https://series.naver.com/novel/top100List.series?rankingTypeCode=DAILY&categoryCode=${code}&page=${page}`);
      const list = html.split('comic_top_lst')[1] ?? '';
      const items = list.split(/<li>/).slice(1);
      for (const it of items) {
        const id = it.match(/productNo=(\d+)/)?.[1];
        const title = text(it.match(/<h3>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/)?.[1]);
        if (!id || !title || /19over/.test(it)) continue; // 성인 전용 작품 제외
        const state = it.match(/총\s*([\d,]+)\s*화\s*\/\s*(미완결|완결)/);
        out.push({
          pf: 'naver', id, title, cat,
          author: text(it.match(/class="author">([\s\S]*?)<\/span>/)?.[1]),
          rank: int(it.match(/<em class="no\d+">(\d+)</)?.[1]) || out.length + 1,
          url: `https://series.naver.com/novel/detail.series?productNo=${id}`,
          img: it.match(/<img src="([^"]+)"/)?.[1]?.replace(/type=m\d+/, 'type=m260'),
          desc: text(it.match(/<p class="dsc">([\s\S]*?)<\/p>/)?.[1]).replace(/([.?!…”’])(?=[가-힣A-Za-z“‘"'\[])/g, '$1 '),
          rating: parseFloat(it.match(/class="score_num">([\d.]+)/)?.[1]) || undefined,
          eps: state ? int(state[1]) : undefined,
          done: state ? state[2] === '완결' : undefined,
        });
      }
      if (items.length < 20) break;
    }
  }
  return out;
}

/* ---------- 카카오페이지 ---------- */
const KAKAO = { 86: 'fantasy', 120: 'modern', 87: 'wuxia', 89: 'romance', 117: 'rofan' };
export async function kakao() {
  const out = [];
  for (const [sub, cat] of Object.entries(KAKAO)) {
    for (let page = 0; page < 2; page++) {
      const r = await get(
        `https://bff-page.kakao.com/api/gateway/view/v1/landing/ranking?category_uid=11&screen_uid=94&subcategory_uid=${sub}&ranking_type=weekly&page=${page}`,
        { json: true, headers: { Referer: 'https://page.kakao.com/', Origin: 'https://page.kakao.com' } },
      );
      const list = r?.result?.list ?? [];
      for (const s of list) {
        if (s.age_grade >= 19 || !s.title) continue;
        out.push({
          pf: 'kakao', id: String(s.series_id), title: s.title, cat,
          author: s.authors ?? '',
          rank: int(s.service_property?.rank) || out.length + 1,
          url: `https://page.kakao.com/content/${s.series_id}`,
          img: s.thumbnail ? `https://dn-img-page.kakao.com/download/resource?kid=${s.thumbnail}&filename=th3` : undefined,
          desc: s.operator_property?.copy || undefined,
          views: s.service_property?.view_count || undefined,
        });
      }
      if (list.length < 50 || r.result.is_end) break;
    }
  }
  return out;
}

/* ---------- 문피아 ---------- */
const munpiaCat = (genres) => {
  const g = genres.split(',')[0].trim(); // 첫 번째로 적힌 장르가 대표 장르
  if (g === '무협') return 'wuxia';
  if (g === '현대판타지') return 'modern';
  if (g === '로맨스') return 'romance';
  if (/^(판타지|퓨전|게임)$/.test(g)) return 'fantasy';
  return 'etc';
};
// 목록에는 표지·소개글이 없어 상세 정보를 따로 받는다
export async function munpiaDetail(id) {
  const r = await get(`https://www.munpia.com/api/v1/pc/novel-detail/${id}`, { json: true, tries: 2 });
  const n = r?.result?.novelInfo;
  if (!n) return null;
  return { img: n.coverUrl || undefined, desc: text(n.introduction), eps: n.chapterCount || undefined, done: !!n.finish };
}
export async function novelpiaDetail(id) {
  const html = await get(`https://novelpia.com/novel/${id}`, { tries: 2 });
  const desc = text(html.match(/property="og:description" content="([^"]*)"/)?.[1]).replace(/^(플러스작품|자유연재|자유작품)\s*-\s*/, '');
  return { desc };
}
export async function munpia() {
  const out = [];
  // 유료 주간 베스트 + 무료 투데이 베스트
  for (const path of ['plsa.weekly', 'today']) {
    const html = await get(`https://www.munpia.com/best/${path}`);
    const blocks = html.split('<a href="https://www.munpia.com/novel/detail/').slice(1);
    let n = 0;
    for (const b of blocks) {
      const id = b.match(/^(\d+)"/)?.[1];
      const body = b.split('</a>')[0];
      const title = text(body.match(/class="(?:novel-)?title(?:-wrap)?">\s*(?:<span[^>]*>)?([\s\S]*?)<\/(?:span|div)>/)?.[1] ?? body.match(/class="novel-title">([\s\S]*?)<\/div>/)?.[1]);
      const genre = text(body.match(/class="(?:novel-)?genre">([\s\S]*?)<\/div>/)?.[1]);
      if (!id || !title || out.some((o) => o.id === id)) continue;
      n++;
      out.push({
        pf: 'munpia', id, title, cat: munpiaCat(genre),
        author: text(body.match(/class="(?:novel-)?author">([\s\S]*?)<\/div>/)?.[1]),
        rank: n,
        url: `https://www.munpia.com/novel/detail/${id}`,
        img: body.match(/<img src="([^"]+)"/)?.[1],
        views: int(body.match(/class="view-count">([\d,]+)/)?.[1] ?? body.match(/조회<span>([\d,]+)/)?.[1]) || undefined,
        free: path === 'today' || undefined,
      });
    }
  }
  return out;
}

/* ---------- 노벨피아 ---------- */
const NOVELPIA = { 1: 'fantasy', 12: 'modern', 3: 'modern', 2: 'wuxia', 6: 'romance', 7: 'etc', 9: 'etc', 8: 'etc', 13: 'etc' };
export async function novelpia() {
  const out = [];
  for (const [g, cat] of Object.entries(NOVELPIA)) {
    const html = await get(`https://novelpia.com/top100/all/weekly/view/all/all/?main_genre=${g}`);
    const cards = html.split('novelbox mobile_hidden').slice(1);
    cards.forEach((c, i) => {
      const id = c.match(/location='\/novel\/(\d+)'/)?.[1];
      const title = text(c.match(/class="cut_line_one">([\s\S]*?)<\/b>/)?.[1]);
      if (!id || !title) return;
      const img = c.match(/<img src\s*="([^"]+)"/)?.[1];
      out.push({
        pf: 'novelpia', id, title, cat,
        author: text(c.match(/<\/b>\s*<font[^>]*>([\s\S]*?)<\/font>/)?.[1]),
        rank: int(c.match(/class="thumb_s1">\s*(\d+)/)?.[1]) || i + 1,
        url: `https://novelpia.com/novel/${id}`,
        img: img && !/noimg|19\.|adult/.test(img) ? (img.startsWith('//') ? 'https:' + img : img) : undefined,
        views: short(c.match(/ion-star"><\/i>\s*([\d.]+[KM]?)/)?.[1]) || undefined, // 선호(★) 수
        eps: int(c.match(/EP\.(\d+)/)?.[1]) || undefined,
      });
    });
  }
  return out;
}

export const SOURCES = { naver, kakao, munpia, novelpia };
export const PLATFORMS = {
  naver: '네이버 시리즈',
  kakao: '카카오페이지',
  munpia: '문피아',
  novelpia: '노벨피아',
};
export const CATS = { fantasy: '판타지', modern: '현대판타지', wuxia: '무협', romance: '로맨스', rofan: '로맨스판타지', etc: '그 외 장르' };

// 직접 실행하면 수집 결과를 요약해 보여준다: node scripts/sources.mjs [플랫폼]
if (process.argv[1]?.endsWith('sources.mjs')) {
  for (const k of process.argv[2] ? [process.argv[2]] : Object.keys(SOURCES)) {
    try {
      const list = await SOURCES[k]();
      const by = {};
      for (const n of list) by[n.cat] = (by[n.cat] || 0) + 1;
      console.log(`\n== ${k}: ${list.length}편`, by);
      console.log(list.slice(0, 2), list.at(-1));
      console.log('빈 값:', Object.fromEntries(['author', 'img', 'desc'].map((f) => [f, list.filter((n) => !n[f]).length])));
    } catch (e) {
      console.log(`\n== ${k} 실패: ${e.message}`);
    }
  }
}
