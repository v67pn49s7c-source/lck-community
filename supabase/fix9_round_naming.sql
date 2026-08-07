-- ── 대회 이름을 LCK 공식 용어로 (스플릿 → 라운드) ─────────────────────
--
-- 왜:
--   2026 LCK 는 스프링·서머로 나뉘는 "스플릿" 제도가 아니다. 한 시즌이
--   정규 라운드 1-2 → Road to MSI → 정규 라운드 3-4 → 플레이-인 → 플레이오프
--   순서로 이어지는 단일 시즌제다. 화면 문구는 코드에서 전부 고쳤는데,
--   대회 이름만은 DB 에 저장돼 있어 여기서 고친다.
--
-- 실행 방법: Supabase → SQL Editor 에 통째로 붙여넣고 Run.
--            맨 아래 결과가 "라운드 이름 정리 OK" 면 성공이다.
--
-- 안전성: 이름(name)과 종류(type)만 바꾼다. 경기·전적·기록은 대회 id 로 이어져
--         있으므로 하나도 건드리지 않는다. 되돌리려면 아래 이름만 다시 바꾸면 된다.

begin;

-- 1) 스플릿 3 → 정규 라운드 3-4  (경기·순위가 다 여기 달려 있다)
update tournaments
   set name = '2026 LCK 정규 라운드 3-4'
 where id = 'split3-2026';

-- 2) 라운드 1-2 도 "정규" 를 붙여 셋을 나란히 읽히게
update tournaments
   set name = '2026 LCK 정규 라운드 1-2'
 where id = 'lck2026-1-2';

-- 3) Road to MSI 는 리그가 아니라 토너먼트다 (5경기 시드형 Bo5).
--    종류가 '리그' 로 되어 있으면 순위표를 자동 계산하려 든다.
update tournaments
   set type = '토너먼트'
 where id = 'lck2026-msi'
   and type <> '토너먼트';

-- 혹시 다른 대회에 '스플릿' 이 남아 있으면 같이 바꾼다
update tournaments
   set name = replace(name, '스플릿', '라운드')
 where name like '%스플릿%';

commit;

-- 확인
select
  case
    when not exists (select 1 from tournaments where name like '%스플릿%')
     and exists (select 1 from tournaments where id = 'split3-2026' and name = '2026 LCK 정규 라운드 3-4')
    then '라운드 이름 정리 OK'
    else '아직 남아 있음 — 아래 목록 확인'
  end as 결과;

select id, name, type from tournaments order by id;
