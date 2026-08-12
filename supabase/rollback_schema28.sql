-- ════════════════════════════════════════════════════════════════════
-- rollback_schema28 — 글의 '모의밴픽' 첨부를 되돌린다
-- ════════════════════════════════════════════════════════════════════
-- 기능만 끄고 자료는 남긴다. 칸을 지우면 그동안 짜 둔 밴픽이 영영 사라진다.
begin;
drop function if exists public.set_post_draft(text, jsonb);
revoke select (draft) on public.posts from anon, authenticated;
commit;
notify pgrst, 'reload schema';
-- 칸까지 완전히 없애려면 (되돌릴 수 없다):
-- alter table public.posts drop column if exists draft;
