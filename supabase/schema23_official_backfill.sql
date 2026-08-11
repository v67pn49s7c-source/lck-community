-- ═══════════════════════════════════════════════════════════════════
-- schema23: 공식 토론방 백필 + 경기당 1개 강제 (P0-1 후반부)
--
-- ⚠ schema22 적용 후, 이 파일 실행 전 반드시 audit_p0_read_only.sql 의 ①·② 와
--   cleanup_p0_manual.sql을 먼저 확인하세요.
--   · ① 에 나온 오염 글이 있으면 cleanup_p0_manual.sql 로 먼저 정리
--   · ② 에 중복 토론방이 있으면 어느 글을 남길지 사람이 정한 뒤 정리
--   아래 유니크 인덱스는 중복이 남아 있으면 실패합니다 — 그게 의도입니다.
--   이 파일이 명시적으로 한 트랜잭션을 열고 posts 쓰기를 잠그므로, 백필과 인덱스
--   생성 사이에 새 중복 글이 끼지 않으며 실패 시 전체가 되돌아갑니다.
--
-- 여러 번 실행해도 안전합니다.
-- ═══════════════════════════════════════════════════════════════════

begin;

-- 백필 대상 고정부터 unique index 생성까지 posts와 관리자 판정의 변경을 잠시 막는다.
-- 일반 SELECT는 계속 가능하다. 글쓰기 트래픽이 낮은 유지보수 시간에 실행한다.
lock table posts, profiles in share row exclusive mode;

-- ── ① 백필 전 값 백업 ─────────────────────────────────────────────
-- public API에 노출되지 않는 전용 schema에 이 파일이 실제로 바꾸는 글만 보관한다.
-- schema23을 되돌릴 때 전역 UPDATE를 하지 않고 이 백업의 글만 원래 값으로 복원한다.
create schema if not exists p0_ops;
revoke all on schema p0_ops from public, anon, authenticated;

create table if not exists p0_ops.official_post_backup_20260809 (
  post_id text primary key,
  is_official_before boolean not null,
  backed_up_at timestamptz not null default now()
);
revoke all on table p0_ops.official_post_backup_20260809 from public, anon, authenticated;

insert into p0_ops.official_post_backup_20260809 (post_id, is_official_before)
select p.id, p.is_official
  from posts p
 where p.match_id is not null
   and p.title like '[경기 토론]%'
   and p.is_official = false
   and exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_admin)
on conflict (post_id) do nothing;

-- ── ② 백필: 관리자가 만든 [경기 토론] 글에 공식 표시 ───────────────
-- 조건 세 개를 모두 요구한다 — 경기 연결 + 관례 제목 + **관리자 작성**.
-- 제목만 흉내 낸 일반 글은 관리자 작성이 아니므로 표시되지 않는다.
update posts p
   set is_official = true
 where p.match_id is not null
   and p.title like '[경기 토론]%'
   and p.is_official = false
   and exists (select 1 from profiles pr where pr.id = p.author_id and pr.is_admin);

-- ── ③ 경기당 공식 토론방은 하나뿐 ──────────────────────────────────
create unique index if not exists one_official_thread_per_match
  on posts (match_id) where is_official and match_id is not null;

-- IF NOT EXISTS는 같은 이름의 잘못된 인덱스도 조용히 건너뛴다. 이름뿐 아니라
-- unique·대상 칼럼·partial predicate까지 확인해 드리프트면 COMMIT 전에 중단한다.
do $$
begin
  if not exists (
    select 1
      from pg_class i
      join pg_namespace n on n.oid = i.relnamespace
      join pg_index x on x.indexrelid = i.oid
     where n.nspname = 'public'
       and i.relname = 'one_official_thread_per_match'
       and i.relkind = 'i'
       and x.indrelid = 'public.posts'::regclass
       and x.indisunique
       and x.indisvalid and x.indisready
       and x.indnkeyatts = 1 and x.indnatts = 1
       and x.indexprs is null and x.indpred is not null
       and x.indkey[0] = (
         select a.attnum from pg_attribute a
          where a.attrelid = 'public.posts'::regclass
            and a.attname = 'match_id' and not a.attisdropped
       )
       and lower(regexp_replace(
             pg_get_expr(x.indpred, x.indrelid, false),
             '[[:space:]()]', '', 'g'
           )) = 'is_officialandmatch_idisnotnull'
  ) then
    raise exception 'one_official_thread_per_match 인덱스 정의가 예상과 다릅니다';
  end if;
end $$;

-- ═══ 확인 ═══
select
  (select count(*) from posts where is_official) as 공식_토론방_수,
  (select count(distinct match_id) from posts where is_official) as 경기_수,
  (select count(*) from p0_ops.official_post_backup_20260809) as schema23_백업_글수,
  case when exists (select 1 from pg_indexes where schemaname = 'public'
                     and indexname = 'one_official_thread_per_match')
       then 'schema23 OK' else '인덱스 생성 실패' end as "결과";

commit;
