# NovelFinder

웹소설 추천 사이트. 네이버 시리즈·카카오페이지·문피아·노벨피아의 공개 인기 순위를 모아 장르와 연재 플랫폼별로 골라 볼 수 있고, 매주 월요일 장르가 다른 3편을 골라 소개합니다. GitHub Actions가 매일 06:00(KST)에 데이터를 갱신하고 GitHub Pages로 배포합니다. API 키·서버 불필요.

## 구성

| 경로 | 역할 |
| --- | --- |
| `scripts/sources.mjs` | 플랫폼별 순위 수집기 (Node 22+, 의존성 없음) |
| `scripts/update.mjs` | 수집 → 같은 작품 합치기 → 점수 계산 → `public/data/novels.json` |
| `scripts/history.mjs` | 날짜별 장르 순위 기록(`data/history/`), 최근 7일 급상승·새로 진입 계산, 상세 창 그래프용 `public/data/history.json` |
| `scripts/ranks.mjs` | 사이트별 일간·주간 인기순위 → `public/data/ranks.json` (인기순위 탭) |
| `scripts/weekly.mjs` | 주간 추천 3편 선정, 글(`public/weekly/`) 생성 |
| `public/` | 배포되는 사이트 (`index.html`, `app.js`, `style.css`) |
| `data/raw/` | 플랫폼별 마지막 수집 결과 — 수집이 실패한 플랫폼은 이 데이터를 그대로 사용 |
| `data/meta.json` | 문피아·노벨피아 작품의 표지·소개글 캐시 (실행마다 150건씩 채움) |
| `.github/workflows/update.yml` | 매일 수집 → 커밋 → Pages 배포 |

## 추천 방식

- **장르**: 판타지 / 현대판타지 / 무협 / 로맨스 / 로맨스판타지 / 그 외(대체역사·SF·스포츠·미스터리 등). 플랫폼마다 다른 장르 이름을 이 여섯 가지로 맞춥니다.
- **같은 작품 합치기**: 제목(`[독점]` 같은 꼬리표 제거)과 작가가 같으면 한 작품으로 묶어, 어느 플랫폼에서 볼 수 있는지 함께 보여 줍니다.
- **추천 점수(1~100)**: 플랫폼 장르 순위가 높을수록, 여러 플랫폼 순위에 함께 올라 있을수록, 평점이 높을수록 올라갑니다.
- **주간 추천**: 표지·소개글이 있는 작품 중 점수에 주마다 달라지는 가중을 더해 장르가 겹치지 않게 3편. 최근 12주에 소개한 작품은 제외합니다.
- 성인 전용 작품은 수집하지 않습니다. 리디는 자동 수집을 막고 있어 포함하지 않았습니다.

## 로컬 실행

```bash
node scripts/update.mjs
node scripts/ranks.mjs
```

```bash
node scripts/weekly.mjs
```

```bash
npx serve public
```

## 배포

1. GitHub에 **public** 저장소를 만들고 push
2. 저장소 Settings → Pages → Source를 **GitHub Actions**로 설정
3. Actions 탭에서 `Update data & deploy`를 한 번 수동 실행 (이후 매일 자동)

각 플랫폼과 제휴 관계가 없는 비공식 프로젝트입니다. 표지와 소개글의 권리는 각 작가·플랫폼에 있습니다.
