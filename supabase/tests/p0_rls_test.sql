-- ═══════════════════════════════════════════════════════════════════
-- P0-1 단계 B 권한 회귀 테스트 — schema25 FINAL 적용 후 실행
--
-- 최종 상태에서는 일반 회원의 polls 직접 INSERT가 거부되고,
-- 회원 자유 투표는 create_member_poll RPC로만 생성돼야 한다.
-- schema22 과도기에는 이 파일을 실행하지 말고 p0_rls_transition_test.sql을 쓴다.
-- 전체가 BEGIN…ROLLBACK 안이므로 테스트 데이터는 남지 않는다.
-- 회귀가 있으면 RAISE EXCEPTION으로 즉시 실패한다.
-- ═══════════════════════════════════════════════════════════════════
begin;

-- F0. FINAL 단계/ACL/RLS 사전조건
do $$
declare v_fn oid;
begin
  select to_regprocedure('public.create_member_poll(text,text,text,jsonb,boolean,timestamptz)')::oid into v_fn;
  if v_fn is null then raise exception 'FAIL F0 create_member_poll 없음'; end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='polls'
             and policyname='member_insert_polls') then
    raise exception 'FAIL F0 과도기 member_insert_polls가 남아 있습니다 — schema25를 실행하세요';
  end if;
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                 where n.nspname='public' and c.relname='polls' and c.relrowsecurity) then
    raise exception 'FAIL F0 polls RLS가 꺼져 있습니다';
  end if;
  if has_function_privilege('anon', v_fn, 'EXECUTE') then
    raise exception 'FAIL F0 anon이 create_member_poll을 실행할 수 있습니다';
  end if;
  if not has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'FAIL F0 authenticated RPC 실행권한이 없습니다';
  end if;
  if has_any_column_privilege('anon', 'public.posts', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.posts', 'INSERT')
     or has_any_column_privilege('anon', 'public.posts', 'UPDATE')
     or has_any_column_privilege('authenticated', 'public.posts', 'UPDATE')
     or has_table_privilege('anon', 'public.posts', 'DELETE')
     or has_table_privilege('authenticated', 'public.posts', 'DELETE') then
    raise exception 'FAIL F0 posts 직접 INSERT/UPDATE/DELETE 권한이 남아 있습니다';
  end if;
  raise notice 'PASS F0 schema25 FINAL + RPC ACL + RLS + posts 직접쓰기 ACL 차단';
end $$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'p0final-a@test.local'),
  ('00000000-0000-4000-8000-0000000000b2', 'p0final-b@test.local'),
  ('00000000-0000-4000-8000-0000000000c3', 'p0final-admin@test.local')
on conflict (id) do nothing;

insert into profiles (id, nick, fav_team, is_admin) values
  ('00000000-0000-4000-8000-0000000000a1', 'P0최종A', 't1', false),
  ('00000000-0000-4000-8000-0000000000b2', 'P0최종B', 'gen', false),
  ('00000000-0000-4000-8000-0000000000c3', 'P0최종관리', 'dk', true)
on conflict (id) do nothing;

insert into posts (id, cat, title, body, nick, author_id)
values ('p0final-post-a', '자유', 'P0 최종 테스트 글', '본문', 'P0최종A',
        '00000000-0000-4000-8000-0000000000a1');

-- F1. 일반 회원 polls 직접 INSERT 거부
do $$
declare v_denied boolean := false;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  begin
    insert into polls (id, match_id, phase, post_id, question, options)
    values ('p0final-direct', null, null, 'p0final-post-a', '직접 넣기', '["a","b"]');
  exception when insufficient_privilege then v_denied := true;
  end;
  perform set_config('role', 'postgres', true);
  if not v_denied then raise exception 'FAIL F1 일반 회원 직접 INSERT가 통과했습니다'; end if;
  raise notice 'PASS F1 회원 직접 INSERT 거부';
end $$;

-- F2. RPC 자기 글 투표 성공 + 공식 속성 NULL
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  perform create_member_poll('p0final-rpc-ok', 'p0final-post-a',
    '자기 글 투표', '["찬성","반대"]', false, null);
  perform set_config('role', 'postgres', true);
  if not exists (select 1 from polls where id='p0final-rpc-ok'
                 and match_id is null and phase is null) then
    raise exception 'FAIL F2 RPC 결과가 없거나 공식 속성이 붙었습니다';
  end if;
  raise notice 'PASS F2 RPC 자기 글 생성';
end $$;

-- F3. RPC 남의 글 거부
do $$
declare v_denied boolean := false;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
  begin
    perform create_member_poll('p0final-rpc-steal', 'p0final-post-a',
      '남의 글', '["a","b"]', false, null);
  exception when raise_exception then
    if sqlerrm like '%자기가 쓴 글에만%' then v_denied := true; else raise; end if;
  end;
  perform set_config('role', 'postgres', true);
  if not v_denied then raise exception 'FAIL F3 남의 글 투표가 통과했습니다'; end if;
  raise notice 'PASS F3 RPC 소유권 강제';
end $$;

-- F4. RPC 없는 글 거부
do $$
declare v_denied boolean := false;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  begin
    perform create_member_poll('p0final-rpc-ghost', 'p0final-no-post',
      '없는 글', '["a","b"]', false, null);
  exception when raise_exception then
    if sqlerrm like '%자기가 쓴 글에만%' then v_denied := true; else raise; end if;
  end;
  perform set_config('role', 'postgres', true);
  if not v_denied then raise exception 'FAIL F4 없는 글 투표가 통과했습니다'; end if;
  raise notice 'PASS F4 RPC 고아 투표 차단';
end $$;

-- F5. 일반 회원 create_post의 match_id/is_official 제거
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  perform create_post('p0final-hijack', null, '경기 분석', '[경기 토론] 가로채기',
    '본문', '무시됨', 'm8', null);
  perform set_config('role', 'postgres', true);
  if not exists (select 1 from posts where id='p0final-hijack'
                 and match_id is null and is_official=false) then
    raise exception 'FAIL F5 일반 회원 글에 공식 경기 속성이 붙었습니다';
  end if;
  raise notice 'PASS F5 회원 경기방 가로채기 차단';
end $$;

-- F6. 비회원 create_post의 match_id/is_official 제거
do $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform create_post('p0final-anon', null, '자유', '[경기 토론] 비회원 가로채기',
    '본문', '무시됨', 'm8', '1234');
  perform set_config('role', 'postgres', true);
  if not exists (select 1 from posts where id='p0final-anon'
                 and match_id is null and is_official=false) then
    raise exception 'FAIL F6 비회원 글에 공식 경기 속성이 붙었습니다';
  end if;
  raise notice 'PASS F6 비회원 경기방 가로채기 차단';
end $$;

-- F7. schema25가 관리자 공식 투표 직접 INSERT까지 막지 않았는지 확인
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
  insert into polls (id, match_id, phase, post_id, question, options)
  values ('p0final-admin-poll', 'p0final-match', 'pre', null, '공식 투표', '["a","b"]');
  perform set_config('role', 'postgres', true);
  if not exists (select 1 from polls where id='p0final-admin-poll' and phase='pre') then
    raise exception 'FAIL F7 관리자 공식 투표 INSERT가 막혔습니다';
  end if;
  raise notice 'PASS F7 관리자 공식 투표 유지';
end $$;

-- F8. schema23 경기당 공식 토론방 하나 강제
do $$
declare v_denied boolean := false;
begin
  if not exists (select 1 from pg_indexes where schemaname='public'
                 and indexname='one_official_thread_per_match') then
    raise exception 'FAIL F8 schema23 유니크 인덱스가 없습니다';
  end if;
  insert into posts (id, cat, title, body, nick, match_id, is_official)
  values ('p0final-off-1', '경기 분석', '[경기 토론] 1', '본문', '운영자', 'p0final-match', true);
  begin
    insert into posts (id, cat, title, body, nick, match_id, is_official)
    values ('p0final-off-2', '경기 분석', '[경기 토론] 2', '본문', '운영자', 'p0final-match', true);
  exception when unique_violation then v_denied := true;
  end;
  if not v_denied then raise exception 'FAIL F8 한 경기에 공식 토론방 두 개가 들어갔습니다'; end if;
  raise notice 'PASS F8 경기당 공식 토론방 1개';
end $$;

-- F9. RPC 보기 입력 경계: 비문자열·공백·중복을 모두 거부
do $$
declare v_type boolean := false; v_blank boolean := false; v_dup boolean := false;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  begin
    perform create_member_poll('p0final-opt-type', 'p0final-post-a',
      '보기 형식', '["정상",{"bad":true}]', false, null);
  exception when raise_exception then
    if sqlerrm like '%문자열만%' then v_type := true; else raise; end if;
  end;
  begin
    perform create_member_poll('p0final-opt-blank', 'p0final-post-a',
      '빈 보기', '["정상","   "]', false, null);
  exception when raise_exception then
    if sqlerrm like '%1~80자%' then v_blank := true; else raise; end if;
  end;
  begin
    perform create_member_poll('p0final-opt-dup', 'p0final-post-a',
      '중복 보기', '["찬성"," 찬성 "]', false, null);
  exception when raise_exception then
    if sqlerrm like '%중복된%' then v_dup := true; else raise; end if;
  end;
  perform set_config('role', 'postgres', true);
  if not (v_type and v_blank and v_dup) then
    raise exception 'FAIL F9 RPC 보기 입력 경계가 완전하지 않습니다';
  end if;
  raise notice 'PASS F9 RPC 보기 문자열·길이·중복 검증';
end $$;

-- F10. 비회원 posts 직접 INSERT 거부
do $$
declare v_denied boolean := false;
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    insert into posts (id, cat, title, body, nick, match_id, is_official)
    values ('p0final-direct-anon', '경기 분석', '[경기 토론] 직접 우회',
            '본문', '익명', 'm8', true);
  exception when insufficient_privilege then v_denied := true;
  end;
  perform set_config('role', 'postgres', true);
  if not v_denied then raise exception 'FAIL F10 비회원 posts 직접 INSERT가 통과했습니다'; end if;
  raise notice 'PASS F10 비회원 posts 직접 INSERT 거부';
end $$;

-- F11. 일반 회원 posts 직접 INSERT 거부
do $$
declare v_denied boolean := false;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  begin
    insert into posts (id, cat, title, body, nick, author_id, match_id, is_official)
    values ('p0final-direct-member', '경기 분석', '[경기 토론] 직접 우회',
            '본문', 'P0최종A', '00000000-0000-4000-8000-0000000000a1', 'm8', true);
  exception when insufficient_privilege then v_denied := true;
  end;
  perform set_config('role', 'postgres', true);
  if not v_denied then raise exception 'FAIL F11 회원 posts 직접 INSERT가 통과했습니다'; end if;
  raise notice 'PASS F11 회원 posts 직접 INSERT 거부';
end $$;

-- F12. 기존 글의 is_official 단독 직접 UPDATE 거부
do $$
declare v_denied boolean := false;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  begin
    update posts set is_official=true where id='p0final-post-a';
  exception when insufficient_privilege then v_denied := true;
  end;
  perform set_config('role', 'postgres', true);
  if not v_denied then raise exception 'FAIL F12 회원 posts is_official 직접 UPDATE가 통과했습니다'; end if;
  raise notice 'PASS F12 posts is_official 직접 UPDATE 거부';
end $$;

-- F13. 비회원 match_id 단독 직접 UPDATE 거부
do $$
declare v_denied boolean := false;
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    update posts set match_id='m8' where id='p0final-post-a';
  exception when insufficient_privilege then v_denied := true;
  end;
  perform set_config('role', 'postgres', true);
  if not v_denied then raise exception 'FAIL F13 비회원 posts match_id 직접 UPDATE가 통과했습니다'; end if;
  raise notice 'PASS F13 posts match_id 직접 UPDATE 거부';
end $$;

-- F14. 일반 회원 posts 직접 DELETE 거부
do $$
declare v_denied boolean := false;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
  begin
    delete from posts where id='p0final-post-a';
  exception when insufficient_privilege then v_denied := true;
  end;
  perform set_config('role', 'postgres', true);
  if not v_denied then raise exception 'FAIL F14 회원 posts 직접 DELETE가 통과했습니다'; end if;
  raise notice 'PASS F14 posts 직접 DELETE 거부';
end $$;

rollback;
