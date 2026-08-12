-- ════════════════════════════════════════════════════════════════════
-- schema28 — 글에 '모의밴픽' 붙이기
-- ════════════════════════════════════════════════════════════════════
--
-- 글쓴이가 직접 짠 밴픽판을 글 본문에 박는다.
-- 그림이 아니라 **데이터**로 저장한다 (챔피언 이름 목록) — 나중에 통계로도 쓸 수 있고,
-- 챔피언 아이콘이 바뀌어도 저절로 따라간다.
--
-- 저장 모양 (posts.draft, jsonb)
--   { v:1, blueTeam:"gen"|null, redTeam:"hle"|null,
--     sets: [ { bans:{blue:[5],red:[5]}, picks:{blue:[{lane,champ}…],red:[…]} } … ] }
--
-- ⚠ 피어리스(앞 세트에서 쓴 챔피언 자동 밴)는 **저장하지 않는다.**
--   앞 세트 픽에서 계산해 낸다. 저장해 두면 앞 세트를 고칠 때 어긋난다.
--
-- ⚠ 실행 순서 — **이 SQL 이 먼저, 코드 배포가 나중이다.**
--   schema26 이 posts 의 컬럼별 읽기 권한을 잠가 놔서 새 칸은 grant 가 필요하다.
--   (코드에는 칸이 없어도 안 죽는 폴백이 있지만, 순서는 이게 맞다)
--   되돌리기: rollback_schema28.sql
-- ════════════════════════════════════════════════════════════════════

begin;

alter table public.posts add column if not exists draft jsonb;

-- schema26 이 테이블 단위 select 를 회수했으므로 새 칸은 따로 열어 준다
grant select (draft) on public.posts to anon, authenticated;

-- 글쓴이 본인/관리자만. create_post 서명은 건드리지 않는다 (인자가 어긋나면 글쓰기가 죽는다).
create or replace function public.set_post_draft(p_post_id text, p_draft jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
  v_sets jsonb;
begin
  if v_uid is null then
    raise exception '로그인한 회원만 모의밴픽을 붙일 수 있습니다';
  end if;

  select author_id into v_author from public.posts where id = p_post_id;
  if not found then raise exception '글을 찾을 수 없습니다'; end if;
  if v_author is distinct from v_uid and not public.is_admin() then
    raise exception '내가 쓴 글에만 붙일 수 있습니다';
  end if;

  -- 지우기
  if p_draft is null or p_draft = 'null'::jsonb then
    update public.posts set draft = null where id = p_post_id;
    return;
  end if;

  -- 모양 검사 — 화면 버그로 이상한 값이 와도 DB 에 남지 않게.
  -- 내용(챔피언 이름)까지 서버가 다 따지지는 않는다. 표시용 자료이고,
  -- 사람이 직접 짠 가상 밴픽이라 '정답'이 없기 때문이다.
  if jsonb_typeof(p_draft) <> 'object' then raise exception '모의밴픽 모양이 잘못되었습니다'; end if;
  v_sets := p_draft -> 'sets';
  if v_sets is null or jsonb_typeof(v_sets) <> 'array' then
    raise exception '모의밴픽에 세트가 없습니다';
  end if;
  if jsonb_array_length(v_sets) < 1 or jsonb_array_length(v_sets) > 5 then
    raise exception '세트는 1~5개여야 합니다';
  end if;
  -- 통째로 커지는 걸 막는다 (한 글에 수 MB 가 들어오지 않게)
  if length(p_draft::text) > 20000 then raise exception '모의밴픽이 너무 큽니다'; end if;

  update public.posts set draft = p_draft where id = p_post_id;
end $$;

revoke all on function public.set_post_draft(text, jsonb) from public;
grant execute on function public.set_post_draft(text, jsonb) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════
-- 확인
-- ════════════════════════════════════════════════════════════════════
-- select grantee, column_name from information_schema.column_privileges
--  where table_schema='public' and table_name='posts' and column_name='draft';
-- select proname, prosecdef from pg_proc
--  where pronamespace='public'::regnamespace and proname='set_post_draft';
