-- ══════════════════════════════════════════════════════════════════
-- fix7: 세트 승패가 통째로 뒤집혀 저장된 경기 바로잡기
-- ══════════════════════════════════════════════════════════════════
-- ⚠ 과거 일회성 파일입니다. 신규 실행에는 백업·트랜잭션 검증·진짜 롤백이 있는
--   backfill_p0_setwin.sql을 사용하세요.
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
-- 신규 실행 금지: 아래 읽기 전용 진단만 참고하고 실제 교정은
-- backfill_p0_setwin.sql을 사용한다. 이 파일의 옛 UPDATE는 안전을 위해 봉인했다.
-- 롤백 주의: 같은 파일을 한 번 더 실행해도 되돌아가지 않는다.
--   첫 실행 뒤에는 '현재 스코어와 어긋나고 뒤집으면 맞음' 조건이 거짓이 되어 보통 0행이다.
--   이 과거 파일을 이미 실행했고 별도 백업이 없다면 Supabase 시점 복구 또는 실행 전
--   값이 담긴 별도 백업으로 복원해야 한다. 신규 작업은 rollback_p0_setwin.sql을 사용한다.
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
            then '과거 단순 승수 후보 — 자동 실행 금지'
            else '불일치 — 건드리지 않음' end as "판정"
from matches m join agg on agg.match_id = m.id
where m.score_a is not null
  and (agg.wa, agg.wb) is distinct from (m.score_a, m.score_b)
order by m.at;

-- ── 2) 과거 무백업 UPDATE 봉인 ───────────────────────────────────
-- 파일 전체를 실수로 실행해도 mutation 전에 즉시 멈춘다. 이 예외를 지우거나
-- 아래에서 별도 UPDATE를 만들지 말고 backfill_p0_setwin.sql을 사용한다.
do $$
begin
  raise exception '이 과거 무백업 교정 파일은 실행 금지입니다. backfill_p0_setwin.sql을 사용하세요';
end $$;

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
