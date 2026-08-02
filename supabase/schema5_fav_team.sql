-- ═══════════════════════════════════════════════════════
-- 응원팀 설정 + 팀 게시판 글쓰기 제한 (여러 번 실행해도 안전)
-- ═══════════════════════════════════════════════════════

-- 회원 프로필에 응원팀 추가
alter table profiles add column if not exists fav_team text;

-- 글쓰기 규칙 교체:
--  · 전체 게시판(team 없음): 누구나 작성 가능
--  · 팀 게시판: 응원팀이 그 팀인 회원(또는 관리자)만 작성 가능
drop policy if exists "insert_posts" on posts;
create policy "insert_posts" on posts for insert with check (
  char_length(title) <= 100 and char_length(body) <= 5000
  and (
    team is null
    or is_admin()
    or (auth.uid() is not null and team = (select fav_team from profiles where id = auth.uid()))
  )
);
