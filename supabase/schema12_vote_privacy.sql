-- ═══════════════════════════════════════════════════════
-- 투표·평점 원본 비공개화 (2026-08-05)
--
-- 지금 문제: predictions·ratings·poll_votes·reactions·comment_likes 가
-- 전부 공개 조회다. 회원의 voter 값은 계정 id 이고 profiles(id, nick) 도 공개라,
-- 익명 키만 있으면 "닉네임 → 그 사람이 한 모든 투표·평점·반응"을 그대로 뽑을 수 있다.
-- (실제로 확인함: 닉네임 '딮기사랑' 의 예측 이력이 조인 한 번에 나온다)
--
-- 이 파일이 하는 일
--   1. 개인이 드러나지 않는 **집계 뷰**를 만든다 (화면이 이미 보여 주는 것만 노출)
--   2. "내 표"는 security definer 함수로만 — 회원 것은 본인만, 익명 것은 그 id 를 아는 사람만
--   3. 쓰기도 전부 함수로 옮긴다 (원본 권한을 회수하면 upsert/delete 의 WHERE 절이
--      컬럼을 읽지 못해 깨지기 때문. 겸사겸사 서버가 신원·마감·값 범위를 강제한다)
--   4. 다섯 테이블에서 anon·authenticated 의 모든 권한을 회수한다
--
-- ※ Supabase Security Advisor 가 아래 뷰들을 'security_definer_view' 로 경고하는데
--    **의도된 설계다**. security_invoker 를 켜면 anon 이 기반 테이블 권한이 없어
--    모든 집계가 0으로 죽는다. 같은 이유로 이 테이블들에 force row level security 를
--    켜서도 안 된다.
-- ※ 여러 번 실행해도 안전하다.
-- ═══════════════════════════════════════════════════════

begin;

-- ── 0) 신원 확정 ──────────────────────────────────────────
-- 익명 방문자 id 는 브라우저가 만든다: 'v' + 시각(36진) + 무작위 6자
-- (assets/store.js voterId() 와 같은 규칙. 현재 DB 의 모든 행이 이 형식 또는 계정 UUID 임을 확인함)
create or replace function public.is_anon_voter(v text) returns boolean
language sql immutable set search_path = '' as $$
  select v ~ '^v[a-z0-9]{6,40}$'
$$;

-- 클라이언트가 보낸 p_voter 를 그대로 믿지 않는다.
-- 로그인 상태면 계정 id 로 **고정**하고 인자는 무시한다(사칭 차단).
-- 비로그인이면 익명 형식일 때만 허용한다(계정 UUID 를 보내도 거부).
create or replace function public.resolve_voter(p_voter text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is not null then return u::text; end if;
  if public.is_anon_voter(p_voter) then return p_voter; end if;
  return null;
end $$;

-- ── 1) 집계 뷰 ────────────────────────────────────────────
-- 원칙: 화면이 이미 보여 주는 것보다 더 많이 내보내지 않는다.
-- 개인 식별의 핵심인 voter 컬럼은 어떤 뷰에도 나오지 않는다.

-- 승부예측: 경기별 A/B 표 수
-- 팬덤별로 쪼개지 않는다. 화면은 전체 비율만 쓰는데, 쪼개서 내보내면
-- "그 팀 팬으로 등록한 회원이 1명뿐인 경기"에서 그 사람의 예측이 그대로 드러난다.
create or replace view public.v_prediction_stats as
select p.match_id,
       count(*) filter (where p.side = 'a')::int as a,
       count(*) filter (where p.side = 'b')::int as b
from public.predictions p
group by 1;

-- 승자 판정 — assets/store.js 의 matchWinner() 와 **같은 규칙**이어야 한다.
-- 끝난 경기 + 양쪽 점수가 모두 있음 + 동점 아님. 하나라도 어긋나면 채점하지 않는다.
create or replace view public.v_match_winner as
select id as match_id,
       case when score_a > score_b then 'a' else 'b' end as winner
from public.matches
where status = 'done'
  and score_a is not null and score_b is not null
  and score_a <> score_b;

-- 팬덤별 예측 적중률 (회원만 — 익명 표는 응원팀을 알 수 없다)
create or replace view public.v_fandom_accuracy as
select pr.fav_team as team,
       count(*)::int as n,
       count(*) filter (where p.side = w.winner)::int as hits
from public.predictions p
join public.profiles pr on pr.id::text = p.voter and pr.fav_team is not null
join public.v_match_winner w on w.match_id = p.match_id
group by 1;

-- 선수 평점: (경기, 선수) × 팬덤 버킷
--   own = 그 선수 팀의 팬 · opp = 상대 팀의 팬 · neu = 그 외(익명 포함) · all = 전체
-- n 과 합계를 그대로 주는 이유: 브라우저가 지금까지 하던 계산을 **한 글자도 바꾸지 않기 위해서**다.
-- (평균만 내려보내면 반올림이 겹쳐 POG 선정이나 육각형 백분위가 미세하게 달라진다)
create or replace view public.v_rating_stats as
with base as (
  select r.match_id, r.player_id, r.score,
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
select match_id, player_id, bucket, count(*)::int as n, sum(score)::int as total
from base group by 1, 2, 3
union all
select match_id, player_id, 'all', count(*)::int, sum(score)::int
from base group by 1, 2;

-- 경기별 평점 참여 인원(중복 제외) — 평점 공유 카드가 쓴다.
-- 선수별 n 을 더하면 한 사람이 10명을 평가했을 때 10명으로 세어지므로 따로 필요하다.
create or replace view public.v_match_rating_voters as
select match_id, count(distinct voter)::int as n_voters
from public.ratings group by 1;

-- 팬심지수 투표: 보기별 득표 (팬덤 버킷별)
-- 응원팀은 투표 시점에 기록된 값을 우선하고, 비어 있으면 현재 프로필로 메운다.
-- (예전 표는 fav_team 이 비어 있는 채로 저장된 것들이 있다)
create or replace view public.v_poll_stats as
with v as (
  select pv.poll_id,
         coalesce(nullif(pv.fav_team, ''), pr.fav_team, '') as fan_team,
         pv.choices
  from public.poll_votes pv
  left join public.profiles pr on pr.id::text = pv.voter
  where jsonb_typeof(pv.choices) = 'array'
)
select v.poll_id, v.fan_team,
       floor((e.value #>> '{}')::numeric)::int as choice_idx,
       count(*)::int as n
from v cross join lateral jsonb_array_elements(v.choices) e
-- 범위를 벗어난 값 한 행 때문에 int 변환이 터져 사이트 전체 집계가 죽지 않도록 거른다
where jsonb_typeof(e.value) = 'number'
  and (e.value #>> '{}')::numeric >= 0
  and (e.value #>> '{}')::numeric < 1000
group by 1, 2, 3;

-- 투표 참여 인원 (보기를 하나도 안 고른 표도 1명으로 센다 — 기존 집계와 같게)
create or replace view public.v_poll_voters as
select pv.poll_id,
       coalesce(nullif(pv.fav_team, ''), pr.fav_team, '') as fan_team,
       count(*)::int as n
from public.poll_votes pv
left join public.profiles pr on pr.id::text = pv.voter
group by 1, 2;

create or replace view public.v_reaction_stats as
select post_id, kind, count(*)::int as n from public.reactions group by 1, 2;

create or replace view public.v_comment_like_stats as
select comment_id, count(*)::int as n from public.comment_likes group by 1;

-- 뷰는 소유자 권한으로 돌아야 기반 테이블의 RLS 를 통과한다 (기본값이지만 못박아 둔다)
alter view public.v_prediction_stats     set (security_invoker = off);
alter view public.v_match_winner         set (security_invoker = off);
alter view public.v_fandom_accuracy      set (security_invoker = off);
alter view public.v_rating_stats         set (security_invoker = off);
alter view public.v_match_rating_voters  set (security_invoker = off);
alter view public.v_poll_stats           set (security_invoker = off);
alter view public.v_poll_voters          set (security_invoker = off);
alter view public.v_reaction_stats       set (security_invoker = off);
alter view public.v_comment_like_stats   set (security_invoker = off);

-- ── 2) 집계 + 내 표를 한 번에 (왕복 1회) ──────────────────
-- 첫 화면 속도를 위해 요청 수를 늘리지 않는다. 예전 5개 테이블 조회를 이 함수 하나가 대신한다.
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
                         from public.comment_likes where voter = v)
    ) end
  );
end $$;

-- ── 3) 쓰기 ───────────────────────────────────────────────
-- 전부 resolve_voter() 로 신원을 확정한 뒤에만 쓴다. 반환값은 확정된 voter —
-- 브라우저가 자기 신원을 서버 기준으로 맞출 수 있게 한다(만료된 세션 대응).

-- 승부예측: 끝난 경기는 예측할 수 없다.
-- (지금까지는 결과를 다 보고 나서 예측해도 적중으로 잡혔다 — 적중률이 상품인 사이트에서 치명적)
create or replace function public.vote_match(p_match_id text, p_voter text, p_side text)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v text := public.resolve_voter(p_voter); st text; starts timestamptz;
begin
  if v is null then raise exception '투표 자격을 확인할 수 없습니다'; end if;
  if p_side not in ('a', 'b') then raise exception '잘못된 선택입니다'; end if;
  select status, at into st, starts from public.matches where id = p_match_id;
  if st is null then raise exception '경기를 찾을 수 없습니다'; end if;
  -- 승부예측 화면이 "마감: 경기 시작 5분 전"이라고 안내한다. 그 약속을 서버가 지킨다.
  -- (이게 없으면 경기를 다 보고 나서 예측해도 적중으로 잡혀 적중률이 무의미해진다)
  if st = 'done' or (starts is not null and now() >= starts - interval '5 minutes') then
    raise exception '예측이 마감된 경기입니다';
  end if;
  insert into public.predictions (match_id, voter, side) values (p_match_id, v, p_side)
    on conflict (match_id, voter) do update set side = excluded.side;
  return v;
end $$;

create or replace function public.rate_player(p_match_id text, p_player_id text, p_voter text, p_score int)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare v text := public.resolve_voter(p_voter);
begin
  if v is null then raise exception '평점 자격을 확인할 수 없습니다'; end if;
  if p_score is null or p_score < 1 or p_score > 10 then raise exception '평점은 1~10점입니다'; end if;
  if not exists (select 1 from public.matches where id = p_match_id) then raise exception '경기를 찾을 수 없습니다'; end if;
  if not exists (select 1 from public.players where id = p_player_id) then raise exception '선수를 찾을 수 없습니다'; end if;
  insert into public.ratings (match_id, player_id, voter, score) values (p_match_id, p_player_id, v, p_score)
    on conflict (match_id, player_id, voter) do update set score = excluded.score;
  return v;
end $$;

-- 팬심지수 투표. 응원팀·회원 여부는 클라이언트 말을 믿지 않고 서버가 직접 읽는다.
create or replace function public.vote_poll(p_poll_id text, p_voter text, p_choices jsonb)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  v text := public.resolve_voter(p_voter);
  u uuid := auth.uid();
  n_opt int; is_multi boolean; closes timestamptz;
  fav text;
begin
  if v is null then raise exception '투표 자격을 확인할 수 없습니다'; end if;
  if jsonb_typeof(p_choices) <> 'array' then raise exception '잘못된 선택입니다'; end if;
  select jsonb_array_length(options), multi, closes_at into n_opt, is_multi, closes
    from public.polls where id = p_poll_id;
  if n_opt is null then raise exception '투표를 찾을 수 없습니다'; end if;
  if closes is not null and closes <= now() then raise exception '마감된 투표입니다'; end if;
  if not is_multi and jsonb_array_length(p_choices) > 1 then raise exception '하나만 고를 수 있습니다'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_choices) e
    where jsonb_typeof(e.value) <> 'number'
       or (e.value #>> '{}')::numeric < 0
       or (e.value #>> '{}')::numeric >= n_opt
       or (e.value #>> '{}')::numeric <> floor((e.value #>> '{}')::numeric)   -- 1.5 같은 값 차단
  ) then raise exception '없는 보기를 골랐습니다'; end if;
  -- 같은 보기를 여러 번 넣어 득표를 부풀리는 것을 막는다 (복수선택 투표에서 가능했다)
  if (select count(distinct e.value) from jsonb_array_elements(p_choices) e) <> jsonb_array_length(p_choices) then
    raise exception '같은 보기를 여러 번 고를 수 없습니다';
  end if;

  if u is not null then select fav_team into fav from public.profiles where id = u; end if;
  insert into public.poll_votes (poll_id, voter, choices, fav_team, is_member)
    values (p_poll_id, v, p_choices, fav, u is not null)
    on conflict (poll_id, voter) do update
      set choices = excluded.choices, fav_team = excluded.fav_team, is_member = excluded.is_member;
  return v;
end $$;

-- 반응 토글. 반환값 true = 켜짐, false = 꺼짐
create or replace function public.toggle_reaction(p_post_id text, p_voter text, p_kind text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v text := public.resolve_voter(p_voter);
begin
  if v is null then raise exception '자격을 확인할 수 없습니다'; end if;
  if p_kind not in ('agree', 'fun', 'insight', 'cheer') then raise exception '잘못된 반응입니다'; end if;
  if not exists (select 1 from public.posts where id = p_post_id) then raise exception '글을 찾을 수 없습니다'; end if;
  if exists (select 1 from public.reactions where post_id = p_post_id and voter = v and kind = p_kind) then
    delete from public.reactions where post_id = p_post_id and voter = v and kind = p_kind;
    return false;
  end if;
  insert into public.reactions (post_id, voter, kind) values (p_post_id, v, p_kind);
  return true;
end $$;

create or replace function public.like_comment(p_comment_id bigint, p_voter text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v text := public.resolve_voter(p_voter);
begin
  if v is null then raise exception '자격을 확인할 수 없습니다'; end if;
  if not exists (select 1 from public.comments where id = p_comment_id) then raise exception '댓글을 찾을 수 없습니다'; end if;
  insert into public.comment_likes (comment_id, voter) values (p_comment_id, v) on conflict do nothing;
  return true;
end $$;

-- ── 4) (보류) 익명 기록을 계정으로 잇기 ─────────────────
-- 팬 여권에서 "가입하면 기록이 이어진다"를 익명 시절까지 소급하려면 이 함수가 필요하지만,
-- **지금은 만들지 않는다.** 익명 id는 비밀이 아니기 때문이다 — 이 파일을 실행하기 전까지
-- predictions.voter 가 공개 조회였으므로, 이미 전체 익명 id 목록을 받아 간 사람이 있을 수 있다.
-- 그 상태에서 "id를 아는 사람이 주인"이라고 인정하면, 가입 한 번으로 남의 익명 기록을
-- 가져가거나 지울 수 있다. 소급 이어붙이기는 브라우저가 비밀 토큰을 갖는 구조로 바꾼 뒤에.
-- (가입 이후의 기록이 기기를 넘어 이어지는 것은 지금도 정상 동작한다)

-- ── 5) 관리자용 이상 감지 ─────────────────────────────────
-- 원본을 아무도 못 보게 만들면 운영자도 부정 투표를 찾을 수 없게 된다.
-- 개인 신원은 여전히 감추고(voter를 해시 앞 8자로만), '한 사람이 몇 표를 던졌는가'만 보여 준다.
create or replace function public.admin_vote_audit()
returns table (kind text, voter_hint text, is_member boolean, n int, first_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false) then
    raise exception '관리자만 볼 수 있습니다';
  end if;
  -- 참여자 표시는 '순번'이다. 해시를 쓰면 회원 계정 id 를 아는 사람이 되돌릴 수 있다.
  return query
  with rows as (
    select '예측'::text as kind, x.voter, count(*)::int as n, min(x.created_at) as first_at
      from public.predictions x group by 1, 2
    union all
    select '평점'::text, x.voter, count(*)::int, min(x.created_at)
      from public.ratings x group by 1, 2
    union all
    select '투표'::text, x.voter, count(*)::int, min(x.created_at)
      from public.poll_votes x group by 1, 2
  ), ident as (
    select r.voter, dense_rank() over (order by r.voter) as no from rows r group by r.voter
  )
  select r.kind, '참여자 ' || i.no::text, r.voter ~ '^[0-9a-fA-F-]{36}$', r.n, r.first_at
    from rows r join ident i on i.voter = r.voter
   order by r.n desc;
end $$;

-- ── 6) 권한 ───────────────────────────────────────────────
-- 새 함수는 기본적으로 PUBLIC 에 실행 권한이 붙는다. 회수하고 필요한 역할에만 준다.
revoke all on function public.is_anon_voter(text)        from public, anon, authenticated;
revoke all on function public.resolve_voter(text)        from public, anon, authenticated;
revoke all on function public.get_fan_stats(text)        from public, anon, authenticated;
revoke all on function public.vote_match(text, text, text) from public, anon, authenticated;
revoke all on function public.rate_player(text, text, text, int) from public, anon, authenticated;
revoke all on function public.vote_poll(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.toggle_reaction(text, text, text) from public, anon, authenticated;
revoke all on function public.like_comment(bigint, text)  from public, anon, authenticated;
revoke all on function public.admin_vote_audit()          from public, anon, authenticated;
grant execute on function public.admin_vote_audit()       to authenticated;

grant execute on function public.get_fan_stats(text)             to anon, authenticated;
grant execute on function public.vote_match(text, text, text)    to anon, authenticated;
grant execute on function public.rate_player(text, text, text, int) to anon, authenticated;
grant execute on function public.vote_poll(text, text, jsonb)    to anon, authenticated;
grant execute on function public.toggle_reaction(text, text, text) to anon, authenticated;
grant execute on function public.like_comment(bigint, text)      to anon, authenticated;

-- ★ 뷰 권한 — 반드시 회수부터. 이유가 있다.
-- 이 프로젝트의 public 스키마에는 Supabase 기본 권한(alter default privileges ... grant all
-- on tables)이 걸려 있어서, 새로 만든 뷰에 anon 의 SELECT/INSERT/UPDATE/DELETE 가 **자동으로**
-- 붙는다. 그런데 v_match_winner 는 단일 테이블 뷰라 PostgreSQL 이 '갱신 가능 뷰'로 취급하고,
-- security_invoker = off 라 소유자 권한으로 matches 의 RLS 를 통과한다.
-- 즉 그대로 두면 로그인도 없이 공개 키만으로
--     DELETE /rest/v1/v_match_winner?match_id=neq.__x__
-- 를 호출해 **끝난 경기가 matches 에서 통째로 지워진다**(순위·전적·적중률·상세 전부).
-- 실제로 재현해서 확인한 문제다. 그래서 전부 회수한 뒤 SELECT 만 다시 준다.
revoke all on public.v_prediction_stats,
               public.v_match_winner,
               public.v_fandom_accuracy,
               public.v_rating_stats,
               public.v_match_rating_voters,
               public.v_poll_stats,
               public.v_poll_voters,
               public.v_reaction_stats,
               public.v_comment_like_stats
  from public, anon, authenticated;

-- v_match_winner 는 v_fandom_accuracy 안에서만 쓰이므로 아무에게도 열지 않는다.
grant select on public.v_prediction_stats,
                public.v_fandom_accuracy,
                public.v_rating_stats,
                public.v_match_rating_voters,
                public.v_poll_stats,
                public.v_poll_voters,
                public.v_reaction_stats,
                public.v_comment_like_stats
  to anon, authenticated;

-- ★ 원본 회수 — 여기서부터 누구도 남의 표를 행 단위로 볼 수 없다
revoke all on public.predictions   from anon, authenticated;
revoke all on public.ratings       from anon, authenticated;
revoke all on public.poll_votes    from anon, authenticated;
revoke all on public.reactions     from anon, authenticated;
revoke all on public.comment_likes from anon, authenticated;

-- 권한을 회수했으므로 RLS 정책은 이제 아무 일도 하지 않는다.
-- 남겨 두면 pg_policies 를 봤을 때 "공개 조회 허용"처럼 읽혀 오해를 부르므로 지운다.
-- (정책이 하나도 없는 RLS 테이블 = 소유자/service_role 외 전면 차단)
drop policy if exists read_all_predictions   on public.predictions;
drop policy if exists upsert_predictions_ins on public.predictions;
drop policy if exists upsert_predictions_upd on public.predictions;
drop policy if exists read_all_ratings       on public.ratings;
drop policy if exists upsert_ratings_ins     on public.ratings;
drop policy if exists upsert_ratings_upd     on public.ratings;
drop policy if exists read_poll_votes        on public.poll_votes;
drop policy if exists insert_poll_votes      on public.poll_votes;
drop policy if exists update_poll_votes      on public.poll_votes;
drop policy if exists read_reactions         on public.reactions;
drop policy if exists insert_reactions       on public.reactions;
drop policy if exists delete_reactions       on public.reactions;
drop policy if exists read_comment_likes     on public.comment_likes;
drop policy if exists insert_comment_likes   on public.comment_likes;

commit;

-- PostgREST 가 새 함수·뷰를 바로 알아보게 한다
notify pgrst, 'reload schema';

-- ── 확인 ──────────────────────────────────────────────────
-- 아래 결과가 '뷰 9 · 함수 9 · 남은 공개 권한 없음' 이면 정상입니다.
-- (Supabase SQL 편집기는 마지막 문장의 결과만 보여 주므로 한 줄로 합쳤습니다)
select
  '뷰 ' || (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'v' and c.relname like 'v!_%' escape '!')
  || ' · 함수 ' || (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in
         ('is_anon_voter','resolve_voter','get_fan_stats','vote_match','rate_player',
          'vote_poll','toggle_reaction','like_comment','admin_vote_audit'))
  || ' · 남은 공개 권한 ' || coalesce((
       select string_agg(distinct table_name || '.' || privilege_type, ', ')
       from information_schema.role_table_grants
       where table_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC')
         and (table_name in ('predictions','ratings','poll_votes','reactions','comment_likes')
              or (table_name like 'v!_%' escape '!' and privilege_type <> 'SELECT'))
     ), '없음') as "설치 결과";
