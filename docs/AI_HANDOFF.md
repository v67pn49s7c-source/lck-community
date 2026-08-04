# AI_HANDOFF — The Nexus

에이전트가 바뀔 때 이 문서만 읽고 이어받을 수 있게 유지합니다.
**작업을 마친 에이전트가 반드시 갱신합니다.**

> 점검 완료: **`docs/AUDIT_REPORT.md`** (Codex, 2026-08-04).
> 대응 1차 완료(코드) — 남은 것은 아래 "보안 후속 작업" 참고.

## 보안 후속 작업 (2026-08-04, 최우선)

점검 보고서의 P0 대응입니다. **코드 쪽은 반영됐고, DB 쪽은 사람이 실행해야 합니다.**

### 운영 DB 적용 상태 (2026-08-04 pg_policies로 확인 완료)

- `supabase/schema9_security.sql` **적용 완료**. 글·댓글 사칭 차단, id 형식 제약,
  회원 예측·평점·투표 행 보호(`voter = auth.uid()`), 반응 삭제 제한이 모두 살아 있음.
- `admin_write_matches / players / stage_records / site_settings`의 `qual`이 모두
  **`is_admin()`** — 옛 느슨한 정책(로그인한 아무나 수정)은 남아 있지 않음. 확인 완료.
- `supabase/schema8_pom_awards.sql`(구문 오류 수정본) **적용 완료** —
  `pom_awards` 37행, `awards` 16행(세레모니 11 · 펜타킬 5) 확인. 수상 페이지 정상 표시.
- `supabase/schema10_member_polls.sql`(회원 투표 첨부 복구) **적용 완료**.
- 남은 데이터 공백: 펜타킬 5건의 **챔피언이 비어 있어 "미등록"으로 표시**됩니다.
  또 수상 데이터는 관리자 화면에 편집 UI가 없어 SQL로만 수정할 수 있습니다.

### 코드에 반영된 것 (커밋 참조)

- DB에서 온 id를 URL·속성에 넣을 때 `q()`(encodeURIComponent)·`esc()` 적용
  (`assets/app.js`의 `q()` 신규, board/live/awards/bracket/players)
- 팬심지수 투표 컨테이너가 `poll.id`를 HTML `id` 속성에 쓰지 않도록 순서 기반으로 변경
- 댓글 저장 실패 시 화면에서 되돌리고 사용자에게 알림 (`addComment`가 프로미스 반환)
- 글·댓글 거부 시 안내 문구에 닉네임 규칙 추가

### 관리자 화면 개편 (2026-08-04)

- 스크롤 한 줄 나열 → **왼쪽 메뉴 + 한 번에 한 섹션**(설정 화면 방식).
  `.admin-shell` / `.admin-nav` / `.admin-panel[data-tab]`, 전환은 `initAdminTabs()`.
  선택한 탭은 URL 해시(`admin.html#awards`)와 localStorage에 저장됨. 좁은 화면은 상단 가로 스크롤 탭.
- **수상 관리 섹션 신규**(`data-tab="awards"`): 베스트 세레모니 · 질레트 펜타킬 ·
  정규시즌 MVP · ALL-LCK · 올해의 감독 · 올해의 신인. 선수 선택 시 이름·팀 자동,
  선수가 아닌 사람은 직접 입력. 펜타킬은 챔피언 아이콘 선택기(`.dd-pickable`) 사용.
  `addAward()`가 프로미스를 반환하도록 바꿔 저장 실패 시 되돌리고 알림.
- **검증 한계**: 관리자 로그인이 필요해 레이아웃·목록 렌더까지만 확인(원본 마크업을 다시 주입해
  확인). 추가·삭제 버튼의 실제 저장 동작은 사용자 로그인 확인 필요.

### 게시글 비밀번호 · 수정 · 삭제 (2026-08-04)

- **실행 필요: `supabase/schema11_post_edit.sql`** (아직 적용 전이면 글쓰기는 예전 방식으로 동작)
- 비회원은 글/댓글 작성 시 4자 이상 비밀번호를 정하고 그 비밀번호로 수정·삭제.
  회원은 계정으로(posts/comments의 새 `author_id` 컬럼), 관리자는 전부 가능.
- **닉네임은 클라이언트가 정하지 못한다**: 회원=프로필 닉네임 고정,
  비회원=서버가 부여하는 유동닉(`anon_nick()` → 익명0000, 글마다 새 번호),
  관리자만 표시 이름 자유. 비회원은 전체 게시판에만 작성 가능(서버에서도 차단).
  `create_post`/`create_comment`는 `{id, nick}` jsonb를 돌려주고 화면이 그 닉네임을 반영한다.
- 비밀번호는 `post_secrets` / `comment_secrets`에 bcrypt 해시로만 보관.
  두 표는 RLS를 켜고 **정책을 두지 않아** 아무도 직접 읽을 수 없고, security definer 함수만 접근.
- 글·댓글 작성이 `create_post` / `create_comment` RPC로 바뀜(기존 insert 정책은 삭제).
  store.js에 `editPost` / `removePost` / `removeComment` 추가.
  RPC가 없으면(=SQL 미적용) 예전 직접 insert로 자동 대체 — 배포 순서와 무관하게 글쓰기가 막히지 않음.
- **조회수·추천수가 서버에 저장되지 않던 문제**도 같은 파일에서 수정
  (posts에 UPDATE 정책이 아예 없었음 → views·up 두 칸만 갱신 가능하도록 컬럼 권한 부여).

### 아직 남은 것 (다음 단계)

- **비회원 표 덮어쓰기**: 회원 행은 SQL로 보호되지만, 비회원 행은 `voter`가 브라우저가 만든
  문자열이라 서버가 소유권을 증명할 수 없습니다. 완전 차단하려면
  ① `predictions/ratings/poll_votes/reactions`의 원시 공개 SELECT를 집계 view/RPC로 교체하고
  ② 쓰기를 security definer RPC로 옮겨야 합니다. 화면 코드 수정 범위가 큽니다.
- **예측 마감 미구현** (보고서 P1): 서버가 경기 시각을 검사하지 않습니다.
- 저장 실패 전반의 사용자 알림(투표·평점·관리자 저장), 개인정보 처리방침·실제 문의 연락처.

---

## 현재 상태 (2026-08-04 기준)

- 기준 커밋: **`3feb23a`** (origin/main과 동일, Vercel 배포 완료 확인)
- 배포 주소: https://lck-community.vercel.app — `main` push 시 자동 배포
- 정적 자원 캐시 버전: **`?v=20260803k`**
- 마지막 작업자: Claude (Claude Code)

### 최근 4개 커밋에서 바뀐 것

| 커밋 | 내용 |
|---|---|
| `f7b9d3e` | 푸터 비제휴 고지 문구 교체 (한국어 + 영어 두 문단) |
| `94b15a9` | 로딩 표시를 회전 사각형 → THE NEXUS 로고 마크(`assets/brand/nexus-mark.png`, 27KB) |
| `f1dfe44` | 모바일 가로 잘림, 챔피언 아이콘 로드 실패, 초기 로딩 속도, 승부예측 % 잘림, 라이브 → 오늘의 경기 + 중계 링크 |
| `3feb23a` | 팬심 평점 모바일: 좌우 대칭 유지 + 1~10 버튼 5개씩 2줄 + 군더더기 숨김 |

### 특히 알아야 할 구조 변경 (`f1dfe44`)

1. **로딩 경로 재구성** (`assets/store.js`)
   - 예전: 로그인 조회 → 테이블 10개 → 테이블 8개 (서버 왕복 3회) → 전부 기다린 뒤 렌더
   - 지금: 한 번에 병렬 요청 1회 + localStorage 스냅샷 선표시
   - `storeReady`(즉시) / `storeFresh`(서버 확인 완료) 두 가지가 생겼습니다. §4 규칙은 AGENTS.md 참고.
   - 로고 데이터 URL(약 80KB, `site_settings`의 `logo_*`)은 첫 화면 경로에서 제외하고
     `loadLogosLater()`가 나중에 받아 헤더 이미지를 교체합니다.
   - 측정값: 첫 방문 약 2.0초 → 1.0초, 재방문 약 2.0초 → 0.02~0.05초 (유럽에서 측정, 서버는 서울)
2. **supabase-js 자체 호스팅**: `assets/vendor/supabase.min.js` (2.49.4). jsdelivr CDN 참조 제거.
3. **정적 자원 `?v=` 캐시 버전 도입**: HTML의 script/link 태그에 붙어 있습니다. 고칠 때마다 올려야 합니다.
4. **중계 링크 기능 신규**: `site_settings`의 `streams` 키에 JSON 저장
   (`{default:{chzzk,soop,youtube}, matches:{"m12":{youtube:"..."}}}`).
   store.js의 `getStreamConfig / saveStreamConfig / streamsForMatch`, 화면은 live.html,
   등록 UI는 admin.html "중계 링크" 섹션.
5. **메뉴 이름 변경**: 라이브 → **오늘의 경기** (`NAV_MENUS` in app.js, live.html).
   파일명 `live.html`은 그대로입니다.

---

## 검증 상태

브라우저(로컬 서버)에서 직접 확인한 것:

- 전 페이지 375px 가로 넘침 0 (index/matches/standings/community/teams/players/awards/
  ranking/bracket/player/predict/live). 대진표는 `.bracket-wrap` 안에서만 가로 스크롤.
- 경기 상세 아이콘 60개 전부 로드(챔피언 10 + 아이템·룬 50).
- 재방문 렌더 시작 12~54ms, 첫 방문 약 1.0초.
- 스냅샷 변경 감지 → "새로고침" 안내 토스트 동작.
- 승부예측 % 잘림 해소(버튼 180px, 잘린 모서리와 14px 여유).
- 팬심 평점 모바일 좌우 대칭 + 버튼 27×24px, 600px 폭에서도 대칭.

**확인하지 못한 것 (다음 작업자가 해 주세요)**

- **관리자 화면(admin.html)의 "중계 링크" 섹션 실제 동작.** 관리자 로그인이 필요해서
  코드 문법과 표시 경로만 검증했습니다. 저장·경기별 덮어쓰기 클릭 확인 필요.
- 실제 모바일 기기(iOS Safari / Android Chrome)에서의 확인. 데스크탑 브라우저의 375px 폭으로만 봤습니다.
- 로그인 사용자 흐름 전반(가입·프로필 설정·창립 팬 번호·글쓰기 권한).

---

## 열린 항목 / 다음 작업 후보

1. **중계 링크 주소 입력** — 치지직·SOOP·유튜브 채널 주소는 아직 비어 있습니다(사용자가 등록 예정).
   2026년부터 국내 LCK 생중계는 치지직·SOOP 독점, 유튜브는 글로벌·다시보기 위주.
2. **파비콘이 아직 626KB 원본**(`assets/app.js`의 `brandLogoURL("mobile", ...)`).
   27KB짜리 `nexus-mark.png`로 바꿀 수 있습니다.
3. **Vercel 캐시 헤더** — 현재 `/assets/*`가 `max-age=0, must-revalidate`라 재방문마다
   조건부 요청이 나갑니다. `?v=`로 파일명이 버전화돼 있으므로 `vercel.json`에서
   긴 캐시를 줄 수 있지만, **버전이 안 붙은 이미지(`assets/brand/*.png`, `logos/*.svg`)까지
   묶이면 교체가 반영되지 않는 위험**이 있습니다. 경로를 분리해서 적용할지 검토 필요.
4. **`?v=` 자동 갱신** — 지금은 손으로 올립니다. 배포 스크립트나 훅으로 자동화 여지.
5. 점검 결과(`docs/AUDIT_REPORT.md`)에서 나온 항목들.

## 사람의 결정이 필요한 것

- 중계 링크 채널 주소 (사용자만 정확히 압니다)
- 캐시 헤더 정책 변경 여부 (로고 교체 반영 지연을 감수할지)
