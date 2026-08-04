-- ═══════════════════════════════════════════════════════
-- 회원의 "글에 투표 첨부" 기능 복구 (2026-08-04)
--
-- schema9에서 polls의 member_insert_polls 정책을 지웠더니,
-- 회원이 글을 쓸 때 붙이는 투표까지 막혔습니다(원래 있던 기능).
-- 아무 투표나 만들 수 있던 문제는 그대로 막으면서 기능만 되살립니다.
--
--   허용: 로그인 회원이 · 자기 글에 딸린(post_id 있는) · 일반 투표
--   금지: 글과 무관한 투표, 경기 공식 투표 흉내(phase 지정), 이상한 id
-- 여러 번 실행해도 안전합니다.
-- ═══════════════════════════════════════════════════════

drop policy if exists "member_insert_polls" on polls;
create policy "member_insert_polls" on polls for insert to authenticated with check (
  post_id is not null
  and phase is null                       -- 'pre' / 'post_pom' 같은 공식 투표는 관리자만
  and id ~ '^[A-Za-z0-9_-]{1,80}$'
  and char_length(question) <= 200
  and jsonb_array_length(options) between 2 and 10   -- options는 jsonb 배열
);

-- 확인용
-- select policyname, cmd, with_check from pg_policies
--  where schemaname = 'public' and tablename = 'polls' order by policyname;
