-- ═══════════════════════════════════════════════════════════════════
-- schema23 공식 경기방 백필 롤백 — 영구 백업 기반
-- ⚠ p0_ops.official_post_backup_20260809를 검토한 뒤에만 실행한다.
-- schema23 이후 사람이 바꾼 글은 덮어쓰지 않고 전체 롤백을 중단한다.
-- ═══════════════════════════════════════════════════════════════════

begin;

-- 검증부터 복원까지 수집기/관리자 글 변경이 끼어들지 못하게 한다.
-- 일반 SELECT는 계속 가능하다.
lock table public.posts in share row exclusive mode;

do $$
begin
  if to_regclass('p0_ops.official_post_backup_20260809') is null then
    raise exception '공식 경기방 백업 테이블이 없어 롤백할 수 없습니다';
  end if;

  if exists (
    select 1
      from p0_ops.official_post_backup_20260809 b
      left join public.posts p on p.id = b.post_id
     where p.id is null
  ) then
    raise exception '백업에 대응하는 posts 행이 사라졌습니다. 자동 롤백을 중단합니다';
  end if;

  -- schema23이 바꾼 행은 현재 true여야 한다. 이후 사람이 수정한 흔적이 있으면
  -- 백업값으로 덮어쓰지 않고 멈춘다.
  if exists (
    select 1
      from p0_ops.official_post_backup_20260809 b
      join public.posts p on p.id = b.post_id
     where p.is_official is distinct from true
  ) then
    raise exception 'schema23 이후 공식 표시가 바뀐 글이 있습니다. 덮어쓰지 않고 롤백을 중단합니다';
  end if;
end $$;

drop index if exists public.one_official_thread_per_match;

update public.posts p
   set is_official = b.is_official_before
  from p0_ops.official_post_backup_20260809 b
 where p.id = b.post_id;

do $$
begin
  if exists (
    select 1
      from p0_ops.official_post_backup_20260809 b
      join public.posts p on p.id = b.post_id
     where p.is_official is distinct from b.is_official_before
  ) then
    raise exception '공식 표시 복원 검증 실패 — 트랜잭션을 롤백합니다';
  end if;
end $$;

select count(*) as 복원한_글
  from p0_ops.official_post_backup_20260809;

commit;

-- 감사 추적을 위해 백업 테이블은 자동 삭제하지 않는다.
