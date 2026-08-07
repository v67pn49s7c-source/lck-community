-- ══════════════════════════════════════════════════════════════════
-- fix7: 세트 승패가 통째로 뒤집혀 저장된 경기 바로잡기
-- ══════════════════════════════════════════════════════════════════
-- 증상:
--   경기 페이지에 "BNK FEARX 승리" 라고 써놓고 바로 아래에
--   "1세트 DN SOOPers 승 / 2세트 DN SOOPers 승" 이 나온다.
--   검색엔진이 읽어 가는 서버 렌더링 페이지라 그대로 색인된다.
--
-- 원인 (api/leaguepedia.js — 코드는 이미 고쳤다):
--   수집기는 Leaguepedia 의 **1세트 블루 진영 팀**을 A 로 보고 승패를 a/b 로 적었는데,
--   실제 matches.a 는 일정표(schedule-sync)의 Team1 이다. 둘이 다른 경기에서는
--   그 경기의 모든 세트 승패가 반대로 저장됐다.
--
-- 확인 근거 (킬·골드로 교차 검증함):
--   예) Week10_3  1세트 킬 dns 5 : bfx 17 · 골드 52k : 64k  →  실제 승자는 bfx 인데 win='a'(dns)
--
-- 무엇을 하나:
--   **세트 승수 합계가 경기 스코어와 어긋나고, 뒤집으면 맞아떨어지는 경기만** 뒤집는다.
--   (세트 기록이 덜 수집된 경기는 뒤집어도 안 맞으므로 건드리지 않는다 — 재수집이 답)
--
-- 실행: Supabase SQL Editor 에 전체 붙여넣기 → Run
-- 되돌리기: 같은 파일을 한 번 더 실행하면 원래대로 돌아온다(대상 조건이 대칭이므로).
--            단 두 번 실행할 이유는 없다.
-- ══════════════════════════════════════════════════════════════════

-- ── 1) 대상 확인 (뒤집기 전에 눈으로 본다) ─────────────────────
with agg as (
  select d.match_id,
         count(*) filter (where d.win = 'a') as wa,
         count(*) filter (where d.win = 'b') as wb
  from match_details d
  where d.win in ('a', 'b')
  group by d.match_id
)
select m.id, m.a, m.score_a, m.score_b, m.b,
       agg.wa as "세트합_a", agg.wb as "세트합_b",
       case when agg.wb = m.score_a and agg.wa = m.score_b
            then '뒤집으면 일치 → 대상' else '불일치 → 건드리지 않음' end as "판정"
from matches m join agg on agg.match_id = m.id
where m.score_a is not null
  and (agg.wa, agg.wb) is distinct from (m.score_a, m.score_b)
order by m.at;

-- ── 2) 뒤집기 ───────────────────────────────────────────────────
with agg as (
  select d.match_id,
         count(*) filter (where d.win = 'a') as wa,
         count(*) filter (where d.win = 'b') as wb
  from match_details d
  where d.win in ('a', 'b')
  group by d.match_id
),
target as (
  select m.id
  from matches m join agg on agg.match_id = m.id
  where m.score_a is not null
    and (agg.wa, agg.wb) is distinct from (m.score_a, m.score_b)   -- 지금 어긋나고
    and agg.wb = m.score_a and agg.wa = m.score_b                  -- 뒤집으면 맞는 경기만
)
update match_details d
   set win = case d.win when 'a' then 'b' when 'b' then 'a' else d.win end
 where d.match_id in (select id from target);

-- ── 3) 확인 ─────────────────────────────────────────────────────
with agg as (
  select d.match_id,
         count(*) filter (where d.win = 'a') as wa,
         count(*) filter (where d.win = 'b') as wb
  from match_details d
  where d.win in ('a', 'b')
  group by d.match_id
)
select case when count(*) = 0
         then '세트 승패 정리 OK — 남은 불일치 없음'
         else '남은 불일치 ' || count(*) || '경기 (세트 기록이 덜 수집된 경기 — 관리자 화면에서 재수집 필요)'
       end as "결과"
from matches m join agg on agg.match_id = m.id
where m.score_a is not null
  and (agg.wa, agg.wb) is distinct from (m.score_a, m.score_b);
