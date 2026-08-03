-- ── m1 (DNS vs BRO · 라운드 3-4 라이즈 그룹) 경기 상세의 잘못된 선수 id 교체 ──
-- 예전에 잘못 등록했던 선수 id가 세트 1~3에 그대로 남아 있어,
-- 현재 로스터(최신) 기준으로 같은 포지션 선수로 바꾼다.
--   DNS: 탑 Dudu · 정글 Pyosik · 미드 Clozer · 원딜 Deokdam · 서폿 Peter
--   BRO: 탑 Casting · 정글 Gideon · 미드 Roamer · 원딜 Teddy · 서폿 Namgung
-- Supabase 대시보드 → SQL Editor에 붙여넣고 Run 한 번이면 끝.

with mapping(old_pid, new_pid) as (values
  ('dns-casting', 'dns-dudu-1785696660242'),
  ('dns-pyosik',  'dns-pyosik-1785696707312'),
  ('dns-bulldog', 'dns-clozer-1785696668233'),
  ('dns-taeyoon', 'dns-deokdam-1785696678691'),
  ('dns-andil',   'dns-peter-1785696688846'),
  ('bro-morgan',  'bro-casting-1785696819742'),
  ('bro-hambak',  'bro-gideon-1785696832175'),
  ('bro-karis',   'bro-roamer-1785696840930'),
  ('bro-hype',    'bro-teddy-1785696850962'),
  ('bro-pollu',   'bro-namgung-1785696861425')
)
update match_details md
set players = (
  select jsonb_agg(
    case when m.new_pid is not null
      then jsonb_set(e.elem, '{pid}', to_jsonb(m.new_pid))
      else e.elem end
    order by e.ord)
  from jsonb_array_elements(md.players) with ordinality as e(elem, ord)
  left join mapping m on m.old_pid = e.elem->>'pid'
)
where md.match_id = 'm1';

-- 예전 id로 매겨져 있던 평점도 새 선수 id로 이어 붙인다 (충돌 시 기존 것 유지)
update ratings r
set player_id = 'dns-pyosik-1785696707312'
where r.player_id = 'dns-pyosik'
  and not exists (
    select 1 from ratings r2
    where r2.match_id = r.match_id
      and r2.player_id = 'dns-pyosik-1785696707312'
      and r2.voter = r.voter);
delete from ratings where player_id in
  ('dns-casting','dns-pyosik','dns-bulldog','dns-taeyoon','dns-andil',
   'bro-morgan','bro-hambak','bro-karis','bro-hype','bro-pollu');

-- 확인용: 아래를 실행하면 세트별 선수 id가 전부 현재 로스터에 있어야 한다
-- select set_index, e.elem->>'pid' as pid,
--        exists(select 1 from players p where p.id = e.elem->>'pid') as ok
-- from match_details md, jsonb_array_elements(md.players) with ordinality as e(elem, ord)
-- where md.match_id = 'm1' order by set_index, e.ord;
