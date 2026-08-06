-- ══════════════════════════════════════════════════════════════════
-- 두 선수의 기록이 한 사람 id로 합쳐진 것 되돌리기
--   증상: Gen.G 쵸비(gen-chovy)의 세트 기록이 0행,
--         캐니언(gen-canyon)이 108행 (한 세트에 캐니언이 두 번 들어 있음)
--   결과: 카드 스튜디오 3번째 장에서 GEN 미드 칸이 비어 있고,
--         정글 칸의 KDA 는 두 사람을 더한 값이 나온다
--         (assets/store.js fanRatingRows 는 "세트 기록에 있는 선수"만 화면에 올린다)
--
--   원인: Leaguepedia 수집의 선수 이름 연결표(site_settings 의 lp_aliases)에서
--         "Chovy" 라는 이름이 캐니언 id 로 이어져 있었다.
--         한번 잘못 이어지면 그 뒤 수집이 전부 같은 id 로 저장된다.
--         ※ 관리자 화면의 연결 표는 "못 알아본 선수"만 보여 주므로
--            이미 (잘못) 이어진 이름은 그 화면에서 고칠 수 없다 → 여기서 SQL 로 고친다.
--
--   2026-08-06 운영 데이터 확인 결과 (읽기만 해서 확인함)
--     · lp_aliases 의 players 63개 중 두 이름이 한 id 를 가리키는 것은 "Chovy"·"Canyon" 뿐
--     · 겹친 세트는 정확히 54개, 겹친 id 는 gen-canyon 하나뿐 (다른 선수는 겹침 없음)
--     · KIWOOM DRX Vincenzo · 농심 Calix · 한진 브리온 Pungyeon 은 **합쳐진 게 아니라
--       한 세트도 못 나온 백업 선수**다. (KRX 정글은 Willer 49세트, NS 미드는 Scout 49세트,
--       BRO 미드는 Roamer 35 + Loki 17 = 52세트로 팀 세트 수와 딱 맞는다.)
--       → 이 세 명은 고칠 기록이 없다. 그대로 두면 된다.
--
-- 실행 방법: Supabase 대시보드 → SQL Editor 에 붙여넣고,
--            ①②③ 순서대로 **한 덩어리씩** 실행하세요. 한 번에 다 돌리지 마세요.
--            ① 은 읽기만 합니다. ② 부터 실제로 고칩니다.
-- ══════════════════════════════════════════════════════════════════


-- ══════════════════════════════════════════════════════════════════
-- ⓪ 되돌릴 수 있게 백업 (제일 먼저 실행)
-- ══════════════════════════════════════════════════════════════════

-- 세트 기록 통째로 복사해 둔다. RLS 를 켜고 정책을 두지 않아 아무도 못 읽는다.
create table if not exists public._fix5_backup_details as
  select match_id, set_index, players, now() as saved_at from public.match_details;
alter table public._fix5_backup_details enable row level security;

-- 선수 이름 연결표도 다른 열쇠로 복사해 둔다
insert into public.site_settings (key, value)
select 'lp_aliases_backup_20260806', value from public.site_settings where key = 'lp_aliases'
on conflict (key) do nothing;


-- ══════════════════════════════════════════════════════════════════
-- ① 진단 — 무엇이 잘못됐는지 눈으로 확인 (읽기만 합니다)
-- ══════════════════════════════════════════════════════════════════

-- ①-A 이름 연결표 점검
--   Leaguepedia 이름에서 괄호를 떼고 우리 선수 닉네임과 맞춰 본다
--   (api/_lp.js 의 normNick 과 같은 규칙: 소문자 + 영문·숫자만 남김).
--   상태 칸에 "⚠ 잘못 연결됨" 이 뜨는 줄이 범인입니다.
with amap as (
  select k.key as lp_name, k.value #>> '{}' as now_pid
  from public.site_settings s,
       lateral jsonb_each(nullif(s.value, '')::jsonb -> 'players') as k
  where s.key = 'lp_aliases'
),
norm as (
  select lp_name, now_pid,
         regexp_replace(lower(split_part(lp_name, '(', 1)), '[^a-z0-9]', '', 'g') as nk
  from amap
),
cand as (
  select n.*,
         (select array_agg(p.id order by p.id) from public.players p
           where n.nk <> ''
             and regexp_replace(lower(p.nick), '[^a-z0-9]', '', 'g') = n.nk) as 같은닉_id
  from norm n
)
select
  lp_name                                                   as "Leaguepedia 이름",
  now_pid                                                   as "지금 이어진 id",
  (select nick || ' / ' || pos || ' / ' || team from public.players where id = now_pid) as "그 사람",
  같은닉_id                                                  as "닉네임이 같은 우리 선수",
  case
    when 같은닉_id is null                     then '우리 DB에 같은 닉네임 없음 (수동 연결일 수 있음 — 그대로 둠)'
    when array_length(같은닉_id, 1) > 1        then '닉네임이 겹쳐 판단 불가 (그대로 둠)'
    when 같은닉_id[1] = now_pid                then 'OK'
    else '⚠ 잘못 연결됨 → ' || 같은닉_id[1]
  end                                                        as "상태"
from cand
order by 5 desc, 1;


-- ①-B 한 세트에 같은 선수가 두 번 들어간 곳 찾기
--   "행수" 가 2 면 그 세트에 두 사람 기록이 한 id 로 겹쳐 있다는 뜻입니다.
--   스펠 칸에 강타가 있는 쪽이 정글러입니다 (아래 ③ 이 이 규칙을 씁니다).
select md.match_id                                          as "경기",
       md.set_index + 1                                     as "세트",
       e.elem->>'pid'                                       as "겹친 id",
       count(*)                                             as "행수",
       string_agg(coalesce(e.elem->>'champ', '?') || ' [' || coalesce(nullif(e.elem->>'spell', ''), '스펠 없음') || ']',
                  '  ·  ' order by e.ord)                   as "겹친 기록"
from public.match_details md,
     jsonb_array_elements(md.players) with ordinality as e(elem, ord)
group by 1, 2, 3
having count(*) > 1
order by 1, 2;


-- ①-C 짝 자동 추천 — "겹친 id" 와 "같은 팀에서 기록이 가장 적은 선수" 3명
--   ③ 에 넣을 (잘못 들어간 id, 진짜 주인 id) 짝을 여기서 확인하세요.
--   기록 행수가 0(또는 유난히 적은) 선수가 기록을 빼앗긴 사람입니다. 포지션을 보고 고르세요.
with dup as (
  select pid, count(*) as 중복세트수 from (
    select md.match_id, md.set_index, e.elem->>'pid' as pid
    from public.match_details md,
         jsonb_array_elements(md.players) with ordinality as e(elem, ord)
    group by 1, 2, 3 having count(*) > 1
  ) x group by pid
)
select wp.team                          as "팀",
       d.pid                            as "잘못 들어간 id",
       wp.nick || ' (' || wp.pos || ')'  as "그 사람",
       d.중복세트수                      as "겹친 세트 수",
       c.id                             as "기록이 적은 같은 팀 선수",
       c.nick || ' (' || c.pos || ')'    as "그 사람 (후보)",
       c.n                              as "그 선수 기록 행수"
from dup d
join public.players wp on wp.id = d.pid
left join lateral (
  select p.id, p.nick, p.pos,
         (select count(*) from public.match_details md, jsonb_array_elements(md.players) e
           where e->>'pid' = p.id) as n
  from public.players p
  where p.team = wp.team and p.id <> wp.id
  order by n asc, p.nick
  limit 3
) c on true
order by 1, 2, 7;


-- ①-D 기록이 0행인 선수 확인 (gen/krx/ns/bro)
--   Chovy 만 "합쳐져서 0" 이고, Vincenzo·Calix·Pungyeon 은 "안 나와서 0" 입니다.
--   같은 팀 같은 포지션 선수의 행수를 팀 세트 수와 비교해 보면 구분됩니다.
select p.id, p.team, p.pos, p.nick,
       (select count(*) from public.match_details md, jsonb_array_elements(md.players) e
         where e->>'pid' = p.id) as "세트 기록 행수"
from public.players p
where p.team in ('gen', 'krx', 'ns', 'bro')
order by p.team, p.pos, p.nick;


-- ══════════════════════════════════════════════════════════════════
-- ② 이름 연결표 고치기 (①-A 에서 "⚠ 잘못 연결됨" 을 확인한 뒤 실행)
-- ══════════════════════════════════════════════════════════════════
-- ①-A 와 똑같은 규칙으로, **닉네임이 딱 한 명과 맞는 이름만** 그 사람 id 로 바로잡습니다.
-- 닉네임이 없거나 겹치는 이름(수동으로 이어 둔 것)은 손대지 않습니다.
-- 이걸 먼저 고쳐야 다음에 수집을 눌렀을 때 또 합쳐지지 않습니다.
update public.site_settings s
set value = jsonb_set(
      nullif(s.value, '')::jsonb,
      '{players}',
      (select coalesce(jsonb_object_agg(k.key, to_jsonb(coalesce(m.right_pid, k.value #>> '{}'))), '{}'::jsonb)
       from jsonb_each(nullif(s.value, '')::jsonb -> 'players') as k
       left join lateral (
         select max(p.id) as right_pid
         from public.players p
         where regexp_replace(lower(split_part(k.key, '(', 1)), '[^a-z0-9]', '', 'g') <> ''
           and regexp_replace(lower(p.nick), '[^a-z0-9]', '', 'g')
             = regexp_replace(lower(split_part(k.key, '(', 1)), '[^a-z0-9]', '', 'g')
         having count(*) = 1
       ) m on true)
    )::text
where s.key = 'lp_aliases';

-- 확인: ①-A 를 다시 실행하면 "⚠" 줄이 없어야 합니다.


-- ══════════════════════════════════════════════════════════════════
-- ③ 세트 기록 고치기 — 겹친 두 줄 중 한 줄을 진짜 주인에게 돌려준다
-- ══════════════════════════════════════════════════════════════════
-- 어느 줄이 누구 것인지 어떻게 아는가:
--   ㉠ **저장된 순서** — 수집기는 Leaguepedia 이름 알파벳순으로 저장합니다
--      (api/leaguepedia.js 의 order_by "SP.GameId ASC, SP.Link ASC").
--      Canyon < Chovy 이므로 **뒤에 있는 줄이 쵸비**입니다.
--      → 이번 건은 54세트 모두 스펠 칸이 비어 있어서 실제로는 이 규칙이 적용됩니다.
--      확인: 54세트 모두 앞줄이 정글 챔피언(리 신·자르반·마오카이·스카너…),
--            뒷줄이 미드 챔피언(아지르·갈리오·아칼리·라이즈…)이었고,
--            52/54 세트에서 뒷줄의 CS 가 더 많았습니다(미드가 정글보다 CS 가 많다).
--   ㉡ 스펠이 기록된 경기라면 **강타**로도 갈립니다. 정글러 쪽에 강타가 있습니다.
--      (아래 정렬에서 강타 규칙을 먼저 보고, 없으면 순서로 갑니다)
--
-- ★ 다른 선수도 같이 고치려면 아래 values 에 줄을 추가하세요. 칸 뜻:
--     잘못들어간id · 진짜주인id · 잘못들어간사람이_정글러인가 · 진짜주인_이름이_알파벳순_뒤인가
--   (KIWOOM DRX Vincenzo · 농심 Calix · 한진 브리온 Pungyeon 은
--    ①-C 로 짝을 확인한 뒤 같은 형식으로 한 줄씩 추가하면 됩니다)

-- ③-① 먼저 미리보기 (읽기만 — 무엇이 바뀔지 확인)
with fix(wrong_pid, right_pid, wrong_is_jungle, right_is_later) as (
  values ('gen-canyon', 'gen-chovy', true, true)
  -- 예) 빈첸조(탑)가 같은 팀 정글러 id 로 합쳐졌다면 — 앞의 id 는 ①-C 에서 확인한 값으로:
  --   , ('krx-정글러id', 'krx-vincenzo', true, true)
  --     3번째 칸: 잘못 들어간 사람이 정글러면 true (강타 있는 줄을 그 사람에게 남김)
  --     4번째 칸: 진짜 주인의 영문 이름이 알파벳순으로 뒤면 true (Hyeonsu < Vincenzo → true)
),
tgt as (
  select md.match_id, md.set_index, f.*
  from public.match_details md
  join fix f on (select count(*) from jsonb_array_elements(md.players) e
                  where e->>'pid' = f.wrong_pid) > 1
),
pick as (
  select t.*, (
    select e.ord
    from public.match_details md2,
         jsonb_array_elements(md2.players) with ordinality as e(elem, ord)
    where md2.match_id = t.match_id and md2.set_index = t.set_index
      and e.elem->>'pid' = t.wrong_pid
    order by
      -- ㉠ 강타 규칙: 넘겨줄 줄을 맨 앞으로
      case when (e.elem->>'spell') ~* '강타|smite'
           then (case when t.wrong_is_jungle then 1 else 0 end)
           else (case when t.wrong_is_jungle then 0 else 1 end) end,
      -- ㉡ 순서 규칙 (스펠이 비었을 때의 판단)
      case when t.right_is_later then -e.ord else e.ord end
    limit 1) as ord_to_fix
  from tgt t
)
select pk.match_id                as "경기",
       pk.set_index + 1           as "세트",
       e.ord                      as "몇 번째 줄",
       e.elem->>'champ'           as "챔피언",
       coalesce(nullif(e.elem->>'spell', ''), '(스펠 없음)') as "스펠",
       (e.elem->>'k') || '/' || (e.elem->>'d') || '/' || (e.elem->>'a') as "KDA",
       e.elem->>'cs'              as "CS",
       pk.wrong_pid               as "지금 id",
       case when e.ord = pk.ord_to_fix then '→ ' || pk.right_pid else '(그대로 둠)' end as "바꿀 id"
from pick pk,
     public.match_details md,
     jsonb_array_elements(md.players) with ordinality as e(elem, ord)
where md.match_id = pk.match_id and md.set_index = pk.set_index
  and e.elem->>'pid' = pk.wrong_pid
order by 1, 2, 3;

-- ③-② 실제로 바꾸기 (위 미리보기가 맞으면 실행)
with fix(wrong_pid, right_pid, wrong_is_jungle, right_is_later) as (
  values ('gen-canyon', 'gen-chovy', true, true)
  -- 예) 빈첸조(탑)가 같은 팀 정글러 id 로 합쳐졌다면 — 앞의 id 는 ①-C 에서 확인한 값으로:
  --   , ('krx-정글러id', 'krx-vincenzo', true, true)
  --     3번째 칸: 잘못 들어간 사람이 정글러면 true (강타 있는 줄을 그 사람에게 남김)
  --     4번째 칸: 진짜 주인의 영문 이름이 알파벳순으로 뒤면 true (Hyeonsu < Vincenzo → true)
),
tgt as (
  select md.match_id, md.set_index, f.*
  from public.match_details md
  join fix f on (select count(*) from jsonb_array_elements(md.players) e
                  where e->>'pid' = f.wrong_pid) > 1
),
pick as (
  select t.*, (
    select e.ord
    from public.match_details md2,
         jsonb_array_elements(md2.players) with ordinality as e(elem, ord)
    where md2.match_id = t.match_id and md2.set_index = t.set_index
      and e.elem->>'pid' = t.wrong_pid
    order by
      case when (e.elem->>'spell') ~* '강타|smite'
           then (case when t.wrong_is_jungle then 1 else 0 end)
           else (case when t.wrong_is_jungle then 0 else 1 end) end,
      case when t.right_is_later then -e.ord else e.ord end
    limit 1) as ord_to_fix
  from tgt t
)
update public.match_details md
set players = (
  select jsonb_agg(
           case when e.ord = pk.ord_to_fix
                then jsonb_set(e.elem, '{pid}', to_jsonb(pk.right_pid))
                else e.elem end
           order by e.ord)
  from jsonb_array_elements(md.players) with ordinality as e(elem, ord)
)
from pick pk
where md.match_id = pk.match_id and md.set_index = pk.set_index;

-- 한 세트에 세 번 겹친 경우가 있으면 ①-B 가 아직 줄을 보여 줍니다.
-- 그때는 ③-①·③-② 를 한 번 더 실행하세요 (여러 번 실행해도 안전합니다).


-- ══════════════════════════════════════════════════════════════════
-- ④ 검증 — 아래 세 가지를 확인하세요
-- ══════════════════════════════════════════════════════════════════

-- ④-A 겹친 줄이 남아 있는가 → **0줄이어야 정상**
select md.match_id, md.set_index + 1 as 세트, e.elem->>'pid' as pid, count(*)
from public.match_details md,
     jsonb_array_elements(md.players) with ordinality as e(elem, ord)
group by 1, 2, 3 having count(*) > 1;

-- ④-B 세트 수가 제자리인가
--   기대값: Canyon 54 · Chovy 54 · Kiin 54 · Ruler 54 · Duro 54 (GEN 은 54세트를 치렀습니다)
select p.id, p.pos, p.nick,
       (select count(*) from public.match_details md, jsonb_array_elements(md.players) e
         where e->>'pid' = p.id) as "세트 기록 행수"
from public.players p
where p.team = 'gen'
order by p.pos, p.nick;

-- ④-C 세트마다 10명인가 (10 이 아닌 세트가 있으면 원래부터 빠진 기록입니다)
select md.match_id, md.set_index + 1 as 세트, jsonb_array_length(md.players) as 인원
from public.match_details md
where jsonb_array_length(md.players) <> 10
order by 1, 2;


-- ══════════════════════════════════════════════════════════════════
-- ⑤ 마무리 (검증이 끝난 뒤)
-- ══════════════════════════════════════════════════════════════════
-- 백업 표는 확인이 끝나면 지워 주세요 (안 지워도 사이트에는 안 보입니다)
-- drop table public._fix5_backup_details;
--
-- 되돌리고 싶을 때:
-- update public.match_details md set players = b.players
--   from public._fix5_backup_details b
--  where md.match_id = b.match_id and md.set_index = b.set_index;
-- update public.site_settings s set value = b.value
--   from public.site_settings b
--  where s.key = 'lp_aliases' and b.key = 'lp_aliases_backup_20260806';
--
-- ※ 평점(ratings)·POM 은 손댈 것이 없습니다 (2026-08-06 확인).
--    두 선수에게 매겨진 팬 평점은 아직 0건이고, pom_awards 의 쵸비 수상은
--    이미 gen-chovy 로 잘 들어가 있습니다(POM 은 닉네임으로 이었기 때문).
--    그래서 고친 뒤 카드의 GEN 미드 칸은 평점 모드에서는 "—",
--    KDA 모드에서는 쵸비의 K/D/A 가 나옵니다.
--
-- ※ 다음 수집부터는 ② 를 먼저 실행해 두어야 또 합쳐지지 않습니다.
--    ② 없이 관리자 화면에서 "가져오기"를 누르면 54세트가 다시 캐니언으로 덮어써집니다.
