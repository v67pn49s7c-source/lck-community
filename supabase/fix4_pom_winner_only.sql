-- ============================================================
-- fix4: 팬 선정 POM 투표를 승리팀 후보로 다시 만들 준비
-- ============================================================
-- 무엇이 문제였나:
--   POM 투표에 양 팀 선수 10명이 전부 후보로 올라가 있었다.
--   POM 은 LCK 관례대로 승리팀에서 뽑아야 하고, 양 팀을 다 올리면
--   팬이 많은 팀이 항상 유리해져 투표가 왜곡된다.
--
-- 무엇을 하나:
--   잘못 만들어진 POM 투표(phase = 'post_pom')를 전부 지운다.
--   딸린 표는 자동으로 함께 지워진다 (poll_votes 는 on delete cascade).
--   ⚠ 지금까지 이 투표들에 들어온 표는 사라진다 — 후보 목록 자체가
--     잘못된 표라 살릴 수 없다. (승부처·스코어 예측 투표는 건드리지 않는다)
--
-- 삭제 후:
--   관리자 화면(admin.html)을 한 번 열면, 고쳐진 규칙으로
--   승리팀 출전 선수만 후보인 POM 투표가 자동으로 다시 만들어진다.
--
-- 실행: Supabase SQL Editor 에 전체 붙여넣기 → Run
-- ============================================================

-- 지우기 전에 몇 건이 대상인지 본다
select count(*) as "삭제될 POM 투표", coalesce(sum(v.n), 0) as "함께 지워질 표"
from polls p
left join lateral (select count(*) n from poll_votes where poll_id = p.id) v on true
where p.phase = 'post_pom';

delete from polls where phase = 'post_pom';

-- ── 확인 ─────────────────────────────────────────────────────
select case when count(*) = 0 then 'POM 투표 정리 OK — 이제 관리자 화면을 한 번 열어 주세요'
       else '⚠ ' || count(*) || '건이 남아 있음' end as "결과"
from polls where phase = 'post_pom';
