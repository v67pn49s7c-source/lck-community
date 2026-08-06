-- ============================================================
-- schema16: 팬 평점 마감 — 경기 시작 후 48시간까지만 받는다
-- ============================================================
-- 왜 필요한가:
--   평점에 마감이 없으면, 결과 카드(SNS 발행물)를 만든 뒤에도 표가
--   계속 들어와 카드 숫자와 사이트 숫자가 갈린다. "우리는 정직한
--   집계"라는 브랜드가 첫 지적에 무너진다.
--   화면(store.js ratingOpen)과 서버가 같은 규칙을 강제해야
--   "누를 수 있는데 저장은 안 되는" 일이 없다.
--
-- 실행: Supabase SQL Editor 에 전체 붙여넣기 → Run
-- 되돌리기: 이 파일 맨 아래 주석의 rollback 블록 실행
-- ============================================================

create or replace function public.rate_player(
  p_match_id text, p_player_id text, p_voter text, p_score int, p_set_index int
) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v text := public.resolve_voter(p_voter); m_at timestamptz;
begin
  if v is null then raise exception '평점 자격을 확인할 수 없습니다'; end if;
  if p_score is null or p_score < 1 or p_score > 10 then raise exception '평점은 1~10점입니다'; end if;

  select at into m_at from public.matches where id = p_match_id;
  if not found then raise exception '경기를 찾을 수 없습니다'; end if;

  -- ★ 마감: 경기 시작 후 48시간까지 (시작 시각이 없는 경기는 마감 없음)
  if m_at is not null and now() > m_at + interval '48 hours' then
    raise exception '평점이 마감된 경기입니다 (경기 후 48시간)';
  end if;

  if not exists (select 1 from public.players where id = p_player_id) then raise exception '선수를 찾을 수 없습니다'; end if;
  if p_set_index is null or p_set_index < 0 then raise exception '세트를 골라 주세요'; end if;

  -- 그 세트에 실제로 나온 선수만 평가할 수 있다 (schema15 규칙 유지)
  if not exists (
    select 1 from public.match_details d,
         lateral jsonb_array_elements(coalesce(d.players, '[]'::jsonb)) e
    where d.match_id = p_match_id and d.set_index = p_set_index
      and e->>'pid' = p_player_id
      and coalesce(btrim(e->>'champ'), '') <> ''
  ) then
    raise exception '이 세트에 출전하지 않은 선수입니다';
  end if;

  insert into public.ratings (match_id, set_index, player_id, voter, score)
  values (p_match_id, p_set_index, p_player_id, v, p_score)
  on conflict (match_id, set_index, player_id, voter) do update set score = excluded.score;
  return v;
end $$;

revoke all on function public.rate_player(text, text, text, int, int) from public, anon, authenticated;
grant execute on function public.rate_player(text, text, text, int, int) to anon, authenticated;

-- ── 확인 ─────────────────────────────────────────────────────
-- 함수 본문에 마감 검사가 들어갔는지 본다
select case
  when prosrc like '%48 hours%' then '마감 규칙 OK'
  else '⚠ 마감 규칙이 안 들어감'
end as "결과"
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'rate_player';

-- ── 되돌리기 (필요할 때만 주석 풀어 실행) ────────────────────
-- schema15_set_ratings.sql 의 rate_player 블록(3장)을 다시 실행하면
-- 마감 없는 이전 판으로 돌아간다. 데이터는 건드리지 않는다.
