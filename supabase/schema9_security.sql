-- ═══════════════════════════════════════════════════════
-- 보안 보강 (2026-08-04) — 점검 보고서 P0 대응
--   ① 비회원의 "공지"·운영자 사칭 글 차단
--   ② 글·투표 id 형식 제한 (저장형 XSS 입력면 차단)
--   ③ 회원의 예측·평점·투표를 남이 덮어쓰지 못하게
--   ④ 투표(polls) 생성은 관리자만
-- 여러 번 실행해도 안전합니다.
-- ═══════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────
-- 0단계. 먼저 "지금 상태"를 확인하세요 (읽기 전용)
--   이 두 쿼리 결과를 먼저 보고, 아래 본문을 실행하세요.
-- ───────────────────────────────────────────────────────
-- select schemaname, tablename, policyname, roles, cmd, qual, with_check
--   from pg_policies where schemaname = 'public' order by tablename, policyname;
--
-- -- id 형식 제한을 걸기 전에, 규칙에서 벗어난 기존 행이 있는지 확인
-- select 'posts' as t, id from posts where id !~ '^[A-Za-z0-9_-]{1,64}$'
-- union all
-- select 'polls', id from polls where id !~ '^[A-Za-z0-9_-]{1,64}$';
-- -- ↑ 결과가 0행이어야 아래 제약이 깔끔하게 걸립니다 (행이 나오면 저에게 알려주세요)

-- ───────────────────────────────────────────────────────
-- 준비. is_admin() 함수 (schema_remaining.sql을 아직 실행하지 않았어도 동작하게)
-- ───────────────────────────────────────────────────────
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select is_admin from profiles where id = auth.uid()), false) $$;

-- ───────────────────────────────────────────────────────
-- ① 글쓰기: 사칭·가짜 공지 차단
-- ───────────────────────────────────────────────────────
-- 규칙
--   · 관리자: 제한 없음 (공지 작성 가능)
--   · 회원  : 닉네임·응원팀은 본인 프로필 값과 일치해야 함. 팀 게시판은 본인 응원팀만
--   · 비회원: 전체 게시판만, 응원팀 배지 없음, 공지 불가, 운영자류 닉네임 금지
drop policy if exists "insert_posts" on posts;
create policy "insert_posts" on posts for insert with check (
  char_length(title) <= 100
  and char_length(body) <= 5000
  and id ~ '^[A-Za-z0-9_-]{1,64}$'
  and (
    is_admin()
    or (
      coalesce(cat, '') <> '공지'
      and (
        (
          auth.uid() is not null
          and nick = (select p.nick from profiles p where p.id = auth.uid())
          and author_team is not distinct from (select p.fav_team from profiles p where p.id = auth.uid())
          and (team is null or team = (select p.fav_team from profiles p where p.id = auth.uid()))
        )
        or (
          auth.uid() is null
          and team is null
          and author_team is null
          and nick !~* '(운영자|관리자|어드민|admin|nexus|넥서스)'
        )
      )
    )
  )
);

-- 댓글도 같은 사칭 방지
drop policy if exists "insert_comments" on comments;
create policy "insert_comments" on comments for insert with check (
  char_length(body) <= 500
  and (
    is_admin()
    or (
      auth.uid() is not null
      and nick = (select p.nick from profiles p where p.id = auth.uid())
      and author_team is not distinct from (select p.fav_team from profiles p where p.id = auth.uid())
    )
    or (
      auth.uid() is null
      and author_team is null
      and nick !~* '(운영자|관리자|어드민|admin|nexus|넥서스)'
    )
  )
);

-- 채팅도 동일
drop policy if exists "insert_chat" on chat_messages;
create policy "insert_chat" on chat_messages for insert with check (
  char_length(body) <= 300
  and (
    is_admin()
    or (auth.uid() is not null and nick = (select p.nick from profiles p where p.id = auth.uid()))
    or (auth.uid() is null and nick !~* '(운영자|관리자|어드민|admin|nexus|넥서스)')
  )
);

-- ───────────────────────────────────────────────────────
-- ② id 형식 제한 — 화면 HTML을 탈출하는 값이 저장되지 못하게
--    (화면 쪽도 이미 escape 처리했지만, 두 겹으로 막습니다)
-- ───────────────────────────────────────────────────────
alter table posts drop constraint if exists posts_id_format;
alter table posts add constraint posts_id_format check (id ~ '^[A-Za-z0-9_-]{1,64}$') not valid;

alter table polls drop constraint if exists polls_id_format;
alter table polls add constraint polls_id_format check (id ~ '^[A-Za-z0-9_-]{1,64}$') not valid;

-- not valid = 기존 행은 건드리지 않고 "앞으로 들어오는 행"부터 적용.
-- 0단계 확인 쿼리가 0행이었다면 아래 두 줄로 기존 행까지 확정할 수 있습니다.
-- alter table posts validate constraint posts_id_format;
-- alter table polls validate constraint polls_id_format;

-- ───────────────────────────────────────────────────────
-- ③ 남의 표 덮어쓰기 차단
--    로그인 회원의 참여(voter = 계정 UUID)는 본인만 수정할 수 있게 합니다.
--    ⚠ 비회원 참여는 브라우저가 만든 임의 문자열이라 소유권을 서버가 증명할 수 없습니다.
--       (비회원 참여를 계속 허용하기로 한 결정에 따라 이번 단계에서는 회원 행만 보호합니다.
--        비회원 구간까지 막으려면 voter 값을 공개 조회에서 감추고 RPC로 바꾸는 다음 단계가 필요합니다.)
-- ───────────────────────────────────────────────────────
drop policy if exists "upsert_predictions_upd" on predictions;
create policy "upsert_predictions_upd" on predictions for update
  using (voter !~ '^[0-9a-fA-F-]{36}$' or voter = auth.uid()::text)
  with check (voter !~ '^[0-9a-fA-F-]{36}$' or voter = auth.uid()::text);

drop policy if exists "upsert_ratings_upd" on ratings;
create policy "upsert_ratings_upd" on ratings for update
  using (voter !~ '^[0-9a-fA-F-]{36}$' or voter = auth.uid()::text)
  with check (voter !~ '^[0-9a-fA-F-]{36}$' or voter = auth.uid()::text);

drop policy if exists "upsert_poll_votes_upd" on poll_votes;
drop policy if exists "update_poll_votes" on poll_votes;
create policy "update_poll_votes" on poll_votes for update
  using (voter !~ '^[0-9a-fA-F-]{36}$' or voter = auth.uid()::text)
  with check (voter !~ '^[0-9a-fA-F-]{36}$' or voter = auth.uid()::text);

-- 반응(👍 등) 삭제도 본인 것만
drop policy if exists "delete_reactions" on reactions;
create policy "delete_reactions" on reactions for delete
  using (voter !~ '^[0-9a-fA-F-]{36}$' or voter = auth.uid()::text);

-- ───────────────────────────────────────────────────────
-- ④ 투표 생성은 관리자만 (지금은 로그인만 하면 누구나 만들 수 있음)
-- ───────────────────────────────────────────────────────
drop policy if exists "member_insert_polls" on polls;

-- ───────────────────────────────────────────────────────
-- 실행 후 확인 (읽기 전용)
-- ───────────────────────────────────────────────────────
-- select tablename, policyname, cmd, qual, with_check
--   from pg_policies where schemaname = 'public'
--    and tablename in ('posts','comments','chat_messages','predictions','ratings','poll_votes','reactions','polls')
--  order by tablename, policyname;
