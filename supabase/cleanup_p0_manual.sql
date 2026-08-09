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


-- ═══════════════════════════════════════════════════════════════════
-- ★ 승격 (삭제 아님) — 브라우저 프리뷰(2026-08-09)에서 확인된 실제 상황
--
-- 감사 ①에 뜨는 "author_id 없는 경기 연결 글"은 **악의적 오염이 아니라**,
-- 초기에 author_id 없이 저장된 관리자 시드 글(m1~m8, 닉='운영자')이다.
-- schema23 백필은 author_id 가 관리자인 글만 official 로 켜므로 이 8개는 누락되고,
-- 그러면 배포 후 matchTalkPost(official 만 신뢰)가 그 경기방을 숨긴다
-- (m7 의 댓글 1개 등 실제 대화가 사라진다). 그래서 **지우지 말고 승격**한다.
--
-- ⚠ 반드시 audit ⑤(정책)로 이 글들이 정말 관리자 시드인지 눈으로 확인한 뒤 실행.
--   nick='운영자' 는 관리자 표식이지만(비회원은 anon_nick 강제), 과거 데이터라
--   아래 조건에 경기 id 를 명시해 **원하는 것만** 켜는 것을 권장한다.
-- ═══════════════════════════════════════════════════════════════════

-- (A) 시드 관리자 토론방을 공식으로 승격 — 경기 id 를 직접 나열해 안전하게.
--     audit ① 결과에서 '비회원(author_id null) + [경기 토론] + 닉 운영자' 인 글의
--     match_id 를 넣으세요. (프리뷰 기준: m1 m2 m3 m4 m5 m6 m7 m8)
-- update posts set is_official = true
--  where title like '[경기 토론]%'
--    and match_id in ('m1','m2','m3','m4','m5','m6','m7','m8')  /* ← 확인 후 조정 */
--    and nick = '운영자';

-- (B) 중복 토론방(감사 ②) 정리 — 댓글이 있거나 더 오래된 글 하나만 남기고
--     나머지는 is_official=false 로 두면 유니크 인덱스(schema23)를 통과한다.
--     ⚠ (A)로 두 글 다 official=true 가 되면 인덱스가 충돌하므로, 중복 경기는
--     (A)에서 빼고 여기서 하나만 골라 켜세요.
-- update posts set is_official = true  where id = '남길_글_id';
-- update posts set is_official = false where id = '버릴_글_id';

-- 승격 후 확인:
-- select match_id, count(*) filter (where is_official) as 공식,
--        count(*) as 전체
--   from posts where match_id is not null and title like '[경기 토론]%'
--  group by match_id having count(*) filter (where is_official) <> 1
--  order by match_id;   -- ← 결과가 비어야 정상 (경기당 공식 정확히 1개)
