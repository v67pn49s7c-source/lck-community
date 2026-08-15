-- ── 운영자는 창립 팬에서 빼기 ────────────────────────────────────
--
-- 사장님 요청 (2026-08-15): 운영자 계정은
--   ① 창립 팬 100인에 카운팅하지 않는다
--   ② 어느 팀을 좋아하는지 남에게 보이지 않는다
--
-- 왜 이게 맞나:
--   창립 팬 100인은 "먼저 온 진짜 팬" 이라는 가치가 전부인 자리다. 운영자가 한 칸을
--   차지하면 그 자리 하나가 팬에게서 사라진다. 그리고 운영자가 특정 팀 팬으로
--   보이면 게시판 운영·평점 집계가 편파적으로 읽힌다 — 실제로 편파적이지 않아도
--   **그렇게 보이는 것만으로 손해**다.
--
-- ⚠ 화면에서 숨기는 것만으로는 부족하다. 우리 사이트는 브라우저가 Supabase 를
--    직접 부르므로, 화면 코드를 지워도 누구나 표를 그대로 읽을 수 있다.
--    그래서 **서버에서** 막는다.
--
-- 적용 순서: SQL 먼저, 코드 나중 (코드는 이 함수들이 없어도 조용히 돌아간다).

-- ── 1) 등록 자체를 막는다 ─────────────────────────────────────
create or replace function public.claim_founding(t text) returns int
language plpgsql security definer set search_path = public as $$
declare n int; uid uuid := auth.uid(); admin boolean;
begin
  if uid is null then raise exception '로그인이 필요합니다.'; end if;

  select coalesce(is_admin, false) into admin from profiles where id = uid;
  if admin then
    raise exception '운영자 계정은 창립 팬에 등록하지 않습니다.';
  end if;

  if (select fav_team from profiles where id = uid) is distinct from t then
    raise exception '응원팀 팬만 등록할 수 있습니다.';
  end if;
  select no into n from founding_fans where team = t and user_id = uid;
  if n is not null then return n; end if;
  select coalesce(max(no), 0) + 1 into n from founding_fans where team = t;
  if n > 100 then raise exception '창립 팬 100인이 모두 모였습니다.'; end if;
  insert into founding_fans (team, user_id, no) values (t, uid, n);
  return n;
end $$;

-- ── 2) 이미 등록돼 있으면 뺀다 ────────────────────────────────
-- 뒤 번호를 당기지 않는다 — 이미 "#7 창립 팬" 이라고 알고 있는 사람의 번호가
-- 어느 날 바뀌면 그게 더 나쁘다. 운영자 자리만 비운다.
delete from public.founding_fans f
 using public.profiles p
 where p.id = f.user_id and coalesce(p.is_admin, false);

-- ── 3) 남이 내 응원팀을 못 보게 (운영자만) ────────────────────
-- profiles 는 닉네임 표시 때문에 공개 조회가 열려 있다. 그 통로로 운영자의
-- fav_team 이 그대로 나가고 있었다. 운영자 행만 응원팀을 가린 뷰로 대신한다.
create or replace view public.v_public_profiles
with (security_invoker = off) as
  select id, nick,
         case when coalesce(is_admin, false) then null else fav_team end as fav_team,
         created_at
    from public.profiles;

revoke all on public.v_public_profiles from public, anon, authenticated;
grant select on public.v_public_profiles to anon, authenticated;

-- 원본 표에서 응원팀 칸을 아예 못 읽게 한다 (뷰로만 나가도록).
-- ⚠ 칸 단위 권한이라, 다시 열려면 grant select (fav_team) 을 해 줘야 한다.
revoke select (fav_team) on public.profiles from anon, authenticated;

-- ── 확인 ──────────────────────────────────────────────────────
select
  (select count(*) from public.founding_fans f join public.profiles p on p.id = f.user_id
    where coalesce(p.is_admin, false))                                   as 남은_운영자_창립팬,
  (select count(*) from information_schema.views
    where table_schema='public' and table_name='v_public_profiles')      as 공개뷰_생성,
  (select position('운영자 계정은 창립 팬' in pg_get_functiondef(p.oid)) > 0
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='claim_founding' limit 1)     as 등록차단_반영;
