-- ── 선수를 지웠다 다시 등록해 id가 바뀐 경우의 기록 이어붙이기 ──
-- Shavel(옛 id) → Sharvel(새 id)로 세트 기록·평점을 옮긴다.
-- 그대로 두면 m1 경기 상세·평점에서 "없는 선수"로 취급돼 사진·평점이 안 붙는다.
-- Supabase 대시보드 → SQL Editor에 붙여넣고 Run.

-- 1) 세트 기록(1·2·3세트)의 선수 id 교체
update match_details md
set players = (
  select jsonb_agg(
    case when e.elem->>'pid' = 'dns-shavel-1785696605626'
      then jsonb_set(e.elem, '{pid}', to_jsonb('dns-sharvel-1785756268044'::text))
      else e.elem end
    order by e.ord)
  from jsonb_array_elements(md.players) with ordinality as e(elem, ord)
)
where md.players::text like '%dns-shavel-1785696605626%';

-- 2) 평점 이어붙이기 (같은 사람이 새 id로도 매겼으면 새 것 유지)
update ratings r
set player_id = 'dns-sharvel-1785756268044'
where r.player_id = 'dns-shavel-1785696605626'
  and not exists (
    select 1 from ratings r2
    where r2.match_id = r.match_id
      and r2.player_id = 'dns-sharvel-1785756268044'
      and r2.voter = r.voter);

-- 3) 이제 존재하지 않는 선수에게 달린 평점 정리 (옛 Shavel, 옛 kt-peter)
delete from ratings
where player_id not in (select id from players);

-- 확인용: 아래를 실행하면 결과가 0줄이어야 정상
-- select r.player_id, count(*) from ratings r
-- where r.player_id not in (select id from players) group by 1;
