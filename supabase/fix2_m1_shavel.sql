-- ── m1 (DNS vs BRO) 정글: 표식(Pyosik) → 샤벨(Shavel) 교체 ──
-- 실제 출전은 샤벨. 1·3세트에 남아 있는 표식 기록(스탯 포함)을 샤벨 것으로 바꾸고,
-- 세트 저장 때 딸려 들어간 "챔피언 빈칸" 서브 행도 정리한다.
-- Supabase 대시보드 → SQL Editor에 붙여넣고 Run.

update match_details md
set players = (
  select jsonb_agg(
    case when e.elem->>'pid' = 'dns-pyosik-1785696707312'
      then jsonb_set(e.elem, '{pid}', to_jsonb('dns-shavel-1785696605626'::text))
      else e.elem end
    order by e.ord)
  from jsonb_array_elements(md.players) with ordinality as e(elem, ord)
  where coalesce(trim(e.elem->>'champ'), '') <> ''   -- 챔피언 빈칸(미출전) 행 제거
)
where md.match_id = 'm1';

-- 표식에게 매겨진 평점을 샤벨로 이어 붙인다 (같은 사람이 둘 다 평가했으면 샤벨 것 유지)
update ratings r
set player_id = 'dns-shavel-1785696605626'
where r.match_id = 'm1' and r.player_id = 'dns-pyosik-1785696707312'
  and not exists (
    select 1 from ratings r2
    where r2.match_id = r.match_id
      and r2.player_id = 'dns-shavel-1785696605626'
      and r2.voter = r.voter);
delete from ratings where match_id = 'm1' and player_id = 'dns-pyosik-1785696707312';

-- 확인용 (주석 해제 후 실행하면 세트별 출전 선수가 보인다)
-- select set_index, e.elem->>'pid' as pid, e.elem->>'champ' as champ
-- from match_details md, jsonb_array_elements(md.players) with ordinality as e(elem, ord)
-- where md.match_id = 'm1' order by set_index, e.ord;
