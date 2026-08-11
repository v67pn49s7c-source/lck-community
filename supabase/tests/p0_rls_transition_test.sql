-- ═══════════════════════════════════════════════════════════════════
-- P0-1 단계 A 권한 회귀 테스트 — schema22 TRANSITION 직후 실행
--
-- 이 단계에서는 옛 웹 코드와의 호환을 위해 '자기 글 + match_id/phase NULL'인
-- 회원 직접 INSERT를 잠시 허용한다. 따라서 직접 INSERT 성공이 정상이다.
-- schema25 적용 뒤에는 이 파일이 아니라 p0_rls_test.sql(FINAL)을 실행한다.
-- 전체가 BEGIN…ROLLBACK 안이므로 테스트 데이터는 남지 않는다.
-- ═══════════════════════════════════════════════════════════════════
begin;

-- T0. 단계/ACL 사전조건
do $$
declare v_fn oid;
begin
  select to_regprocedure('public.create_member_poll(text,text,text,jsonb,boolean,timestamptz)')::oid into v_fn;
  if v_fn is null then raise exception 'FAIL T0 create_member_poll 없음 — schema22를 먼저 실행하세요'; end if;
  if not exists (
    select 1 from pg_policies
     where schemaname='public' and tablename='polls' and policyname='member_insert_polls'
       and lower(coalesce(with_check,'')) like '%match_id is null%'
       and lower(coalesce(with_check,'')) like '%auth.uid()%'
  ) then
    raise exception 'FAIL T0 schema22 과도기 member_insert_polls 정책이 없거나 조건이 다릅니다';
  end if;
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                 where n.nspname='public' and c.relname='polls' and c.relrowsecurity) then
    raise exception 'FAIL T0 polls RLS가 꺼져 있습니다';
  end if;
  if has_function_privilege('anon', v_fn, 'EXECUTE') then
    raise exception 'FAIL T0 anon이 create_member_poll을 실행할 수 있습니다';
  end if;
  if not has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'FAIL T0 authenticated RPC 실행권한이 없습니다';
  end if;
  if has_any_column_privilege('anon', 'public.posts', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.posts', 'INSERT')
     or has_any_column_privilege('anon', 'public.posts', 'UPDATE')
     or has_any_column_privilege('authenticated', 'public.posts', 'UPDATE')
     or has_table_privilege('anon', 'public.posts', 'DELETE')
     or has_table_privilege('authenticated', 'public.posts', 'DELETE') then
    raise exception 'FAIL T0 posts 직접 INSERT/UPDATE/DELETE 권한이 남아 있습니다';
  end if;
  raise notice 'PASS T0 schema22 TRANSITION 정책 + RPC ACL + posts 직접쓰기 ACL 차단';
end $$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'p0transition-a@test.local'),
  ('00000000-0000-4000-8000-0000000000b2', 'p0transition-b@test.local')
on conflict (id) do nothing;

insert into profiles (id, nick, fav_team, is_admin) values
  ('00000000-0000-4000-8000-0000000000a1', 'P0전환A', 't1', false),
  ('00000000-0000-4000-8000-0000000000b2', 'P0전환B', 'gen', false)
on conflict (id) do nothing;

insert into posts (id, cat, title, body, nick, author_id)
values ('p0transition-post-a', '자유', 'P0 전환 테스트 글', '본문', 'P0전환A',
        '00000000-0000-4000-8000-0000000000a1');

-- T1. 옛 코드 호환: 회원이 자기 글에 안전한 직접 INSERT → 과도기에는 성공
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  insert into polls (id, match_id, phase, post_id, question, options)
  values ('p0transition-direct-ok', null, null, 'p0transition-post-a', '직접 안전 투표', '["a","b"]');
  perform set_config('role', 'postgres', true);
  if not exists (select 1 from polls where id='p0transition-direct-ok' and match_id is null and phase is null) then
    raise exception 'FAIL T1 과도기 안전 직접 INSERT가 저장되지 않았습니다';
  end if;
  raise notice 'PASS T1 과도기 자기 글 직접 INSERT 허용';
end $$;

-- T2. 직접 INSERT라도 match_id를 실으면 거부
do $$
declare v_denied boolean := false;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  begin
    insert into polls (id, match_id, phase, post_id, question, options)
    values ('p0transition-match', 'm8', null, 'p0transition-post-a', '공식 흉내', '["a","b"]');
  exception when insufficient_privilege then v_denied := true;
  end;
  perform set_config('role', 'postgres', true);
  if not v_denied then raise exception 'FAIL T2 회원 직접 INSERT에 match_id가 통과했습니다'; end if;
  raise notice 'PASS T2 직접 INSERT match_id 차단';
end $$;

-- T3. 다른 회원 글에 직접 INSERT 거부
do $$
declare v_denied boolean := false;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
  begin
    insert into polls (id, match_id, phase, post_id, question, options)
    values ('p0transition-steal', null, null, 'p0transition-post-a', '남의 글', '["a","b"]');
  exception when insufficient_privilege then v_denied := true;
  end;
  perform set_config('role', 'postgres', true);
  if not v_denied then raise exception 'FAIL T3 남의 글 직접 INSERT가 통과했습니다'; end if;
  raise notice 'PASS T3 직접 INSERT 소유권 강제';
end $$;

-- T4. 새 코드 경로: RPC 자기 글 투표 성공 + 공식 속성 NULL
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  perform create_member_poll('p0transition-rpc-ok', 'p0transition-post-a',
    'RPC 자기 글', '["찬성","반대"]', false, null);
  perform set_config('role', 'postgres', true);
  if not exists (select 1 from polls where id='p0transition-rpc-ok' and match_id is null and phase is null) then
    raise exception 'FAIL T4 RPC 결과가 없거나 공식 속성이 붙었습니다';
  end if;
  raise notice 'PASS T4 RPC 자기 글 생성';
end $$;

-- T5. RPC 남의 글 거부(예상한 소유권 오류만 PASS)
do $$
declare v_denied boolean := false;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
  begin
    perform create_member_poll('p0transition-rpc-steal', 'p0transition-post-a',
      'RPC 남의 글', '["a","b"]', false, null);
  exception when raise_exception then
    if sqlerrm like '%자기가 쓴 글에만%' then v_denied := true; else raise; end if;
  end;
  perform set_config('role', 'postgres', true);
  if not v_denied then raise exception 'FAIL T5 RPC 남의 글 투표가 통과했습니다'; end if;
  raise notice 'PASS T5 RPC 소유권 강제';
end $$;

-- T6. 일반 회원 create_post의 match_id/is_official 제거
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  perform create_post('p0transition-hijack', null, '경기 분석', '[경기 토론] 가로채기',
    '본문', '무시됨', 'm8', null);
  perform set_config('role', 'postgres', true);
  if not exists (select 1 from posts where id='p0transition-hijack'
                 and match_id is null and is_official=false) then
    raise exception 'FAIL T6 일반 회원 글에 공식 경기 속성이 붙었습니다';
  end if;
  raise notice 'PASS T6 회원 경기방 가로채기 차단';
end $$;

-- T7. 비회원 create_post의 match_id/is_official 제거
do $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform create_post('p0transition-anon', null, '자유', '[경기 토론] 비회원 가로채기',
    '본문', '무시됨', 'm8', '1234');
  perform set_config('role', 'postgres', true);
  if not exists (select 1 from posts where id='p0transition-anon'
                 and match_id is null and is_official=false) then
    raise exception 'FAIL T7 비회원 글에 공식 경기 속성이 붙었습니다';
  end if;
  raise notice 'PASS T7 비회원 경기방 가로채기 차단';
end $$;

-- T8. RPC 보기 입력 경계: 비문자열·공백·중복을 모두 거부
do $$
declare v_type boolean := false; v_blank boolean := false; v_dup boolean := false;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  begin
    perform create_member_poll('p0transition-opt-type', 'p0transition-post-a',
      '보기 형식', '["정상",{"bad":true}]', false, null);
  exception when raise_exception then
    if sqlerrm like '%문자열만%' then v_type := true; else raise; end if;
  end;
  begin
    perform create_member_poll('p0transition-opt-blank', 'p0transition-post-a',
      '빈 보기', '["정상","   "]', false, null);
  exception when raise_exception then
    if sqlerrm like '%1~80자%' then v_blank := true; else raise; end if;
  end;
  begin
    perform create_member_poll('p0transition-opt-dup', 'p0transition-post-a',
      '중복 보기', '["찬성"," 찬성 "]', false, null);
  exception when raise_exception then
    if sqlerrm like '%중복된%' then v_dup := true; else raise; end if;
  end;
  perform set_config('role', 'postgres', true);
  if not (v_type and v_blank and v_dup) then
    raise exception 'FAIL T8 RPC 보기 입력 경계가 완전하지 않습니다';
  end if;
  raise notice 'PASS T8 RPC 보기 문자열·길이·중복 검증';
end $$;

-- T9. 비회원이 posts를 직접 INSERT하여 공식 경기방을 만들 수 없어야 한다.
do $$
declare v_denied boolean := false;
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    insert into posts (id, cat, title, body, nick, match_id, is_official)
    values ('p0transition-direct-anon', '경기 분석', '[경기 토론] 직접 우회',
            '본문', '익명', 'm8', true);
  exception when insufficient_privilege then v_denied := true;
  end;
  perform set_config('role', 'postgres', true);
  if not v_denied then raise exception 'FAIL T9 비회원 posts 직접 INSERT가 통과했습니다'; end if;
  raise notice 'PASS T9 비회원 posts 직접 INSERT 거부';
end $$;

-- T10. 일반 회원도 posts 직접 INSERT를 우회 경로로 쓸 수 없어야 한다.
do $$
declare v_denied boolean := false;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  begin
    insert into posts (id, cat, title, body, nick, author_id, match_id, is_official)
    values ('p0transition-direct-member', '경기 분석', '[경기 토론] 직접 우회',
            '본문', 'P0전환A', '00000000-0000-4000-8000-0000000000a1', 'm8', true);
  exception when insufficient_privilege then v_denied := true;
  end;
  perform set_config('role', 'postgres', true);
  if not v_denied then raise exception 'FAIL T10 회원 posts 직접 INSERT가 통과했습니다'; end if;
  raise notice 'PASS T10 회원 posts 직접 INSERT 거부';
end $$;

-- T11. 기존 글의 is_official만 직접 UPDATE하는 우회도 막는다.
do $$
declare v_denied boolean := false;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  begin
    update posts set is_official=true where id='p0transition-post-a';
  exception when insufficient_privilege then v_denied := true;
  end;
  perform set_config('role', 'postgres', true);
  if not v_denied then raise exception 'FAIL T11 회원 posts is_official 직접 UPDATE가 통과했습니다'; end if;
  raise notice 'PASS T11 posts is_official 직접 UPDATE 거부';
end $$;

-- T12. 비회원의 match_id 단독 UPDATE도 막는다.
do $$
declare v_denied boolean := false;
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    update posts set match_id='m8' where id='p0transition-post-a';
  exception when insufficient_privilege then v_denied := true;
  end;
  perform set_config('role', 'postgres', true);
  if not v_denied then raise exception 'FAIL T12 비회원 posts match_id 직접 UPDATE가 통과했습니다'; end if;
  raise notice 'PASS T12 posts match_id 직접 UPDATE 거부';
end $$;

-- T13. 오래된 admin_delete_posts 정책이 남아 있어도 일반 회원 직접 DELETE는 막는다.
do $$
declare v_denied boolean := false;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
  begin
    delete from posts where id='p0transition-post-a';
  exception when insufficient_privilege then v_denied := true;
  end;
  perform set_config('role', 'postgres', true);
  if not v_denied then raise exception 'FAIL T13 회원 posts 직접 DELETE가 통과했습니다'; end if;
  raise notice 'PASS T13 posts 직접 DELETE 거부';
end $$;

rollback;
