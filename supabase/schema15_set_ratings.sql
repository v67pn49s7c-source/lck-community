-- ═══════════════════════════════════════════════════════
-- 팬 평점을 **세트별**로 (2026-08-05)
--
-- 지금 문제: 평점이 경기 단위라, 3세트짜리 경기에서 1세트만 뛴 교체 선수도
-- 경기 전체 평점을 받는다. 반대로 그 세트에 나오지도 않은 선수를 평가할 수도 있다.
-- → 1세트·2세트·3세트 각각 평가하고, 그 세트에 실제로 나온 선수만 대상으로 한다.
--
-- 이미 매겨진 평점은 어느 세트인지 알 수 없으므로 **set_index = -1(경기 전체)** 로 남긴다.
-- 화면의 경기 평균에는 그대로 반영되고, 세트별 화면에는 나오지 않는다.
--
-- 여러 번 실행해도 안전합니다.
-- ═══════════════════════════════════════════════════════

begin;

-- ── 1) 세트 번호 칸 ───────────────────────────────────────
alter table ratings add column if not exists set_index int not null default -1;

-- 기본키를 (경기, 세트, 선수, 사람) 으로 바꾼다.
-- 같은 사람이 같은 선수를 세트마다 다르게 평가할 수 있어야 한다.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.ratings'::regclass and contype = 'p'
      and pg_get_constraintdef(oid) = 'PRIMARY KEY (match_id, player_id, voter)'
  ) then
    alter table ratings drop constraint ratings_pkey;
    alter table ratings add primary key (match_id, set_index, player_id, voter);
  end if;
end $$;

-- ── 2) 집계 뷰에 세트 번호 추가 ───────────────────────────
-- 경기 전체 평균은 브라우저가 세트들을 합쳐서 낸다 (뷰를 둘로 나누지 않는다).
drop view if exists public.v_rating_stats;
create view public.v_rating_stats as
with base as (
  select r.match_id, r.set_index, r.player_id, r.score,
    case
      when pr.fav_team is null then 'neu'
      when pr.fav_team = pl.team then 'own'
      when pr.fav_team = case when pl.team = m.a then m.b
                              when pl.team = m.b then m.a
                              else null end then 'opp'
      else 'neu'
    end as bucket
  from public.ratings r
  join public.players pl on pl.id = r.player_id
  join public.matches m  on m.id  = r.match_id
  left join public.profiles pr on pr.id::text = r.voter
)
select match_id, set_index, player_id, bucket, count(*)::int as n, sum(score)::int as total
from base group by 1, 2, 3, 4
union all
select match_id, set_index, player_id, 'all', count(*)::int, sum(score)::int
from base group by 1, 2, 3;

alter view public.v_rating_stats set (security_invoker = off);
revoke all on public.v_rating_stats from public, anon, authenticated;
grant select on public.v_rating_stats to anon, authenticated;

-- ── 3) 평점 저장 (세트 번호를 함께 받는다) ────────────────
-- 예전 함수는 지운다 — 남겨 두면 세트 없이 저장하는 길이 열려 있게 된다.
drop function if exists public.rate_player(text, text, text, int);

create or replace function public.rate_player(
  p_match_id text, p_player_id text, p_voter text, p_score int, p_set_index int
) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v text := public.resolve_voter(p_voter); n_sets int;
begin
  if v is null then raise exception '평점 자격을 확인할 수 없습니다'; end if;
  if p_score is null or p_score < 1 or p_score > 10 then raise exception '평점은 1~10점입니다'; end if;
  if not exists (select 1 from public.matches where id = p_match_id) then raise exception '경기를 찾을 수 없습니다'; end if;
  if not exists (select 1 from public.players where id = p_player_id) then raise exception '선수를 찾을 수 없습니다'; end if;
  if p_set_index is null or p_set_index < 0 then raise exception '세트를 골라 주세요'; end if;

  -- ★ 그 세트에 실제로 나온 선수만 평가할 수 있다.
  --   경기 상세에 챔피언이 기록된 선수를 '출전'으로 본다.
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

-- ── 4) 내 평점에도 세트 번호를 실어 준다 ──────────────────
create or replace function public.get_fan_stats(p_voter text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v text := public.resolve_voter(p_voter);
begin
  return jsonb_build_object(
    'voter', v,
    'pred',         (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.v_prediction_stats x),
    'rating',       (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.v_rating_stats x),
    'ratingVoters', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.v_match_rating_voters x),
    'pollChoice',   (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.v_poll_stats x),
    'pollVoters',   (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.v_poll_voters x),
    'reaction',     (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.v_reaction_stats x),
    'commentLike',  (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.v_comment_like_stats x),
    'fandom',       (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.v_fandom_accuracy x),
    'ranking',      (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.v_predict_ranking x),
    'mine', case when v is null then jsonb_build_object() else jsonb_build_object(
      'predictions',  (select coalesce(jsonb_agg(jsonb_build_object('match_id', match_id, 'side', side)), '[]'::jsonb)
                         from public.predictions where voter = v),
      'ratings',      (select coalesce(jsonb_agg(jsonb_build_object(
                           'match_id', match_id, 'set_index', set_index, 'player_id', player_id, 'score', score)), '[]'::jsonb)
                         from public.ratings where voter = v),
      'pollVotes',    (select coalesce(jsonb_agg(jsonb_build_object('poll_id', poll_id, 'choices', choices)), '[]'::jsonb)
                         from public.poll_votes where voter = v),
      'reactions',    (select coalesce(jsonb_agg(jsonb_build_object('post_id', post_id, 'kind', kind)), '[]'::jsonb)
                         from public.reactions where voter = v),
      'commentLikes', (select coalesce(jsonb_agg(jsonb_build_object('comment_id', comment_id)), '[]'::jsonb)
                         from public.comment_likes where voter = v),
      'postUpvotes',  (select coalesce(jsonb_agg(jsonb_build_object('post_id', post_id)), '[]'::jsonb)
                         from public.post_upvotes where voter = v)
    ) end
  );
end $$;
revoke all on function public.get_fan_stats(text) from public, anon, authenticated;
grant execute on function public.get_fan_stats(text) to anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- ── 확인 ──────────────────────────────────────────────────
-- '세트칸 OK · 기본키 OK · 옛 평점 N건(경기 전체)' 이 나오면 정상입니다.
select
  case when exists (select 1 from information_schema.columns
                    where table_name = 'ratings' and column_name = 'set_index')
       then '세트칸 OK' else '세트칸 ⚠' end
  || ' · ' ||
  case when exists (select 1 from pg_constraint
                    where conrelid = 'public.ratings'::regclass and contype = 'p'
                      and pg_get_constraintdef(oid) like '%set_index%')
       then '기본키 OK' else '기본키 ⚠' end
  || ' · 옛 평점 ' || (select count(*) from ratings where set_index = -1) || '건(경기 전체)'
  || ' · 세트별 평점 ' || (select count(*) from ratings where set_index >= 0) || '건'
  as "설치 결과";
