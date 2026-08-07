-- ══════════════════════════════════════════════════════════════════
-- fix10: 스테이지 이름 통일 + Road to MSI 경기를 제 대회로
-- ══════════════════════════════════════════════════════════════════
--
-- 무엇이 잘못돼 있나 (운영 데이터를 직접 세어 확인한 값):
--
--   ① 이름이 영어·한글로 갈린다
--        stage_records: "Rounds 1-2"(영) / "Road To MSI"(영) / "라운드 3-4 …"(한글)
--      순위표 탭이 "Rounds 1-2 · Road To MSI · 라운드 3-4 레전드 그룹" 처럼 뒤죽박죽 보인다.
--
--   ② 같은 스테이지가 대소문자로 갈려 두 개처럼 취급된다
--        matches.stage = "Road To MSI" 4경기 · "Road to MSI" 1경기
--      순위 반영 코드(assets/store.js)가 이름을 **정확히** 비교하는 자리가 있어서,
--      소문자 to 인 1경기는 스테이지를 못 찾는다.
--
--   ③ Road to MSI 5경기가 전부 "정규 라운드 3-4"(split3-2026) 대회에 들어가 있다
--      정작 lck2026-msi 대회에는 경기가 0개다. 그래서 경기 목록에서 대회로 걸러도
--      Road to MSI 가 나오지 않는다.
--      ⚠ Road to MSI 는 시즌 순위에 넣지 않는 별도 대회다(MSI 진출팀을 정하는 토너먼트).
--        대회만 옮기고 stage_records.in_total 은 false 그대로 둔다 — 순위 계산은 안 바뀐다.
--
-- 무엇을 하나:
--   이름을 한 규칙으로 맞추고, matches.stage 와 stage_records.name 을 **같은 트랜잭션에서**
--   함께 바꾼다. 둘 중 하나만 바꾸면 순위 반영이 통째로 끊긴다.
--   "Road to MSI" 는 LCK 공식 대회명이라 영문 그대로 두되, 대소문자만 하나로 맞춘다.
--
--   바뀌는 이름:
--     "Rounds 1-2"   →  "라운드 1-2"
--     "Road To MSI"  →  "Road to MSI"   (공식 표기)
--     "라운드 3-4 레전드 그룹" · "라운드 3-4 라이즈 그룹"  →  그대로 (이미 한글)
--
-- 실행: Supabase → SQL Editor 에 통째로 붙여넣고 Run.
--       맨 아래가 '스테이지 정리 OK' 면 성공.
-- 되돌리기: 이름을 원래대로 바꾸는 update 를 반대로 한 번 더 돌리면 된다.
-- ══════════════════════════════════════════════════════════════════

begin;

-- ── 1) 경기의 스테이지 이름 (먼저) ────────────────────────────
update matches set stage = '라운드 1-2'  where stage = 'Rounds 1-2';
update matches set stage = 'Road to MSI' where lower(btrim(stage)) = 'road to msi';

-- ── 2) 순위 스테이지 이름 (같은 값으로) ───────────────────────
update stage_records set name = '라운드 1-2'  where id = 'r12';
update stage_records set name = 'Road to MSI' where id = 'rtm';

-- ── 3) Road to MSI 경기를 제 대회로 ───────────────────────────
--     lck2026-msi 대회가 없으면 만들지 않는다 (있는 것으로 확인했다).
update matches
   set tid = 'lck2026-msi'
 where stage = 'Road to MSI'
   and exists (select 1 from tournaments where id = 'lck2026-msi');

-- ── 4) 그 대회의 라운드 목록을 채운다 (대진표 페이지가 쓴다) ──
update tournaments
   set stages = (select coalesce(jsonb_agg(distinct m.stage), '[]'::jsonb)
                   from matches m where m.tid = 'lck2026-msi')
 where id = 'lck2026-msi';

commit;

-- ── 확인 ──────────────────────────────────────────────────────
select case
    when not exists (select 1 from matches where stage = 'Rounds 1-2')
     and not exists (select 1 from matches where stage <> 'Road to MSI'
                                             and lower(btrim(stage)) = 'road to msi')
     and (select count(*) from matches where tid = 'lck2026-msi') = 5
     and not exists (select 1 from stage_records where name = 'Rounds 1-2' or name = 'Road To MSI')
     -- 모든 경기의 스테이지가 순위 스테이지 목록 안에 있어야 한다 (이름이 어긋나면 순위가 끊긴다)
     and not exists (
       select 1 from matches m
        where coalesce(m.stage,'') <> ''
          and not exists (select 1 from stage_records s where s.name = m.stage))
    then '스테이지 정리 OK'
    else '아직 안 맞음 — 아래 두 표를 비교해 보세요'
  end as "결과";

select stage as "경기 스테이지", count(*) as "경기수",
       (select string_agg(id, ',') from tournaments t
         where t.id in (select distinct tid from matches m2 where m2.stage = m.stage)) as "대회"
  from matches m group by stage order by stage;

select id, name, ord, in_total from stage_records order by ord;
