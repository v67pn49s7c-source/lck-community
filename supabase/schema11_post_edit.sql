-- ═══════════════════════════════════════════════════════
-- 게시글 비밀번호 · 수정 · 삭제 (2026-08-04)
--
--  · 비회원은 글/댓글을 쓸 때 비밀번호를 정하고, 그 비밀번호로 수정·삭제
--  · 회원은 비밀번호 없이 자기 글을 수정·삭제 (계정으로 확인)
--  · 관리자는 모두 가능
--  · 조회수·추천수가 서버에 저장되지 않던 문제도 함께 수정
--
-- 비밀번호는 본문 테이블(posts)이 전체 공개 조회라 절대 같이 두면 안 되므로,
-- 아무도 직접 읽을 수 없는 별도 테이블에 bcrypt 해시로만 보관합니다.
-- 여러 번 실행해도 안전합니다.
-- ═══════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- ── 1) 작성자 표시용 컬럼 (회원 글 소유 확인) ──
alter table posts    add column if not exists author_id uuid;
alter table comments add column if not exists author_id uuid;

-- ── 2) 비밀번호 보관소 — RLS 켜고 정책을 두지 않아 아무도 직접 읽을 수 없음 ──
create table if not exists post_secrets (
  post_id text primary key references posts(id) on delete cascade,
  pw_hash text not null,
  created_at timestamptz not null default now()
);
alter table post_secrets enable row level security;

create table if not exists comment_secrets (
  comment_id bigint primary key references comments(id) on delete cascade,
  pw_hash text not null,
  created_at timestamptz not null default now()
);
alter table comment_secrets enable row level security;

-- ── 3) 글 작성 (비밀번호 포함) ──
-- 기존 insert 정책과 같은 규칙을 함수 안에서 검사한다.
create or replace function create_post(
  p_id text, p_team text, p_cat text, p_title text, p_body text,
  p_nick text, p_match_id text, p_pw text
) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_nick text; v_fav text; v_admin boolean := false;
  v_team text := nullif(p_team, '');
  v_author_team text := null;
begin
  if p_id !~ '^[A-Za-z0-9_-]{1,64}$' then raise exception '글 번호 형식이 잘못되었습니다'; end if;
  if not (coalesce(char_length(p_title), 0) between 1 and 100) then raise exception '제목은 1~100자로 입력해 주세요'; end if;
  if not (coalesce(char_length(p_body), 0) between 1 and 5000) then raise exception '내용은 1~5000자로 입력해 주세요'; end if;

  if v_uid is not null then
    select nick, fav_team, is_admin into v_nick, v_fav, v_admin from profiles where id = v_uid;
  end if;

  if coalesce(v_admin, false) then
    v_author_team := v_fav;
  elsif v_uid is not null then
    if p_nick is distinct from v_nick then raise exception '닉네임은 프로필 닉네임만 쓸 수 있습니다'; end if;
    if p_cat = '공지' then raise exception '공지는 관리자만 쓸 수 있습니다'; end if;
    if v_team is not null and v_team is distinct from v_fav then
      raise exception '응원팀 게시판에만 글을 쓸 수 있습니다';
    end if;
    v_author_team := v_fav;
  else
    if p_cat = '공지' then raise exception '공지는 관리자만 쓸 수 있습니다'; end if;
    if v_team is not null then raise exception '팀 게시판은 그 팀 팬 회원만 쓸 수 있습니다'; end if;
    if p_nick ~* '(운영자|관리자|어드민|admin|nexus|넥서스)' then raise exception '쓸 수 없는 닉네임입니다'; end if;
    if p_pw is null or char_length(p_pw) < 4 then
      raise exception '비회원 글은 4자 이상의 비밀번호가 필요합니다 (수정·삭제할 때 씁니다)';
    end if;
  end if;

  insert into posts (id, team, cat, title, body, nick, author_team, match_id, author_id)
  values (p_id, v_team, p_cat, p_title, p_body, p_nick, v_author_team, nullif(p_match_id, ''), v_uid);

  if p_pw is not null and char_length(p_pw) >= 4 then
    insert into post_secrets (post_id, pw_hash) values (p_id, crypt(p_pw, gen_salt('bf')))
    on conflict (post_id) do nothing;
  end if;
  return p_id;
end $$;

-- ── 4) 수정·삭제 권한 확인 ──
create or replace function can_edit_post(p_id text, p_pw text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := auth.uid(); v_author uuid; v_hash text;
begin
  select author_id into v_author from posts where id = p_id;
  if not found then return false; end if;
  if coalesce((select is_admin from profiles where id = v_uid), false) then return true; end if;
  if v_uid is not null and v_author = v_uid then return true; end if;
  select pw_hash into v_hash from post_secrets where post_id = p_id;
  if v_hash is null or p_pw is null then return false; end if;
  return v_hash = crypt(p_pw, v_hash);
end $$;

create or replace function update_post(p_id text, p_pw text, p_title text, p_body text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not can_edit_post(p_id, p_pw) then raise exception '비밀번호가 맞지 않습니다'; end if;
  if not (coalesce(char_length(p_title), 0) between 1 and 100) then raise exception '제목은 1~100자로 입력해 주세요'; end if;
  if not (coalesce(char_length(p_body), 0) between 1 and 5000) then raise exception '내용은 1~5000자로 입력해 주세요'; end if;
  update posts set title = p_title, body = p_body where id = p_id;
end $$;

create or replace function delete_post(p_id text, p_pw text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not can_edit_post(p_id, p_pw) then raise exception '비밀번호가 맞지 않습니다'; end if;
  delete from posts where id = p_id;
end $$;

-- ── 5) 댓글 (작성 시 비밀번호, 비밀번호로 삭제) ──
create or replace function create_comment(
  p_post_id text, p_nick text, p_body text, p_pw text
) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_nick text; v_fav text; v_admin boolean := false; v_id bigint;
begin
  if not (coalesce(char_length(p_body), 0) between 1 and 500) then raise exception '댓글은 1~500자로 입력해 주세요'; end if;
  if not exists (select 1 from posts where id = p_post_id) then raise exception '글을 찾을 수 없습니다'; end if;

  if v_uid is not null then
    select nick, fav_team, is_admin into v_nick, v_fav, v_admin from profiles where id = v_uid;
  end if;

  if not coalesce(v_admin, false) then
    if v_uid is not null then
      if p_nick is distinct from v_nick then raise exception '닉네임은 프로필 닉네임만 쓸 수 있습니다'; end if;
    else
      if p_nick ~* '(운영자|관리자|어드민|admin|nexus|넥서스)' then raise exception '쓸 수 없는 닉네임입니다'; end if;
      if p_pw is null or char_length(p_pw) < 4 then
        raise exception '비회원 댓글은 4자 이상의 비밀번호가 필요합니다 (삭제할 때 씁니다)';
      end if;
    end if;
  end if;

  insert into comments (post_id, nick, body, author_team, author_id)
  values (p_post_id, p_nick, p_body, case when v_uid is null then null else v_fav end, v_uid)
  returning id into v_id;

  if p_pw is not null and char_length(p_pw) >= 4 then
    insert into comment_secrets (comment_id, pw_hash) values (v_id, crypt(p_pw, gen_salt('bf')));
  end if;
  return v_id;
end $$;

create or replace function delete_comment(p_id bigint, p_pw text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := auth.uid(); v_author uuid; v_hash text; v_ok boolean := false;
begin
  select author_id into v_author from comments where id = p_id;
  if not found then raise exception '댓글을 찾을 수 없습니다'; end if;
  if coalesce((select is_admin from profiles where id = v_uid), false) then v_ok := true;
  elsif v_uid is not null and v_author = v_uid then v_ok := true;
  else
    select pw_hash into v_hash from comment_secrets where comment_id = p_id;
    v_ok := v_hash is not null and p_pw is not null and v_hash = crypt(p_pw, v_hash);
  end if;
  if not v_ok then raise exception '비밀번호가 맞지 않습니다'; end if;
  delete from comments where id = p_id;
end $$;

grant execute on function create_post(text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function update_post(text, text, text, text) to anon, authenticated;
grant execute on function delete_post(text, text) to anon, authenticated;
grant execute on function can_edit_post(text, text) to anon, authenticated;
grant execute on function create_comment(text, text, text, text) to anon, authenticated;
grant execute on function delete_comment(bigint, text) to anon, authenticated;

-- ── 6) 글·댓글 작성은 위 함수로만 (비밀번호 규칙을 우회하지 못하게) ──
drop policy if exists "insert_posts" on posts;
drop policy if exists "insert_comments" on comments;

-- ── 7) 조회수·추천수 저장 (지금은 UPDATE 정책이 없어 서버에 반영되지 않음) ──
-- 컬럼 권한으로 views·up 두 칸만 고칠 수 있게 제한한다.
drop policy if exists "bump_post_counters" on posts;
create policy "bump_post_counters" on posts for update using (true) with check (true);
revoke update on posts from anon, authenticated;
grant update (views, up) on posts to anon, authenticated;

-- 확인용
-- select routine_name from information_schema.routines
--  where routine_schema='public' and routine_name in
--    ('create_post','update_post','delete_post','create_comment','delete_comment','can_edit_post');
