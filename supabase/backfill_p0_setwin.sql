-- ═══════════════════════════════════════════════════════════════════
-- P0-2 데이터 백필 — 완전히 뒤집힌 세트 승자(a↔b) 교정
-- ⚠ 자동 실행 금지. 수정 수집기 배포 → 영향 경기 재수집 →
-- audit_p0_read_only.sql ⑥·⑦ 재실행 → 남은 exact 대상 사람 검토 후에만 실행한다.
--
-- 이 파일이 자동으로 고치는 것은 다음을 모두 만족하는 경기뿐이다.
--   · 종료 경기이며 최종 스코어가 정상(비동점)
--   · 저장된 세트 수 = score_a + score_b (전 세트 수집 완료)
--   · set_index가 정확히 0..(score_a + score_b - 1) (결번·중복·범위 이탈 없음)
--   · 모든 win 값이 a 또는 b
--   · 각 세트 players가 정확히 10명이고 side='a' 5명 / side='b' 5명
--   · a승 수 = score_b, b승 수 = score_a (최종 스코어와 정확히 반대)
--
-- 부분수집·set_index 오류·win 누락·혼합 오류는 별도 목록으로만 보여 주고 절대 수정하지 않는다.
-- 교정 전 각 (match_id,set_index,win)과 win 제외 행 전체를
-- p0_ops.setwin_backup_20260809에 영구 백업하며,
-- 경기별 핵심 JSON/fingerprint는 p0_ops.setwin_match_backup_20260809에 보존한다.
-- rollback_p0_setwin.sql은 그 백업값을 사용해 실제 원래 값으로 복원한다.
-- 같은 UPDATE를 재실행하는 것은 롤백이 아니다. 교정 후에는 대상 조건이 거짓이 되어
-- 보통 0행을 바꾸므로 반드시 백업 기반 rollback을 사용한다.

-- ── ★ 운영자 승인 allowlist (반드시 먼저 편집) ──
-- audit ⑥ 재실행 + 공식 세트 결과 대조를 끝낸
-- (match_id, detail_fingerprint) 쌍만 나열한다. 복수 경기는 VALUES 행을 추가한다.
-- 빈 목록·아래 placeholder·중복 ID·md5 형식이 아닌 fingerprint는
-- 전부 fail-closed로 중단된다. ①·②만 다시 보려면 그 SELECT만 별도 실행한다.
begin;

create temporary table p0_setwin_approved_match_ids (
  match_id text primary key,
  expected_detail_fingerprint text not null
) on commit drop;

insert into p0_setwin_approved_match_ids (match_id, expected_detail_fingerprint) values
  ('__REPLACE_WITH_AUDITED_MATCH_ID__', '__REPLACE_WITH_AUDITED_DETAIL_FINGERPRINT__');
  -- ↑ audit ⑥의 승인한 실제 (id, detail_fingerprint) 쌍으로 반드시 교체

do $$
begin
  if not exists (select 1 from p0_setwin_approved_match_ids) then
    raise exception '운영자 승인 match_id allowlist가 비어 있습니다. 수정 없이 중단합니다';
  end if;
  if exists (
    select 1 from p0_setwin_approved_match_ids
     where match_id = '__REPLACE_WITH_AUDITED_MATCH_ID__'
        or expected_detail_fingerprint = '__REPLACE_WITH_AUDITED_DETAIL_FINGERPRINT__'
        or btrim(match_id) = ''
        or match_id <> btrim(match_id)
        or expected_detail_fingerprint !~ '^[0-9a-f]{32}$'
  ) then
    raise exception 'allowlist에 placeholder·빈 ID·공백·잘못된 fingerprint가 있습니다. audit ⑥의 승인한 (id,fingerprint) 쌍으로 교체하세요';
  end if;
end $$;
-- ═══════════════════════════════════════════════════════════════════

-- ── ① 정확한 자동 교정 대상 (읽기 전용) ───────────────────────────
with agg as (
  select d.match_id,
         count(*) as sets,
         count(distinct set_index) as index_distinct,
         min(set_index) as index_min,
         max(set_index) as index_max,
         md5(
           jsonb_build_object(
             'id', fm.id, 'lp_id', fm.lp_id, 'a', fm.a, 'b', fm.b,
             'status', fm.status, 'score_a', fm.score_a, 'score_b', fm.score_b
           )::text || '|details:' ||
           string_agg((to_jsonb(d) - 'match_id')::text, '|' order by d.set_index)
         ) as detail_fingerprint,
         count(*) filter (where win in ('a','b')) as labeled,
         count(*) filter (where win = 'a') as wa,
         count(*) filter (where win = 'b') as wb,
         count(*) filter (where case when jsonb_typeof(players) = 'array' then
           jsonb_array_length(players) = 10
           and (select count(*) from jsonb_array_elements(players) p where p->>'side' = 'a') = 5
           and (select count(*) from jsonb_array_elements(players) p where p->>'side' = 'b') = 5
         else false end) as side_ok
    from match_details d
    join matches fm on fm.id = d.match_id
   group by d.match_id, fm.id, fm.lp_id, fm.a, fm.b, fm.status, fm.score_a, fm.score_b
)
select m.id, m.a, m.b, m.score_a, m.score_b, a.wa, a.wb, a.sets,
       a.index_distinct, a.index_min, a.index_max, a.side_ok,
       a.detail_fingerprint,
       '백업 후 a↔b 교정 대상' as 조치
  from matches m join agg a on a.match_id = m.id
 where m.status = 'done'
   and m.score_a is not null and m.score_b is not null
   and m.score_a <> m.score_b
   and a.sets = m.score_a + m.score_b
   and a.index_distinct = a.sets
   and a.index_min = 0 and a.index_max = a.sets - 1
   and a.labeled = a.sets
   and a.side_ok = a.sets
   and a.wa = m.score_b and a.wb = m.score_a
 order by m.id;

-- ── ② 자동 대상이 아닌 불일치 (읽기 전용·수정하지 않음) ───────────
-- 이 결과는 경기별 재수집/수동 검수 대상으로 따로 처리한다.
with agg as (
  select match_id,
         count(*) as sets,
         count(distinct set_index) as index_distinct,
         min(set_index) as index_min,
         max(set_index) as index_max,
         count(*) filter (where win in ('a','b')) as labeled,
         count(*) filter (where win = 'a') as wa,
         count(*) filter (where win = 'b') as wb,
         count(*) filter (where case when jsonb_typeof(players) = 'array' then
           jsonb_array_length(players) = 10
           and (select count(*) from jsonb_array_elements(players) p where p->>'side' = 'a') = 5
           and (select count(*) from jsonb_array_elements(players) p where p->>'side' = 'b') = 5
         else false end) as side_ok
    from match_details group by match_id
), state as (
  select m.*, coalesce(a.sets,0) sets, coalesce(a.labeled,0) labeled,
         coalesce(a.wa,0) wa, coalesce(a.wb,0) wb, coalesce(a.side_ok,0) side_ok,
         coalesce(a.index_distinct,0) index_distinct, a.index_min, a.index_max,
         m.score_a + m.score_b expected
    from matches m left join agg a on a.match_id = m.id
   where m.status = 'done' and m.score_a is not null and m.score_b is not null
)
select id, a, b, score_a, score_b, wa, wb, sets,
       index_distinct, index_min, index_max, side_ok,
       case when sets = expected
                  and index_distinct = expected
                  and index_min = 0 and index_max = expected - 1
            then '정상(0..N-1 완전)'
            else '문제(결번/중복/범위 이탈 가능)' end as set_index_상태,
       case when sets < expected then '부분수집/상세 없음 — 재수집'
            when sets > expected then '예상보다 세트가 많음 — 유령/중복 세트 검수'
            when index_distinct <> expected
              or index_min is distinct from 0
              or index_max is distinct from expected - 1
              then 'set_index가 0..N-1이 아님 — 결번/중복/범위 이탈 검수'
            when side_ok < sets then '선수 side가 세트마다 5:5가 아님 — 재수집'
            when labeled < sets then 'win 누락·잘못된 값 — 수동 검수'
            else '혼합 불일치 — 수동 검수' end as 조치
  from state
 where not (sets = expected
            and index_distinct = expected and index_min = 0 and index_max = expected - 1
            and labeled = sets and side_ok = sets
            and wa = score_a and wb = score_b)
   and not (score_a <> score_b and sets = expected
            and index_distinct = expected and index_min = 0 and index_max = expected - 1
            and labeled = sets and side_ok = sets
            and wa = score_b and wb = score_a)
 order by id;

-- ── ③ 백업 + 교정 + 검증 (하나의 트랜잭션) ────────────────────────
-- target 고정부터 백업·교정·검증까지 수집기 UPDATE가 끼어들지 못하게 짧게 잠근다.
-- 일반 SELECT는 계속 가능하다. 운영 수집 작업과 겹치지 않는 시간에 실행한다.
lock table matches, match_details in share row exclusive mode;

create schema if not exists p0_ops;
revoke all on schema p0_ops from public, anon, authenticated;

create table if not exists p0_ops.setwin_backup_20260809 (
  match_id text not null,
  set_index integer not null,
  win_before text,
  row_without_win_before jsonb,
  backed_up_at timestamptz not null default now(),
  primary key (match_id, set_index)
);
create table if not exists p0_ops.setwin_match_backup_20260809 (
  match_id text primary key,
  match_core_before jsonb,
  approved_detail_fingerprint text,
  backed_up_at timestamptz not null default now()
);
alter table p0_ops.setwin_backup_20260809
  add column if not exists row_without_win_before jsonb;
alter table p0_ops.setwin_match_backup_20260809
  add column if not exists match_core_before jsonb,
  add column if not exists approved_detail_fingerprint text;
revoke all on table p0_ops.setwin_backup_20260809 from public, anon, authenticated;
revoke all on table p0_ops.setwin_match_backup_20260809 from public, anon, authenticated;
lock table p0_ops.setwin_backup_20260809, p0_ops.setwin_match_backup_20260809
  in share row exclusive mode;

-- 기존 백업이 있으면 이미 실행했거나 사람이 확인할 상태다. 덮어쓰지 않고 중단한다.
do $$
begin
  if exists (select 1 from p0_ops.setwin_backup_20260809)
     or exists (select 1 from p0_ops.setwin_match_backup_20260809) then
    raise exception 'P0 setwin 백업이 이미 있습니다. 재실행하지 말고 백업/rollback 상태를 확인하세요';
  end if;
end $$;

-- 기존 빈 백업 테이블을 재사용하더라도 이번 백업은 행 본문을 반드시 보존한다.
alter table p0_ops.setwin_backup_20260809
  alter column row_without_win_before set not null;
alter table p0_ops.setwin_match_backup_20260809
  alter column match_core_before set not null,
  alter column approved_detail_fingerprint set not null;

create temporary table p0_setwin_targets (
  match_id text primary key,
  detail_fingerprint text not null
) on commit drop;

insert into p0_setwin_targets (match_id, detail_fingerprint)
select m.id, a.detail_fingerprint
  from matches m
  join (
    select d.match_id,
           count(*) as sets,
           count(distinct set_index) as index_distinct,
           min(set_index) as index_min,
           max(set_index) as index_max,
           md5(
             jsonb_build_object(
               'id', fm.id, 'lp_id', fm.lp_id, 'a', fm.a, 'b', fm.b,
               'status', fm.status, 'score_a', fm.score_a, 'score_b', fm.score_b
             )::text || '|details:' ||
             string_agg((to_jsonb(d) - 'match_id')::text, '|' order by d.set_index)
           ) as detail_fingerprint,
           count(*) filter (where win in ('a','b')) as labeled,
           count(*) filter (where win = 'a') as wa,
           count(*) filter (where win = 'b') as wb,
           count(*) filter (where case when jsonb_typeof(players) = 'array' then
             jsonb_array_length(players) = 10
             and (select count(*) from jsonb_array_elements(players) p where p->>'side' = 'a') = 5
             and (select count(*) from jsonb_array_elements(players) p where p->>'side' = 'b') = 5
           else false end) as side_ok
      from match_details d
      join matches fm on fm.id = d.match_id
     group by d.match_id, fm.id, fm.lp_id, fm.a, fm.b, fm.status, fm.score_a, fm.score_b
  ) a on a.match_id = m.id
 where m.status = 'done'
   and m.score_a is not null and m.score_b is not null
   and m.score_a <> m.score_b
   and a.sets = m.score_a + m.score_b
   and a.index_distinct = a.sets
   and a.index_min = 0 and a.index_max = a.sets - 1
   and a.labeled = a.sets
   and a.side_ok = a.sets
   and a.wa = m.score_b and a.wb = m.score_a;

-- 잠금 후 재계산한 exact-safe 전체와 운영자 승인 ID 전체가
-- 양방향으로 완전히 같고 fingerprint도 같아야 한다. 하나라도 빠지거나,
-- 추가되거나, 승인 후 상세 행이 바뀌면 UPDATE 전 중단한다.
do $$
declare
  approved_but_not_exact text[];
  exact_but_not_approved text[];
  changed_after_approval text[];
begin
  select array_agg(a.match_id order by a.match_id)
    into approved_but_not_exact
    from p0_setwin_approved_match_ids a
    left join p0_setwin_targets t on t.match_id = a.match_id
   where t.match_id is null;

  select array_agg(t.match_id order by t.match_id)
    into exact_but_not_approved
    from p0_setwin_targets t
    left join p0_setwin_approved_match_ids a on a.match_id = t.match_id
   where a.match_id is null;

  select array_agg(a.match_id order by a.match_id)
    into changed_after_approval
    from p0_setwin_approved_match_ids a
    join p0_setwin_targets t on t.match_id = a.match_id
   where a.expected_detail_fingerprint is distinct from t.detail_fingerprint;

  if approved_but_not_exact is not null
     or exact_but_not_approved is not null
     or changed_after_approval is not null then
    raise exception
      'allowlist≠잠금 후 exact-safe 대상. 승인했지만 현재 대상 아님=%, 현재 대상이지만 미승인=%, 승인 후 상세 변경=%',
      coalesce(approved_but_not_exact, array[]::text[]),
      coalesce(exact_but_not_approved, array[]::text[]),
      coalesce(changed_after_approval, array[]::text[]);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from p0_setwin_targets) then
    raise exception '안전한 자동 교정 대상이 0건입니다. 이미 교정됐거나 audit 결과를 다시 확인하세요';
  end if;
end $$;

insert into p0_ops.setwin_match_backup_20260809
  (match_id, match_core_before, approved_detail_fingerprint)
select m.id,
       jsonb_build_object(
         'id', m.id, 'lp_id', m.lp_id, 'a', m.a, 'b', m.b,
         'status', m.status, 'score_a', m.score_a, 'score_b', m.score_b
       ),
       t.detail_fingerprint
  from p0_setwin_targets t
  join matches m on m.id = t.match_id
 order by m.id;

do $$
begin
  if (select count(*) from p0_ops.setwin_match_backup_20260809)
       <> (select count(*) from p0_setwin_targets) then
    raise exception '경기 핵심/fingerprint 백업 행 수가 승인 대상과 다릅니다';
  end if;
  if exists (
    select 1
      from p0_ops.setwin_match_backup_20260809 mb
      join p0_setwin_targets t on t.match_id = mb.match_id
      join matches m on m.id = mb.match_id
     where mb.match_core_before is distinct from jsonb_build_object(
             'id', m.id, 'lp_id', m.lp_id, 'a', m.a, 'b', m.b,
             'status', m.status, 'score_a', m.score_a, 'score_b', m.score_b
           )
        or mb.approved_detail_fingerprint is distinct from t.detail_fingerprint
  ) then
    raise exception '경기 핵심/fingerprint 백업 검증이 실패했습니다';
  end if;
end $$;

insert into p0_ops.setwin_backup_20260809
  (match_id, set_index, win_before, row_without_win_before)
select d.match_id, d.set_index, d.win, to_jsonb(d) - 'win'
  from match_details d join p0_setwin_targets t on t.match_id = d.match_id
 order by d.match_id, d.set_index;

-- 백업행과 실제 수정 대상행이 정확히 같지 않으면 UPDATE 전에 중단한다.
do $$
begin
  if (select count(*) from p0_ops.setwin_backup_20260809)
       <> (select count(*) from match_details d
             join p0_setwin_targets t on t.match_id = d.match_id) then
    raise exception '백업 행 수가 수정 대상과 다릅니다';
  end if;
  if exists (
    select 1
      from p0_ops.setwin_backup_20260809 b
      join match_details d
        on d.match_id = b.match_id and d.set_index = b.set_index
     where b.row_without_win_before is null
        or b.row_without_win_before is distinct from (to_jsonb(d) - 'win')
  ) then
    raise exception '백업한 비-win 행 본문이 실제 수정 대상과 다릅니다';
  end if;
end $$;

update match_details d
   set win = case b.win_before when 'a' then 'b' when 'b' then 'a' else b.win_before end
  from p0_ops.setwin_backup_20260809 b
 where d.match_id = b.match_id and d.set_index = b.set_index;

-- 백업의 모든 행이 정확히 반대로 바뀌었고, set_index가 0..N-1이며,
-- 경기별 세트 승수가 스코어와 맞는지 검증한다.
do $$
begin
  if exists (
    select 1
      from p0_ops.setwin_match_backup_20260809 mb
      left join matches m on m.id = mb.match_id
     where m.id is null
        or mb.match_core_before is distinct from jsonb_build_object(
             'id', m.id, 'lp_id', m.lp_id, 'a', m.a, 'b', m.b,
             'status', m.status, 'score_a', m.score_a, 'score_b', m.score_b
           )
  ) then
    raise exception '교정 후 경기 핵심 정보 검증 실패 — 트랜잭션을 롤백합니다';
  end if;

  if exists (
    select 1
      from p0_ops.setwin_backup_20260809 b
      left join match_details d
        on d.match_id = b.match_id and d.set_index = b.set_index
     where d.match_id is null
        or d.win is distinct from case b.win_before
             when 'a' then 'b' when 'b' then 'a' else b.win_before end
        or (to_jsonb(d) - 'win') is distinct from b.row_without_win_before
  ) then
    raise exception '교정 후 행 단위 검증 실패 — 트랜잭션을 롤백합니다';
  end if;

  if exists (
    select m.id
      from p0_setwin_targets t
      join matches m on m.id = t.match_id
      left join match_details d on d.match_id = t.match_id
     group by m.id, m.score_a, m.score_b
    having count(*) filter (where d.win = 'a') <> m.score_a
        or count(*) filter (where d.win = 'b') <> m.score_b
        or count(d.match_id) <> m.score_a + m.score_b
        or count(distinct d.set_index) <> m.score_a + m.score_b
        or min(d.set_index) is distinct from 0
        or max(d.set_index) is distinct from m.score_a + m.score_b - 1
  ) then
    raise exception '교정 후 경기 스코어 검증 실패 — 트랜잭션을 롤백합니다';
  end if;
end $$;

select t.match_id, m.a, m.score_a, m.score_b, m.b,
       count(*) filter (where d.win = 'a') as 교정후_a승,
       count(*) filter (where d.win = 'b') as 교정후_b승
  from p0_setwin_targets t
  join matches m on m.id = t.match_id
  join match_details d on d.match_id = t.match_id
 group by t.match_id, m.a, m.score_a, m.score_b, m.b
 order by t.match_id;

commit;

-- COMMIT 후 p0_ops.setwin_backup_20260809은 삭제하지 않는다.
-- 운영 확인이 끝날 때까지 보관해야 rollback_p0_setwin.sql로 복구할 수 있다.
