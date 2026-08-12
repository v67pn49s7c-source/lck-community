-- ════════════════════════════════════════════════════════════════════
-- rollback_schema26 — 팀 게시판 잠금을 schema26 이전 상태로 되돌린다
-- ════════════════════════════════════════════════════════════════════
--
-- 언제 쓰나
--   schema26 을 적용했는데 글 목록이 비거나 본문이 안 뜨는 등 사이트가 망가졌을 때.
--   되돌리면 **팀 게시판 본문이 다시 누구에게나 열린다**(잠금 이전 상태).
--   화면 차단은 브라우저 코드에 그대로 남아 있으므로 일반 사용자에게는 여전히 막혀 보인다.
--
-- 데이터는 건드리지 않는다 — 권한과 정책만 되돌린다.
-- ════════════════════════════════════════════════════════════════════

begin;

-- ① 테이블 전체 읽기 권한 복구 (schema26 이전 = select *)
grant select on public.posts to anon, authenticated;

-- ② 댓글·투표 정책을 "누구나 읽기"로 복구
drop policy if exists "read_visible_comments" on public.comments;
drop policy if exists "read_all_comments" on public.comments;
create policy "read_all_comments" on public.comments for select using (true);

drop policy if exists "read_polls" on public.polls;
create policy "read_polls" on public.polls for select using (true);

-- ③ 창구 함수 제거
--    ⚠ 브라우저 코드(schema26 이후 버전)는 get_post_body 로 본문을 받는다.
--    함수를 지우면 그 코드에서 본문이 빈칸이 되므로, 코드도 함께 되돌려야 한다.
--    코드를 되돌리지 않을 거라면 아래 두 줄은 건너뛰어라 — 함수가 남아 있어도
--    권한이 복구된 상태에서는 아무 해가 없다.
-- drop function if exists public.get_post_body(text);
-- drop function if exists public.can_read_post(text);

commit;

notify pgrst, 'reload schema';

-- 확인 — anon 이 body 를 다시 읽을 수 있어야 한다
-- select has_column_privilege('anon', 'public.posts', 'body', 'select');
