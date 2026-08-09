-- ═══════════════════════════════════════════════════════════════════
-- P0 정리 SQL — ⚠ 자동 실행 금지. 사람이 감사 결과를 보고 한 줄씩 결정.
--
-- audit_p0_read_only.sql 의 결과를 먼저 보고, 삭제·수정 대상 id 를
-- 아래 틀에 직접 넣어 실행하세요. 이 파일은 그대로 돌리면 아무것도
-- 하지 않습니다 (대상 id 가 '없음' 이라 매칭되는 행이 없습니다).
-- ═══════════════════════════════════════════════════════════════════

-- ── 감사 ① 대응: 비공식 계정 글의 경기 연결만 해제 (글은 남긴다) ──
-- update posts set match_id = null
--  where id in ('없음' /* ← 감사 ① 에서 나온 글 id 로 교체 */)
--    and (author_id is null
--         or not exists (select 1 from profiles pr where pr.id = posts.author_id and pr.is_admin));

-- ── 감사 ③ 대응: 공식 흉내 투표의 경기 연결 해제 (투표는 글 안에 남는다) ──
-- update polls set match_id = null
--  where id in ('없음' /* ← 감사 ③ 에서 나온 투표 id 로 교체 */)
--    and phase is null;

-- ── 감사 ④ 대응: 부모 글이 사라진 고아 투표 삭제 ──
-- delete from polls
--  where id in ('없음' /* ← 감사 ④ 에서 나온 투표 id 로 교체 */)
--    and phase is null and match_id is null
--    and not exists (select 1 from posts p where p.id = polls.post_id);

-- ── 감사 ② 대응: 중복 토론방 중 남길 글 하나를 정하고 나머지 연결 해제 ──
-- update posts set match_id = null, is_official = false
--  where id in ('없음' /* ← 버릴 글 id */);
