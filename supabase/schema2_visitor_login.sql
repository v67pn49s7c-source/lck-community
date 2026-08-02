-- ═══════════════════════════════════════════════════════
-- The Nexus 2차: 방문자 회원가입 + 관리자 권한 분리
-- SQL Editor에 붙여넣고 Run 하세요.
-- ═══════════════════════════════════════════════════════

-- ── 회원 프로필 (닉네임 고정) ──
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nick text not null unique check (char_length(nick) between 2 and 12),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;
create policy "read_all_profiles" on profiles for select using (true);
create policy "insert_own_profile" on profiles for insert with check (auth.uid() = id and is_admin = false);
create policy "update_own_nick" on profiles for update using (auth.uid() = id) with check (auth.uid() = id and is_admin = (select p.is_admin from profiles p where p.id = auth.uid()));

-- ── 관리자 판별 함수 ──
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select is_admin from profiles where id = auth.uid()), false) $$;

-- ── 기존 관리자 계정에 관리자 권한 부여 ──
-- (현재 auth.users에 있는 유일한 계정 = 직접 만든 관리자 계정)
insert into profiles (id, nick, is_admin)
select id, '운영자', true from auth.users
on conflict (id) do update set is_admin = true;

-- ── 운영 데이터 정책을 "로그인한 누구나" → "관리자만"으로 교체 ──
drop policy if exists "admin_write_tournaments" on tournaments;
drop policy if exists "admin_write_matches" on matches;
drop policy if exists "admin_write_records" on stage_records;
drop policy if exists "admin_write_players" on players;
drop policy if exists "admin_write_details" on match_details;
drop policy if exists "admin_delete_posts" on posts;
drop policy if exists "admin_delete_comments" on comments;
drop policy if exists "admin_delete_chat" on chat_messages;

create policy "admin_write_tournaments" on tournaments for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin_write_matches" on matches for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin_write_records" on stage_records for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin_write_players" on players for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin_write_details" on match_details for all to authenticated using (is_admin()) with check (is_admin());
create policy "admin_delete_posts" on posts for delete to authenticated using (is_admin());
create policy "admin_delete_comments" on comments for delete to authenticated using (is_admin());
create policy "admin_delete_chat" on chat_messages for delete to authenticated using (is_admin());
