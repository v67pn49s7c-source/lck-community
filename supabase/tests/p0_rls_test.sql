-- ═══════════════════════════════════════════════════════════════════
-- P0-1 권한 회귀 테스트 — schema22 적용 **후** 실행해야 통과합니다.
--
-- ⚠ 실행 위치: staging DB 권장. 운영에서 돌려야 한다면 그대로 두세요 —
--   전체가 BEGIN…ROLLBACK 안이라 **아무것도 남지 않습니다.**
--   (Supabase SQL Editor 는 postgres 역할이므로 set local role 로 흉내냅니다)
--
-- 판정: 각 단계가 RAISE NOTICE 'PASS …' 를 찍습니다.
--   'FAIL' 이 하나라도 보이면 회귀입니다.
-- ═══════════════════════════════════════════════════════════════════
begin;

-- 실험용 회원 두 명 (롤백되므로 흔적이 안 남는다)
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'p0test-a@test.local'),
  ('00000000-0000-4000-8000-0000000000b2', 'p0test-b@test.local')
  on conflict (id) do nothing;
insert into profiles (id, nick, fav_team, is_admin) values
  ('00000000-0000-4000-8000-0000000000a1', 'P0테스트A', 't1', false),
  ('00000000-0000-4000-8000-0000000000b2', 'P0테스트B', 'gen', false)
  on conflict (id) do nothing;

-- A 의 글 하나 (author_id = A)
insert into posts (id, cat, title, body, nick, author_id)
  values ('p0test-post-a', '잡담', 'P0 테스트 글', '본문', 'P0테스트A',
          '00000000-0000-4000-8000-0000000000a1');

-- ── ① 회원이 polls 에 직접 INSERT → 거부돼야 한다 ──────────────────
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  begin
    insert into polls (id, match_id, phase, post_id, question, options)
    values ('p0test-direct', null, null, 'p0test-post-a', '직접 넣기', '["a","b"]');
    raise notice 'FAIL ① 회원 직접 INSERT 가 통과했습니다 (member_insert_polls 가 남아 있음)';
  exception when insufficient_privilege or sqlstate '42501' then
    raise notice 'PASS ① 회원 직접 INSERT 거부';
  end;
  perform set_config('role', 'postgres', true);
end $$;

-- ── ② RPC 로 자기 글에 투표 → 성공, match_id/phase 는 NULL 강제 ─────
do $$
declare v jsonb;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  v := create_member_poll('p0test-rpc-ok', 'p0test-post-a', '자기 글 투표', '["찬성","반대"]', false, null);
  perform set_config('role', 'postgres', true);
  if exists (select 1 from polls where id = 'p0test-rpc-ok' and match_id is null and phase is null) then
    raise notice 'PASS ② RPC 회원 투표 생성 + match_id/phase NULL';
  else
    raise notice 'FAIL ② RPC 투표가 없거나 공식 속성이 붙었습니다';
  end if;
end $$;

-- ── ③ RPC 로 **남의 글**에 투표 → 거부돼야 한다 ────────────────────
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
  begin
    perform create_member_poll('p0test-rpc-steal', 'p0test-post-a', '남의 글', '["a","b"]', false, null);
    raise notice 'FAIL ③ 남의 글에 투표가 붙었습니다';
  exception when others then
    raise notice 'PASS ③ 남의 글 투표 거부 (%)', sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
end $$;

-- ── ④ RPC 로 **없는 글**에 투표 → 거부돼야 한다 ────────────────────
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  begin
    perform create_member_poll('p0test-rpc-ghost', 'p0test-no-such-post', '유령 글', '["a","b"]', false, null);
    raise notice 'FAIL ④ 없는 글에 투표가 붙었습니다';
  exception when others then
    raise notice 'PASS ④ 없는 글 투표 거부 (%)', sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
end $$;

-- ── ⑤ 일반 회원 create_post 에 match_id → NULL 로 저장돼야 한다 ────
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  perform create_post('p0test-hijack', null, '경기 분석', '[경기 토론] 가로채기 시도', '본문',
                      '무시됨', 'm8', null);
  perform set_config('role', 'postgres', true);
  if exists (select 1 from posts where id = 'p0test-hijack' and match_id is null and is_official = false) then
    raise notice 'PASS ⑤ 비관리자 match_id 차단 (NULL 저장, 공식 표시 없음)';
  else
    raise notice 'FAIL ⑤ 비관리자 글에 match_id 또는 공식 표시가 붙었습니다';
  end if;
end $$;

-- ── ⑥ 비회원(anon) create_post 에 match_id → NULL 저장 ─────────────
do $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform create_post('p0test-anon', null, '잡담', '[경기 토론] 비회원 가로채기', '본문',
                      '무시됨', 'm8', '1234');
  perform set_config('role', 'postgres', true);
  if exists (select 1 from posts where id = 'p0test-anon' and match_id is null and is_official = false) then
    raise notice 'PASS ⑥ 비회원 match_id 차단';
  else
    raise notice 'FAIL ⑥ 비회원 글에 match_id 가 붙었습니다';
  end if;
end $$;

-- ── ⑦ (schema23 이후) 공식 토론방은 경기당 하나 ────────────────────
do $$
begin
  if not exists (select 1 from pg_indexes where indexname = 'one_official_thread_per_match') then
    raise notice 'SKIP ⑦ one_official_thread_per_match 인덱스 없음 (schema23 미적용)';
    return;
  end if;
  insert into posts (id, cat, title, body, nick, match_id, is_official)
    values ('p0test-off-1', '경기 분석', '[경기 토론] 1', '본문', '운영자', 'p0test-m', true);
  begin
    insert into posts (id, cat, title, body, nick, match_id, is_official)
      values ('p0test-off-2', '경기 분석', '[경기 토론] 2', '본문', '운영자', 'p0test-m', true);
    raise notice 'FAIL ⑦ 한 경기에 공식 토론방이 두 개 들어갔습니다';
  exception when unique_violation then
    raise notice 'PASS ⑦ 경기당 공식 토론방 1개 강제';
  end;
end $$;

rollback;   -- ⚠ 전부 되돌린다 — 위 테스트 데이터는 하나도 남지 않는다
