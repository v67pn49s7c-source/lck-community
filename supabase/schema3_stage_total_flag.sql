-- 스테이지별 "종합 순위 합산 여부" 플래그 추가
-- Road To MSI는 리그 순위에 미합산 처리
alter table stage_records add column if not exists in_total boolean not null default true;
update stage_records set in_total = false where id = 'rtm';
