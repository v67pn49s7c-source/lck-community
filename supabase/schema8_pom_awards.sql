-- ── POM 포인트 · 시즌 수상 테이블 (The Nexus) ──────────────
-- Supabase 대시보드 → SQL Editor에 전체 붙여넣고 Run 한 번이면 끝.
-- 2026-08-04 수정: 값 사이 쉼표·끝 세미콜론이 주석(-- 이름,) 안에 들어가 있어
--   구문 오류로 실행되지 않던 것을 바로잡음. 운영 DB에 두 테이블이 없던 원인.

-- 관리자 판별 함수 (다른 SQL을 아직 실행하지 않았어도 동작하게)
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select is_admin from profiles where id = auth.uid()), false) $$;

-- 1) POM (Player of the Match) 포인트 — 경기당 100pt
create table if not exists pom_awards (
  id bigserial primary key,
  match_id text,                       -- 우리 DB의 경기 id (과거 이월분은 null)
  player_id text not null,
  pts int not null default 100,
  label text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists pom_player_idx on pom_awards (player_id);
create unique index if not exists pom_match_uniq on pom_awards (match_id) where match_id is not null;

-- 2) 시즌 수상 (정규시즌 MVP · ALL-LCK · 감독상 · 신인상 · 베스트 세레모니 · 펜타킬)
create table if not exists awards (
  id bigserial primary key,
  cat text not null,                   -- season_mvp | all_lck | head_coach | rookie | ceremony | pentakill
  ord int not null default 0,          -- 주차 / 순번 / 정렬
  player_id text,                      -- 우리 로스터 선수 (아니면 null)
  person text not null default '',     -- 본명 (감독·인터뷰어 등 선수 아닌 경우 포함)
  team text not null default '',
  nick text not null default '',
  champ text not null default '',      -- 펜타킬 챔피언
  opp_team text not null default '',   -- 펜타킬 상대 팀
  at_date text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists awards_cat_idx on awards (cat, ord);
-- 이미 만들어 둔 경우를 위한 보강
alter table awards add column if not exists opp_team text not null default '';

alter table pom_awards enable row level security;
alter table awards enable row level security;

drop policy if exists "read_all_pom" on pom_awards;
drop policy if exists "admin_write_pom" on pom_awards;
drop policy if exists "read_all_awards" on awards;
drop policy if exists "admin_write_awards" on awards;

create policy "read_all_pom" on pom_awards for select using (true);
create policy "admin_write_pom" on pom_awards for all to authenticated using (is_admin()) with check (is_admin());
create policy "read_all_awards" on awards for select using (true);
create policy "admin_write_awards" on awards for all to authenticated using (is_admin()) with check (is_admin());

-- ── 시드 데이터 (2026 정규시즌 진행분) ──────────────────────
-- POM 누적 포인트 (LCK 공식 집계 이월 · 우리 로스터에 없는 LazyFeel·Rich 제외)
delete from pom_awards where match_id is null;
insert into pom_awards (player_id, pts, label) values
  ('gen-chovy', 900, '2026 정규시즌 누적 이월'),  -- Chovy
  ('hle-zeka', 700, '2026 정규시즌 누적 이월'),  -- Zeka
  ('bfx-taeyoon-1785696794062', 500, '2026 정규시즌 누적 이월'),  -- Taeyoon
  ('kt-bdd', 400, '2026 정규시즌 누적 이월'),  -- Bdd
  ('t1-keria', 400, '2026 정규시즌 누적 이월'),  -- Keria
  ('t1-oner', 400, '2026 정규시즌 누적 이월'),  -- Oner
  ('kt-perfect', 400, '2026 정규시즌 누적 이월'),  -- PerfecT
  ('ns-scout-1785696751182', 400, '2026 정규시즌 누적 이월'),  -- Scout
  ('dk-showmaker', 400, '2026 정규시즌 누적 이월'),  -- ShowMaker
  ('bro-teddy-1785696850962', 400, '2026 정규시즌 누적 이월'),  -- Teddy
  ('krx-aiming-1785696472017', 300, '2026 정규시즌 누적 이월'),  -- Aiming
  ('kt-cuzz-1785696455823', 300, '2026 정규시즌 누적 이월'),  -- Cuzz
  ('t1-faker', 300, '2026 정규시즌 누적 이월'),  -- Faker
  ('hle-kanavi-1785696306601', 300, '2026 정규시즌 누적 이월'),  -- Kanavi
  ('dk-lucid', 300, '2026 정규시즌 누적 이월'),  -- Lucid
  ('t1-peyz-1785696354910', 300, '2026 정규시즌 누적 이월'),  -- Peyz
  ('dk-smash', 300, '2026 정규시즌 누적 이월'),  -- Smash
  ('krx-ucal', 300, '2026 정규시즌 누적 이월'),  -- Ucal
  ('hle-delight', 200, '2026 정규시즌 누적 이월'),  -- Delight
  ('bro-gideon-1785696832175', 200, '2026 정규시즌 누적 이월'),  -- GIDEON
  ('gen-kiin', 200, '2026 정규시즌 누적 이월'),  -- Kiin
  ('gen-ruler', 200, '2026 정규시즌 누적 이월'),  -- Ruler
  ('dk-siwoo', 200, '2026 정규시즌 누적 이월'),  -- Siwoo
  ('hle-zeus', 200, '2026 정규시즌 누적 이월'),  -- Zeus
  ('gen-canyon', 100, '2026 정규시즌 누적 이월'),  -- Canyon
  ('dk-career-1785696394105', 100, '2026 정규시즌 누적 이월'),  -- Career
  ('bfx-clear', 100, '2026 정규시즌 누적 이월'),  -- Clear
  ('t1-doran', 100, '2026 정규시즌 누적 이월'),  -- Doran
  ('kt-effort-1785755537491', 100, '2026 정규시즌 누적 이월'),  -- Effort
  ('hle-gumayusi-1785696329218', 100, '2026 정규시즌 누적 이월'),  -- Gumayusi
  ('bfx-kellin', 100, '2026 정규시즌 누적 이월'),  -- Kellin
  ('ns-lehends', 100, '2026 정규시즌 누적 이월'),  -- Lehends
  ('dns-pyosik-1785696707312', 100, '2026 정규시즌 누적 이월'),  -- Pyosik
  ('bfx-raptor', 100, '2026 정규시즌 누적 이월'),  -- Raptor
  ('dns-sharvel-1785756268044', 100, '2026 정규시즌 누적 이월'),  -- Sharvel
  ('ns-sponge-1785696742452', 100, '2026 정규시즌 누적 이월'),  -- Sponge
  ('krx-willer-1785696540742', 100, '2026 정규시즌 누적 이월');  -- Willer

-- 베스트 세레모니 · 질레트 펜타킬
delete from awards where cat in ('ceremony','pentakill');
insert into awards (cat, ord, player_id, person, team, nick, champ, opp_team, at_date, note) values

  ('ceremony', 1, 'dns-pyosik-1785696707312', '홍창현', 'dns', 'Pyosik', '', '', '', ''),
  ('ceremony', 2, 'dk-showmaker', '허수', 'dk', 'ShowMaker', '', '', '', ''),
  ('ceremony', 3, 'kt-perfect', '이승민', 'kt', 'PerfecT', '', '', '', ''),
  ('ceremony', 4, 'dk-showmaker', '허수', 'dk', 'ShowMaker', '', '', '', ''),
  ('ceremony', 5, 'krx-ucal', '손우현', 'krx', 'Ucal', '', '', '', ''),
  ('ceremony', 6, 'krx-aiming-1785696472017', '김하람', 'krx', 'Aiming', '', '', '', ''),
  ('ceremony', 7, 'bro-roamer-1785696840930', '조우진', 'bro', 'Roamer', '', '', '', ''),
  ('ceremony', 8, 'krx-ucal', '손우현', 'krx', 'Ucal', '', '', '', ''),
  ('ceremony', 9, null, '이은빈', '', '', '', '', '', 'LCK 인터뷰어 · LCK 솔랭헌터스2'),
  ('ceremony', 9, null, '이성진', '', 'CuVee', '', '', '', 'LCK 솔랭헌터스2'),
  ('ceremony', 10, 'krx-ucal', '손우현', 'krx', 'Ucal', '', '', '', ''),

  ('pentakill', 1, 't1-peyz-1785696354910', '김수환', 't1', 'Peyz', '', 'ns', '2026.05.13', '61경기 1세트'),
  ('pentakill', 2, 'gen-chovy', '정지훈', 'gen', 'Chovy', '', 'bfx', '2026.05.14', '63경기 1세트'),
  ('pentakill', 3, 't1-peyz-1785696354910', '김수환', 't1', 'Peyz', '', 'krx', '2026.05.20', '71경기 1세트'),
  ('pentakill', 4, 'dk-smash', '신금재', 'dk', 'Smash', '', 'ns', '2026.05.31', '90경기 1세트'),
  ('pentakill', 5, 'krx-aiming-1785696472017', '김하람', 'krx', 'Aiming', '', 'dk', '2026.06.07', 'RtM 2라운드 3세트');

-- 확인용: 누적 POM 순위
-- select p.nick, sum(a.pts) as pts from pom_awards a join players p on p.id = a.player_id
-- group by 1 order by 2 desc;
