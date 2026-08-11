-- ═══════════════════════════════════════════════════════════════════
-- P0-2 세트 승자 교정 롤백 — backfill_p0_setwin.sql의 영구 백업 기반
-- ⚠ setwin_backup_20260809 + setwin_match_backup_20260809 두 백업이
-- 모두 있고 내용이 검토된 경우에만 실행한다.
-- 같은 뒤집기 SQL 재실행이 아니라 저장된 win_before를 정확히 복원한다.
-- 누락/추가 세트, win 외 행 변경, 구 백업은 모두 덮어쓰지 않고 중단한다.
-- ═══════════════════════════════════════════════════════════════════

begin;

-- 검증과 복원 사이에 경기 정체성·세트 본문이 바뀌지 못하게 먼저 잠근다.
-- 일반 SELECT는 계속 가능하다.
lock table matches, match_details in share row exclusive mode;

do $$
begin
  if to_regclass('p0_ops.setwin_backup_20260809') is null then
    raise exception 'setwin 백업 테이블이 없어 롤백할 수 없습니다';
  end if;
  if to_regclass('p0_ops.setwin_match_backup_20260809') is null then
    raise exception '경기 핵심/fingerprint 백업 테이블이 없습니다. 구 백업을 자동 롤백하지 않습니다';
  end if;
  if not exists (
    select 1
      from pg_attribute
     where attrelid = 'p0_ops.setwin_backup_20260809'::regclass
       and attname = 'row_without_win_before'
       and not attisdropped
  ) then
    raise exception '백업에 row_without_win_before 컬럼이 없습니다. 구 백업을 자동 롤백하지 않습니다';
  end if;
  if not exists (
    select 1 from pg_attribute
     where attrelid = 'p0_ops.setwin_match_backup_20260809'::regclass
       and attname = 'match_core_before' and not attisdropped
  ) or not exists (
    select 1 from pg_attribute
     where attrelid = 'p0_ops.setwin_match_backup_20260809'::regclass
       and attname = 'approved_detail_fingerprint' and not attisdropped
  ) then
    raise exception '경기 핵심/fingerprint 백업 컬럼이 없습니다. 구 백업을 자동 롤백하지 않습니다';
  end if;
end $$;

-- 백업 검증·복원 사이에 다른 관리자가 백업 본문을 바꾸지 못하게 잠근다.
lock table p0_ops.setwin_backup_20260809, p0_ops.setwin_match_backup_20260809
  in share row exclusive mode;

do $$
begin
  if not exists (select 1 from p0_ops.setwin_backup_20260809) then
    raise exception 'setwin 백업이 비어 있어 롤백할 수 없습니다';
  end if;
  if not exists (select 1 from p0_ops.setwin_match_backup_20260809) then
    raise exception '경기 핵심/fingerprint 백업이 비어 있어 롤백할 수 없습니다';
  end if;
  if exists (
    select 1 from p0_ops.setwin_match_backup_20260809
     where match_core_before is null
        or approved_detail_fingerprint is null
        or approved_detail_fingerprint !~ '^[0-9a-f]{32}$'
  ) then
    raise exception '구/손상 백업에 경기 핵심 또는 fingerprint가 없습니다. 자동 롤백을 중단합니다';
  end if;
  if exists (
    select match_id from p0_ops.setwin_match_backup_20260809
    except
    select distinct match_id from p0_ops.setwin_backup_20260809
  ) or exists (
    select distinct match_id from p0_ops.setwin_backup_20260809
    except
    select match_id from p0_ops.setwin_match_backup_20260809
  ) then
    raise exception '경기 백업과 세트 백업의 match_id 집합이 다릅니다. 자동 롤백을 중단합니다';
  end if;
  if exists (
    select 1
      from p0_ops.setwin_match_backup_20260809 mb
      left join matches m on m.id = mb.match_id
     where m.id is null
        or jsonb_build_object(
             'id', m.id, 'lp_id', m.lp_id, 'a', m.a, 'b', m.b,
             'status', m.status, 'score_a', m.score_a, 'score_b', m.score_b
           ) is distinct from mb.match_core_before
  ) then
    raise exception '백업 후 경기 정체성(lp_id/A/B/status/score)이 바뀌었습니다. 자동 롤백을 중단합니다';
  end if;
  if exists (
    select 1 from p0_ops.setwin_backup_20260809
     where row_without_win_before is null
  ) then
    raise exception '구 백업 행에 비-win 본문이 없습니다. 데이터를 덮어쓰지 않고 롤백을 중단합니다';
  end if;
  if exists (
    with rebuilt as (
      select mb.match_id, mb.approved_detail_fingerprint,
             md5(
               mb.match_core_before::text || '|details:' ||
               string_agg(
                 ((b.row_without_win_before || jsonb_build_object('win', b.win_before)) - 'match_id')::text,
                 '|' order by b.set_index
               )
             ) as rebuilt_fingerprint
        from p0_ops.setwin_match_backup_20260809 mb
        join p0_ops.setwin_backup_20260809 b on b.match_id = mb.match_id
       group by mb.match_id, mb.match_core_before, mb.approved_detail_fingerprint
    )
    select 1 from rebuilt
     where rebuilt_fingerprint is distinct from approved_detail_fingerprint
  ) then
    raise exception '백업 본문으로 재구성한 승인 fingerprint가 다릅니다. 손상 백업을 자동 롤백하지 않습니다';
  end if;
  if exists (
    select 1
      from p0_ops.setwin_backup_20260809 b
      left join match_details d
        on d.match_id = b.match_id and d.set_index = b.set_index
     where d.match_id is null
  ) then
    raise exception '백업에 대응하는 match_details 행이 사라졌습니다. 자동 롤백을 중단합니다';
  end if;
  if exists (
    select 1
      from match_details d
      join (select distinct match_id from p0_ops.setwin_backup_20260809) bm
        on bm.match_id = d.match_id
      left join p0_ops.setwin_backup_20260809 b
        on b.match_id = d.match_id and b.set_index = d.set_index
     where b.match_id is null
  ) then
    raise exception '백업 후 대상 경기에 추가 세트가 생겼습니다. 자동 롤백을 중단합니다';
  end if;
  if exists (
    select 1
      from p0_ops.setwin_backup_20260809 b
      join match_details d
        on d.match_id = b.match_id and d.set_index = b.set_index
     where (to_jsonb(d) - 'win') is distinct from b.row_without_win_before
  ) then
    raise exception '백업 후 win 이외의 세트 내용이 바뀌었습니다. 덮어쓰지 않고 롤백을 중단합니다';
  end if;
  if exists (
    select 1
      from p0_ops.setwin_backup_20260809 b
      join match_details d
        on d.match_id = b.match_id and d.set_index = b.set_index
     where d.win is distinct from case b.win_before
            when 'a' then 'b' when 'b' then 'a' else b.win_before end
  ) then
    raise exception '교정 후 값이 다른 작업으로 바뀌었습니다. 덮어쓰지 않고 롤백을 중단합니다';
  end if;
end $$;

update match_details d
   set win = b.win_before
  from p0_ops.setwin_backup_20260809 b
 where d.match_id = b.match_id and d.set_index = b.set_index;

do $$
begin
  if exists (
    select 1
      from p0_ops.setwin_match_backup_20260809 mb
      left join matches m on m.id = mb.match_id
     where m.id is null
        or jsonb_build_object(
             'id', m.id, 'lp_id', m.lp_id, 'a', m.a, 'b', m.b,
             'status', m.status, 'score_a', m.score_a, 'score_b', m.score_b
           ) is distinct from mb.match_core_before
  ) then
    raise exception '롤백 후 경기 핵심 정보 검증 실패 — 트랜잭션을 롤백합니다';
  end if;

  if exists (
    select 1
      from p0_ops.setwin_backup_20260809 b
      left join match_details d
        on d.match_id = b.match_id and d.set_index = b.set_index
     where d.match_id is null
        or d.win is distinct from b.win_before
        or (to_jsonb(d) - 'win') is distinct from b.row_without_win_before
  ) then
    raise exception '백업값/비-win 본문 복원 검증 실패 — 트랜잭션을 롤백합니다';
  end if;
  if exists (
    select 1
      from match_details d
      join (select distinct match_id from p0_ops.setwin_backup_20260809) bm
        on bm.match_id = d.match_id
      left join p0_ops.setwin_backup_20260809 b
        on b.match_id = d.match_id and b.set_index = d.set_index
     where b.match_id is null
  ) then
    raise exception '롤백 후 추가 세트 검증 실패 — 트랜잭션을 롤백합니다';
  end if;
  if exists (
    with restored as (
      select mb.match_id, mb.approved_detail_fingerprint,
             md5(
               jsonb_build_object(
                 'id', m.id, 'lp_id', m.lp_id, 'a', m.a, 'b', m.b,
                 'status', m.status, 'score_a', m.score_a, 'score_b', m.score_b
               )::text || '|details:' ||
               string_agg((to_jsonb(d) - 'match_id')::text, '|' order by d.set_index)
             ) as restored_fingerprint
        from p0_ops.setwin_match_backup_20260809 mb
        join matches m on m.id = mb.match_id
        join match_details d on d.match_id = mb.match_id
       group by mb.match_id, mb.approved_detail_fingerprint,
                m.id, m.lp_id, m.a, m.b, m.status, m.score_a, m.score_b
    )
    select 1 from restored
     where restored_fingerprint is distinct from approved_detail_fingerprint
  ) then
    raise exception '롤백 후 전체 fingerprint 검증 실패 — 트랜잭션을 롤백합니다';
  end if;
end $$;

select b.match_id, count(*) as 복원한_세트
  from p0_ops.setwin_backup_20260809 b
 group by b.match_id order by b.match_id;

commit;

-- 감사 추적과 재검증을 위해 백업 테이블은 자동 삭제하지 않는다.
