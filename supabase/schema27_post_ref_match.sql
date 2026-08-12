-- ════════════════════════════════════════════════════════════════════
-- schema27 — 글에 '참조 경기' 붙이기 (이전 경기 기록 첨부)
-- ════════════════════════════════════════════════════════════════════
--
-- 왜 새 칸이 필요한가
--   posts.match_id 를 재활용하려 했지만 **불가능**하다.
--   그 칸은 schema22/25 에서 **관리자 전용**이 됐다 — 공식 [경기 토론] 방을 가리키는
--   칸이고, 비관리자가 값을 보내면 create_post 가 조용히 버린다(P0-1 수정).
--   일반 회원이 글에 경기를 붙이려면 **성격이 다른 칸**이 따로 있어야 한다.
--
--     match_id      = 이 글이 그 경기의 **공식 토론방이다** (관리자만, is_official 판정에 쓰임)
--     ref_match_id  = 이 글이 그 경기를 **인용한다** (누구나, 표시용일 뿐)
--
-- ⚠ 실행 순서 — **이 SQL 이 먼저, 코드 배포가 나중이다.**
--   schema26 이 posts 의 컬럼별 읽기 권한을 잠가 놨기 때문에, 새 칸은 grant 를
--   따로 해 줘야 목록에 나온다. 코드가 먼저 나가면 그 칸을 못 읽어 목록이 죽는다.
--   되돌리기: rollback_schema27.sql
-- ════════════════════════════════════════════════════════════════════

begin;

-- ── ① 참조 경기 칸 ───────────────────────────────────────────────────
alter table public.posts add column if not exists ref_match_id text;

-- ⚠ schema26 에서 테이블 단위 select 를 회수했으므로 **새 칸은 따로 열어 줘야** 한다.
--   (이걸 빼먹으면 글 목록 요청이 통째로 권한 오류가 난다)
grant select (ref_match_id) on public.posts to anon, authenticated;

-- ── ② 참조 경기 설정 RPC ─────────────────────────────────────────────
-- create_post 의 서명은 건드리지 않는다 — 이름 인자가 하나라도 어긋나면 배포 순서에
-- 따라 글쓰기가 통째로 죽는다. 투표 첨부(create_member_poll)와 같은 방식으로,
-- 글을 만든 **뒤에** 따로 호출한다.
--
-- 규칙
--   · 글쓴이 본인 또는 관리자만
--   · 실제로 있는 경기만 (없는 id 를 넣어 화면을 깨뜨릴 수 없게)
--   · 빈 값이면 첨부 해제
--   · is_official / match_id 는 **절대 건드리지 않는다** (공식 경기방과 무관)
create or replace function public.set_post_ref_match(p_post_id text, p_match_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
  v_ref text := nullif(btrim(coalesce(p_match_id, '')), '');
begin
  if v_uid is null then
    raise exception '로그인한 회원만 경기를 첨부할 수 있습니다';
  end if;

  select author_id into v_author from public.posts where id = p_post_id;
  if not found then raise exception '글을 찾을 수 없습니다'; end if;

  if v_author is distinct from v_uid and not public.is_admin() then
    raise exception '내가 쓴 글에만 경기를 첨부할 수 있습니다';
  end if;

  if v_ref is not null and not exists (select 1 from public.matches where id = v_ref) then
    raise exception '없는 경기입니다';
  end if;

  update public.posts set ref_match_id = v_ref where id = p_post_id;
end $$;

revoke all on function public.set_post_ref_match(text, text) from public;
grant execute on function public.set_post_ref_match(text, text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════
-- 확인
-- ════════════════════════════════════════════════════════════════════
-- (1) 칸이 생겼고 읽기 권한이 열렸나 → anon 행이 나와야 한다
-- select grantee, column_name from information_schema.column_privileges
--  where table_schema='public' and table_name='posts' and column_name='ref_match_id';
--
-- (2) 함수가 있나
-- select proname, prosecdef from pg_proc
--  where pronamespace='public'::regnamespace and proname='set_post_ref_match';
