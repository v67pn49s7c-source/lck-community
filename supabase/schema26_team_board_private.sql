-- ════════════════════════════════════════════════════════════════════
-- schema26 — 팀 게시판 진짜 잠금 (서버에서 막기)
-- ════════════════════════════════════════════════════════════════════
--
-- 왜 필요한가
--   이 사이트는 브라우저가 DB에 직접 말을 건다. 그 열쇠(anon key)는 코드 안에
--   들어 있어 누구나 꺼낼 수 있다. 그래서 브라우저 코드로만 막으면
--     curl .../rest/v1/posts?id=eq.<글>&select=body
--   한 줄로 팀 게시판 본문이 그대로 읽힌다. (2026-08-12 실제로 확인)
--   화면 차단은 "안내판"일 뿐이고, 자물쇠는 DB에 달아야 한다.
--
-- 무엇을 하는가
--   ① posts 의 **body 컬럼만** 읽기 권한을 회수한다.
--      목록에 필요한 제목·글쓴이·날짜·추천수는 그대로 공개 → 게시판 목록은 계속 보인다.
--   ② 본문은 확인하고 내주는 전용 창구(get_post_body)로만 나간다.
--   ③ 댓글·투표도 같은 기준으로 가린다 (본문만 막고 댓글이 뚫리면 의미가 없다).
--
-- ⚠ 바뀌는 것 — **비회원은 팀 게시판 글을 읽을 수 없다.**
--   서버는 비회원이 어느 팀 팬인지 확인할 방법이 없다(브라우저에만 저장돼 있다).
--   즉 팀 게시판 읽기 = 로그인 + 응원팀 일치. 공지와 관리자는 예외.
--
-- ⚠ 실행 순서 — **코드 배포가 먼저, 이 SQL 이 나중이다.**
--   이 SQL 을 먼저 돌리면, 아직 배포돼 있는 옛 코드가 select("*") 로 목록을 받다가
--   권한 오류로 실패해 **사이트 전체에서 글이 사라진다** (새 배포가 끝날 때까지).
--   반대 순서는 안전하다 — 새 코드는 이 SQL 이 아직 없으면 예전 방식으로 본문을 받는다.
--   되돌리기: rollback_schema26.sql
-- ════════════════════════════════════════════════════════════════════

begin;

-- ── ① 본문 컬럼 읽기 권한 회수 ───────────────────────────────────────
-- 테이블 단위 select 를 회수하고, 목록에 필요한 컬럼만 하나씩 되돌려 준다.
-- (body 와 up_seed 는 의도적으로 뺀다. up_seed 는 내부 보정값이라 밖에 나갈 이유가 없다)
revoke select on public.posts from anon, authenticated;
grant select (
  id, team, cat, title, nick, author_team, author_id,
  match_id, is_official, up, views, created_at
) on public.posts to anon, authenticated;

-- ── ② 읽어도 되는 글인가 (공용 판정) ────────────────────────────────
-- security definer = 이 함수 안에서는 서버 권한으로 posts 를 본다.
-- 규칙은 브라우저의 canReadPost() 와 **같아야 한다**.
create or replace function public.can_read_post(p_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_id
      and (
        p.team is null                              -- 전체 게시판 글
        or p.cat = '공지'                            -- 운영 공지는 어디서나 읽힌다
        or public.is_admin()
        or (auth.uid() is not null
            and p.team = (select fav_team from public.profiles where id = auth.uid()))
      )
  )
$$;

-- ── ③ 본문 전용 창구 ────────────────────────────────────────────────
-- 읽을 자격이 없으면 null 을 돌려준다. 글이 없어도 null 이다 —
-- 밖에서 두 경우를 구분할 수 없어야 "어떤 글이 있는지" 캐낼 수 없다.
create or replace function public.get_post_body(p_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.body from public.posts p
  where p.id = p_id and public.can_read_post(p_id)
$$;

-- ── ④ 댓글 — 못 읽는 글의 댓글도 안 보인다 ──────────────────────────
drop policy if exists "read_all_comments" on public.comments;
drop policy if exists "read_visible_comments" on public.comments;
create policy "read_visible_comments" on public.comments
  for select using (public.can_read_post(post_id));

-- ── ⑤ 글에 붙은 투표 — 질문·보기가 새면 안 된다 ─────────────────────
-- 경기 연동 투표(post_id 없음)는 그대로 공개다.
drop policy if exists "read_polls" on public.polls;
create policy "read_polls" on public.polls
  for select using (post_id is null or public.can_read_post(post_id));

-- ── ⑥ 실행 권한 ─────────────────────────────────────────────────────
revoke all on function public.can_read_post(text)  from public;
revoke all on function public.get_post_body(text)  from public;
grant execute on function public.can_read_post(text) to anon, authenticated;
grant execute on function public.get_post_body(text) to anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════
-- 확인 — 아래를 실행해 기대값과 맞는지 본다
-- ════════════════════════════════════════════════════════════════════
--
-- (1) body 권한이 진짜 사라졌나 → anon·authenticated 행이 **없어야** 한다
-- select grantee, privilege_type
--   from information_schema.column_privileges
--  where table_schema = 'public' and table_name = 'posts' and column_name = 'body'
--    and grantee in ('anon','authenticated');
--
-- (2) 목록용 컬럼은 남았나 → anon 에 title 이 **있어야** 한다
-- select grantee, column_name
--   from information_schema.column_privileges
--  where table_schema = 'public' and table_name = 'posts'
--    and grantee = 'anon' and column_name in ('title','body')
--  order by column_name;
--
-- (3) 정책이 바뀌었나 → comments=read_visible_comments, polls=read_polls
-- select tablename, policyname, qual
--   from pg_policies
--  where schemaname = 'public' and tablename in ('comments','polls') and cmd = 'SELECT';
--
-- (4) 창구가 살아 있나 → 두 함수가 나와야 한다
-- select proname, prosecdef from pg_proc
--  where pronamespace = 'public'::regnamespace
--    and proname in ('can_read_post','get_post_body');
