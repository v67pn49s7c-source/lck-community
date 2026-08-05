-- ═══════════════════════════════════════════════════════
-- 초기 설치용 가짜 데이터 · 테스트 데이터 정리 (2026-08-05)
--
-- ⚠ 이 파일은 **글과 경기를 실제로 지웁니다.** 되돌릴 수 없습니다.
--    지워질 내용은 supabase/backup/ 폴더에 JSON으로 미리 받아 두었습니다.
--    (seed_posts_20260805.json / seed_comments_20260805.json / test_matches_20260805.json)
--
-- 왜 지우나
--   · 사이트를 처음 만들 때 넣은 예시 글 8개(협곡의봄·티원십년팬 등 가짜 닉네임)가
--     추천 214·조회 1520 같은 큰 숫자를 달고 있어, 진짜 팬 글(추천 0~1)이
--     '실시간 인기 글'에 영원히 못 올라옵니다.
--   · 그중 공지 글은 옛 이름 'LCK 라운지'로 되어 있고, 공지는 모든 팀 게시판
--     맨 위에 고정되므로 11개 게시판 상단에 옛 브랜드명이 계속 보입니다.
--     → 이 공지만은 지우지 않고 The Nexus 문구로 **고쳐 씁니다**(실제로 필요한 안내라서).
--   · 8/4 새벽에 만들어진 테스트 경기 3건(모두 상대가 BFX, 같은 시각)이
--     홈 일정·승부예측·대진표에 그대로 노출됩니다.
--
-- 실행하면 마지막에 '무엇이 몇 건 지워졌는지' 표가 나옵니다.
-- ═══════════════════════════════════════════════════════

begin;

-- ── 0) 지우기 전 현황 (기록용) ──
create temp table _before as
select
  (select count(*) from posts   where id in ('p1','p2','p3','p4','p5','p7','p8')) as 예시글,
  (select count(*) from matches where id in ('m1785832719686','m1785832734273','m1785832740694')) as 테스트경기,
  (select count(*) from polls   where post_id is not null
     and not exists (select 1 from posts p where p.id = polls.post_id))           as 고아투표;

-- ── 1) 옛 이름 공지는 지우지 않고 고쳐 쓴다 ──
update posts set
  title = 'The Nexus 이용 안내 — 비방·혐오 없이 응원해 주세요',
  body  = E'The Nexus는 LCK 팬이 모여 경기를 함께 보고 이야기하는 비공식 팬 커뮤니티입니다.\n\n'
       || E'· 상대 팀·선수를 향한 비방과 혐오 표현은 삭제되고 이용이 제한됩니다.\n'
       || E'· 불법 베팅·불법 중계 링크는 즉시 삭제됩니다.\n'
       || E'· 경기 예측과 평점은 재미로 하는 팬 활동이며, 포인트는 환전·양도할 수 없습니다.\n'
       || E'· 비회원도 전체 게시판에서 자유롭게 참여할 수 있습니다. 팀 게시판은 그 팀을 응원하는 회원만 글을 쓸 수 있어요.\n\n'
       || E'좋은 경기, 즐거운 응원 되세요.'
where id = 'p6';

-- ── 2) 예시 글 7개와 딸린 것들 삭제 ──
-- (댓글·반응·댓글추천은 외래키 cascade 로 함께 지워집니다)
delete from polls where post_id in ('p1','p2','p3','p4','p5','p7','p8');
delete from posts where id in ('p1','p2','p3','p4','p5','p7','p8');

-- ── 3) 테스트 경기 3건과 딸린 토론 글·투표 삭제 ──
-- 관리자 화면이 경기마다 '[경기 토론]' 글과 투표를 자동으로 만들기 때문에 함께 지운다.
create temp table _testm(id text primary key);
insert into _testm values ('m1785832719686'), ('m1785832734273'), ('m1785832740694');

delete from polls where match_id in (select id from _testm);
delete from posts where match_id in (select id from _testm);
delete from match_details where match_id in (select id from _testm);
delete from predictions where match_id in (select id from _testm);
delete from ratings where match_id in (select id from _testm);
delete from matches where id in (select id from _testm);

-- ── 4) 글이 사라졌는데 남아 있는 투표 정리 ──
-- (글 삭제 코드가 투표를 같이 지우지 않아 생긴 잔여물. 코드도 이번에 함께 고쳤습니다)
delete from polls
where post_id is not null
  and not exists (select 1 from posts p where p.id = polls.post_id);

commit;

notify pgrst, 'reload schema';

-- ── 정리 결과 ──
select
  '예시 글 ' || b.예시글 || '건 · 테스트 경기 ' || b.테스트경기 || '건 · 고아 투표 ' || b.고아투표 || '건 정리했습니다. '
  || '남은 글 ' || (select count(*) from posts) || '건 · 남은 경기 ' || (select count(*) from matches) || '건'
  as "정리 결과"
from _before b;
