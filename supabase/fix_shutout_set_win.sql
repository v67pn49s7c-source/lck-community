-- ════════════════════════════════════════════════════════════════════
-- 완봉 경기(0:N)의 세트 승자 교정
-- ════════════════════════════════════════════════════════════════════
--
-- 무엇을 고치나
--   GEN 0:2 DK (lpLCK2026SeasonRounds3-4_Week10_8) 의 저장된 세트가
--   "GEN 승(win='a')" 으로 되어 있었다. 최종 스코어가 0:2 이므로 **틀린 값**이다.
--   그 결과 경기 화면이 승/패를 못 믿고 '기록 확인 중' 으로 굳어 있었다.
--
-- 왜 이 교정은 추측이 아닌가
--   한 팀이 **0승**이면, 그 경기의 **모든 세트**는 반대 팀이 이긴 것이다. 산수다.
--   (스코어가 1:2 처럼 양쪽 다 이긴 경기는 어느 세트를 누가 이겼는지 알 수 없으므로
--    이 스크립트는 **손대지 않는다**. 그런 경우는 원본 재수집으로만 고쳐야 한다.)
--
-- 안전장치
--   · 완봉(0:N 또는 N:0) 경기만
--   · 저장된 값이 실제로 어긋난 행만
--   · 고치기 전 원본을 백업 표에 남긴다
--   되돌리기: 맨 아래 주석 참고
-- ════════════════════════════════════════════════════════════════════

begin;

-- 되돌릴 수 있게 원본을 남긴다
create table if not exists public.md_win_backup_shutout (
  match_id text, set_index int, win_before text, fixed_at timestamptz default now()
);

insert into public.md_win_backup_shutout (match_id, set_index, win_before)
select d.match_id, d.set_index, d.win
from public.match_details d
join public.matches m on m.id = d.match_id
where m.status = 'done'
  and (coalesce(m.score_a, 0) = 0 or coalesce(m.score_b, 0) = 0)   -- 완봉 경기만
  and coalesce(m.score_a, 0) <> coalesce(m.score_b, 0)             -- 0:0 은 제외
  and d.win is distinct from (case when coalesce(m.score_a, 0) = 0 then 'b' else 'a' end);

update public.match_details d
set win = (case when coalesce(m.score_a, 0) = 0 then 'b' else 'a' end)
from public.matches m
where m.id = d.match_id
  and m.status = 'done'
  and (coalesce(m.score_a, 0) = 0 or coalesce(m.score_b, 0) = 0)
  and coalesce(m.score_a, 0) <> coalesce(m.score_b, 0)
  and d.win is distinct from (case when coalesce(m.score_a, 0) = 0 then 'b' else 'a' end);

commit;

-- ════════════════════════════════════════════════════════════════════
-- 확인 — 고쳐진 행이 나와야 한다 (없으면 이미 정상이라는 뜻)
-- ════════════════════════════════════════════════════════════════════
-- select * from public.md_win_backup_shutout order by fixed_at desc;
--
-- 그 경기 상태:
-- select d.set_index, d.win from public.match_details d
--  where d.match_id = 'lpLCK2026SeasonRounds3-4_Week10_8' order by d.set_index;
--
-- 되돌리기:
-- update public.match_details d set win = b.win_before
--   from public.md_win_backup_shutout b
--  where d.match_id = b.match_id and d.set_index = b.set_index;
