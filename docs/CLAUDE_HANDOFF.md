# Claude Code 인수인계 — 2026-08-11

## 현재 상태

- 프로젝트: `/Users/j/lck-community`
- 운영: https://lck-community.vercel.app/
- 운영 `main`: `ee19140` — Vercel Production `Ready`
- 작업 브랜치: `codex/role-player-radar`
- 작업 브랜치 최신: `623e588`
- `623e588`을 운영 `main`에 cherry-pick한 커밋이 `ee19140`이다. 내용은 같다.
- 현재 공용 자산 캐시 버전: `?v=20260811h`

## 최근 완료한 핵심 작업

1. 홈
   - 전체 게시판은 최신 글 5개 중심으로 정리.
   - 순위와 이후 일정은 우측 사이드바로 이동.
   - 가장 가까운 경기일의 1~2경기를 팀 메뉴 위 얇은 바로 표시.
   - 예측 버튼을 약 44px로 축소하고, 960px 이하에서는 두 경기를 두 행으로 배치.
   - 관리자 `홈 문구` 탭에서 현재 핵심 경기의 제목·보조 설명 수정 가능.
   - 설정은 `site_settings.home_feature_copy`에 경기 ID와 함께 저장되어 다음 경기에는 자동 해제됨.

2. 선수·팀
   - 팀 로고를 선택하면 해당 팀 선수 명단만 표시.
   - 초기 팀은 `응원팀 → 다음 경기 첫 팀` 순으로 결정.
   - 검색과 포지션 필터 간소화.
   - `이번 주 평점 상승`, `팬 관심 선수`를 사이드바로 이동.
   - 동일 포지션 육각형 비교는 접을 수 있는 별도 도구로 축소.
   - 비교 화면에 공식 선수 상반신 이미지 추가.
   - 포지션별 육각형 축과 계산식은 `assets/store.js`의 `ROLE_RADAR_AXES`, `radarData()` 참고.

3. 팀 게시판
   - 960px 이하에서 숨은 표 열이 너비를 계속 차지하던 문제 수정.
   - 중간 폭은 `분류 72px / 제목 가변 / 추천 52px` 3열로 전체 카드 너비 사용.
   - 모바일은 기존 3열 카드 UI 유지.

4. 경기 상세·수집기·권한
   - 아이템·챔피언·포지션 아이콘, 딜량 막대, 드래곤·영혼·장로드래곤, 한국 LCK VOD 연결 작업 완료.
   - Leaguepedia 저장은 경기 단위 원자 RPC와 무결성 차단 로직이 적용되어 있음.
   - 공식 경기방·회원 투표 권한 하드닝 관련 SQL과 운영 순서는 `docs/P0_DEPLOY.md`, `docs/AI_HANDOFF.md`를 우선 확인.

## 이번 작업의 SQL 여부

- 최근 홈·선수·게시판 UI 변경에는 신규 SQL이 필요 없다.
- 홈 수동 문구는 기존 `site_settings` 테이블을 사용한다.
- 기존 P0 SQL은 운영 데이터 안전 절차가 있으므로 문서를 읽지 않고 재실행하지 말 것.

## 검증 결과

- 깨끗한 운영 기준 worktree에서 `bash tests/check.sh` 전체 통과.
- 주요 수치: invariants 15, Leaguepedia 55, race 60 및 홈·선수·팀 게시판 회귀 테스트 통과.
- 운영 확인:
  - `assets/app.js?v=20260811h`
  - 선수 팀 선택 버튼 11개(전체+10팀)
  - 홈 당일 경기 2개, 예측 버튼 약 45px
  - 팀 게시판 표가 카드 전체 너비 사용
  - 확인한 페이지 모두 가로 넘침 없음

## 로컬 작업 시 주의

다음 파일은 기존 사용자 파일이므로 수정·삭제·스테이징하지 말 것.

- `.DS_Store` — modified
- `.gitignore` — untracked
- `assets/home-preview.css` — untracked
- `assets/home-preview.js` — untracked
- `home-preview.html` — untracked

`tests/check.sh`는 미추적 HTML도 검사한다. 현재 `home-preview.html`의 옛 캐시 버전 때문에 기존 작업 폴더에서는 자산 버전 검사만 실패할 수 있다. 배포 대상만 검증하려면 깨끗한 worktree에서 실행할 것. 사용자 파일을 임의로 고치지 말 것.

## 이어서 볼 파일

- 홈 렌더링: `assets/app.js`의 `renderHomeFeature()`, `renderHomeMatchBar()`
- 홈 관리자 편집: `admin.html`의 `renderHomeCopyAdmin()`
- 선수 탐색·비교: `players.html`
- 선수 지표 계산: `assets/store.js`의 `radarRole()`, `radarData()`
- 반응형 UI: `assets/styles.css`
- 게시판 렌더링: `assets/board.js`
- 전체 변경 기록: `docs/AI_HANDOFF.md`

## 배포 방식

1. 사용자 파일을 제외하고 의도한 파일만 stage.
2. `node --check`와 관련 focused test 실행.
3. 깨끗한 `origin/main` worktree에 커밋을 cherry-pick.
4. 그 worktree에서 `PYTHONPYCACHEPREFIX=/tmp/... bash tests/check.sh` 전체 통과 확인.
5. `HEAD:main` push 후 Vercel `Ready`와 운영 HTML 캐시 버전 확인.

