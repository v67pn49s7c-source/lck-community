-- ═══════════════════════════════════════════════════════════════════
-- P0 읽기 전용 감사 — 아무것도 바꾸지 않습니다 (SELECT 만).
-- Supabase SQL Editor 에 통째로 붙여 실행하세요. 결과는 마지막 SELECT 만
-- 보이므로, 항목별로 나눠 실행하는 것을 권장합니다.
-- ═══════════════════════════════════════════════════════════════════

-- ── ① 관리자로 입증되지 않은 경기 연결 글 (사람 검토 후보) ─────────
-- author_id 없는 과거 글은 비회원이라고 단정할 수 없다. 초기 관리자 시드일 수도
-- 있으므로 닉네임·제목·댓글·생성 시점을 확인해 승격 또는 연결 해제를 결정한다.
select p.id, p.title, p.match_id, p.nick, p.author_id, p.created_at,
       case when p.author_id is null then 'author_id 없음 — 시드/과거자료 확인'
            when pr.is_admin then '관리자'
            else '일반회원' end as 작성자구분
  from posts p
  left join profiles pr on pr.id = p.author_id
 where p.match_id is not null
   and (p.author_id is null or coalesce(pr.is_admin, false) = false)
 order by p.created_at desc;

-- ── ② 경기당 [경기 토론] 글이 두 개 이상인 경기 (토론방 중복) ──────
select match_id, count(*) as 글수, array_agg(id order by created_at) as 글목록
  from posts
 where match_id is not null and title like '[경기 토론]%'
 group by match_id having count(*) > 1;

-- ── ③ 공식 흉내 투표 — match_id 는 있는데 phase 가 없는 투표 ───────
-- 관리자 공식 투표는 항상 phase(pre/post_pom/post_key)가 있다.
-- phase 없이 match_id 만 있으면 회원이 끼워 넣은 것이다.
select id, match_id, post_id, question, created_at
  from polls
 where match_id is not null and phase is null
 order by created_at desc;

-- ── ④ 부모 글이 사라진 고아 자유 투표 ─────────────────────────────
-- polls에는 과거 생성자 id가 없어 이미 만들어진 '남의 글 연결'을 사후에 확정할 수 없다.
-- schema22부터는 정책/RPC가 생성 시점의 auth.uid()와 posts.author_id를 비교한다.
select po.id, po.post_id, po.question,
       case when p.id is null then '글 없음' else '글 있음' end as 부모글
  from polls po
  left join posts p on p.id = po.post_id
 where po.post_id is not null and po.phase is null and p.id is null;

-- ── ⑤ 정책·함수 권한 드리프트 검사 ─────────────────────────────────
-- 단계별 기대:
--   · schema22 전: member_insert_polls가 있을 수 있으나 match_id/소유 검사가 없음
--   · schema22 TRANSITION 후: 같은 정책이 남되 match_id NULL + 자기 글만 허용
--   · schema25 FINAL 후: member_insert_polls가 없어야 함(회원은 RPC 전용)
select c.relname as 테이블, c.relrowsecurity as rls_활성
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname in ('polls', 'posts')
 order by c.relname;

select tablename, policyname, cmd, roles, with_check
  from pg_policies
 where schemaname = 'public' and tablename in ('polls', 'posts')
 order by tablename, policyname;

-- SECURITY DEFINER 함수의 PUBLIC 기본 EXECUTE가 제거됐는지도 함께 본다.
-- persist_leaguepedia_match는 service_role만 true, anon/회원은 모두 false여야 한다.
select p.oid::regprocedure as 함수,
       p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_실행,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as 회원_실행,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_실행
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('create_member_poll', 'create_post', 'persist_leaguepedia_match')
 order by p.proname;

-- 정책이 남아 있어도 직접 table/column grant가 없으면 RPC 밖의 쓰기는 불가능하다.
-- schema22 이후에는 두 역할의 posts 직접 INSERT/UPDATE/DELETE가 모두 false여야 한다.
select role_name as 역할,
       has_any_column_privilege(role_name, 'public.posts', 'INSERT') as posts_insert,
       has_any_column_privilege(role_name, 'public.posts', 'UPDATE') as posts_update,
       has_table_privilege(role_name, 'public.posts', 'DELETE') as posts_delete
  from (values ('anon'), ('authenticated')) as roles(role_name)
 order by role_name;

-- ── ⑥ 종료 경기 정합성 — 안전한 a↔b 백필 **정확 대상만** ──────────
-- set_index가 정확히 0..N-1이고, 전 세트가 있고, 모든 win이 a/b이며,
-- 승수 합계가 최종 스코어와 완전히 반대인 경기.
-- detail_fingerprint는 경기 정체성(id/lp_id/A/B/status/score) + set_index 순의
-- win/players/game 등 세트 행 전체를 하나로 해싱한다.
-- 승인 후 행 내용이 하나라도 바뀌면 백필 allowlist 검사가 중단한다.
-- 이 결과만 backfill_p0_setwin.sql의 자동 교정 대상이다.
with agg as (
  select d.match_id,
         count(*) as sets,
         count(distinct set_index) as index_distinct,
         min(set_index) as index_min,
         max(set_index) as index_max,
         md5(
           jsonb_build_object(
             'id', fm.id, 'lp_id', fm.lp_id, 'a', fm.a, 'b', fm.b,
             'status', fm.status, 'score_a', fm.score_a, 'score_b', fm.score_b
           )::text || '|details:' ||
           string_agg((to_jsonb(d) - 'match_id')::text, '|' order by d.set_index)
         ) as detail_fingerprint,
         count(*) filter (where win in ('a','b')) as labeled,
         count(*) filter (where win = 'a') as wa,
         count(*) filter (where win = 'b') as wb,
         count(*) filter (where case when jsonb_typeof(players) = 'array' then
           jsonb_array_length(players) = 10
           and (select count(*) from jsonb_array_elements(players) p where p->>'side' = 'a') = 5
           and (select count(*) from jsonb_array_elements(players) p where p->>'side' = 'b') = 5
         else false end) as side_ok
    from match_details d
    join matches fm on fm.id = d.match_id
   group by d.match_id, fm.id, fm.lp_id, fm.a, fm.b, fm.status, fm.score_a, fm.score_b
)
select m.id, m.a, m.b, m.score_a, m.score_b, a.wa, a.wb, a.sets,
       a.index_distinct, a.index_min, a.index_max, a.side_ok,
       a.detail_fingerprint
  from matches m join agg a on a.match_id = m.id
 where m.status = 'done'
   and m.score_a is not null and m.score_b is not null
   and m.score_a <> m.score_b
   and a.sets = m.score_a + m.score_b
   and a.index_distinct = a.sets
   and a.index_min = 0 and a.index_max = a.sets - 1
   and a.labeled = a.sets
   and a.side_ok = a.sets
   and a.wa = m.score_b and a.wb = m.score_a
 order by m.id;

-- ── ⑦ 부분수집·win 누락·혼합 불일치 — 자동 백필과 분리 ────────────
-- 아래는 a↔b 뒤집기 대상이 아니다. Leaguepedia 재수집 또는 경기별 수동 검수가 필요하다.
with agg as (
  select match_id,
         count(*) as sets,
         count(distinct set_index) as index_distinct,
         min(set_index) as index_min,
         max(set_index) as index_max,
         count(*) filter (where win in ('a','b')) as labeled,
         count(*) filter (where win = 'a') as wa,
         count(*) filter (where win = 'b') as wb,
         count(*) filter (where case when jsonb_typeof(players) = 'array' then
           jsonb_array_length(players) = 10
           and (select count(*) from jsonb_array_elements(players) p where p->>'side' = 'a') = 5
           and (select count(*) from jsonb_array_elements(players) p where p->>'side' = 'b') = 5
         else false end) as side_ok
    from match_details group by match_id
), state as (
  select m.*, coalesce(a.sets,0) sets, coalesce(a.labeled,0) labeled,
         coalesce(a.wa,0) wa, coalesce(a.wb,0) wb, coalesce(a.side_ok,0) side_ok,
         coalesce(a.index_distinct,0) index_distinct, a.index_min, a.index_max,
         m.score_a + m.score_b expected
    from matches m left join agg a on a.match_id = m.id
   where m.status = 'done' and m.score_a is not null and m.score_b is not null
)
select id, a, b, score_a, score_b, wa, wb, sets,
       index_distinct, index_min, index_max, side_ok,
       case when sets = expected
                  and index_distinct = expected
                  and index_min = 0 and index_max = expected - 1
            then '정상(0..N-1 완전)'
            else '문제(결번/중복/범위 이탈 가능)' end as set_index_상태,
       case when sets < expected then '부분수집/상세 없음 — 재수집'
            when sets > expected then '예상보다 세트가 많음 — 유령/중복 세트 검수'
            when index_distinct <> expected
              or index_min is distinct from 0
              or index_max is distinct from expected - 1
              then 'set_index가 0..N-1이 아님 — 결번/중복/범위 이탈 검수'
            when side_ok < sets then '선수 side가 세트마다 5:5가 아님 — 재수집'
            when labeled < sets then 'win 누락·잘못된 값 — 수동 검수'
            else '혼합 불일치 — 수동 검수' end as 조치
  from state
 where not (sets = expected
            and index_distinct = expected and index_min = 0 and index_max = expected - 1
            and labeled = sets and side_ok = sets
            and wa = score_a and wb = score_b)
   and not (score_a <> score_b and sets = expected
            and index_distinct = expected and index_min = 0 and index_max = expected - 1
            and labeled = sets and side_ok = sets
            and wa = score_b and wb = score_a)
 order by id;

-- ── ⑧ 종료인데 스코어가 없거나 동점인 경기 ─────────────────────────
select id, a, b, score_a, score_b, at
  from matches
 where status = 'done'
   and (score_a is null or score_b is null or score_a = score_b);
