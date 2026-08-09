-- ═══════════════════════════════════════════════════════════════════
-- P0-2 데이터 백필 — 세트 승자 라벨 뒤집힘 교정
-- ⚠ 자동 실행 금지. 아래 ①(확인)을 먼저 돌려 대상을 눈으로 본 뒤, ②(교정)를
--   BEGIN…COMMIT 로 감싼 채 실행하세요. 되돌리려면 같은 UPDATE 를 한 번 더 돌리면
--   됩니다(뒤집기는 자기역함수).
--
-- 배경 (2026-08-09 감사 ⑥):
--   종료 경기 10건의 세트 win 라벨이 최종 스코어와 반대다. 예: m8 BFX 0:2 BRO 인데
--   두 세트가 win='a'(BFX). score_a/score_b 는 맞고(순위·경우의 수는 이 값으로 정확),
--   match_details.win 만 통째로 뒤집혔다.
--
-- 안전 원칙 — **정확히 반대인, 전 세트 수집된 경기만** 자동 뒤집는다:
--   · 저장된 세트 수 = score_a + score_b (부분 수집 아님)
--   · win='a' 세트 수 = score_b  그리고  win='b' 세트 수 = score_a  (완전 반대)
--   이 조건이면 "뒤집으면 정확히 맞음"이 보장된다. 부분 수집(예: Week10_8, 1세트만
--   저장)은 이 조건에 안 걸리므로 자동 대상에서 빠진다 → 재수집으로 해결.
--
-- ⚠ players[].side(각 선수의 팀 배정)는 건드리지 않는다. win(세트 승자)만 반대이고
--   팀 배정은 맞다는 전제다. 아래 ①-b 로 side 정합성을 함께 확인하세요.
-- ═══════════════════════════════════════════════════════════════════

-- ── ① 교정 대상 확인 (읽기 전용) ──────────────────────────────────
with agg as (
  select d.match_id,
         count(*) filter (where d.win = 'a') as wa,
         count(*) filter (where d.win = 'b') as wb,
         count(*) as sets
    from match_details d
   group by d.match_id
)
select m.id, m.a, m.b, m.score_a, m.score_b, a.wa, a.wb, a.sets,
       case when a.sets = m.score_a + m.score_b
                 and a.wa = m.score_b and a.wb = m.score_a
            then '뒤집기 대상 (완전 반대)'
            else '부분수집/불명 — 재수집 권장' end as 판정
  from matches m join agg a on a.match_id = m.id
 where m.status = 'done' and m.score_a is not null and m.score_b is not null
   and (a.wa > m.score_a or a.wb > m.score_b
        or (a.sets = m.score_a + m.score_b and (a.wa <> m.score_a or a.wb <> m.score_b)))
 order by m.id;

-- ── ①-b side 정합성 확인 (읽기 전용) — win 만 반대인지, 팀 배정도 틀렸는지 ──
-- 각 세트 players 의 side='a' 선수가 정말 match.a 팀 로스터인지 표본으로 본다.
-- (틀렸으면 win 뿐 아니라 팀 자체가 뒤집힌 것이라 이 백필로는 부족 — 재수집 필요)
-- select d.match_id, d.set_index,
--        jsonb_agg(distinct (p->>'side')) as sides
--   from match_details d, jsonb_array_elements(d.players) p
--  where d.match_id in ('m8','m1')
--  group by d.match_id, d.set_index order by d.match_id, d.set_index;

-- ── ② 교정 (BEGIN…COMMIT 로 감싸 실행) ────────────────────────────
-- 위 ① 에서 '뒤집기 대상'으로 나온 경기의 세트 win 을 a↔b 뒤집는다.
-- 조건을 UPDATE 안에 그대로 넣어, 대상이 아닌 경기는 절대 안 건드린다.

-- begin;
-- update match_details d
--    set win = case d.win when 'a' then 'b' when 'b' then 'a' else d.win end
--  where d.match_id in (
--    select m.id from matches m
--      join (select match_id,
--                   count(*) filter (where win='a') wa,
--                   count(*) filter (where win='b') wb,
--                   count(*) sets
--              from match_details group by match_id) a on a.match_id = m.id
--     where m.status='done' and m.score_a is not null and m.score_b is not null
--       and a.sets = m.score_a + m.score_b
--       and a.wa = m.score_b and a.wb = m.score_a
--   );
-- -- 교정 후 재확인: 위반이 0건이어야 한다
-- select m.id, m.score_a, m.score_b,
--        count(*) filter (where d.win='a') wa, count(*) filter (where d.win='b') wb
--   from matches m join match_details d on d.match_id=m.id
--  where m.status='done'
--  group by m.id, m.score_a, m.score_b
--  having count(*) filter (where d.win='a') <> m.score_a
--      or count(*) filter (where d.win='b') <> m.score_b;
-- commit;   -- ← 위 재확인이 비어 있으면 commit, 아니면 rollback
