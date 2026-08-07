-- ══════════════════════════════════════════════════════════════════
-- schema20: 팀 게시판 댓글도 그 팀 팬만
-- ══════════════════════════════════════════════════════════════════
--
-- 무엇이 뚫려 있었나:
--   글쓰기는 서버가 제대로 막고 있다 —
--     create_post: "응원팀 게시판에만 글을 쓸 수 있습니다" (schema11_post_edit.sql)
--   그런데 **댓글에는 팀 검사가 한 줄도 없었다.**
--   그래서 T1 팬이 젠지 게시판 글에 댓글을 다는 건 응원팀을 바꿀 필요조차 없이
--   그냥 됐다. 로그인하지 않은 사람도 됐다. 글쓰기 제한보다 악용이 훨씬 쉬웠다.
--
-- 규칙 (글쓰기와 똑같이 맞춘다):
--   · 팀 게시판 글(posts.team 이 있는 글)의 댓글은 **그 팀 팬 회원만**.
--   · 비회원은 팀 게시판에 댓글을 달 수 없다 (전체 게시판·경기 토론은 그대로 가능).
--   · 관리자는 예외.
--   · 팀이 없는 글(전체 게시판·공지·[경기 토론])은 아무 영향 없다 — 지금과 똑같다.
--
-- 이 함수가 댓글의 **유일한 입력 경로**다 (comments 테이블 직접 insert 는 이미 막혀 있다).
-- 그래서 여기 넣으면 주소를 직접 두드려도 통과하지 못한다.
--
-- 실행: Supabase → SQL Editor 에 통째로 붙여넣고 Run.
--       맨 아래가 '댓글 팀 검사 OK' 면 성공.
-- ══════════════════════════════════════════════════════════════════

create or replace function create_comment(
  p_post_id text, p_nick text, p_body text, p_pw text
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_nick text; v_fav text; v_admin boolean := false; v_id bigint; v_nick_out text;
  v_post_team text;
begin
  if not (coalesce(char_length(p_body), 0) between 1 and 500) then raise exception '댓글은 1~500자로 입력해 주세요'; end if;

  -- 글이 있는지 확인하면서 그 글이 어느 팀 게시판인지도 같이 읽는다
  select team into v_post_team from posts where id = p_post_id;
  if not found then raise exception '글을 찾을 수 없습니다'; end if;
  v_post_team := nullif(v_post_team, '');

  if v_uid is not null then
    select nick, fav_team, is_admin into v_nick, v_fav, v_admin from profiles where id = v_uid;
  end if;

  if coalesce(v_admin, false) then
    v_nick_out := coalesce(nullif(p_nick, ''), v_nick, '운영자');
  elsif v_uid is not null then
    if v_nick is null then raise exception '프로필(닉네임)을 먼저 설정해 주세요'; end if;
    -- ★ 새로 넣은 검사 — 글쓰기(create_post)와 같은 규칙
    if v_post_team is not null and v_post_team is distinct from v_fav then
      raise exception '응원팀 게시판에만 댓글을 쓸 수 있습니다';
    end if;
    v_nick_out := v_nick;                                        -- 회원은 프로필 닉네임 고정
  else
    -- ★ 새로 넣은 검사 — 비회원은 팀 게시판에 못 쓴다 (글쓰기와 같은 규칙)
    if v_post_team is not null then
      raise exception '팀 게시판은 회원만 댓글을 쓸 수 있습니다 (전체 게시판은 누구나 가능합니다)';
    end if;
    if p_pw is null or char_length(p_pw) < 4 then
      raise exception '비회원 댓글은 4자 이상의 비밀번호가 필요합니다 (삭제할 때 씁니다)';
    end if;
    v_nick_out := anon_nick();                                   -- 비회원은 자동 부여 유동닉
  end if;

  insert into comments (post_id, nick, body, author_team, author_id)
  values (p_post_id, v_nick_out, p_body, case when v_uid is null then null else v_fav end, v_uid)
  returning id into v_id;

  if p_pw is not null and char_length(p_pw) >= 4 then
    insert into comment_secrets (comment_id, pw_hash) values (v_id, crypt(p_pw, gen_salt('bf')));
  end if;
  return jsonb_build_object('id', v_id, 'nick', v_nick_out);
end $$;

grant execute on function create_comment(text, text, text, text) to anon, authenticated;

-- ── 확인 ──────────────────────────────────────────────────────
select case
    when (select pg_get_functiondef(p.oid) from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'create_comment' limit 1)
         like '%응원팀 게시판에만 댓글을%'
    then '댓글 팀 검사 OK'
    else '실패 — 위 함수가 다시 만들어졌는지 확인해 주세요'
  end as "결과";
