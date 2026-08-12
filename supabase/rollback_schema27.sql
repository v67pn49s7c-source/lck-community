-- ════════════════════════════════════════════════════════════════════
-- rollback_schema27 — 글의 '참조 경기' 첨부를 되돌린다
-- ════════════════════════════════════════════════════════════════════
--
-- 되돌리면 글에 붙은 경기 카드가 사라진다. 글·댓글 등 다른 것은 그대로다.
-- ⚠ 칸(ref_match_id)은 **지우지 않는다** — 지우면 그동안 붙여 둔 첨부가 영영 사라진다.
--   기능만 끄고 싶은 것이므로 함수만 없애고 칸은 남긴다.
--   칸까지 정말 지우려면 맨 아래 줄의 주석을 직접 풀어라.
-- ════════════════════════════════════════════════════════════════════

begin;

drop function if exists public.set_post_ref_match(text, text);

-- 읽기 권한만 거두면 화면에서 카드가 사라진다 (자료는 남는다)
revoke select (ref_match_id) on public.posts from anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- 칸까지 완전히 없애려면 (되돌릴 수 없다):
-- alter table public.posts drop column if exists ref_match_id;
