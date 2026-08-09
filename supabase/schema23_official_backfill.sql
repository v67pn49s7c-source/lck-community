-- ═══════════════════════════════════════════════════════════════════
-- schema23: 공식 토론방 백필 + 경기당 1개 강제 (P0-1 후반부)
--
-- ⚠ 실행 전 반드시 audit_p0_read_only.sql 의 ①·② 를 먼저 확인하세요.
--   · ① 에 나온 오염 글이 있으면 cleanup_p0_manual.sql 로 먼저 정리
--   · ② 에 중복 토론방이 있으면 어느 글을 남길지 사람이 정한 뒤 정리
--   아래 유니크 인덱스는 중복이 남아 있으면 실패합니다 — 그게 의도입니다.
--   (Supabase SQL Editor 는 한 트랜잭션으로 돌므로 실패 시 전체가 되돌아갑니다)
--
-- 여러 번 실행해도 안전합니다.
-- ═══════════════════════════════════════════════════════════════════

-- ── ① 백필: 관리자가 만든 [경기 토론] 글에 공식 표시 ───────────────
-- 조건 세 개를 모두 요구한다 — 경기 연결 + 관례 제목 + **관리자 작성**.
-- 제목만 흉내 낸 일반 글은 관리자 작성이 아니므로 표시되지 않는다.
update posts p
   set is_official = true
 where p.match_id is not null
   and p.title like '[경기 토론]%'
   and p.is_official = false
   and exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_admin);

-- ── ② 경기당 공식 토론방은 하나뿐 ──────────────────────────────────
create unique index if not exists one_official_thread_per_match
  on posts (match_id) where is_official and match_id is not null;

-- ═══ 확인 ═══
select
  (select count(*) from posts where is_official) as 공식_토론방_수,
  (select count(distinct match_id) from posts where is_official) as 경기_수,
  case when exists (select 1 from pg_indexes where indexname = 'one_official_thread_per_match')
       then 'schema23 OK' else '인덱스 생성 실패' end as "결과";
