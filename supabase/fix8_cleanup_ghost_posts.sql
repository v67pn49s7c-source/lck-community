-- ══════════════════════════════════════════════════════════════════
-- fix8: 참여 0인 자동 생성 토론 글 정리 (유령 도시 해소)
-- ══════════════════════════════════════════════════════════════════
-- 증상:
--   커뮤니티 첫 페이지가 "[경기 토론] …" 글로 도배돼 있고 전부 조회 0·추천 0·댓글 0.
--   실제 사람이 쓴 글은 그 아래 파묻혀 보이지 않는다.
--
-- 원인 (admin.html — 코드는 이미 고쳤다):
--   관리자 화면을 열 때마다 **전 경기**에 대해 토론 글을 만들었다.
--   일정이 4~5월 경기까지 들고 있으니, 화면을 열 때마다 옛 경기 글이 계속 늘었다.
--   이제는 예정 경기 + 최근 3일 이내 종료 경기만 만든다.
--
-- 무엇을 지우나 (조건을 모두 만족하는 글만):
--   · 제목이 "[경기 토론]" 으로 시작하고
--   · 추천 0 · 조회 0 · 댓글 0 (사람 손이 전혀 닿지 않은 글)
--   · 연결된 경기가 7일보다 전에 끝났음
--   → 즉 아무도 안 본, 지나간 경기의 자동 글만.
--   댓글이 하나라도 달렸거나 추천·조회가 있으면 **남긴다.**
--
-- 실행: Supabase SQL Editor 에 전체 붙여넣기 → Run
-- ══════════════════════════════════════════════════════════════════

-- ── 1) 지울 대상 미리보기 ───────────────────────────────────────
with dead as (
  select p.id, p.title, m.at as "경기시각"
  from posts p
  left join matches m on m.id = p.match_id
  where p.title like '[경기 토론]%'
    and coalesce(p.up, 0) = 0
    and coalesce(p.views, 0) = 0
    and not exists (select 1 from comments c where c.post_id = p.id)
    and (m.at is null or m.at < now() - interval '7 days')
)
select count(*) as "지울 글 수" from dead;

-- 남게 될 글도 확인 (사람 손이 닿은 자동 글)
select count(*) as "남길 자동글(참여 있음)"
from posts p
where p.title like '[경기 토론]%'
  and (coalesce(p.up,0) > 0 or coalesce(p.views,0) > 0
       or exists (select 1 from comments c where c.post_id = p.id));

-- ── 2) 삭제 ─────────────────────────────────────────────────────
-- polls 는 post_id 에 on delete cascade 가 걸려 있어 함께 정리된다.
delete from posts p
where p.title like '[경기 토론]%'
  and coalesce(p.up, 0) = 0
  and coalesce(p.views, 0) = 0
  and not exists (select 1 from comments c where c.post_id = p.id)
  and (
    p.match_id is null
    or exists (select 1 from matches m where m.id = p.match_id and m.at < now() - interval '7 days')
  );

-- ── 3) 오래 지난 경기의 사후 투표도 정리 (마감이 몇 달 지난 것) ──
delete from polls
where phase in ('post_pom', 'post_key')
  and closes_at is not null
  and closes_at < now() - interval '14 days'
  and not exists (select 1 from poll_votes v where v.poll_id = polls.id);

-- ── 4) 확인 ─────────────────────────────────────────────────────
select
  (select count(*) from posts) as "남은 글",
  (select count(*) from posts where title like '[경기 토론]%') as "남은 자동글",
  (select count(*) from polls) as "남은 투표";
