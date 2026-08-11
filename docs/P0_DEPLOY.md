# P0 하드닝 운영 적용 안내

> ## ⚠️ 이 문서는 **이미 실행된 작업의 기록**입니다 (2026-08-11 확인)
>
> 아래 "운영 적용 순서"는 **지나간 절차**입니다. 다시 실행하는 문서가 아닙니다.
> 특히 **schema23 백필**과 **세트 win a↔b 뒤집기(backfill_p0_setwin.sql)** 는
> 되돌리기 어려운 파괴적 작업이며 **이미 운영에 적용됐습니다.**
> 재실행하지 마세요. 되돌려야 한다면 아래 "롤백" 절만 보십시오.
>
> **2026-08-11 운영 실측 결과**
>
> | 항목 | 상태 | 확인 방법 |
> |---|---|---|
> | 코드 (`main` = `ee19140`) | **배포 완료** — Vercel Production Ready | 운영 자산 `?v=20260812a` |
> | `schema22` (is_official·create_member_poll) | **적용 완료** | `posts.is_official` 조회 성공, RPC 호출 시 `42501`(권한거부) |
> | `schema23` (공식 경기방 백필·유니크 인덱스) | **적용 완료** | `is_official=true` 글 38개 |
> | `schema24` (경기 원자 저장 RPC) | **적용 완료** | RPC 호출 시 `42501`, 8/11 수집에서 세트 20개 저장·경고 0 |
> | 세트 win 뒤집힘 backfill | **적용 완료** | m8·m1·m7 등 세트 win이 최종 스코어와 일치, 정합성 위반 0 |
> | `schema25` (FINAL 잠금) | **미확인** | anon 권한으로는 정책 조회 불가 — 아래 확인 SQL 참고 |
>
> **schema25 적용 여부 확인용 (읽기 전용):**
> ```sql
> select policyname from pg_policies
>  where schemaname='public' and tablename='polls' and policyname='member_insert_polls';
> -- 결과가 비어 있으면 schema25 적용 완료(회원 직접 INSERT 제거됨)
> -- 행이 나오면 아직 TRANSITION 단계 — 코드 배포가 끝났으므로 schema25 실행 가능
> ```

기준 브랜치: `main` (운영과 동일). 초안이 있던 `p0-hardening` 브랜치는 이미 운영에 반영됐다.
아래 절차·롤백·백로그는 **기록과 참고용**으로 남긴다.

## 최근 5개 커밋

1. `2798987` — P0-2 세트 win 뒤집힘 backfill SQL(자동실행 금지)
2. `2128c44` — 초기 관리자 시드 토론방 승격 틀
3. `951af65` — 적대적 검토 5건 반영
4. `6315f01` — P0 배포·롤백·백로그 문서
5. `7cedad7` — 공식 콘텐츠 권한 잠금 + 종료 경기 정합성 게이트

## 현재 확인된 문제와 아직 확인할 것

| 구분 | 내용 | 확인 방법 |
|---|---|---|
| 확인됨 | 회원 자유 투표 정책에 `match_id`·글 소유 검사가 없었음 | 구 `schema10_member_polls.sql` |
| 확인됨 | 비관리자 `create_post`가 `match_id`를 보존했음 | 구 `schema11_post_edit.sql` |
| 확인됨 | 공식 경기방을 제목으로 판별해 가로채기가 가능했음 | 수정 전 `assets/store.js` |
| 확인됨 | 종료 경기의 세트 win과 최종 스코어가 모순됨 | `/match/m8`, 로컬 invariant 감사 |
| 확인됨 | 초기 관리자 시드 경기방 일부는 `author_id`가 없음 | 로컬 데이터 감사. 운영은 audit ① 재확인 필요 |
| 운영 확인 필요 | 운영 RLS·함수 ACL이 저장소 SQL과 같은지 | `audit_p0_read_only.sql` ⑤ |
| 운영 확인 필요 | 정확한 win 교정 대상과 부분수집/side 오염 경기 | audit ⑥·⑦ |

## 중요한 2단계 권한 모델

회원 자유 투표는 배포 호환 때문에 한 번에 잠그지 않는다.

- `schema22` **TRANSITION**: 옛 코드용 직접 INSERT를 `자기 글 + match_id NULL + phase NULL`로 제한해 잠시 유지하고, 새 RPC를 추가한다.
- 코드 배포 후 `schema25` **FINAL**: 일반 회원 직접 INSERT 정책을 제거한다. 이후 회원 자유 투표는 RPC 전용이다.
- 관리자 공식 투표는 별도 `admin_all_polls` 정책을 사용하므로 FINAL 뒤에도 유지된다.

`schema22`와 `schema25`는 SECURITY DEFINER 함수의 기본 `PUBLIC EXECUTE`를 회수하고 역할별 권한을 다시 부여한다. 두 파일 모두 `NOTIFY pgrst, 'reload schema'`를 보내므로 COMMIT 후 PostgREST가 새 column/RPC를 인식한다.

## 운영 적용 순서

순서를 바꾸지 않는다. 특히 cleanup은 `is_official` 컬럼을 사용하므로 schema22보다 먼저 실행할 수 없다.

### 0. 로컬/Preview 확인

1. `bash tests/check.sh`
2. schema22 전 Preview에서는 일반 조회·레이아웃·비공식 화면과 `/match/m8`의
   `기록 확인 중`만 확인한다. 공식 경기방/RPC는 아직 운영 DB에 없으므로 이 단계에서
   정상 동작을 기대하지 않는다.
3. 아직 `main` 병합·운영 DB 실행은 하지 않음

### 1. 운영 DB 사전 감사 — 읽기 전용

`supabase/audit_p0_read_only.sql`을 항목별 실행한다.

- ① 비관리자/author_id 없는 경기 연결 글
- ② 경기당 토론방 중복
- ③ `match_id`는 있지만 phase가 없는 투표
- ④ 고아 자유 투표
- ⑤ RLS 정책과 SECURITY DEFINER 함수 ACL
- ⑥ **set_index 0..N-1 완전 + 전 세트 + side 5:5**인 정확한 win 교정 대상
- ⑦ 부분수집·set_index 결번/중복/범위 이탈·side 오염·혼합 오류(자동 교정 금지)
- ⑧ 종료 경기의 스코어 없음/동점

감사 결과를 저장하고 예상 밖 정책이 있으면 여기서 멈춘다.

### 2. schema22 TRANSITION

1. `supabase/schema22_p0_official_content.sql`
2. 결과가 `schema22 TRANSITION OK`인지 확인
3. 새 브라우저 세션에서 PostgREST가 `is_official`, `create_member_poll`을 인식하는지 확인
4. `supabase/tests/p0_rls_transition_test.sql` 실행 — T0~T13, 14개 전부 PASS

이 단계의 일반 회원 직접 INSERT 성공(T1)은 옛 코드 호환을 위한 의도된 상태다. FINAL 테스트를 여기서 실행하면 실패하는 것이 정상이다.

### 3. schema23 전 수동 정리

`supabase/cleanup_p0_manual.sql`은 그대로 실행하는 파일이 아니다. audit의 실제 id를 넣고 작업마다 `BEGIN → UPDATE/DELETE → 검증 SELECT → COMMIT`한다.

- 악성/비공식 경기 연결은 `match_id`만 해제하고 글은 보존
- phase 없는 공식 흉내 투표는 `match_id` 해제
- 고아 자유 투표만 지정 삭제
- 중복 경기방은 남길 글 하나만 `match_id`를 유지하고 `is_official=true`로 지정
- 버릴 중복 글은 **모두** `match_id=NULL, is_official=false`로 두 경기와의 연결까지 해제(글·댓글 데이터는 보존)
- 초기 `author_id IS NULL`, `nick='운영자'` 시드방은 실제 관리자 시드임을 확인한 경우에만 지정 승격

### 4. schema23 공식 경기방 백필

1. `supabase/schema23_official_backfill.sql`
2. 관리자가 만든 대상의 이전 `is_official` 값은 `p0_ops.official_post_backup_20260809`에 저장됨
3. 경기당 공식 경기방 unique index 생성 확인
4. audit ①·②를 다시 실행해 예상 밖 중복/오염이 없는지 확인

이 파일은 자체 트랜잭션 안에서 `posts`·`profiles` 쓰기를 잠시 잠가 백필과 인덱스 생성 사이의 중복 유입을 막는다. 글쓰기 트래픽이 낮을 때 실행한다.

### 5. schema24 Leaguepedia 경기별 원자 저장 RPC

수집기 코드를 배포하기 전에 먼저 적용한다. 이 함수는 service_role만 호출할 수 있고,
한 경기의 신규 행·세트 상세·대회 교정을 한 트랜잭션으로 저장한다.

1. `supabase/schema24_leaguepedia_atomic.sql`
2. 결과가 `schema24 LEAGUEPEDIA ATOMIC OK`인지 확인
3. `supabase/tests/p0_collector_atomic_test.sql` 실행 — C0~C8 전부 PASS

RPC가 없거나 검증에 실패할 때 수집기는 직접 REST 저장으로 우회하지 않는다. 따라서 이 단계가
끝나기 전에는 새 수집기 실행을 승인하지 않는다.

### 6. 코드 배포

1. `p0-hardening`을 Preview에서 다시 확인
2. 승인된 경우에만 `main` 병합·배포
3. 운영에서 다음을 확인
   - 회원 글 투표 생성/조회
   - 회원 투표에 `match_id`·phase가 없음
   - 경기 페이지에는 phase가 있는 공식 투표만 노출
   - 공식 경기방 댓글 연결 유지
   - `/match/m8` 등 오류 경기는 승 배지 대신 검수 안내

### 7. schema25 FINAL 잠금

코드 배포와 회원 투표 RPC 성공을 확인한 뒤 즉시 실행한다.

1. `supabase/schema25_p0_rpc_only.sql`
2. 결과가 `schema25 FINAL OK`인지 확인
3. `supabase/tests/p0_rls_test.sql` 실행 — F0~F14, 15개 전부 PASS
4. audit ⑤에서 `member_insert_polls`가 없고, `create_member_poll`은 authenticated만 실행 가능한지 확인

### 8. P0-2 win 교정 — 권한 작업과 별도

1. **수정된 Leaguepedia 수집기가 운영에 배포됐는지 먼저 확인**
2. 기존 team/side 연결 오염 가능성이 있는 영향 경기를 수정 수집기로 공식 소스에서 재수집
3. 재수집이 끝난 뒤 audit ⑥·⑦을 다시 실행해 정확 대상과 문제 경기를 새로 확정
4. 남은 audit ⑥ 후보를 사람이 공식 세트 결과와 대조하고, `backfill_p0_setwin.sql` ① 결과와 같은지 확인
5. audit ⑥에서 검토·승인한 **모든** `(match_id, detail_fingerprint)` 쌍을 `backfill_p0_setwin.sql` 상단 `p0_setwin_approved_match_ids` VALUES에 복사하고 두 placeholder를 제거
6. 그 후에만 `supabase/backfill_p0_setwin.sql` 전체 실행. 빈 allowlist·placeholder·중복 ID는 수정 전 중단됨
7. 파일은 하나의 트랜잭션에서 다음을 수행
   - `matches`·`match_details` 쓰기를 잠시 잠가 동시 수집과 경합 차단
   - 잠금 후 exact-safe 대상 id 전체를 재계산
   - 운영자 allowlist와 재계산 대상 ID가 **양방향으로 정확히 같고**, 각 detail fingerprint도 같은지 확인
   - 승인했지만 현재 unsafe인 ID, 새로 생긴 미승인 exact ID, 승인 후 상세가 바뀐 ID가 하나라도 있으면 전체 롤백
   - 먼저 경기별 승인 시점 핵심 JSON(`id/lp_id/A/B/status/score`)과 fingerprint를 `p0_ops.setwin_match_backup_20260809`에 백업
   - 그다음 원래 `(match_id,set_index,win)`과 `win` 제외 행 전체 JSON을 `p0_ops.setwin_backup_20260809`에 백업
   - 백업행과 수정행 수 일치 검증
   - a↔b 교정
   - 행 단위, set_index `0..N-1` 완전성, 경기 스코어 단위 검증
   - 검증 실패 시 전체 롤백
8. 운영 경기 화면과 관리자 검수 결과를 확인하고 두 백업 테이블은 유지

`detail_fingerprint`는 `id/lp_id/A/B/status/score` 경기 핵심 정보와 set_index 순의 세트 행 전체(win/players/game 포함)를 합쳐 계산한다. 직접 재계산하거나 수정하지 말고, 사람이 검토한 audit ⑥ 결과의 값을 그대로 복사한다.

**side 5:5는 형식 정합성일 뿐, 해당 선수가 실제 A/B 팀에 올바르게 연결됐다는 신원 증명이 아니다.** 따라서 수정 수집기 배포·영향 경기 재수집 전에는, side가 5:5로 보여도 win 백필을 실행하지 않는다. 부분수집, set_index 결번/중복/범위 이탈, side 5:5 실패 경기는 모두 재수집/수동 검수가 우선이다.
잠금은 일반 조회를 막지 않지만 경기 수집·관리자 경기 저장과는 충돌한다. 수집 작업을 잠시 멈추거나 겹치지 않는 짧은 유지보수 시간에 실행한다.

## 롤백

### 코드 배포 롤백

FINAL(`schema25`) 뒤 옛 코드로 돌아가면 옛 코드의 직접 INSERT가 막혀 회원 투표가 실패한다. 다음 순서를 쓴다.

1. `schema22_p0_official_content.sql`을 다시 실행해 **안전한 TRANSITION 정책** 복원
2. `p0_rls_transition_test.sql` 통과 확인
3. 코드 이전 버전 배포

취약했던 구 정책(`post_id만 검사`)으로 되돌리지 않는다.

### schema25만 되돌리기

`schema22_p0_official_content.sql`을 재실행하면 제한된 transition 정책이 복원된다. RPC와 `is_official`은 유지된다.

### schema23 되돌리기

전역 `update posts set is_official=false`는 사용하지 않는다. cleanup에서 사람이 승격한
시드방까지 지워 버리기 때문이다. `supabase/rollback_p0_official.sql`을 실행한다.
이 파일은 `posts`를 잠근 뒤 백업행 존재와 현재 `is_official` 값을 검사하며, schema23 뒤
공식 표시가 달라진 글이 있으면 덮어쓰지 않고 전체 롤백을 중단한다.

### 세트 win 교정 되돌리기

`supabase/rollback_p0_setwin.sql`을 실행한다. 영구 백업의 `win_before`를 복원하고 검증한 뒤 COMMIT한다. 롤백 전에 `matches`·`match_details`·두 백업 테이블을 모두 잠근다. 구 백업(`row_without_win_before` 또는 경기별 핵심/fingerprint 없음), 백업 대상 집합 불일치, `lp_id/A/B/status/score` 변경, 누락/추가 세트, win 외 행 내용 변경이 하나라도 있으면 덮어쓰지 않고 중단한다. 복원 후에도 전체 fingerprint가 승인 시점과 같은지 재검증한다.

같은 뒤집기 파일을 재실행하는 방식은 롤백이 아니다. 교정 후 대상 조건이 거짓이 되어 보통 0행을 수정한다. 과거 `fix7_flip_set_winners.sql`을 백업 없이 이미 실행했다면 Supabase 시점 복구 또는 별도 실행 전 자료가 필요하다.

## 검증 현황

로컬 자동 검사 기준:

- `invariants.test.js`: 15개 통과
- `leaguepedia-integrity.test.js`: 55개 통과
- `leaguepedia-atomic-transport.test.js`: 경기별 RPC 1회·직접 저장 fallback 차단·tid 교정·미완료 POM 차단 계약 통과
- `race.golden.test.js`: 60개 통과
- `admin-save-order.test.js`: 1개 통합 시나리오 통과
- `snapshot-refresh.test.js`: 스냅샷 v3 폐기·공식 경기방 갱신 회귀 통과
- 자산 버전·NUL·JS/Python 구문·`vercel.json` 검사 포함
- SQL 단계 A: T0~T13, 14개 검증 — 최신 파일로 로컬 PostgreSQL 16 통과
- SQL 단계 B: F0~F14, 15개 검증 — 최신 파일로 로컬 PostgreSQL 16 통과
- `audit_p0_read_only.sql` 최신 파일 전체 실제 실행 통과
- schema23 백필 → 백업 기반 롤백 → 재적용 왕복 통과
- 최신 fingerprint 승인 + 두 백업 테이블로 세트 win `{a,a} → {b,b} → {a,a}` 왕복 통과;
  경기 핵심 `lp_id` 변경 시 롤백이 수정 없이 중단하는 fail-safe도 실제 통과
- schema24 원자 저장 RPC + C0~C8, 9개 검증 — 최신 파일로 실제 통과
- schema25 FINAL → schema22 TRANSITION 복원 → schema25 재잠금 왕복 통과

위 검증은 2026-08-11 현재 파일 그대로 실행했다. 운영 DB에서는 데이터·정책 drift가 다를 수
있으므로 배포 단계에서도 **audit 전체 → T0~T13 → C0~C8 → F0~F14**를 다시 확인하고,
실제 audit ⑥ 승인값으로만 백필한다.

로컬 검증 DB에는 Supabase 역할·`auth.uid()`·RLS·기존 스키마를 재현했다. 다만 운영 정책 드리프트와 실제 오염 데이터까지 보장하는 것은 아니므로, 운영에서는 각 단계에 맞는 감사·권한 테스트를 다시 실행한다.

## 미해결 P1/P2

- 익명 voter id 위조와 반복 참여 방지
- 경기 저장·순위 반영·counted의 단일 트랜잭션화
- GitHub Actions CI
- 운영 정책 drift 주기 검사
- soft 404, 팀/선수/게시글 SSR, 완료 경기 `EventCompleted`
- 데이터 수집 실패·stale 외부 알림

## 변경·적용 상태 (2026-08-11 실측)

- Git commit·push **완료** — 운영 `main` = `ee19140`
- Vercel 배포 **완료** — Production Ready, 자산 `?v=20260812a`
- 운영 DB **적용 완료** — `schema22` · `schema23` · `schema24`
- 세트 win 뒤집힘 backfill **적용 완료** — 대상 경기 정합성 위반 0건
- `schema25`(FINAL 잠금)만 **미확인** — 위 머리말의 확인 SQL로 판정할 것

> 이 절은 과거에 "아무것도 적용하지 않음"이라고 적혀 있었다. 실제로는 전부 적용된
> 뒤였고, 그 표기를 믿으면 파괴적 SQL을 재실행할 위험이 있어 실측값으로 바로잡았다.
