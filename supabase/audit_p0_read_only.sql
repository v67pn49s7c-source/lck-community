-- ═══════════════════════════════════════════════════════════════════
-- P0 읽기 전용 감사 — 아무것도 바꾸지 않습니다 (SELECT 만).
-- Supabase SQL Editor 에 통째로 붙여 실행하세요. 결과는 마지막 SELECT 만
-- 보이므로, 항목별로 나눠 실행하는 것을 권장합니다.
-- ═══════════════════════════════════════════════════════════════════

-- ── ① 비공식 계정이 만든 경기 연결 글 (공식 토론방 오염 후보) ──────
-- author_id 가 관리자가 아니거나(=회원) 아예 없는(=비회원) 글이
-- match_id 를 달고 있으면 오염이다.
select p.id, p.title, p.match_id, p.nick, p.created_at,
       case when p.author_id is null then '비회원'
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

-- ── ④ 부모 글이 없거나 남의 글에 붙은 투표 ─────────────────────────
select po.id, po.post_id, po.question,
       case when p.id is null then '글 없음' else '글 있음' end as 부모글
  from polls po
  left join posts p on p.id = po.post_id
 where po.post_id is not null and po.phase is null and p.id is null;

-- ── ⑤ 정책 드리프트 검사 — 저장소 SQL 과 운영 정책이 같은가 ────────
-- 기대: schema22 적용 전에는 member_insert_polls 가 보이고,
--       적용 후에는 사라져야 한다. 예상 밖의 정책이 보이면 드리프트.
select tablename, policyname, cmd, roles, with_check
  from pg_policies
 where schemaname = 'public' and tablename in ('polls', 'posts')
 order by tablename, policyname;

-- ── ⑥ 종료 경기 정합성 — 세트 승수가 최종 스코어와 다른 경기 ───────
-- (P0-2. /match/m8 = BFX 0:2 BRO 인데 두 세트가 모두 a 승으로 저장된 사례)
select m.id, m.a, m.b, m.score_a, m.score_b,
       count(*) filter (where d.win = 'a') as 세트승_a,
       count(*) filter (where d.win = 'b') as 세트승_b,
       count(*) as 저장된_세트
  from matches m
  join match_details d on d.match_id = m.id
 where m.status = 'done' and m.score_a is not null and m.score_b is not null
 group by m.id, m.a, m.b, m.score_a, m.score_b
having count(*) filter (where d.win = 'a') > m.score_a
    or count(*) filter (where d.win = 'b') > m.score_b
 order by m.id;

-- ── ⑦ 종료인데 스코어가 없거나 동점인 경기 ─────────────────────────
select id, a, b, score_a, score_b, at
  from matches
 where status = 'done'
   and (score_a is null or score_b is null or score_a = score_b);
