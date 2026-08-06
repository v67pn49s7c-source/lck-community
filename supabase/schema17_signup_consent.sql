-- ============================================================
-- schema17: 가입 약관 동의 — 동의해야 가입되고, 동의 시각이 남는다
-- ============================================================
-- 왜 필요한가:
--   회원가입 폼에 이용약관·개인정보 수집 동의 절차가 없었다.
--   화면에 체크박스만 넣으면 "동의했다는 증거"가 남지 않으므로,
--   서버가 동의 없이는 프로필 생성을 거부하고 동의 시각을 기록한다.
--   (화면: login.html 동의 블록 · 문서: terms.html / privacy.html)
--
-- 실행: Supabase SQL Editor 에 전체 붙여넣기 → Run
-- 순서: schema14 실행 후에 실행할 것 (create_profile 을 대체한다)
-- ============================================================

-- 동의 시각 (기존 회원은 null 로 남는다 — 신규 가입부터 기록)
alter table profiles add column if not exists terms_agreed_at timestamptz;

-- 예전 시그니처(동의 없는 가입)는 제거 — 이게 남아 있으면 우회 가입이 가능하다
drop function if exists public.create_profile(text, text);

create or replace function public.create_profile(p_nick text, p_fav_team text, p_terms boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception '로그인이 필요합니다'; end if;
  -- ★ 약관·개인정보 동의 없이는 가입할 수 없다
  if p_terms is distinct from true then
    raise exception '이용약관과 개인정보 처리방침에 동의해야 가입할 수 있습니다';
  end if;
  if p_nick is null or char_length(p_nick) not between 2 and 12 then
    raise exception '닉네임은 2~12자로 입력해 주세요';
  end if;
  if exists (select 1 from public.profiles where nick = p_nick and id <> u) then
    raise exception '이미 사용 중인 닉네임입니다';
  end if;
  insert into public.profiles (id, nick, fav_team, is_admin, terms_agreed_at)
  values (u, p_nick, nullif(p_fav_team, ''), false, now())
  on conflict (id) do nothing;               -- 이미 있으면 그대로 둔다(관리자 승격 방지)
  return public.my_profile();
end $$;

revoke all on function public.create_profile(text, text, boolean) from public, anon;
grant execute on function public.create_profile(text, text, boolean) to authenticated;

-- ── 확인 ─────────────────────────────────────────────────────
select
  case when exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'terms_agreed_at')
    then '동의시각 칸 OK' else '⚠ 칸 없음' end as "①",
  case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_profile' and p.pronargs = 3)
    then '동의 강제 함수 OK' else '⚠ 함수 없음' end as "②",
  case when not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_profile' and p.pronargs = 2)
    then '우회 경로 제거 OK' else '⚠ 옛 함수가 남아 있음' end as "③";
