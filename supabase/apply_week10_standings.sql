-- ═══════════════════════════════════════════════════════
-- 10주차 실제 순위 반영 (op.gg 스크린샷 기준)
-- 누적 = Rounds 1-2 + 아래 R3-4 수치 → 스크린샷과 정확히 일치
-- ═══════════════════════════════════════════════════════

-- 자동 반영 준비 (이미 실행했어도 안전)
alter table matches add column if not exists counted boolean not null default false;
alter table stage_records add column if not exists in_total boolean not null default true;
update stage_records set in_total = false where id = 'rtm';

-- 이미 이 순위에 포함된 경기들은 "반영됨" 처리 (이중 계산 방지)
update matches set counted = true where id in ('m1','m2');

-- 라운드 3-4 레전드 그룹 (10주차 기준)
update stage_records set
  name = '라운드 3-4 레전드 그룹',
  records = '[
    {"team":"kt","w":2,"l":0,"sw":4,"sl":1},
    {"team":"dk","w":2,"l":0,"sw":4,"sl":1},
    {"team":"t1","w":1,"l":1,"sw":2,"sl":2},
    {"team":"hle","w":0,"l":2,"sw":2,"sl":4},
    {"team":"gen","w":0,"l":2,"sw":0,"sl":4}
  ]'::jsonb
where id = 'r34L';

-- 라운드 3-4 라이즈 그룹 (10주차 기준)
update stage_records set
  name = '라운드 3-4 라이즈 그룹',
  records = '[
    {"team":"ns","w":2,"l":0,"sw":4,"sl":1},
    {"team":"bfx","w":1,"l":1,"sw":3,"sl":2},
    {"team":"krx","w":1,"l":1,"sw":2,"sl":3},
    {"team":"dns","w":1,"l":1,"sw":2,"sl":3},
    {"team":"bro","w":0,"l":2,"sw":2,"sl":4}
  ]'::jsonb
where id = 'r34R';
