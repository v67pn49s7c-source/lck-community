-- ═══════════════════════════════════════════════════════
-- 팬심지수: 투표·빠른반응·댓글추천·창립 팬 100인 (여러 번 실행해도 안전)
-- ═══════════════════════════════════════════════════════

-- ── 투표 ──
create table if not exists polls (
  id text primary key,
  match_id text,                -- 경기 연동 투표 (팬심지수)
  phase text,                   -- 'pre' | 'post_pom' | 'post_key' | null(자유 투표 게시글)
  post_id text,                 -- 투표 게시글이면 해당 글 id
  question text not null,
  options jsonb not null,       -- ["DK 2:0","DK 2:1",...]
  multi boolean not null default false,
  closes_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists poll_votes (
  poll_id text references polls(id) on delete cascade,
  voter text not null,
  choices jsonb not null,       -- 선택한 보기 번호 배열 [0] 또는 [0,2]
  fav_team text,                -- 투표 시점 응원팀 (비회원·미설정 = null = 중립)
  is_member boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (poll_id, voter)
);

-- ── 빠른 반응 (글) ──
create table if not exists reactions (
  post_id text references posts(id) on delete cascade,
  voter text not null,
  kind text not null check (kind in ('agree','fun','insight','cheer')),
  primary key (post_id, voter, kind)
);

-- ── 댓글 추천 ──
create table if not exists comment_likes (
  comment_id bigint references comments(id) on delete cascade,
  voter text not null,
  primary key (comment_id, voter)
);

-- ── 창립 팬 100인 ──
create table if not exists founding_fans (
  team text not null,
  user_id uuid not null references profiles(id) on delete cascade,
  no int not null,
  created_at timestamptz not null default now(),
  primary key (team, user_id),
  unique (team, no)
);

-- ── 작성자 응원팀 배지·경기 연동용 컬럼 ──
alter table posts add column if not exists author_team text;
alter table posts add column if not exists match_id text;
alter table comments add column if not exists author_team text;
alter table chat_messages add column if not exists author_team text;

-- ── RLS ──
alter table polls enable row level security;
alter table poll_votes enable row level security;
alter table reactions enable row level security;
alter table comment_likes enable row level security;
alter table founding_fans enable row level security;

drop policy if exists "read_polls" on polls;
drop policy if exists "member_insert_polls" on polls;
drop policy if exists "admin_all_polls" on polls;
create policy "read_polls" on polls for select using (true);
create policy "member_insert_polls" on polls for insert to authenticated with check (true);
create policy "admin_all_polls" on polls for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "read_poll_votes" on poll_votes;
drop policy if exists "insert_poll_votes" on poll_votes;
drop policy if exists "update_poll_votes" on poll_votes;
create policy "read_poll_votes" on poll_votes for select using (true);
create policy "insert_poll_votes" on poll_votes for insert with check (true);
create policy "update_poll_votes" on poll_votes for update using (true);

drop policy if exists "read_reactions" on reactions;
drop policy if exists "insert_reactions" on reactions;
drop policy if exists "delete_reactions" on reactions;
create policy "read_reactions" on reactions for select using (true);
create policy "insert_reactions" on reactions for insert with check (true);
create policy "delete_reactions" on reactions for delete using (true);

drop policy if exists "read_comment_likes" on comment_likes;
drop policy if exists "insert_comment_likes" on comment_likes;
create policy "read_comment_likes" on comment_likes for select using (true);
create policy "insert_comment_likes" on comment_likes for insert with check (true);

drop policy if exists "read_founding" on founding_fans;
create policy "read_founding" on founding_fans for select using (true);
-- founding_fans 등록은 아래 함수로만 (순번 중복·초과 방지)

create or replace function claim_founding(t text) returns int
language plpgsql security definer set search_path = public as $$
declare n int; uid uuid := auth.uid();
begin
  if uid is null then raise exception '로그인이 필요합니다.'; end if;
  if (select fav_team from profiles where id = uid) is distinct from t then
    raise exception '응원팀 팬만 등록할 수 있습니다.';
  end if;
  select no into n from founding_fans where team = t and user_id = uid;
  if n is not null then return n; end if;
  select coalesce(max(no), 0) + 1 into n from founding_fans where team = t;
  if n > 100 then raise exception '창립 팬 100인이 모두 모였습니다.'; end if;
  insert into founding_fans (team, user_id, no) values (t, uid, n);
  return n;
end $$;
