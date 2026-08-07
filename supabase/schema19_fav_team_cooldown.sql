-- ══════════════════════════════════════════════════════════════════
-- schema19: 응원팀 변경 30일 쿨다운
-- ══════════════════════════════════════════════════════════════════
--
-- 왜 필요한가:
--   팀 게시판은 그 팀 팬만 글을 쓸 수 있다. 서버(create_post)가 제대로 막고 있어서
--   주소를 직접 두드려도 통과하지 못한다.
--   그런데 **응원팀을 아무 때나 바꿀 수 있으면** 팀을 바꾼 다음 쓰면 그만이다.
--   팀을 옮겨 다니며 아무 게시판에나 글을 쓸 수 있으니 제한의 의미가 사라진다.
--
-- 규칙:
--   · 응원팀을 한 번 정하면 **30일간 바꿀 수 없다.**
--   · 처음 정하는 것(지금 값이 비어 있음)은 쿨다운 없이 자유롭다.
--   · 같은 팀으로 다시 저장하는 것(눌러도 그대로)은 변경으로 세지 않는다.
--   · 중립('')로 내리는 것도 변경이다 — 이걸 빼 두면 "중립 → 아무 팀" 으로 우회된다.
--   · 관리자는 제외한다 (운영상 필요).
--
-- 화면은 이 값을 읽어 남은 날짜를 안내한다. 화면만으로는 못 막으므로 **서버가 기준**이다.
--
-- 실행: Supabase → SQL Editor 에 통째로 붙여넣고 Run.
--       맨 아래가 '응원팀 쿨다운 OK' 면 성공.
-- ══════════════════════════════════════════════════════════════════

-- ── 1) 마지막으로 바꾼 시각을 남길 칸 ─────────────────────────
alter table public.profiles
  add column if not exists fav_team_changed_at timestamptz;

-- 이미 팀을 정해 둔 기존 회원은 '지금 막 정한 것'으로 치지 않는다.
-- (그러면 전원이 30일간 묶여 버린다) → 계정 생성 시각을 넣어 곧바로 바꿀 수 있게 둔다.
update public.profiles
   set fav_team_changed_at = coalesce(created_at, now() - interval '31 days')
 where fav_team is not null and fav_team_changed_at is null;

-- ── 2) 내 프로필에 이 값을 실어 보낸다 (화면이 남은 날을 안내한다) ──
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
    'created_at', r.created_at
  );
end $$;

-- ── 3) 변경에 쿨다운을 건다 ───────────────────────────────────
create or replace function public.set_fav_team(p_team text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  cur text; last timestamptz; admin boolean; wait_days int;
  DAYS constant int := 30;
begin
  if u is null then raise exception '로그인이 필요합니다'; end if;
  -- 팀 목록은 화면 코드(assets/data.js)에 있어 DB가 다 알지 못한다. 형식만 확인한다.
  -- ('' = 중립을 명시적으로 고른 것이므로 허용)
  if coalesce(p_team, '') <> '' and p_team !~ '^[a-z0-9]{2,8}$' then
    raise exception '팀 값이 올바르지 않습니다';
  end if;

  select fav_team, fav_team_changed_at, coalesce(is_admin, false)
    into cur, last, admin
    from public.profiles where id = u;

  -- 같은 값이면 아무것도 하지 않는다 (쿨다운도 소모하지 않는다)
  if cur is not distinct from nullif(p_team, '') then return; end if;

  -- 처음 정하는 것과 관리자는 자유. 그 외에는 30일에 한 번.
  if not admin and cur is not null and last is not null
     and last > now() - make_interval(days => DAYS) then
    wait_days := ceil(extract(epoch from (last + make_interval(days => DAYS) - now())) / 86400);
    raise exception '응원팀은 %일에 한 번만 바꿀 수 있습니다. % 일 뒤에 다시 시도해 주세요.', DAYS, wait_days;
  end if;

  update public.profiles
     set fav_team = nullif(p_team, ''),
         fav_team_changed_at = now()
   where id = u;
end $$;

revoke all on function public.set_fav_team(text) from public, anon, authenticated;
grant execute on function public.set_fav_team(text) to authenticated;
revoke all on function public.my_profile() from public, anon, authenticated;
grant execute on function public.my_profile() to authenticated;

-- ── 확인 ──────────────────────────────────────────────────────
select case
    when exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='profiles'
                    and column_name='fav_team_changed_at')
     and (select pg_get_functiondef(p.oid) from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname='public' and p.proname='set_fav_team' limit 1) like '%30일에 한 번%'
    then '응원팀 쿨다운 OK'
    else '실패 — 위 문장이 다 돌았는지 확인해 주세요'
  end as "결과";
