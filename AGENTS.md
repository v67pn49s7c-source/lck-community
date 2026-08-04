# AGENTS.md — The Nexus (LCK 팬 커뮤니티)

AI 에이전트(Codex·Claude 등)가 이 저장소에서 작업할 때 지켜야 할 규칙입니다.
사람용 설명이 아니라 **작업 지침**이므로, 시작 전에 이 문서를 먼저 읽으세요.

## 1. 이 저장소는 무엇인가

LCK(리그 오브 레전드 챔피언스 코리아)의 **비공식 팬 커뮤니티** 사이트입니다.
Riot Games·LCK·구단과 아무 관계가 없으며, 푸터·이용약관에 그 고지가 들어 있습니다.
**이 고지 문구는 임의로 바꾸지 마세요.**

주요 기능: 경기 일정·결과, 순위, 승부예측(포인트), 팬심지수 투표, 팬심 평점(선수 10점 평가),
커뮤니티 게시판, 팀·선수 정보, 수상, 주간 랭킹, 관리자 화면.

## 2. 기술 스택 — 빌드 도구가 없습니다

- **정적 HTML + CSS + 바닐라 JS**. 번들러·프레임워크·npm 스크립트·테스트 프레임워크가 **없습니다**.
  `npm install`, `npm run build` 같은 명령을 찾지 마세요. 파일을 그대로 브라우저가 읽습니다.
- 데이터는 **Supabase**(서울 리전, PostgREST + Auth + RLS). 클라이언트가 직접 붙습니다.
  서버 코드·API 라우트가 없으므로 **모든 권한 통제는 RLS에 달려 있습니다.**
- 배포: **`main`에 push → Vercel 자동 배포** → https://lck-community.vercel.app
- 로컬 실행: `python3 -m http.server 5173` 후 http://localhost:5173

## 3. 파일 지도

```
*.html                  페이지 (index/matches/standings/predict/live/community/
                        teams/players/player/team/post/write/awards/ranking/
                        bracket/login/terms/admin)
assets/
  data.js               팀 목록 등 정적 상수 (TEAM_MAP)
  store.js              ★ 데이터 계층 — Supabase 연결, 캐시, 스냅샷, 모든 읽기/쓰기 함수
  app.js                공통 유틸 + 헤더/푸터 + 홈 화면
  board.js              커뮤니티(글 목록·글 보기·글쓰기·팀 게시판)
  ddragon.js            Data Dragon 아이콘 (챔피언·아이템·룬·스펠) + 관리자 아이콘 선택기
  player-photos.js      선수 사진 매핑
  styles.css            ★ 전체 스타일 (반응형 포함)
  vendor/supabase.min.js  supabase-js 2.49.4 자체 호스팅본 (외부 CDN 대신)
  logos/, brand/        팀 로고(SVG), 사이트 로고(PNG)
supabase/*.sql          스키마·RLS 정책·데이터 보정 SQL (사람이 Supabase 콘솔에서 직접 실행)
docs/AI_HANDOFF.md      ★ 인수인계 문서 — 작업 끝나면 반드시 갱신
```

## 4. 데이터 계층 규칙 (assets/store.js)

- 화면 코드는 **동기 함수**로 캐시를 읽습니다 (`getMatches()`, `getSetting()` 등).
  Supabase를 페이지 곳곳에서 직접 호출하지 말고, store.js에 함수를 추가해서 쓰세요.
- 쓰기는 **낙관적 반영**: 캐시를 먼저 고치고 서버에 비동기 저장합니다.
- 부팅 순서가 두 가지입니다. 헷갈리면 안 됩니다.
  - `storeReady` — 화면을 그려도 되는 시점. **지난 방문 스냅샷이 있으면 즉시 resolve**(약 30ms).
    일반 페이지는 이것을 씁니다.
  - `storeFresh` — 서버 응답까지 반영된 시점. **로그인·권한 판정이 정확해야 하는 화면**
    (admin.html, login.html, 글쓰기)은 반드시 이것을 씁니다.
- 스냅샷은 localStorage(`nexus_snap_v1`, 로고는 `nexus_logos_v1`). 서버 데이터가 도착해
  의미 있는 변화가 있으면 하단에 "새로고침" 안내만 띄웁니다(화면을 임의로 다시 그리지 않음 —
  사용자가 쓰던 입력·선택이 날아가기 때문).

## 5. 코드 규칙

- 주석·UI 문구는 **한국어**. 주석은 "왜 이렇게 했는지"를 적습니다.
- 들여쓰기 2칸, 세미콜론 사용, 기존 파일의 스타일을 그대로 따릅니다.
- **사용자 입력을 화면에 넣을 때는 반드시 `esc()`** 를 통과시킵니다 (innerHTML을 많이 씁니다).
- CSS는 `assets/styles.css` 한 곳에만. 반응형 분기: 960 / 720 / 640 / 560px.
  그리드 칸은 기본이 `min-width:auto`라 내용이 길면 화면 밖으로 밀립니다 —
  가로 스크롤이 생기면 `minmax(0, 1fr)` / `min-width: 0`부터 의심하세요.
- 표처럼 원래 넓은 것은 `.table-scroll`로 감싸 **표 안에서만** 가로로 밀리게 합니다.
- **CSS·JS를 고쳤으면 모든 HTML의 `?v=YYYYMMDDx` 값을 한 번에 올립니다.**
  (안 올리면 재방문자가 옛 파일을 씁니다. 예: `perl -pi -e 's{\?v=20260803k}{?v=20260804a}g' *.html`)

## 6. 절대 하지 말 것

1. **service_role 키·비밀 키를 저장소에 넣지 않습니다.** 코드에 있는 anon 키는 공개용이 맞습니다.
2. **운영 Supabase에 테스트 데이터를 쓰지 않습니다.** 이 프로젝트에는 개발용 DB가 따로 없고,
   실제 방문자가 쓰는 데이터입니다. 스키마 변경은 `supabase/`에 SQL 파일로만 제안하고,
   실행은 사람이 합니다.
3. **남의 미커밋 변경을 함께 커밋하지 않습니다.** `git add -A` 전에 `git status`로 확인하세요.
4. 비공식 팬 사이트 고지(푸터·terms.html)를 약화시키지 않습니다.
5. 요청받지 않은 대규모 리팩터링·프레임워크 도입을 하지 않습니다. 빌드 없는 구조가 의도입니다.

## 7. 작업을 마칠 때

1. 브라우저에서 실제로 확인합니다(로컬 서버 + 모바일 폭 375px + 데스크탑).
   자동 테스트가 없으므로 **눈으로 본 것이 유일한 검증**입니다.
2. `node --check assets/*.js`로 최소한 문법을 확인합니다.
3. `?v=` 값을 올립니다.
4. **`docs/AI_HANDOFF.md`를 갱신합니다** — 기준 커밋 / 바꾼 것 / 검증한 것 / 확인 못 한 것 /
   다음 작업 / 사람의 결정이 필요한 항목. 다음 에이전트가 이 문서만 보고 이어받습니다.
5. push는 사용자가 명시적으로 요청했을 때만 합니다 (push = 즉시 배포).
