-- ── 빠져 있던 세트 상세 1건 채우기 ──────────────────────────────
--
-- 2026-08-01 젠지 0:2 디플러스 기아 · **2세트**만 밴픽·오브젝트·경기시간·패치가
-- 통째로 비어 있었다. 선수 스탯은 들어 있어서 이름·KDA·아이템은 보였지만,
-- 그 위의 밴픽 블록과 패치 표시가 안 나오고 딜량 옆 DPM 도 안 나왔다
-- (DPM 은 경기 시간이 있어야 계산된다).
--
-- 왜 비었나: 수집 당시 리그피디아에 그 세트의 **게임 기록만** 아직 없었고,
--   이후 자동 수집이 빈 세트를 다시 시도하지 않는다. 한 번 놓치면 스스로
--   메워지지 않는 구멍이다. 저장된 415세트를 전부 훑어서 이 하나만 찾았다.
--
-- ⚠ 이 세트는 리그피디아 기준 Team1 = Dplus Kia(우리 b), Team2 = Gen.G(우리 a) 다.
--   블루/레드가 1세트와 반대라 a/b 를 뒤집어 담았다. 팀 이름으로만 맞추면 틀린다.
--   (실제로 처음에 팀 순서를 반대로 걸어 조회가 0건으로 나왔다)
--
-- 출처: Leaguepedia ScoreboardGames — LCK/2026 Season/Rounds 3-4_Week 10_8_2
--   DK 7 : 2 GEN · 28:46 · 패치 26.14

update match_details
   set game = '{"len": "28:46", "patch": "26.14", "bans": {"a": ["Poppy", "Ezreal", "Vi", "Syndra", "Ryze"], "b": ["Nocturne", "Orianna", "Jayce", "Akali", "Anivia"]}, "picks": {"a": ["Rumble", "Jarvan IV", "Yone", "Lucian", "Milio"], "b": ["K''Sante", "Xin Zhao", "Viktor", "Caitlyn", "Bard"]}, "kills": {"a": 2, "b": 7}, "gold": {"a": 47692, "b": 57872}, "towers": {"a": 1, "b": 10}, "dragons": {"a": 0, "b": 3}, "barons": {"a": 0, "b": 1}, "inhib": {"a": 0, "b": 1}, "blue": "b"}'::jsonb
 where match_id = 'lpLCK2026SeasonRounds3-4_Week10_8'
   and set_index = 1;

-- ── 확인 — 두 세트 모두 game 이 채워져 있어야 한다 ────────────────
select set_index, win,
       game->>'len' as 경기시간, game->>'patch' as 패치,
       jsonb_array_length(game->'picks'->'a') as A픽수
  from match_details
 where match_id = 'lpLCK2026SeasonRounds3-4_Week10_8'
 order by set_index;
