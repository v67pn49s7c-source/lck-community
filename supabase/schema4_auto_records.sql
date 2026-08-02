-- 경기 결과 → 순위 자동 반영 지원
-- counted: 이 경기가 순위 전적에 이미 반영됐는지 표시 (이중 반영 방지)
alter table matches add column if not exists counted boolean not null default false;

-- 시드 경기 m1(DNS 2:1 BRO)은 이미 시드 전적에 포함돼 있으므로 반영됨 처리
update matches set counted = true where id = 'm1';

-- 순위 스테이지 이름을 경기 관리의 스테이지명과 일치시킴 (자동 매칭용)
update stage_records set name = '라운드 3-4 레전드 그룹' where id = 'r34L';
update stage_records set name = '라운드 3-4 라이즈 그룹' where id = 'r34R';
