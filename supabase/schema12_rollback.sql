-- ═══════════════════════════════════════════════════════
-- schema12 되돌리기 (비상용)
--
-- schema12_vote_privacy.sql 을 실행한 뒤 사이트에 문제가 생겼을 때,
-- 이 파일을 Supabase SQL 편집기에 붙여넣고 실행하면 **예전 상태로 돌아갑니다**.
-- (투표·평점 데이터는 하나도 지워지지 않습니다. 권한만 되돌립니다)
--
-- 되돌린 뒤에는 다시 원본이 공개 조회되므로, 원인을 고친 다음
-- schema12 를 다시 실행해 주세요.
-- ═══════════════════════════════════════════════════════

begin;

-- 권한 복구
grant select, insert, update on public.predictions to anon, authenticated;
grant select, insert, update on public.ratings     to anon, authenticated;
grant select, insert, update on public.poll_votes  to anon, authenticated;
grant select, insert, delete on public.reactions   to anon, authenticated;
grant select, insert         on public.comment_likes to anon, authenticated;

-- RLS 정책 복구 (schema.sql + schema7 + schema9 의 최종 상태와 같게)
create policy read_all_predictions   on public.predictions for select using (true);
create policy upsert_predictions_ins on public.predictions for insert with check (true);
create policy upsert_predictions_upd on public.predictions for update
  using  (voter !~ '^[0-9a-fA-F-]{36}$' or voter = auth.uid()::text)
  with check (voter !~ '^[0-9a-fA-F-]{36}$' or voter = auth.uid()::text);

create policy read_all_ratings   on public.ratings for select using (true);
create policy upsert_ratings_ins on public.ratings for insert with check (true);
create policy upsert_ratings_upd on public.ratings for update
  using  (voter !~ '^[0-9a-fA-F-]{36}$' or voter = auth.uid()::text)
  with check (voter !~ '^[0-9a-fA-F-]{36}$' or voter = auth.uid()::text);

create policy read_poll_votes   on public.poll_votes for select using (true);
create policy insert_poll_votes on public.poll_votes for insert with check (true);
create policy update_poll_votes on public.poll_votes for update
  using  (voter !~ '^[0-9a-fA-F-]{36}$' or voter = auth.uid()::text)
  with check (voter !~ '^[0-9a-fA-F-]{36}$' or voter = auth.uid()::text);

create policy read_reactions   on public.reactions for select using (true);
create policy insert_reactions on public.reactions for insert with check (true);
create policy delete_reactions on public.reactions for delete
  using (voter !~ '^[0-9a-fA-F-]{36}$' or voter = auth.uid()::text);

create policy read_comment_likes   on public.comment_likes for select using (true);
create policy insert_comment_likes on public.comment_likes for insert with check (true);

-- 집계 함수를 없애면 브라우저 코드가 자동으로 예전 방식으로 돌아간다
-- (assets/store.js 의 legacyFanStats — 함수가 없으면 원본을 직접 읽는다)
drop function if exists public.get_fan_stats(text);

commit;

notify pgrst, 'reload schema';

select '되돌리기 완료 — 예전 방식으로 동작합니다' as "결과";
