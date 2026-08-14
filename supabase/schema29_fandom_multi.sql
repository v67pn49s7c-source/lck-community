-- ── 다중 응원 (A안) + 최애선수 ──────────────────────────────────
--
-- 배경: 실제 팬은 최애팀 하나만 있는 경우가 드물다. 다른 팀도 한둘 챙겨 보고,
--       아예 팀보다 **선수**를 따라다니는 사람도 많다 (선수는 이적하니까).
--
-- 정한 정책 (2026-08-14, 사장님 선택):
--   · 최애팀 1개  — 지금과 똑같다. 팀 게시판 글쓰기, 평점 own/opp 집계 기준,
--                   창립 팬 자격, **30일 잠금**. 여기는 아무것도 안 바뀐다.
--   · 관심팀 2개  — 열람·홈 노출만. 글쓰기 못 하고 평점 집계에도 안 들어간다.
--                   대신 **아무 때나 바꿀 수 있다** (권리가 없으니 잠글 이유도 없다).
--   · 최애선수 5명 — 팀과 무관. 1명만 골라도 되고 안 골라도 된다.
--
-- ⚠ 왜 관심팀에 글쓰기를 안 주나:
--   팀 게시판은 "그 팀 팬 전용"이 핵심이라 서버에서 막아 뒀다(schema26).
--   관심팀에도 글쓰기를 주면 한 사람이 세 팀 게시판에 다 쓸 수 있어 그 원칙이 무너진다.
--   그리고 평점 own/opp 분리 집계는 이 사이트의 차별화 자산이라, 기준이 흐려지면
--   지표 자체가 의미를 잃는다.
--
-- 적용 순서: **SQL 먼저, 코드 나중.** (코드는 이 칸들이 없어도 조용히 돌아가지만,
--            SQL 을 먼저 돌려야 저장이 실제로 남는다)

-- ── 1) 칸 추가 ────────────────────────────────────────────────
alter table public.profiles
  add column if not exists sub_teams   text[] not null default '{}',
  add column if not exists fav_players text[] not null default '{}';

-- ── 2) 내 프로필 — 새 칸까지 함께 돌려준다 ────────────────────
-- (schema19 정의에 두 줄만 더한 것이다. 이 함수가 유일한 프로필 조회 통로다 —
--  is_admin 은 공개 조회에서 아예 막혀 있어 여기로만 나간다)
create or replace function public.my_profile()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare u uuid := auth.uid(); r record;
begin
  if u is null then return null; end if;
  select * into r from public.profiles where id = u;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', r.id, 'nick', r.nick, 'fav_team', r.fav_team, 'is_admin', r.is_admin,
    'fav_team_changed_at', r.fav_team_changed_at,
    'sub_teams', coalesce(r.sub_teams, '{}'),
    'fav_players', coalesce(r.fav_players, '{}'),
    'created_at', r.created_at
  );
end $$;

-- ── 3) 관심팀 저장 ────────────────────────────────────────────
-- 잠금 없음. 최대 2개, 최애팀과 겹치지 못한다.
create or replace function public.set_sub_teams(p_teams text[])
returns void language plpgsql volatile security definer set search_path = '' as $$
declare u uuid := auth.uid(); cur text; clean text[];
begin
  if u is null then raise exception '로그인이 필요합니다'; end if;
  select fav_team into cur from public.profiles where id = u;

  -- 빈 값·중복 제거. 팀 목록은 화면 코드(assets/data.js)에 있어 DB 가 다 알지 못하므로
  -- 형식만 확인한다 (set_fav_team 과 같은 규칙).
  select coalesce(array_agg(distinct t), '{}')
    into clean
    from unnest(coalesce(p_teams, '{}')) as t
   where t is not null and t <> '' and t ~ '^[a-z0-9]{2,8}$'
     and t is distinct from cur;

  if array_length(clean, 1) > 2 then
    raise exception '관심팀은 2개까지 고를 수 있습니다';
  end if;

  update public.profiles set sub_teams = clean where id = u;
end $$;

-- ── 4) 최애선수 저장 ──────────────────────────────────────────
-- 최대 5명. **실제로 있는 선수만** 넣는다 (없는 id 는 조용히 걸러낸다 —
-- 로스터가 바뀌어 선수가 지워졌을 때 저장 자체가 막히면 안 된다).
create or replace function public.set_fav_players(p_players text[])
returns void language plpgsql volatile security definer set search_path = '' as $$
declare u uuid := auth.uid(); clean text[];
begin
  if u is null then raise exception '로그인이 필요합니다'; end if;

  select coalesce(array_agg(distinct p.id), '{}')
    into clean
    from unnest(coalesce(p_players, '{}')) as x(id)
    join public.players p on p.id = x.id;

  if array_length(clean, 1) > 5 then
    raise exception '최애선수는 5명까지 고를 수 있습니다';
  end if;

  update public.profiles set fav_players = clean where id = u;
end $$;

-- ── 5) 최애팀을 바꾸면 관심팀에서 겹치는 것을 빼 준다 ─────────
-- (안 그러면 최애팀이자 관심팀인 상태가 되어 화면에 두 번 나온다)
create or replace function public.set_fav_team(p_team text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  cur text; last timestamptz; admin boolean; wait_days int;
  DAYS constant int := 30;
begin
  if u is null then raise exception '로그인이 필요합니다'; end if;
  if coalesce(p_team, '') <> '' and p_team !~ '^[a-z0-9]{2,8}$' then
    raise exception '팀 값이 올바르지 않습니다';
  end if;

  select fav_team, fav_team_changed_at, coalesce(is_admin, false)
    into cur, last, admin
    from public.profiles where id = u;

  if cur is not distinct from nullif(p_team, '') then return; end if;

  if not admin and cur is not null and last is not null
     and last > now() - make_interval(days => DAYS) then
    wait_days := ceil(extract(epoch from (last + make_interval(days => DAYS) - now())) / 86400);
    raise exception '응원팀은 %일에 한 번만 바꿀 수 있습니다. % 일 뒤에 다시 시도해 주세요.', DAYS, wait_days;
  end if;

  update public.profiles
     set fav_team = nullif(p_team, ''),
         fav_team_changed_at = now(),
         sub_teams = coalesce(
           (select array_agg(t) from unnest(coalesce(sub_teams, '{}')) as t
             where t is distinct from nullif(p_team, '')), '{}')
   where id = u;
end $$;

-- ── 6) 권한 ───────────────────────────────────────────────────
revoke all on function public.set_sub_teams(text[])   from public, anon, authenticated;
revoke all on function public.set_fav_players(text[]) from public, anon, authenticated;
revoke all on function public.set_fav_team(text)      from public, anon, authenticated;
revoke all on function public.my_profile()            from public, anon, authenticated;
grant execute on function public.set_sub_teams(text[])   to authenticated;
grant execute on function public.set_fav_players(text[]) to authenticated;
grant execute on function public.set_fav_team(text)      to authenticated;
grant execute on function public.my_profile()            to authenticated;

-- ── 확인 ──────────────────────────────────────────────────────
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name in ('sub_teams','fav_players'))                       as 새칸_2개,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('set_sub_teams','set_fav_players')) as 새함수_2개,
  (select position('sub_teams' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='my_profile' limit 1)            as 프로필에_반영됨;
