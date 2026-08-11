-- ═══════════════════════════════════════════════════════════════════
-- schema25: 회원 자유 투표를 RPC 전용으로 최종 잠금 (P0-1 마지막 단계)
--
-- 실행 시점:
--   1) schema22 TRANSITION 적용
--   2) schema23 공식 경기방 백필/인덱스 적용
--   3) schema24 Leaguepedia 원자 저장 RPC 적용
--   4) p0-hardening 코드가 운영에 배포되어 두 RPC를 쓰는지 확인
--   5) **그 다음 이 파일 실행**
--
-- schema22가 남겨 둔 과도기용 member_insert_polls 정책을 제거한다.
-- polls의 admin_all_polls 정책은 건드리지 않으므로 관리자의 공식 투표 직접 INSERT는
-- 계속 가능하고, 일반 회원만 create_member_poll RPC를 통해서 생성하게 된다.
-- 여러 번 실행해도 안전하다.
-- ═══════════════════════════════════════════════════════════════════

begin;

alter table public.polls enable row level security;
drop policy if exists "member_insert_polls" on public.polls;

-- 운영 DB에 예전 posts 정책/권한이 다시 남아 있어도 create_post RPC를 우회하지
-- 못하도록 FINAL 단계에서도 직접 INSERT/UPDATE ACL을 재확정한다.
alter table public.posts enable row level security;
drop policy if exists "insert_posts" on public.posts;
drop policy if exists "admin_delete_posts" on public.posts;
revoke insert, update, delete on table public.posts from public, anon, authenticated;
do $p0_posts_acl$
declare
  v_columns text;
begin
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
    into v_columns
    from pg_attribute a
   where a.attrelid = 'public.posts'::regclass
     and a.attnum > 0
     and not a.attisdropped;

  if v_columns is not null then
    execute format(
      'revoke insert (%1$s), update (%1$s) on table public.posts from public, anon, authenticated',
      v_columns
    );
  end if;
end $p0_posts_acl$;

-- SECURITY DEFINER 함수는 PUBLIC 기본 실행권한을 명시적으로 제거한다.
revoke execute on function public.create_member_poll(
  text, text, text, jsonb, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_member_poll(
  text, text, text, jsonb, boolean, timestamptz
) to authenticated;

-- create_post도 허용 역할을 정확히 고정한다. anon 글쓰기는 서비스 의도이므로 유지한다.
revoke execute on function public.create_post(
  text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_post(
  text, text, text, text, text, text, text, text
) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

-- ═══ 확인 ═══
select case
  when not exists (
         select 1 from pg_policies
          where schemaname = 'public' and tablename = 'polls'
            and policyname = 'member_insert_polls'
       )
   and has_function_privilege(
         'authenticated',
         'public.create_member_poll(text,text,text,jsonb,boolean,timestamptz)',
         'EXECUTE'
       )
   and not has_function_privilege(
         'anon',
         'public.create_member_poll(text,text,text,jsonb,boolean,timestamptz)',
         'EXECUTE'
       )
   and not has_any_column_privilege('anon', 'public.posts', 'INSERT')
   and not has_any_column_privilege('authenticated', 'public.posts', 'INSERT')
   and not has_any_column_privilege('anon', 'public.posts', 'UPDATE')
   and not has_any_column_privilege('authenticated', 'public.posts', 'UPDATE')
   and not has_table_privilege('anon', 'public.posts', 'DELETE')
   and not has_table_privilege('authenticated', 'public.posts', 'DELETE')
  then 'schema25 FINAL OK — 회원 직접 INSERT 차단 · 회원 RPC 전용 · anon RPC 차단'
  else '실패 — 정책 또는 함수 실행권한을 확인하세요'
end as "결과";
