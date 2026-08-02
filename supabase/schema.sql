-- ═══════════════════════════════════════════════════════
-- The Nexus — Supabase 스키마 + 시드 데이터
-- Supabase 대시보드 > SQL Editor에 붙여넣고 Run 하세요.
-- ═══════════════════════════════════════════════════════

-- ── 대회 ──
create table if not exists tournaments (
  id text primary key,
  name text not null,
  type text not null default '리그',
  stages jsonb not null default '[]',
  note text default ''
);

-- ── 경기 ──
create table if not exists matches (
  id text primary key,
  tid text references tournaments(id) on delete cascade,
  stage text,
  at timestamptz not null,
  a text not null,
  b text not null,
  label text default '',
  odds_a numeric default 2,
  odds_b numeric default 2,
  status text not null default 'upcoming' check (status in ('upcoming','live','done')),
  score_a int,
  score_b int
);

-- ── 스테이지별 순위 전적 ──
create table if not exists stage_records (
  id text primary key,
  name text not null,
  ord int not null default 0,
  records jsonb not null default '[]'
);

-- ── 선수 ──
create table if not exists players (
  id text primary key,
  team text not null,
  pos text not null,
  nick text not null,
  name text default ''
);

-- ── 게시글 ──
create table if not exists posts (
  id text primary key,
  team text,
  cat text not null default '자유',
  title text not null,
  body text not null default '',
  nick text not null,
  up int not null default 0,
  views int not null default 0,
  created_at timestamptz not null default now()
);

-- ── 댓글 ──
create table if not exists comments (
  id bigint generated always as identity primary key,
  post_id text references posts(id) on delete cascade,
  nick text not null,
  body text not null,
  created_at timestamptz not null default now()
);

-- ── 응원 채팅 (room = 경기 id 또는 player_선수id) ──
create table if not exists chat_messages (
  id bigint generated always as identity primary key,
  room text not null,
  nick text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_room_idx on chat_messages (room, created_at);

-- ── 승부예측 (voter = 브라우저 익명 id) ──
create table if not exists predictions (
  match_id text not null,
  voter text not null,
  side text not null check (side in ('a','b')),
  created_at timestamptz not null default now(),
  primary key (match_id, voter)
);

-- ── 선수 평점 ──
create table if not exists ratings (
  match_id text not null,
  player_id text not null,
  voter text not null,
  score int not null check (score between 1 and 10),
  created_at timestamptz not null default now(),
  primary key (match_id, player_id, voter)
);

-- ── 경기 상세 (세트별 KDA·아이템·룬) ──
create table if not exists match_details (
  match_id text not null,
  set_index int not null,
  win text not null default 'a' check (win in ('a','b')),
  players jsonb not null default '[]',
  primary key (match_id, set_index)
);

-- ═══ RLS (행 수준 보안) ═══
-- 읽기: 누구나 / 커뮤니티 쓰기: 누구나 / 운영 데이터 쓰기: 로그인한 관리자만
alter table tournaments enable row level security;
alter table matches enable row level security;
alter table stage_records enable row level security;
alter table players enable row level security;
alter table posts enable row level security;
alter table comments enable row level security;
alter table chat_messages enable row level security;
alter table predictions enable row level security;
alter table ratings enable row level security;
alter table match_details enable row level security;

-- 모두 읽기 허용
create policy "read_all_tournaments" on tournaments for select using (true);
create policy "read_all_matches" on matches for select using (true);
create policy "read_all_records" on stage_records for select using (true);
create policy "read_all_players" on players for select using (true);
create policy "read_all_posts" on posts for select using (true);
create policy "read_all_comments" on comments for select using (true);
create policy "read_all_chat" on chat_messages for select using (true);
create policy "read_all_predictions" on predictions for select using (true);
create policy "read_all_ratings" on ratings for select using (true);
create policy "read_all_details" on match_details for select using (true);

-- 커뮤니티 데이터: 익명 쓰기 허용
create policy "insert_posts" on posts for insert with check (char_length(title) <= 100 and char_length(body) <= 5000);
create policy "insert_comments" on comments for insert with check (char_length(body) <= 500);
create policy "insert_chat" on chat_messages for insert with check (char_length(body) <= 300);
create policy "upsert_predictions_ins" on predictions for insert with check (true);
create policy "upsert_predictions_upd" on predictions for update using (true);
create policy "upsert_ratings_ins" on ratings for insert with check (true);
create policy "upsert_ratings_upd" on ratings for update using (true);

-- 운영 데이터: 로그인(관리자)만 쓰기
create policy "admin_write_tournaments" on tournaments for all to authenticated using (true) with check (true);
create policy "admin_write_matches" on matches for all to authenticated using (true) with check (true);
create policy "admin_write_records" on stage_records for all to authenticated using (true) with check (true);
create policy "admin_write_players" on players for all to authenticated using (true) with check (true);
create policy "admin_write_details" on match_details for all to authenticated using (true) with check (true);
create policy "admin_delete_posts" on posts for delete to authenticated using (true);
create policy "admin_delete_comments" on comments for delete to authenticated using (true);
create policy "admin_delete_chat" on chat_messages for delete to authenticated using (true);

-- 조회수·추천 증가는 함수로만 (임의 수정 방지)
create or replace function inc_views(pid text) returns void
language sql security definer set search_path = public as
$$ update posts set views = views + 1 where id = pid; $$;

create or replace function upvote_post(pid text) returns void
language sql security definer set search_path = public as
$$ update posts set up = up + 1 where id = pid; $$;

-- 실시간 채팅 구독 활성화
alter publication supabase_realtime add table chat_messages;

-- ═══ 시드 데이터 ═══
insert into tournaments (id, name, type, stages, note) values
('split3-2026', '2026 LCK 스플릿 3', '리그',
 '["라운드 3-4 레전드 그룹","라운드 3-4 라이즈 그룹"]', '7월~9월 · 지역 대회')
on conflict (id) do nothing;

insert into matches (id, tid, stage, at, a, b, odds_a, odds_b, status, score_a, score_b) values
('m1','split3-2026','라운드 3-4 라이즈 그룹','2026-08-02T10:00:00+09','dns','bro',1.55,2.40,'done',2,1),
('m2','split3-2026','라운드 3-4 레전드 그룹','2026-08-02T13:15:00+09','kt','hle',3.50,1.30,'upcoming',null,null),
('m3','split3-2026','라운드 3-4 라이즈 그룹','2026-08-05T10:00:00+09','bro','ns',2.60,1.50,'upcoming',null,null),
('m4','split3-2026','라운드 3-4 레전드 그룹','2026-08-05T12:00:00+09','hle','gen',1.65,2.25,'upcoming',null,null),
('m5','split3-2026','라운드 3-4 라이즈 그룹','2026-08-06T10:00:00+09','krx','dns',1.42,2.90,'upcoming',null,null),
('m6','split3-2026','라운드 3-4 레전드 그룹','2026-08-06T12:00:00+09','dk','t1',2.05,1.78,'upcoming',null,null),
('m7','split3-2026','라운드 3-4 레전드 그룹','2026-08-07T10:00:00+09','kt','gen',2.35,1.60,'upcoming',null,null),
('m8','split3-2026','라운드 3-4 라이즈 그룹','2026-08-07T12:00:00+09','bfx','bro',1.50,2.60,'upcoming',null,null)
on conflict (id) do nothing;

insert into stage_records (id, name, ord, records) values
('r12','Rounds 1-2',1,'[{"team":"hle","w":15,"l":3,"sw":32,"sl":11},{"team":"t1","w":14,"l":4,"sw":30,"sl":10},{"team":"gen","w":14,"l":4,"sw":30,"sl":11},{"team":"kt","w":13,"l":5,"sw":26,"sl":15},{"team":"dk","w":11,"l":7,"sw":24,"sl":18},{"team":"bro","w":6,"l":12,"sw":16,"sl":24},{"team":"bfx","w":6,"l":12,"sw":14,"sl":25},{"team":"krx","w":5,"l":13,"sw":16,"sl":28},{"team":"ns","w":5,"l":13,"sw":13,"sl":28},{"team":"dns","w":1,"l":17,"sw":3,"sl":34}]'),
('rtm','Road To MSI',2,'[{"team":"t1","w":3,"l":1,"sw":7,"sl":4},{"team":"gen","w":2,"l":1,"sw":5,"sl":3},{"team":"hle","w":1,"l":1,"sw":3,"sl":3},{"team":"kt","w":1,"l":2,"sw":3,"sl":5},{"team":"dk","w":0,"l":2,"sw":1,"sl":4}]'),
('r34L','Round 3-4 Legend Group',3,'[{"team":"dk","w":2,"l":0,"sw":4,"sl":1},{"team":"kt","w":1,"l":0,"sw":2,"sl":0},{"team":"t1","w":1,"l":1,"sw":2,"sl":2},{"team":"hle","w":0,"l":1,"sw":1,"sl":2},{"team":"gen","w":0,"l":2,"sw":0,"sl":4}]'),
('r34R','Round 3-4 Rise Group',4,'[{"team":"ns","w":2,"l":0,"sw":4,"sl":1},{"team":"bfx","w":1,"l":1,"sw":3,"sl":2},{"team":"dns","w":1,"l":1,"sw":3,"sl":2},{"team":"krx","w":1,"l":1,"sw":2,"sl":2},{"team":"bro","w":0,"l":2,"sw":1,"sl":4}]')
on conflict (id) do nothing;

insert into players (id, team, pos, nick, name) values
('t1-doran','t1','탑','Doran','최현준'),('t1-oner','t1','정글','Oner','문현준'),('t1-faker','t1','미드','Faker','이상혁'),('t1-gumayusi','t1','원딜','Gumayusi','이민형'),('t1-keria','t1','서폿','Keria','류민석'),
('gen-kiin','gen','탑','Kiin','김기인'),('gen-canyon','gen','정글','Canyon','김건부'),('gen-chovy','gen','미드','Chovy','정지훈'),('gen-ruler','gen','원딜','Ruler','박재혁'),('gen-duro','gen','서폿','Duro','주민규'),
('hle-zeus','hle','탑','Zeus','최우제'),('hle-peanut','hle','정글','Peanut','한왕호'),('hle-zeka','hle','미드','Zeka','김건우'),('hle-viper','hle','원딜','Viper','박도현'),('hle-delight','hle','서폿','Delight','유환중'),
('kt-perfect','kt','탑','PerfecT','이승민'),('kt-fenrir','kt','정글','Fenrir','박강준'),('kt-bdd','kt','미드','Bdd','곽보성'),('kt-aiming','kt','원딜','Aiming','김하람'),('kt-peter','kt','서폿','Peter','정윤수'),
('dk-siwoo','dk','탑','Siwoo','전시우'),('dk-lucid','dk','정글','Lucid','최용혁'),('dk-showmaker','dk','미드','ShowMaker','허수'),('dk-smash','dk','원딜','Smash','신금재'),('dk-moham','dk','서폿','Moham','정재훈'),
('krx-rich','krx','탑','Rich','이재원'),('krx-juhan','krx','정글','Juhan','이주한'),('krx-ucal','krx','미드','Ucal','손우현'),('krx-teddy','krx','원딜','Teddy','박진성'),('krx-pleata','krx','서폿','Pleata','손민우'),
('dns-casting','dns','탑','Casting','신민제'),('dns-pyosik','dns','정글','Pyosik','홍창현'),('dns-bulldog','dns','미드','BuLLDoG','이태영'),('dns-taeyoon','dns','원딜','Taeyoon','김태윤'),('dns-andil','dns','서폿','Andil','문관빈'),
('ns-dudu','ns','탑','DuDu','이동주'),('ns-gideon','ns','정글','GIDEON','김민성'),('ns-fisher','ns','미드','Fisher','이정태'),('ns-jiwoo','ns','원딜','Jiwoo','정지우'),('ns-lehends','ns','서폿','Lehends','손시우'),
('bfx-clear','bfx','탑','Clear','송현민'),('bfx-raptor','bfx','정글','Raptor','전어진'),('bfx-vicla','bfx','미드','VicLa','이대광'),('bfx-diable','bfx','원딜','Diable','김민수'),('bfx-kellin','bfx','서폿','Kellin','김형규'),
('bro-morgan','bro','탑','Morgan','박루한'),('bro-hambak','bro','정글','HamBak','안성민'),('bro-karis','bro','미드','Karis','김홍조'),('bro-hype','bro','원딜','Hype','변정현'),('bro-pollu','bro','서폿','Pollu','성수민')
on conflict (id) do nothing;

insert into posts (id, team, cat, title, body, nick, up, views, created_at) values
('p1','kt','경기 분석','펜리르 2경기 연속 선발, 오늘 HLE전 미드-정글 동선 예상','kt 롤스터 펜리르가 2경기 연속 선발로 나선다. 한화생명전 핵심은 초반 3레벨 갱 각과 바텀 주도권.','협곡의봄',214,1520,now() - interval '1 hour'),
('p2','t1','자유','어제 KT전 0:2… 탑정글 합 이대로 괜찮은가','다이브 타이밍이 계속 어긋난다. DK전 전까지 합 맞출 시간이 얼마 없다.','티원십년팬',189,2103,now() - interval '3 hours'),
('p3','dns','경기 분석','DN수퍼스 1세트 한진 브리온 상대 초반 설계 복기','1세트 5분 지표가 압도적이었다. 합류 속도 차이가 컸음.','바텀차이',121,890,now() - interval '2 hours'),
('p4','gen','선수·팀','쵸비 이주의 선수 선정 — 0승 2패인데 폼은 리그 최상위','팀 성적과 별개로 개인 지표는 리그 1위권.','미드갱승',98,1204,now() - interval '5 hours'),
('p5','hle','밴픽·메타','오늘 KT전 HLE 밴픽 예상 — 자르반·신짜오 1티어 정글 싸움','최근 5경기 기준 자르반 픽밴률 83%.','한타의신',76,675,now() - interval '4 hours'),
('p6',null,'공지','The Nexus 이용 안내 — 비방·혐오 없이 응원해 주세요','팀과 선수에 대한 비판은 자유지만 모욕·혐오·신상 공개는 제재됩니다.','운영자',42,3200,now() - interval '5 days'),
('p7','dk','자유','레전드 그룹 2승 0패 단독 1위! 이 기세 그대로','T1전까지 잡으면 사실상 결승 직행 각.','디플황제',66,780,now() - interval '1 day'),
('p8','bro','자유','브리온 아쉽지만 1세트는 진짜 잘했다','결과는 1:2 패배지만 1세트 운영은 이번 시즌 최고였다.','브리온화이팅',54,430,now() - interval '2 hours')
on conflict (id) do nothing;

insert into match_details (match_id, set_index, win, players) values
('m1',0,'a','[{"pid":"dns-casting","champ":"크산테","k":2,"d":1,"a":5,"cs":231,"gold":11.2,"items":"태양불꽃 방패, 판금장화, 가시 갑옷","runes":"착취의 손아귀 / 영감"},{"pid":"dns-pyosik","champ":"신 짜오","k":4,"d":2,"a":6,"cs":188,"gold":12.1,"items":"월식, 판금장화, 요우무의 유령검","runes":"정복자 / 지배"},{"pid":"dns-bulldog","champ":"아지르","k":5,"d":1,"a":7,"cs":265,"gold":13.4,"items":"루덴의 동반자, 마법사의 신발, 라바돈의 죽음모자","runes":"정복자 / 결의"},{"pid":"dns-taeyoon","champ":"이즈리얼","k":6,"d":0,"a":4,"cs":278,"gold":14.0,"items":"무라마나, 삼위일체, 명석함의 아이오니아 장화","runes":"집중 공격 / 영감"},{"pid":"dns-andil","champ":"알리스타","k":1,"d":3,"a":11,"cs":42,"gold":7.8,"items":"불타는 향로, 기동력의 장화, 구원","runes":"여진 / 영감"},{"pid":"bro-morgan","champ":"레넥톤","k":1,"d":3,"a":2,"cs":214,"gold":10.1,"items":"선혈포식자, 판금장화, 스테락의 도전","runes":"정복자 / 결의"},{"pid":"bro-hambak","champ":"바이","k":2,"d":4,"a":3,"cs":175,"gold":10.5,"items":"선체파괴자, 판금장화, 스테락의 도전","runes":"돌파 / 정밀"},{"pid":"bro-karis","champ":"오리아나","k":3,"d":3,"a":2,"cs":241,"gold":11.8,"items":"루덴의 동반자, 마법사의 신발, 존야의 모래시계","runes":"감전 / 영감"},{"pid":"bro-hype","champ":"진","k":3,"d":2,"a":1,"cs":255,"gold":12.6,"items":"고속 연사포, 무한의 대검, 유령 무희","runes":"치명적 속도 / 영감"},{"pid":"bro-pollu","champ":"노틸러스","k":0,"d":5,"a":4,"cs":38,"gold":6.9,"items":"기사의 맹세, 기동력의 장화, 지크의 융합","runes":"여진 / 지배"}]'),
('m1',1,'b','[{"pid":"dns-casting","champ":"오른","k":1,"d":4,"a":3,"cs":198,"gold":9.8,"items":"태양불꽃 방패, 판금장화, 얼어붙은 심장","runes":"착취의 손아귀 / 영감"},{"pid":"dns-pyosik","champ":"리 신","k":3,"d":5,"a":2,"cs":162,"gold":10.2,"items":"월식, 판금장화, 흑색 절단기","runes":"정복자 / 지배"},{"pid":"dns-bulldog","champ":"라이즈","k":2,"d":3,"a":4,"cs":244,"gold":11.5,"items":"대천사의 지팡이, 마법사의 신발, 세라프의 포옹","runes":"시대의 흐름 / 결의"},{"pid":"dns-taeyoon","champ":"카이사","k":4,"d":2,"a":2,"cs":251,"gold":12.3,"items":"크라켄 학살자, 광전사의 군화, 밤의 끝자락","runes":"정복자 / 지배"},{"pid":"dns-andil","champ":"레나타 글라스크","k":0,"d":4,"a":7,"cs":35,"gold":6.5,"items":"불타는 향로, 기동력의 장화, 미카엘의 축복","runes":"소환: 아에리 / 결의"},{"pid":"bro-morgan","champ":"크산테","k":3,"d":1,"a":6,"cs":225,"gold":11.9,"items":"태양불꽃 방패, 판금장화, 정령의 형상","runes":"착취의 손아귀 / 결의"},{"pid":"bro-hambak","champ":"자르반 4세","k":5,"d":2,"a":8,"cs":171,"gold":12.4,"items":"월식, 판금장화, 죽음의 무도","runes":"정복자 / 영감"},{"pid":"bro-karis","champ":"아리","k":6,"d":1,"a":5,"cs":238,"gold":13.1,"items":"루덴의 동반자, 마법사의 신발, 그림자불꽃","runes":"감전 / 정밀"},{"pid":"bro-hype","champ":"제리","k":7,"d":1,"a":4,"cs":266,"gold":13.8,"items":"무한의 대검, 광전사의 군화, 피바라기","runes":"치명적 속도 / 결의"},{"pid":"bro-pollu","champ":"라칸","k":1,"d":2,"a":13,"cs":29,"gold":7.2,"items":"슈렐리아의 군가, 기동력의 장화, 구원","runes":"콩콩이 소환 / 영감"}]'),
('m1',2,'a','[{"pid":"dns-casting","champ":"잭스","k":4,"d":2,"a":5,"cs":238,"gold":12.8,"items":"삼위일체, 판금장화, 스테락의 도전","runes":"착취의 손아귀 / 정밀"},{"pid":"dns-pyosik","champ":"바이","k":5,"d":1,"a":9,"cs":180,"gold":12.9,"items":"선체파괴자, 판금장화, 가고일 돌갑옷","runes":"돌파 / 정밀"},{"pid":"dns-bulldog","champ":"아리","k":6,"d":2,"a":6,"cs":248,"gold":13.6,"items":"루덴의 동반자, 마법사의 신발, 존야의 모래시계","runes":"감전 / 정밀"},{"pid":"dns-taeyoon","champ":"진","k":7,"d":0,"a":8,"cs":272,"gold":14.5,"items":"고속 연사포, 무한의 대검, 나보리 신속검","runes":"치명적 속도 / 영감"},{"pid":"dns-andil","champ":"쓰레쉬","k":0,"d":3,"a":15,"cs":40,"gold":7.5,"items":"기사의 맹세, 기동력의 장화, 지크의 융합","runes":"여진 / 영감"},{"pid":"bro-morgan","champ":"오른","k":2,"d":4,"a":4,"cs":210,"gold":10.4,"items":"태양불꽃 방패, 판금장화, 가시 갑옷","runes":"착취의 손아귀 / 영감"},{"pid":"bro-hambak","champ":"세주아니","k":1,"d":5,"a":6,"cs":158,"gold":9.8,"items":"태양불꽃 방패, 판금장화, 얼어붙은 심장","runes":"여진 / 영감"},{"pid":"bro-karis","champ":"빅토르","k":4,"d":4,"a":3,"cs":252,"gold":12.2,"items":"루덴의 동반자, 마법사의 신발, 라바돈의 죽음모자","runes":"감전 / 영감"},{"pid":"bro-hype","champ":"이즈리얼","k":3,"d":3,"a":3,"cs":247,"gold":11.9,"items":"무라마나, 삼위일체, 명석함의 아이오니아 장화","runes":"집중 공격 / 영감"},{"pid":"bro-pollu","champ":"브라움","k":0,"d":6,"a":7,"cs":33,"gold":6.4,"items":"기사의 맹세, 기동력의 장화, 구원","runes":"수호자 / 영감"}]')
on conflict (match_id, set_index) do nothing;
