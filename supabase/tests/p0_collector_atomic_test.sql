-- ═══════════════════════════════════════════════════════════════════
-- schema24 Leaguepedia 원자 저장 회귀 테스트
-- schema24_leaguepedia_atomic.sql 적용 직후 실행한다.
-- 전체가 BEGIN…ROLLBACK 안이므로 테스트 데이터는 남지 않는다.
-- ═══════════════════════════════════════════════════════════════════
begin;

-- 테스트 세트도 운영 수집기와 같은 10명·A/B 5:5 형태를 쓴다.
create or replace function public.p0_atomic_test_players(p_bad_side boolean default false)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_agg(
           jsonb_build_object(
             'pid', 'p' || i,
             'side', case when p_bad_side and i = 10 then 'x'
                          when i <= 5 then 'a' else 'b' end
           ) order by i
         )
    from generate_series(1, 10) i
$$;

-- C0. 함수와 실행권한: 서버 service_role만 호출 가능해야 한다.
do $$
declare v_fn oid;
begin
  select to_regprocedure('public.persist_leaguepedia_match(text,jsonb,jsonb,text)')::oid into v_fn;
  if v_fn is null then
    raise exception 'FAIL C0 persist_leaguepedia_match 없음 — schema24를 먼저 실행하세요';
  end if;
  if not has_function_privilege('service_role', v_fn, 'EXECUTE')
     or has_function_privilege('anon', v_fn, 'EXECUTE')
     or has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'FAIL C0 RPC 실행권한이 service_role 전용이 아닙니다';
  end if;
  raise notice 'PASS C0 service_role 전용 RPC 권한';
end $$;

delete from public.match_details
 where match_id in (
   'p0-atomic-bad', 'p0-atomic-ok', 'p0-atomic-race',
   'p0-atomic-conflict', 'p0-atomic-tid', 'p0-atomic-side',
   'p0-atomic-lp-collision'
 );
delete from public.matches
 where id in (
   'p0-atomic-bad', 'p0-atomic-ok', 'p0-atomic-race',
   'p0-atomic-conflict', 'p0-atomic-tid', 'p0-atomic-side',
   'p0-atomic-lp-collision'
 );
insert into public.tournaments (id, name, type, stages, note) values
  ('p0-atomic-tid-a', 'P0 원자 저장 대회 A', '테스트', '[]'::jsonb, ''),
  ('p0-atomic-tid-b', 'P0 원자 저장 대회 B', '테스트', '[]'::jsonb, '')
on conflict (id) do nothing;

-- C1. 신규 경기 INSERT 뒤 종료 상세 완전성 검사가 실패하면 경기까지 롤백된다.
do $$
declare v_rejected boolean := false; v_players jsonb := public.p0_atomic_test_players();
begin
  begin
    perform public.persist_leaguepedia_match(
      'p0-atomic-bad',
      jsonb_build_object(
        'id','p0-atomic-bad', 'lp_id','LP-P0-BAD', 'tid',null,
        'stage','테스트', 'at','2026-08-09T10:00:00Z',
        'a','t1', 'b','gen', 'label','', 'odds_a',2, 'odds_b',2,
        'status','done', 'score_a',2, 'score_b',0
      ),
      jsonb_build_array(jsonb_build_object(
        'match_id','p0-atomic-bad', 'set_index',0, 'win','a',
        'players',v_players, 'game',jsonb_build_object()
      )),
      null
    );
  exception when raise_exception then
    if sqlerrm like '%완전집합%' then v_rejected := true; else raise; end if;
  end;
  if not v_rejected then
    raise exception 'FAIL C1 불완전 종료 상세가 거부되지 않았습니다';
  end if;
  if exists (select 1 from public.matches where id = 'p0-atomic-bad')
     or exists (select 1 from public.match_details where match_id = 'p0-atomic-bad') then
    raise exception 'FAIL C1 실패한 묶음의 경기 또는 상세가 부분 저장됐습니다';
  end if;
  raise notice 'PASS C1 상세 검증 실패 시 신규 경기+상세 전체 롤백';
end $$;

-- C2. 올바른 종료 경기 묶음은 경기 한 행과 전 세트가 함께 저장된다.
do $$
declare v_players jsonb := public.p0_atomic_test_players();
begin
  perform public.persist_leaguepedia_match(
    'p0-atomic-ok',
    jsonb_build_object(
      'id','p0-atomic-ok', 'lp_id','LP-P0-OK', 'tid',null,
      'stage','테스트', 'at','2026-08-09T11:00:00Z',
      'a','t1', 'b','gen', 'label','', 'odds_a',2, 'odds_b',2,
      'status','done', 'score_a',2, 'score_b',0
    ),
    jsonb_build_array(
      jsonb_build_object(
        'match_id','p0-atomic-ok', 'set_index',0, 'win','a',
        'players',v_players, 'game',jsonb_build_object('rich','keep')
      ),
      jsonb_build_object(
        'match_id','p0-atomic-ok', 'set_index',1, 'win','a',
        'players',v_players, 'game',jsonb_build_object('old',true)
      )
    ),
    null
  );
  if not exists (
    select 1 from public.matches where id = 'p0-atomic-ok' and status = 'done'
      and score_a = 2 and score_b = 0
  ) or (select count(*) from public.match_details where match_id = 'p0-atomic-ok') <> 2 then
    raise exception 'FAIL C2 정상 묶음의 경기 또는 상세가 빠졌습니다';
  end if;
  raise notice 'PASS C2 정상 신규 경기+상세 원자 저장';
end $$;

-- C3. done 완전집합 재수집은 범위 밖 유령 세트를 지우고, game 키가 없으면 기존값을 보존한다.
insert into public.match_details (match_id, set_index, win, players, game)
values ('p0-atomic-ok', 9, 'b', public.p0_atomic_test_players(), '{"ghost":true}'::jsonb);
do $$
declare v_players jsonb := public.p0_atomic_test_players();
begin
  perform public.persist_leaguepedia_match(
    'p0-atomic-ok',
    null,
    jsonb_build_array(
      -- set 0은 game 키 자체를 생략: 기존 {rich:keep}을 보존해야 한다.
      jsonb_build_object(
        'match_id','p0-atomic-ok', 'set_index',0, 'win','a', 'players',v_players
      ),
      -- set 1은 명시적으로 새 game을 보내므로 교체해야 한다.
      jsonb_build_object(
        'match_id','p0-atomic-ok', 'set_index',1, 'win','a',
        'players',v_players, 'game',jsonb_build_object('fresh',true)
      )
    ),
    null
  );
  if (select count(*) from public.match_details where match_id = 'p0-atomic-ok') <> 2
     or exists (select 1 from public.match_details where match_id = 'p0-atomic-ok' and set_index = 9) then
    raise exception 'FAIL C3 done 완전집합 밖 유령 세트가 남았습니다';
  end if;
  if not exists (
    select 1 from public.match_details
     where match_id = 'p0-atomic-ok' and set_index = 0 and game = '{"rich":"keep"}'::jsonb
  ) then
    raise exception 'FAIL C3 game 생략 재수집이 기존 game을 지웠습니다';
  end if;
  if not exists (
    select 1 from public.match_details
     where match_id = 'p0-atomic-ok' and set_index = 1 and game = '{"fresh":true}'::jsonb
  ) then
    raise exception 'FAIL C3 명시한 새 game이 반영되지 않았습니다';
  end if;
  raise notice 'PASS C3 done 유령 세트 제거 + 생략 game 보존';
end $$;

-- C4. 일정 수집기가 같은 id의 upcoming 행을 먼저 만들었어도 행을 덮지 않는다.
-- p_match의 done 상세는 실제 행 상태와 별개로 입력 스코어 1:0에 맞는지 검증된다.
insert into public.matches (
  id, lp_id, tid, stage, at, a, b, label, odds_a, odds_b, status, score_a, score_b
) values (
  'p0-atomic-race', 'LP-P0-RACE', null, '일정 정본', '2026-08-09T12:00:00Z',
  't1', 'gen', '일정표', 1.5, 2.5, 'upcoming', null, null
);
do $$
declare v_players jsonb := public.p0_atomic_test_players();
begin
  perform public.persist_leaguepedia_match(
    'p0-atomic-race',
    jsonb_build_object(
      'id','p0-atomic-race', 'lp_id','LP-P0-RACE', 'tid',null,
      'stage','수집기가 덮으면 실패', 'at','2030-01-01T00:00:00Z',
      'a','t1', 'b','gen', 'label','덮으면 실패', 'odds_a',9, 'odds_b',9,
      'status','done', 'score_a',1, 'score_b',0
    ),
    jsonb_build_array(jsonb_build_object(
      'match_id','p0-atomic-race', 'set_index',0, 'win','a',
      'players',v_players, 'game',jsonb_build_object()
    )),
    null
  );
  if not exists (
    select 1 from public.matches
     where id = 'p0-atomic-race' and stage = '일정 정본' and label = '일정표'
       and at = '2026-08-09T12:00:00Z'::timestamptz and odds_a = 1.5 and odds_b = 2.5
       and status = 'upcoming' and score_a is null and score_b is null
  ) then
    raise exception 'FAIL C4 동시에 만든 일정 경기 행이 덮였습니다';
  end if;
  if (select count(*) from public.match_details where match_id = 'p0-atomic-race') <> 1 then
    raise exception 'FAIL C4 일정 경기의 검증된 상세가 저장되지 않았습니다';
  end if;
  raise notice 'PASS C4 일정 수집 경기 보존 + 입력 done 스코어 검증 + 상세 저장';
end $$;

-- C5. 실제 DB의 done 스코어가 p_match 묶음과 충돌하면 상세를 거부한다.
insert into public.matches (
  id, lp_id, tid, stage, at, a, b, label, odds_a, odds_b, status, score_a, score_b
) values (
  'p0-atomic-conflict', 'LP-P0-CONFLICT', null, '일정 정본', '2026-08-09T12:30:00Z',
  't1', 'gen', '', 2, 2, 'done', 0, 1
);
do $$
declare v_rejected boolean := false; v_players jsonb := public.p0_atomic_test_players();
begin
  begin
    perform public.persist_leaguepedia_match(
      'p0-atomic-conflict',
      jsonb_build_object(
        'id','p0-atomic-conflict', 'lp_id','LP-P0-CONFLICT', 'tid',null,
        'stage','다름', 'at','2026-08-09T12:30:00Z',
        'a','t1', 'b','gen', 'label','', 'odds_a',2, 'odds_b',2,
        'status','done', 'score_a',1, 'score_b',0
      ),
      jsonb_build_array(jsonb_build_object(
        'match_id','p0-atomic-conflict', 'set_index',0, 'win','a',
        'players',v_players, 'game',jsonb_build_object()
      )),
      null
    );
  exception when raise_exception then
    if sqlerrm like '%완전집합%' then v_rejected := true; else raise; end if;
  end;
  if not v_rejected
     or exists (select 1 from public.match_details where match_id = 'p0-atomic-conflict') then
    raise exception 'FAIL C5 실제 done 스코어와 충돌한 상세가 저장됐습니다';
  end if;
  raise notice 'PASS C5 실제 done 스코어 충돌 시 상세 롤백';
end $$;

-- C6. 상세가 없는 기존 경기의 tid 전용 교정도 부분 행 upsert 없이 RPC로 처리한다.
insert into public.matches (
  id, lp_id, tid, stage, at, a, b, label, odds_a, odds_b, status, score_a, score_b
) values (
  'p0-atomic-tid', 'LP-P0-TID', 'p0-atomic-tid-a', '일정 정본',
  '2026-08-09T13:00:00Z', 't1', 'gen', '보존', 1.5, 2.5, 'upcoming', null, null
);
select public.persist_leaguepedia_match(
  'p0-atomic-tid', null, '[]'::jsonb, 'p0-atomic-tid-b'
);
do $$
begin
  if not exists (
    select 1 from public.matches
     where id = 'p0-atomic-tid' and tid = 'p0-atomic-tid-b'
       and stage = '일정 정본' and label = '보존' and a = 't1' and b = 'gen'
  ) then
    raise exception 'FAIL C6 tid 전용 교정이 실패했거나 다른 필드를 덮었습니다';
  end if;
  raise notice 'PASS C6 기존 경기 tid만 안전하게 교정';
end $$;

-- C7. 선수 10명 중 side 하나라도 a/b가 아니면 신규 경기와 상세 모두 남지 않는다.
do $$
declare v_rejected boolean := false; v_players jsonb := public.p0_atomic_test_players(true);
begin
  begin
    perform public.persist_leaguepedia_match(
      'p0-atomic-side',
      jsonb_build_object(
        'id','p0-atomic-side', 'lp_id','LP-P0-SIDE', 'tid',null,
        'stage','테스트', 'at','2026-08-09T14:00:00Z',
        'a','t1', 'b','gen', 'label','', 'odds_a',2, 'odds_b',2,
        'status','done', 'score_a',1, 'score_b',0
      ),
      jsonb_build_array(jsonb_build_object(
        'match_id','p0-atomic-side', 'set_index',0, 'win','a',
        'players',v_players, 'game',jsonb_build_object()
      )),
      null
    );
  exception when raise_exception then
    if sqlerrm like '%pid/side%' then v_rejected := true; else raise; end if;
  end;
  if not v_rejected
     or exists (select 1 from public.matches where id = 'p0-atomic-side')
     or exists (select 1 from public.match_details where match_id = 'p0-atomic-side') then
    raise exception 'FAIL C7 잘못된 선수 side 묶음이 남았습니다';
  end if;
  raise notice 'PASS C7 선수 pid/side·5:5 검증';
end $$;

-- C8. 정리/60자 절단 결과가 같은 내부 id라도 lp_id가 다르면 다른 경기다.
-- 대진까지 같아도 기존 경기 상세를 덮지 않는다.
insert into public.matches (
  id, lp_id, tid, stage, at, a, b, label, odds_a, odds_b, status, score_a, score_b
) values (
  'p0-atomic-lp-collision', 'LP-P0-ORIGINAL', null, '기존 경기',
  '2026-08-09T15:00:00Z', 't1', 'gen', '보존', 2, 2, 'done', 1, 0
);
do $$
declare v_rejected boolean := false; v_players jsonb := public.p0_atomic_test_players();
begin
  begin
    perform public.persist_leaguepedia_match(
      'p0-atomic-lp-collision',
      jsonb_build_object(
        'id','p0-atomic-lp-collision', 'lp_id','LP-P0-DIFFERENT', 'tid',null,
        'stage','다른 경기', 'at','2026-08-09T15:00:00Z',
        'a','t1', 'b','gen', 'label','덮으면 실패', 'odds_a',2, 'odds_b',2,
        'status','done', 'score_a',1, 'score_b',0
      ),
      jsonb_build_array(jsonb_build_object(
        'match_id','p0-atomic-lp-collision', 'set_index',0, 'win','a',
        'players',v_players, 'game',jsonb_build_object()
      )),
      null
    );
  exception when raise_exception then
    if sqlerrm like '%lp_id%' then v_rejected := true; else raise; end if;
  end;
  if not v_rejected
     or exists (select 1 from public.match_details where match_id = 'p0-atomic-lp-collision')
     or not exists (
       select 1 from public.matches
        where id = 'p0-atomic-lp-collision' and lp_id = 'LP-P0-ORIGINAL'
          and stage = '기존 경기' and label = '보존'
     ) then
    raise exception 'FAIL C8 다른 lp_id 경기가 기존 경기/상세를 덮었습니다';
  end if;
  raise notice 'PASS C8 내부 id 충돌 시 lp_id로 다른 경기 덮어쓰기 차단';
end $$;

rollback;
