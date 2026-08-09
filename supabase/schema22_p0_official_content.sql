-- ═══════════════════════════════════════════════════════════════════
-- schema22: 공식 경기 콘텐츠 보호 (P0-1)
--
-- 문제 — 일반 사용자가 공식 경기 화면을 오염시킬 수 있었다:
--   ① polls.member_insert_polls 정책이 match_id 를 검사하지 않아,
--      로그인 회원이 공식 경기(match_id)에 걸리는 투표를 만들 수 있었다.
--      경기 화면(live.html)은 match_id 로 투표를 모으므로 그 투표가
--      공식 팬심지수 사이에 그대로 끼어 보였다.
--   ② 같은 정책이 post_id 의 실존·소유를 검사하지 않아,
--      남의 글이나 없는 글에도 투표를 붙일 수 있었다.
--   ③ create_post 가 비회원·일반 회원의 p_match_id 를 그대로 저장했고,
--      경기 토론방은 "match_id + 제목이 [경기 토론]으로 시작"으로 찾으므로
--      아무나 최신 글로 공식 토론방을 가로챌 수 있었다.
--
-- 고침:
--   · 회원 투표는 직접 INSERT 대신 SECURITY DEFINER RPC 로만 생성
--     (match_id 강제 NULL · phase 강제 NULL · 자기 글에만)
--   · create_post: 비관리자의 match_id 는 무조건 NULL
--   · posts.is_official 칸 신설 — 공식 경기 토론방 표시는 관리자만
--
-- 이 파일은 **여러 번 실행해도 안전**합니다.
-- ⚠ 공식 토론방 백필과 경기당 1개 유니크 인덱스는 schema23 에 있습니다.
--   반드시 audit_p0 SQL 로 중복·오염을 확인한 뒤 실행하세요.
-- ═══════════════════════════════════════════════════════════════════

-- ── ① 공식 토론방 표시 칸 ──────────────────────────────────────────
alter table posts add column if not exists is_official boolean not null default false;

-- ── ② 회원 투표: 정책 강화 + RPC ─────────────────────────────────
-- 정책을 **지우지 않고 강화**한다. 지우면, 아직 옛 코드가 도는 과도기에
-- 회원 투표(직접 INSERT)가 통째로 막힌다. 강화하면 배포 순서와 무관하게
-- 옛 코드의 정상 투표(match_id 없음)는 통과하고, 흉내(match_id 있음)만 막힌다.
-- RPC(아래)는 그 위에 얹는 이중 방어이자 새 코드의 주 경로다.
drop policy if exists "member_insert_polls" on polls;
create policy "member_insert_polls" on polls for insert to authenticated with check (
  post_id is not null
  and phase is null
  and match_id is null                    -- ★ 공식 경기(match_id)에 못 건다
  and id ~ '^[A-Za-z0-9_-]{1,80}$'
  and char_length(question) <= 200
  and jsonb_array_length(options) between 2 and 10
  and exists (select 1 from posts where posts.id = polls.post_id
                and posts.author_id = auth.uid())   -- ★ 자기 글에만
);

create or replace function create_member_poll(
  p_id text, p_post_id text, p_question text, p_options jsonb,
  p_multi boolean, p_closes_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception '로그인이 필요합니다'; end if;
  if p_id !~ '^[A-Za-z0-9_-]{1,80}$' then raise exception '투표 번호 형식이 잘못되었습니다'; end if;
  if not (coalesce(char_length(p_question), 0) between 1 and 200) then
    raise exception '질문은 1~200자로 입력해 주세요';
  end if;
  if jsonb_typeof(p_options) is distinct from 'array'
     or jsonb_array_length(p_options) not between 2 and 10 then
    raise exception '보기는 2~10개여야 합니다';
  end if;
  -- 자기 글에만 붙일 수 있다 (글 실존 + 소유 동시 검사)
  if not exists (select 1 from posts where id = p_post_id and author_id = v_uid) then
    raise exception '자기가 쓴 글에만 투표를 붙일 수 있습니다';
  end if;

  -- 공식 경기 속성은 여기서 절대 만들 수 없다
  insert into polls (id, match_id, phase, post_id, question, options, multi, closes_at)
  values (p_id, null, null, p_post_id, p_question, p_options, coalesce(p_multi, false), p_closes_at);
  return jsonb_build_object('id', p_id);
end $$;

grant execute on function create_member_poll(text, text, text, jsonb, boolean, timestamptz) to authenticated;

-- ── ③ create_post: 비관리자 match_id 차단 + 관리자만 공식 표시 ────
-- ⚠ 서명을 바꾸지 않는다 — 이름 인자가 어긋나면 배포 순서에 따라 글쓰기가 통째로
--    죽는다(RPC 는 인자 목록으로 함수를 찾는다). 공식 표시는 서버가 스스로 판정한다.
create or replace function create_post(
  p_id text, p_team text, p_cat text, p_title text, p_body text,
  p_nick text, p_match_id text, p_pw text
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_nick text; v_fav text; v_admin boolean := false;
  v_team text := nullif(p_team, '');
  v_author_team text := null;
  v_nick_out text;
  v_match_id text := nullif(p_match_id, '');
begin
  if p_id !~ '^[A-Za-z0-9_-]{1,64}$' then raise exception '글 번호 형식이 잘못되었습니다'; end if;
  if not (coalesce(char_length(p_title), 0) between 1 and 100) then raise exception '제목은 1~100자로 입력해 주세요'; end if;
  if not (coalesce(char_length(p_body), 0) between 1 and 5000) then raise exception '내용은 1~5000자로 입력해 주세요'; end if;

  if v_uid is not null then
    select nick, fav_team, is_admin into v_nick, v_fav, v_admin from profiles where id = v_uid;
  end if;

  if coalesce(v_admin, false) then
    v_author_team := v_fav;
    v_nick_out := coalesce(nullif(p_nick, ''), v_nick, '운영자');
  elsif v_uid is not null then
    if p_cat = '공지' then raise exception '공지는 관리자만 쓸 수 있습니다'; end if;
    if v_team is not null and v_team is distinct from v_fav then
      raise exception '응원팀 게시판에만 글을 쓸 수 있습니다';
    end if;
    if v_nick is null then raise exception '프로필(닉네임)을 먼저 설정해 주세요'; end if;
    v_author_team := v_fav;
    v_nick_out := v_nick;
  else
    if p_cat = '공지' then raise exception '공지는 관리자만 쓸 수 있습니다'; end if;
    if v_team is not null then raise exception '팀 게시판은 회원만 쓸 수 있습니다 (비회원은 전체 게시판)'; end if;
    if p_pw is null or char_length(p_pw) < 4 then
      raise exception '비회원 글은 4자 이상의 비밀번호가 필요합니다 (수정·삭제할 때 씁니다)';
    end if;
    v_nick_out := anon_nick();
  end if;

  -- ★ 공식 경기 연결(match_id)과 공식 표시(is_official)는 관리자 전용.
  --   비관리자는 값을 보내도 조용히 버린다 — 에러로 막으면 정상 글쓰기 화면이
  --   URL 에 ?match= 를 들고 온 경우까지 깨진다. 연결만 제거하고 글은 받는다.
  if not coalesce(v_admin, false) then
    v_match_id := null;
  end if;

  -- 공식 토론방 판정: 관리자 + 경기 연결 + 관례 제목. 비관리자는 위에서 match_id 가
  -- 이미 NULL 이므로 절대 참이 될 수 없다.
  insert into posts (id, team, cat, title, body, nick, author_team, match_id, author_id, is_official)
  values (p_id, v_team, p_cat, p_title, p_body, v_nick_out, v_author_team, v_match_id, v_uid,
          coalesce(v_admin, false) and v_match_id is not null and p_title like '[경기 토론]%');

  if p_pw is not null and char_length(p_pw) >= 4 then
    insert into post_secrets (post_id, pw_hash) values (p_id, crypt(p_pw, gen_salt('bf')))
    on conflict (post_id) do nothing;
  end if;
  return jsonb_build_object('id', p_id, 'nick', v_nick_out);
end $$;

grant execute on function create_post(text, text, text, text, text, text, text, text) to anon, authenticated;

-- ── ④ update_post 로 공식 표시를 바꿀 수 없는지 확인 ──────────────
--     (schema11 의 update_post 는 title·body·cat 만 갱신하므로 안전 —
--      아래 확인 쿼리로 운영에서도 같은지 검사하세요. 정책 드리프트 가능성 있음)

-- ═══ 확인 ═══
select case
  when exists (select 1 from information_schema.columns
                where table_name = 'posts' and column_name = 'is_official')
   and exists (select 1 from pg_proc where proname = 'create_member_poll')
   and exists (select 1 from pg_policies where tablename = 'polls'
                and policyname = 'member_insert_polls' and with_check like '%match_id is null%')
  then 'schema22 OK — 회원투표 정책강화+RPC · 비관리자 match_id 차단 · is_official 신설'
  else '실패 — 위 문장들이 전부 돌았는지 확인해 주세요'
end as "결과";
