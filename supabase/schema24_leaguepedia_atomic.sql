-- ═══════════════════════════════════════════════════════════════════
-- schema24: Leaguepedia 경기 + 세트 상세를 경기 단위로 원자 저장
--
-- 수집기가 matches와 match_details를 REST 요청 여러 번으로 쓰면, 중간 실패 때
-- 신규 경기만 남거나 상세 일부만 남을 수 있다. 이 함수는 한 경기 묶음을 한 DB
-- 트랜잭션에서 검증·저장한다. 실행권한은 서버의 service_role에만 준다.
-- ═══════════════════════════════════════════════════════════════════

begin;

create or replace function public.persist_leaguepedia_match(
  p_match_id text,
  p_match jsonb default null,
  p_details jsonb default '[]'::jsonb,
  p_tid text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $leaguepedia_atomic$
declare
  v_match_id text := btrim(coalesce(p_match_id, ''));
  v_detail_count integer;
  v_unique_count integer;
  v_status text;
  v_score_a integer;
  v_score_b integer;
  v_actual_a text;
  v_actual_b text;
  v_actual_lp_id text;
  v_input_status text;
  v_input_score_a integer;
  v_input_score_b integer;
  v_inserted integer := 0;
  v_a_wins integer;
  v_b_wins integer;
  v_min_index integer;
  v_max_index integer;
begin
  if v_match_id = '' or char_length(v_match_id) > 100 then
    raise exception 'Leaguepedia 원자 저장: 경기 id가 없거나 너무 깁니다';
  end if;
  if p_match is not null and coalesce(jsonb_typeof(p_match), 'null') <> 'object' then
    raise exception 'Leaguepedia 원자 저장: p_match는 객체 또는 null이어야 합니다';
  end if;
  if coalesce(jsonb_typeof(p_details), 'null') <> 'array' then
    raise exception 'Leaguepedia 원자 저장: p_details는 배열이어야 합니다';
  end if;
  if p_tid is not null and btrim(p_tid) = '' then
    raise exception 'Leaguepedia 원자 저장: 빈 대회 id는 허용하지 않습니다';
  end if;
  if p_match is not null and btrim(coalesce(p_match->>'id', '')) <> v_match_id then
    raise exception 'Leaguepedia 원자 저장: 경기 행 id가 요청 id와 다릅니다';
  end if;

  v_detail_count := jsonb_array_length(p_details);
  if p_match is null and v_detail_count = 0 and p_tid is null then
    raise exception 'Leaguepedia 원자 저장: 저장할 경기·상세·대회 교정이 없습니다';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_details) d
     where coalesce(jsonb_typeof(d), 'null') <> 'object'
  ) then
    raise exception 'Leaguepedia 원자 저장: 세트 상세는 객체만 허용합니다';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_details) d
     where btrim(coalesce(d->>'match_id', '')) <> v_match_id
  ) then
    raise exception 'Leaguepedia 원자 저장: 한 요청에는 한 경기 상세만 허용합니다';
  end if;
  -- 먼저 형식/길이를 확인해야 아래 숫자 변환이 overflow나 임의 문자열로 실패하지 않는다.
  if exists (
    select 1 from jsonb_array_elements(p_details) d
     where coalesce(jsonb_typeof(d->'set_index'), 'null') <> 'number'
        or coalesce(d->>'set_index', '') !~ '^(0|[1-9][0-9]*)$'
        or char_length(coalesce(d->>'set_index', '')) > 10
  ) then
    raise exception 'Leaguepedia 원자 저장: set_index는 0 이상의 정수여야 합니다';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_details) d
     where (d->>'set_index')::numeric > 2147483647
  ) then
    raise exception 'Leaguepedia 원자 저장: set_index 범위를 벗어났습니다';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_details) d
     where coalesce(jsonb_typeof(d->'win'), 'null') <> 'string'
        or (d->>'win') not in ('a', 'b')
  ) then
    raise exception 'Leaguepedia 원자 저장: win은 a 또는 b여야 합니다';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_details) d
     where coalesce(jsonb_typeof(d->'players'), 'null') <> 'array'
        or (d ? 'game' and coalesce(jsonb_typeof(d->'game'), 'null') <> 'object')
  ) then
    raise exception 'Leaguepedia 원자 저장: players/game JSON 형식이 올바르지 않습니다';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_details) d
     where jsonb_array_length(d->'players') <> 10
  ) then
    raise exception 'Leaguepedia 원자 저장: 한 세트 출전 선수는 정확히 10명이어야 합니다';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_details) d
      cross join lateral jsonb_array_elements(d->'players') p
     where coalesce(jsonb_typeof(p), 'null') <> 'object'
        or coalesce(jsonb_typeof(p->'pid'), 'null') <> 'string'
        or btrim(coalesce(p->>'pid', '')) = ''
        or coalesce(jsonb_typeof(p->'side'), 'null') <> 'string'
        or (p->>'side') not in ('a', 'b')
  ) then
    raise exception 'Leaguepedia 원자 저장: 선수 pid/side 형식이 올바르지 않습니다';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_details) d
      cross join lateral (
        select count(*) as player_count,
               count(distinct p->>'pid') as unique_pid_count,
               count(*) filter (where p->>'side' = 'a') as side_a_count,
               count(*) filter (where p->>'side' = 'b') as side_b_count
          from jsonb_array_elements(d->'players') p
      ) roster
     where roster.player_count <> 10
        or roster.unique_pid_count <> 10
        or roster.side_a_count <> 5
        or roster.side_b_count <> 5
  ) then
    raise exception 'Leaguepedia 원자 저장: 선수는 중복 없이 A/B 5:5여야 합니다';
  end if;

  select count(*), count(distinct (d->>'set_index')::integer)
    into v_detail_count, v_unique_count
    from jsonb_array_elements(p_details) d;
  if v_detail_count <> v_unique_count then
    raise exception 'Leaguepedia 원자 저장: set_index가 중복됩니다';
  end if;

  if p_match is not null then
    if btrim(coalesce(p_match->>'at', '')) = ''
       or btrim(coalesce(p_match->>'lp_id', '')) = ''
       or btrim(coalesce(p_match->>'a', '')) = ''
       or btrim(coalesce(p_match->>'b', '')) = ''
       or p_match->>'a' = p_match->>'b'
       or coalesce(p_match->>'status', '') not in ('upcoming', 'live', 'done') then
      raise exception 'Leaguepedia 원자 저장: 신규 경기 필수값이 올바르지 않습니다';
    end if;
    if (p_match ? 'score_a' and p_match->'score_a' <> 'null'::jsonb
        and (coalesce(jsonb_typeof(p_match->'score_a'), 'null') <> 'number'
             or coalesce(p_match->>'score_a', '') !~ '^[0-9]+$'))
       or (p_match ? 'score_b' and p_match->'score_b' <> 'null'::jsonb
        and (coalesce(jsonb_typeof(p_match->'score_b'), 'null') <> 'number'
             or coalesce(p_match->>'score_b', '') !~ '^[0-9]+$')) then
      raise exception 'Leaguepedia 원자 저장: 신규 경기 스코어가 올바르지 않습니다';
    end if;
    if (p_match ? 'odds_a' and p_match->'odds_a' <> 'null'::jsonb
        and coalesce(jsonb_typeof(p_match->'odds_a'), 'null') <> 'number')
       or (p_match ? 'odds_b' and p_match->'odds_b' <> 'null'::jsonb
        and coalesce(jsonb_typeof(p_match->'odds_b'), 'null') <> 'number') then
      raise exception 'Leaguepedia 원자 저장: 신규 경기 배당값이 올바르지 않습니다';
    end if;
    v_input_status := p_match->>'status';
    v_input_score_a := (p_match->>'score_a')::integer;
    v_input_score_b := (p_match->>'score_b')::integer;

    insert into public.matches (
      id, lp_id, tid, stage, at, a, b, label, odds_a, odds_b, status, score_a, score_b
    ) values (
      v_match_id,
      nullif(btrim(coalesce(p_match->>'lp_id', '')), ''),
      nullif(btrim(coalesce(p_match->>'tid', '')), ''),
      p_match->>'stage',
      (p_match->>'at')::timestamptz,
      p_match->>'a',
      p_match->>'b',
      coalesce(p_match->>'label', ''),
      coalesce((p_match->>'odds_a')::numeric, 2),
      coalesce((p_match->>'odds_b')::numeric, 2),
      p_match->>'status',
      (p_match->>'score_a')::integer,
      (p_match->>'score_b')::integer
    )
    on conflict (id) do nothing;
    get diagnostics v_inserted = row_count;

    -- 상세 없는 신규 경기만 남기는 호출은 INSERT 뒤 예외를 내 전체를 롤백한다.
    if v_detail_count = 0 then
      raise exception 'Leaguepedia 원자 저장: 신규 경기에는 세트 상세가 필요합니다';
    end if;

    -- 일정 수집 행이 같은 id로 먼저 생겨 실제 DB 상태가 upcoming이어도, 수집기가
    -- done이라고 보낸 신규 묶음 자체는 그 최종 스코어와 정확히 맞아야 한다.
    if v_input_status = 'done' then
      if v_input_score_a is null or v_input_score_b is null
         or v_input_score_a < 0 or v_input_score_b < 0
         or v_input_score_a = v_input_score_b then
        raise exception 'Leaguepedia 원자 저장: 신규 종료 경기 최종 스코어가 올바르지 않습니다';
      end if;
      select count(*) filter (where d->>'win' = 'a'),
             count(*) filter (where d->>'win' = 'b'),
             min((d->>'set_index')::integer),
             max((d->>'set_index')::integer)
        into v_a_wins, v_b_wins, v_min_index, v_max_index
        from jsonb_array_elements(p_details) d;
      if v_detail_count <> v_input_score_a + v_input_score_b
         or v_min_index <> 0
         or v_max_index <> v_detail_count - 1
         or v_a_wins <> v_input_score_a
         or v_b_wins <> v_input_score_b then
        raise exception 'Leaguepedia 원자 저장: 신규 종료 경기 세트가 입력 스코어/0..N-1 완전집합과 다릅니다';
      end if;
    end if;
  end if;

  -- INSERT ... ON CONFLICT DO NOTHING은 같은 id의 일정 수집 행을 덮지 않는다.
  -- 그 행이 먼저 생겼다면 실제 A/B·상태·스코어를 잠그고 그 기준으로 다시 검증한다.
  select lp_id, status, score_a, score_b, a, b
    into v_actual_lp_id, v_status, v_score_a, v_score_b, v_actual_a, v_actual_b
    from public.matches
   where id = v_match_id
   for update;
  if not found then
    raise exception 'Leaguepedia 원자 저장: 대상 경기가 없습니다 (%)', v_match_id;
  end if;
  -- matchIdOf는 외부 id를 정리하고 60자로 자르므로 서로 다른 긴 MatchId가 같은
  -- 내부 id가 될 수 있다. 팀 대진까지 같더라도 lp_id가 다르면 절대 상세를 덮지 않는다.
  if p_match is not null
     and v_actual_lp_id is distinct from btrim(p_match->>'lp_id') then
    raise exception 'Leaguepedia 원자 저장: 내부 경기 id는 같지만 lp_id가 달라 저장을 중단합니다';
  end if;
  if p_match is not null
     and (v_actual_a is distinct from p_match->>'a'
          or v_actual_b is distinct from p_match->>'b') then
    raise exception 'Leaguepedia 원자 저장: 동시에 만들어진 일정 경기의 A/B가 달라 상세 저장을 중단합니다';
  end if;

  if p_tid is not null then
    update public.matches set tid = p_tid where id = v_match_id;
  end if;

  if v_detail_count > 0 and v_status = 'done' then
    if v_score_a is null or v_score_b is null
       or v_score_a < 0 or v_score_b < 0 or v_score_a = v_score_b then
      raise exception 'Leaguepedia 원자 저장: 종료 경기 최종 스코어가 올바르지 않습니다';
    end if;
    select count(*) filter (where d->>'win' = 'a'),
           count(*) filter (where d->>'win' = 'b'),
           min((d->>'set_index')::integer),
           max((d->>'set_index')::integer)
      into v_a_wins, v_b_wins, v_min_index, v_max_index
      from jsonb_array_elements(p_details) d;
    if v_detail_count <> v_score_a + v_score_b
       or v_min_index <> 0
       or v_max_index <> v_detail_count - 1
       or v_a_wins <> v_score_a
       or v_b_wins <> v_score_b then
      raise exception 'Leaguepedia 원자 저장: 종료 경기 세트가 스코어/0..N-1 완전집합과 다릅니다';
    end if;
  end if;

  -- done 묶음은 0..N-1 전 세트가 정본이다. 과거 부분 저장이 남긴 범위 밖 유령
  -- 세트는 같은 트랜잭션에서 제거해 새 완전집합과 섞이지 않게 한다.
  if v_detail_count > 0 and (v_status = 'done' or v_input_status = 'done') then
    delete from public.match_details old
     where old.match_id = v_match_id
       and not exists (
         select 1 from jsonb_array_elements(p_details) d
          where (d->>'set_index')::integer = old.set_index
       );
  end if;

  insert into public.match_details (match_id, set_index, win, players, game)
  select v_match_id,
         (d->>'set_index')::integer,
         d->>'win',
         d->'players',
         coalesce(d->'game', '{}'::jsonb)
    from jsonb_array_elements(p_details) d
  on conflict (match_id, set_index) do update
    set win = excluded.win,
        players = excluded.players;

  -- game 키가 아예 없는 재수집은 기존의 풍부한 스코어보드를 지우지 않는다.
  -- 명시적으로 game:{}을 보낸 경우에만 빈 객체로 교체한다.
  update public.match_details saved
     set game = d->'game'
    from jsonb_array_elements(p_details) d
   where d ? 'game'
     and saved.match_id = v_match_id
     and saved.set_index = (d->>'set_index')::integer;

  return jsonb_build_object(
    'match_id', v_match_id,
    'match_inserted', v_inserted = 1,
    'details_saved', v_detail_count,
    'tid_updated', p_tid is not null
  );
end
$leaguepedia_atomic$;

revoke all on function public.persist_leaguepedia_match(text, jsonb, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.persist_leaguepedia_match(text, jsonb, jsonb, text)
  to service_role;

notify pgrst, 'reload schema';

commit;

select case
  when to_regprocedure('public.persist_leaguepedia_match(text,jsonb,jsonb,text)') is not null
   and has_function_privilege(
         'service_role',
         'public.persist_leaguepedia_match(text,jsonb,jsonb,text)',
         'EXECUTE'
       )
   and not has_function_privilege(
         'anon',
         'public.persist_leaguepedia_match(text,jsonb,jsonb,text)',
         'EXECUTE'
       )
   and not has_function_privilege(
         'authenticated',
         'public.persist_leaguepedia_match(text,jsonb,jsonb,text)',
         'EXECUTE'
       )
  then 'schema24 LEAGUEPEDIA ATOMIC OK — service_role 전용'
  else '실패 — 함수 또는 실행권한을 확인하세요'
end as "결과";
