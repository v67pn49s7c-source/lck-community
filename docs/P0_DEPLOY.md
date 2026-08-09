# P0 하드닝 — 적용 순서 · 롤백 · 미해결 위험

브랜치 `p0-hardening` · 커밋 `7cedad7` (감사 기준 `23030e9`에서 분기)
**아직 아무것도 운영에 적용하지 않았습니다.** main push·Vercel 배포·운영 DB 실행은 별도 승인 후.

---

## 실제 확인된 문제 vs 가정으로 남은 것

| 구분 | 내용 | 확인 방법 |
|---|---|---|
| **확인됨** | P0-1 회원 투표에 match_id·post_id 소유 검사 없음 | `schema10_member_polls.sql:14-20` 정책 본문 |
| **확인됨** | P0-1 create_post 가 비관리자 match_id 저장 | `schema11_post_edit.sql:87-88` |
| **확인됨** | P0-1 matchTalkPost 가 제목+최신순으로 토론방 판정 | `store.js` (수정 전) |
| **확인됨** | P0-2 종료 경기 세트 win/score 모순 — **m8 외 총 10경기** | 로컬 프리뷰에서 `finishedMatchViolations` 전수 |
| **확인됨** | admin.html NUL 2개 → 버전 범프 누락(20260808i 고착) | `python3 -c "open('admin.html','rb').read().count(b'\x00')"` |
| **가정** | 운영 RLS 정책이 저장소 SQL과 동일 | ⚠ 드리프트 가능 — `audit_p0_read_only.sql ⑤`로 운영에서 확인 필요 |
| **가정** | 관리자 공식 투표는 `admin_all_polls`(schema7)로 계속 통과 | 저장소엔 있음. 운영 잔존은 감사 ⑤로 확인 |
| **가정** | m1~m8 세트 win 손상이 "저장 시 팀순서 뒤집힘"인지 "원본 수기 오류"인지 | 원본이 저장소에 없어 단정 불가. 표시만 차단, 데이터 미변경 |

---

## 운영에서 먼저 돌릴 읽기 전용 SQL

`supabase/audit_p0_read_only.sql` 전체 (SELECT만, 변경 없음). 특히:
- **①** 비공식 계정이 만든 match_id 글 → schema23 백필 전에 정리 대상 파악
- **②** 경기당 [경기 토론] 중복 → 유니크 인덱스가 실패할지 미리 확인
- **③④** 회원이 끼워 넣은 공식 흉내 투표 / 고아 투표
- **⑤** `pg_policies` 실제 정책 — 저장소 SQL과 드리프트 여부
- **⑥⑦** 종료 경기 정합성 위반 목록 (백필 규모)

---

## 적용 순서 (승인 후)

1. **코드 배포 먼저, DB 나중** — 순서가 중요하다.
   클라이언트는 schema22 전에도 안전하게 동작하도록 폴백을 넣었다:
   - `createMemberPoll`: RPC 없으면 옛 직접 INSERT (옛 정책이 아직 살아 있어 통과)
   - `matchTalkPost`: is_official 없으면 제목+**가장 오래된** 글
   반대로 DB를 먼저 바꾸면, 옛 코드(`createPoll` 직접 INSERT로 회원 투표)가
   삭제된 정책에 막혀 회원 투표가 잠깐 죽는다. **코드 → DB 순서 유지.**

2. `bash tests/check.sh` 통과 확인 → `p0-hardening`을 Vercel Preview로 확인
   → 승인 → main 병합 → 자동 배포.

3. 배포 안정 후 **staging 또는 운영**에서:
   - `audit_p0_read_only.sql` 실행 → ①② 결과 확보
   - 오염이 있으면 `cleanup_p0_manual.sql`에 id를 채워 **한 줄씩** 실행
   - `schema22_p0_official_content.sql` 실행 (여러 번 안전)
   - `schema23_official_backfill.sql` 실행 (②가 깨끗해야 인덱스 성공)
   - `supabase/tests/p0_rls_test.sql` 실행 → 전부 `PASS` 확인 (BEGIN…ROLLBACK)

4. P0-2 데이터 백필(선택): 관리자 화면 '데이터 검수' 목록을 보고
   경기별로 재수집(데이터 수집 버튼) 또는 경기 상세 입력에서 세트 승자 수정.
   **자동 backfill SQL은 만들지 않았다** — 어느 쪽이 진짜 승자인지 원본 없이 단정 불가.

---

## 롤백

- **코드**: `git revert 7cedad7` 후 재배포. 폴백 덕에 DB가 이미 바뀌었어도
  옛 코드가 새 RPC를 못 찾으면 직접 INSERT로 되돌아가나, schema22가
  `member_insert_polls`를 지웠으면 회원 투표만 잠깐 막힌다 → 아래 DB 롤백 병행.
- **schema22**: 아래를 실행하면 옛 정책이 되살아난다.
  ```sql
  drop function if exists create_member_poll(text,text,text,jsonb,boolean,timestamptz);
  create policy "member_insert_polls" on polls for insert to authenticated with check (
    post_id is not null and phase is null
    and id ~ '^[A-Za-z0-9_-]{1,80}$' and char_length(question) <= 200
    and jsonb_array_length(options) between 2 and 10);
  ```
  `create_post`는 서명을 안 바꿨으므로 되돌릴 필요 없음. `is_official` 칸은
  남겨도 무해(기본 false).
- **schema23**: `drop index if exists one_official_thread_per_match;`
  백필한 `is_official=true`는 `update posts set is_official=false;`로 초기화 가능.

---

## 미해결 위험 (P1/P2 백로그로 넘김)

- **익명 voter ID 위조** — timestamp+Math.random, 서버는 형식만 검사.
  localStorage 삭제로 반복 투표. → 서버 서명 쿠키 + rate limit + Turnstile.
- **경기 저장 원자성** — `updateMatch`가 fire-and-forget, 순위 반영과 분리.
  → 저장+순위반영+counted를 단일 트랜잭션 RPC로.
- **CI 없음** — `tests/check.sh`는 만들었으나 GitHub Actions 미구성.
  → PR에서 check.sh 자동 실행.
- **정책 드리프트 상시 검사 없음** — 저장소 SQL이 운영과 같다는 보장 없음.
  → pg_policies 스냅샷을 저장소에 두고 주기 비교.
- **soft 404, SSR 메타, EventCompleted** — SEO 백로그.
- **P0-2 원인 미규명** — 세트 win 손상이 저장 시 팀순서 뒤집힘인지 확인 필요.
  재현되면 수집기 line 536/573의 `baseA` 매칭을 봐야 한다.

---

## 변경 파일

```
신규  supabase/schema22_p0_official_content.sql   회원투표 RPC · match_id 차단 · is_official
신규  supabase/schema23_official_backfill.sql     토론방 백필 + 경기당 1개 인덱스
신규  supabase/audit_p0_read_only.sql             읽기 전용 감사 7종
신규  supabase/cleanup_p0_manual.sql              수동 정리 틀 (자동 실행 안 함)
신규  supabase/tests/p0_rls_test.sql              권한 회귀 7종 (ROLLBACK)
신규  assets/invariants.js                        정합성 판정 (브라우저+Node)
신규  tests/invariants.test.js                    정합성 회귀 12건
신규  tests/race.golden.test.js                   경우의 수 golden 60건
신규  tests/check.sh                              정적 검사 일괄
수정  assets/store.js       pollsForMatch·matchTalkPost·createMemberPoll·is_official 매핑
수정  assets/board.js       회원 투표 RPC화·match_id 미전달·투표 종류 라벨
수정  assets/app.js         setScoreboardHTML 정합성 게이트
수정  live.html             세트 승 배지 게이트 + invariants.js 포함
수정  admin.html            NUL 제거·버전 통일·데이터 검수 카드·invariants.js 포함
수정  api/leaguepedia.js    수집 직후 정합성 경고
```

## 테스트 결과 (로컬)

```
bash tests/check.sh → 전부 통과
  자산 버전 통일: ?v=20260809d · NUL 없음 · JS/Python 구문 OK
  invariants.test: 12 통과, 0 실패
  race.golden.test: 60 통과, 0 실패
  vercel.json OK
로컬 프리뷰: /match/m8 "기록 확인 중"·"검수 중" 표시 확인, 정상 경기(m5) "세트 승" 유지,
            글 투표 "글쓴이 자유 투표" 라벨, match_id+phase없는 오염 투표 0건
```

## push·배포·운영 DB 적용 여부

**하지 않았습니다.** 브랜치 `p0-hardening`에만 커밋. 승인 대기.
