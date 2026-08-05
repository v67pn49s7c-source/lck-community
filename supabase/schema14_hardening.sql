-- ═══════════════════════════════════════════════════════
-- 남은 구멍 막기 (2026-08-05) — schema12 에 이어서
--
--   1. 관리자가 누구인지 아무나 알아낼 수 있던 문제
--   2. 글 추천·조회수를 아무나 원하는 값으로 바꿀 수 있던 문제
--   3. 가짜였던 '주간 예측 랭킹'을 진짜 기록으로
--   4. 순위 반영이 절반만 저장되거나 두 번 더해지던 문제
--   5. 경기 일정 자동 갱신을 위한 준비
--
-- 여러 번 실행해도 안전합니다.
-- ═══════════════════════════════════════════════════════

begin;

-- ── 1) 프로필: 관리자 여부를 감춘다 ────────────────────────
-- 지금까지 익명 키로 profiles?is_admin=eq.true 를 부르면 관리자 계정의 id 와
-- 닉네임이 그대로 나왔다. 공격 대상을 서버가 알려 주는 셈이라 컬럼 단위로 잠근다.
-- (코드는 이미 id·nick·fav_team 만 읽고 있어서 화면은 그대로 동작한다)
revoke select, update, insert, delete on public.profiles from anon, authenticated;
grant select (id, nick, fav_team) on public.profiles to anon, authenticated;

-- 내 프로필은 관리자 여부까지 필요하다 (관리자 화면 진입 판정)
create or replace function public.my_profile()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare u uuid := auth.uid(); r public.profiles%rowtype;
begin
  if u is null then return null; end if;
  select * into r from public.profiles where id = u;
  if not found then return null; end if;
  return jsonb_build_object('id', r.id, 'nick', r.nick, 'fav_team', r.fav_team, 'is_admin', r.is_admin);
end $$;

-- 응원팀 바꾸기 · 프로필 만들기도 함수로 (테이블 쓰기 권한을 회수했으므로)
create or replace function public.set_fav_team(p_team text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception '로그인이 필요합니다'; end if;
  -- 팀 목록은 화면 코드(assets/data.js)에 있어 DB가 다 알지 못한다. 형식만 확인한다.
  -- ('' = 중립을 명시적으로 고른 것이므로 허용)
  if coalesce(p_team, '') <> '' and p_team !~ '^[a-z0-9]{2,8}$' then
    raise exception '팀 값이 올바르지 않습니다';
  end if;
  update public.profiles set fav_team = nullif(p_team, '') where id = u;
end $$;

create or replace function public.create_profile(p_nick text, p_fav_team text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception '로그인이 필요합니다'; end if;
  if p_nick is null or char_length(p_nick) not between 2 and 12 then
    raise exception '닉네임은 2~12자로 입력해 주세요';
  end if;
  if exists (select 1 from public.profiles where nick = p_nick and id <> u) then
    raise exception '이미 사용 중인 닉네임입니다';
  end if;
  insert into public.profiles (id, nick, fav_team, is_admin)
  values (u, p_nick, nullif(p_fav_team, ''), false)
  on conflict (id) do nothing;               -- 이미 있으면 그대로 둔다(관리자 승격 방지)
  return public.my_profile();
end $$;

-- ── 2) 글 추천·조회수 ──────────────────────────────────────
-- 지금까지 posts 의 up·views 에 **직접 쓰기 권한**이 열려 있어서(schema11 199행),
-- 요청 한 번으로 추천수를 원하는 값으로 바꿀 수 있었다. 누가 눌렀는지도 남지 않았다.
create table if not exists post_upvotes (
  post_id text not null references posts(id) on delete cascade,
  voter text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, voter)
);
alter table post_upvotes enable row level security;   -- 정책 없음 = 함수로만 접근

-- 이미 쌓인 추천수를 살리기 위해, 기존 up 값은 그대로 두고 여기에 더한다.
-- (누가 눌렀는지 알 수 없는 과거분이므로 되돌리지 않는다)
alter table posts add column if not exists up_seed int not null default 0;
update posts set up_seed = up where up_seed = 0 and up > 0;

create or replace function public.upvote_post_v2(p_post_id text, p_voter text)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare v text := public.resolve_voter(p_voter); n int;
begin
  if v is null then raise exception '추천 자격을 확인할 수 없습니다'; end if;
  if not exists (select 1 from public.posts where id = p_post_id) then raise exception '글을 찾을 수 없습니다'; end if;
  insert into public.post_upvotes (post_id, voter) values (p_post_id, v) on conflict do nothing;
  select count(*) into n from public.post_upvotes where post_id = p_post_id;
  update public.posts set up = up_seed + n where id = p_post_id;
  return (select up from public.posts where id = p_post_id);
end $$;

-- 조회수도 서버가 올린다 (클라이언트가 절대값을 쓰지 못하게)
create or replace function public.bump_post_view(p_post_id text)
returns void language sql volatile security definer set search_path = '' as $$
  update public.posts set views = views + 1 where id = p_post_id;
$$;

-- 예전 함수는 검사 없이 up = up + 1 을 했다. 더 이상 쓰지 못하게 막는다.
revoke all on function public.upvote_post(text) from public, anon, authenticated;
revoke all on function public.inc_views(text)   from public, anon, authenticated;
-- ★ 직접 쓰기 권한 회수 (이게 핵심)
revoke update on public.posts from anon, authenticated;

-- ── 3) 진짜 예측 랭킹 ──────────────────────────────────────
-- 지금까지 홈·승부예측·랭킹에 보이던 5명은 assets/data.js 에 박아 둔 가짜였다.
-- 표본이 적으면 순위 자체가 그 사람의 예측을 드러내므로 5경기 이상만 올린다.
create or replace view public.v_predict_ranking as
select pr.nick,
       pr.fav_team,
       count(*) filter (where p.side = w.winner)::int as hits,
       count(*)::int as total
from public.predictions p
join public.profiles pr on pr.id::text = p.voter
join public.v_match_winner w on w.match_id = p.match_id
group by pr.nick, pr.fav_team
having count(*) >= 5;

alter view public.v_predict_ranking set (security_invoker = off);
revoke all on public.v_predict_ranking from public, anon, authenticated;
grant select on public.v_predict_ranking to anon, authenticated;

-- ── 4) 순위 반영을 안전하게 ────────────────────────────────
-- 지금까지 '전적 저장'과 '반영됨 표시'가 서로 기다리지 않고 따로 날아가서,
-- 앞이 실패하면 순위가 빠진 채 잠기고 뒤가 실패하면 다음에 또 눌러 두 번 더해졌다.
-- 이제 '먼저 자리를 잡고(claim) → 전적을 저장 → 실패하면 자리를 되돌린다' 순서로 한다.
create or replace function public.claim_match_for_records(p_match_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare m public.matches%rowtype; w text; n int;
begin
  if not coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false) then
    raise exception '관리자만 할 수 있습니다';
  end if;
  select * into m from public.matches where id = p_match_id;
  if not found then raise exception '경기를 찾을 수 없습니다'; end if;
  if m.status <> 'done' then raise exception '종료된 경기만 반영할 수 있습니다'; end if;
  if m.score_a is null or m.score_b is null then raise exception '스코어를 먼저 입력해 주세요'; end if;
  if m.score_a = m.score_b then raise exception '동점은 승패를 정할 수 없습니다 (스코어를 확인해 주세요)'; end if;

  -- 이미 반영된 경기면 여기서 0행 → 두 번 더해지지 않는다
  update public.matches set counted = true where id = p_match_id and counted is not true;
  get diagnostics n = row_count;
  if n = 0 then raise exception '이미 순위에 반영된 경기입니다'; end if;

  w := case when m.score_a > m.score_b then 'a' else 'b' end;
  return jsonb_build_object('winner', w, 'scoreA', m.score_a, 'scoreB', m.score_b,
                            'a', m.a, 'b', m.b, 'stage', m.stage);
end $$;

create or replace function public.release_match_records(p_match_id text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false) then
    raise exception '관리자만 할 수 있습니다';
  end if;
  update public.matches set counted = false where id = p_match_id;
end $$;

-- ── 5) 경기 일정 자동 갱신 준비 ────────────────────────────
-- Leaguepedia 의 경기 고유 번호를 기록해 두면, 일정이 바뀌어도 같은 경기를
-- 다시 찾아 고칠 수 있다(중복 생성 방지). 손으로 만든 경기도 처음 한 번은
-- 팀·날짜로 짝지어 이 번호를 붙인다.
alter table matches add column if not exists lp_id text;
create unique index if not exists matches_lp_id_key on matches (lp_id) where lp_id is not null;

-- 자동 갱신이 너무 자주 돌지 않게 마지막 실행 시각을 남길 자리
insert into site_settings (key, value) values ('schedule_sync', '{}')
on conflict (key) do nothing;

-- ── 6) 권한 ───────────────────────────────────────────────
revoke all on function public.my_profile()                    from public, anon, authenticated;
revoke all on function public.set_fav_team(text)              from public, anon, authenticated;
revoke all on function public.create_profile(text, text)      from public, anon, authenticated;
revoke all on function public.upvote_post_v2(text, text)      from public, anon, authenticated;
revoke all on function public.bump_post_view(text)            from public, anon, authenticated;
revoke all on function public.claim_match_for_records(text)   from public, anon, authenticated;
revoke all on function public.release_match_records(text)     from public, anon, authenticated;

grant execute on function public.my_profile()                 to authenticated;
grant execute on function public.set_fav_team(text)           to authenticated;
grant execute on function public.create_profile(text, text)   to authenticated;
grant execute on function public.upvote_post_v2(text, text)   to anon, authenticated;
grant execute on function public.bump_post_view(text)         to anon, authenticated;
grant execute on function public.claim_match_for_records(text) to authenticated;
grant execute on function public.release_match_records(text)  to authenticated;

-- ── 7) get_fan_stats 에 '내 추천'과 '예측 랭킹'을 더한다 ───
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
      'ratings',      (select coalesce(jsonb_agg(jsonb_build_object('match_id', match_id, 'player_id', player_id, 'score', score)), '[]'::jsonb)
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
-- '관리자 감춤 OK · 추천 잠금 OK · 함수 7 · 랭킹뷰 OK' 가 나오면 정상입니다.
select
  case when exists (select 1 from information_schema.column_privileges
                    where table_name = 'profiles' and column_name = 'is_admin'
                      and grantee in ('anon','authenticated') and privilege_type = 'SELECT')
       then '관리자 노출 ⚠' else '관리자 감춤 OK' end
  || ' · ' ||
  case when exists (select 1 from information_schema.role_table_grants
                    where table_name = 'posts' and grantee in ('anon','authenticated')
                      and privilege_type = 'UPDATE')
       then '추천 열림 ⚠' else '추천 잠금 OK' end
  || ' · 함수 ' || (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in
         ('my_profile','set_fav_team','create_profile','upvote_post_v2','bump_post_view',
          'claim_match_for_records','release_match_records'))
  || ' · ' ||
  case when exists (select 1 from pg_class where relname = 'v_predict_ranking')
       then '랭킹뷰 OK' else '랭킹뷰 ⚠' end
  as "설치 결과";
