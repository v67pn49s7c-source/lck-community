// ── 종료 경기 데이터 정합성 검사 (P0-2) ─────────────────────────────
//
// 왜 필요한가 — 운영에서 실제로 이런 데이터가 발견됐다 (2026-08-09):
//   /match/m8 최종 결과는 BFX 0:2 BRO 인데, 두 세트가 모두 win='a'(BFX) 로
//   저장돼 화면에 "BFX 세트 승" 배지가 떴다. 수집·저장 어느 단계에서 진영이
//   뒤집혀도 그대로 공개되는 구조였다.
//
// 이 파일은 **판정만** 한다 — 고치지 않는다. 세 곳이 같이 쓴다:
//   ① 수집 직후 (api/leaguepedia.js — Node)     → 경고 목록에 올린다
//   ② 공개 렌더 전 (live.html — 브라우저)        → 세트 승 배지를 숨긴다
//   ③ 회귀 테스트 (tests/invariants.test.js)     → m8 모순이 fixture 로 박제
//
// 브라우저에서는 <script> 로, Node 에서는 require 로 읽힌다.

/** 종료 경기 하나의 위반 목록. 빈 배열 = 정상.
 *  match: { status, scoreA, scoreB, a, b } (scoreA/scoreB 는 score_a/score_b 도 허용)
 *  sets:  [{ win: 'a'|'b', players?: [...] }]  — 없으면 세트 관련 검사는 건너뛴다 */
function finishedMatchViolations(match, sets) {
  const v = [];
  if (!match || match.status !== "done") return v;
  const sa = match.scoreA ?? match.score_a, sb = match.scoreB ?? match.score_b;

  if (sa == null || sb == null) { v.push("종료 경기인데 스코어가 비어 있음"); return v; }
  if (sa === sb) v.push(`종료 경기가 동점 (${sa}:${sb})`);

  if (!Array.isArray(sets) || !sets.length) return v;   // 세트 기록이 아직 없으면 여기까지

  const total = sa + sb;
  let winA = 0, winB = 0;
  const seen = new Set();
  sets.forEach((s, i) => {
    if (s.win === "a") winA++;
    else if (s.win === "b") winB++;
    else v.push(`${(s._idx ?? i) + 1}세트 승자가 a/b 가 아님 (${JSON.stringify(s.win)})`);
    // ⚠ 세트 번호까지 본다. 개수만 세면 2:0 인데 _idx 가 0·2 인 유령 세트가
    //   개수(2)만 맞아 "전 세트 수집"으로 통과한다. 번호가 스코어 범위를 벗어나거나
    //   겹치면 그것도 손상이다. (_idx 없으면 배열 위치로 폴백 — 옛 fixture 호환)
    const n = s._idx ?? i;
    if (n >= total) v.push(`${n + 1}세트는 최종 스코어 ${sa}:${sb} 상 존재할 수 없음`);
    if (seen.has(n)) v.push(`${n + 1}세트가 중복 저장됨`);
    seen.add(n);
  });
  // 세트가 일부만 수집됐을 수 있으므로 "많다"만 잡는다. (적은 건 수집 중일 수 있다)
  if (winA > sa) v.push(`A팀 세트 승 ${winA}개가 최종 스코어 ${sa}보다 많음`);
  if (winB > sb) v.push(`B팀 세트 승 ${winB}개가 최종 스코어 ${sb}보다 많음`);
  // 0..total-1 번호가 전부 모였을 때만 "전 세트 수집"으로 보고 정확히 대조한다.
  // (개수만 맞고 번호가 빠진 경우는 아직 수집 중으로 간주 — 오탐 방지)
  const complete = sets.length >= total && Array.from({ length: total }, (_, k) => k).every(k => seen.has(k));
  if (complete) {
    if (winA !== sa) v.push(`전 세트 수집 완료인데 A팀 세트 승 ${winA} ≠ 스코어 ${sa}`);
    if (winB !== sb) v.push(`전 세트 수집 완료인데 B팀 세트 승 ${winB} ≠ 스코어 ${sb}`);
  }
  return v;
}

/** POM 투표 후보 검사 — 승리팀의 실제 출전 선수만 후보여야 한다.
 *  poll:      { options: ["Nick (ABBR 포지션)", ...] }
 *  winnerAbbr: 승리팀 약칭 ("HLE")
 *  playedNicks: 실제 출전 선수 닉 집합 (Set). 비어 있으면(기록 미수집) 팀 검사만 한다. */
function pomPollViolations(poll, winnerAbbr, playedNicks) {
  const v = [];
  if (!poll || !Array.isArray(poll.options)) return v;
  poll.options.forEach(opt => {
    const m = /^(.+?) \((\S+) /.exec(opt);        // "Zeus (HLE 탑)" → 닉, 팀
    if (!m) { v.push(`후보 형식이 이상함: ${opt}`); return; }
    const [, nick, abbr] = m;
    if (winnerAbbr && abbr !== winnerAbbr) v.push(`후보 ${nick} 이(가) 승리팀(${winnerAbbr}) 소속이 아님 (${abbr})`);
    if (playedNicks && playedNicks.size && !playedNicks.has(nick)) v.push(`후보 ${nick} 이(가) 실제 출전 명단에 없음`);
  });
  return v;
}

// ── 일정·결과 공개 전 신뢰 게이트 ────────────────────────────────
// 화면마다 각자 "끝난 경기인가"를 추측하면 한쪽은 결과, 다른 쪽은 예정으로
// 말하는 사고가 생긴다. 여기서는 자동 수정하지 않고, 공개해도 되는지 한 번만 판정한다.
function scheduleMatchViolations(match) {
  const v = [];
  if (!match) return ["경기 자료가 비어 있음"];
  const status = String(match.status || "");
  const sa = match.scoreA ?? match.score_a;
  const sb = match.scoreB ?? match.score_b;
  const a = sa == null || sa === "" ? null : Number(sa);
  const b = sb == null || sb === "" ? null : Number(sb);
  if (!["upcoming", "live", "done"].includes(status)) v.push(`알 수 없는 경기 상태 (${status || "없음"})`);
  if ((a != null && !Number.isFinite(a)) || (b != null && !Number.isFinite(b))) {
    v.push("스코어가 숫자가 아님");
    return v;
  }
  if (status === "upcoming" && ((a || 0) + (b || 0) > 0)) {
    v.push(`예정 경기인데 스코어가 있음 (${a || 0}:${b || 0})`);
  }
  if (status === "done") v.push(...finishedMatchViolations(match, []));
  return v;
}

/** 마지막 수집 성공과 공개 경기 상태를 함께 본다.
 *  scheduleState: site_settings.schedule_sync JSON 또는 파싱된 객체
 *  level: ok | warn | blocked. blocked이면 확정·무산 같은 단정형 콘텐츠를 숨긴다. */
function dataTrustSummary(matches, scheduleState, now) {
  const clock = Number(now) || Date.now();
  let state = scheduleState || {};
  if (typeof state === "string") {
    try { state = JSON.parse(state || "{}"); } catch { state = {}; }
  }
  const list = Array.isArray(matches) ? matches : [];
  const violations = [];
  list.forEach(m => {
    const problems = scheduleMatchViolations(m);
    if (problems.length) violations.push({ id: m.id || "", problems });
  });

  // 옛 저장본에는 ok_at이 없다. 첫 배포 직후에는 at을 성공 시각으로 한 번만 인정한다.
  const updatedAt = Number(state.ok_at || state.at || 0) || 0;
  const ageMs = updatedAt ? Math.max(0, clock - updatedAt) : null;
  const nearGame = list.some(m => {
    if (m.status === "done" || !m.at) return false;
    const delta = clock - Date.parse(m.at);
    return Number.isFinite(delta) && delta >= -2 * 3600e3 && delta <= 10 * 3600e3;
  });
  const staleAfter = nearGame ? 35 * 60000 : 6 * 3600e3;
  const issues = [];
  if (!updatedAt) issues.push("마지막 일정 수집 성공 시각이 없음");
  else if (ageMs > staleAfter) issues.push("일정 수집이 평소보다 늦음");
  if (/오래된 저장분/.test(String(state.source || ""))) issues.push("외부 원본 대신 저장분을 사용함");
  if (Number(state.failed_at || 0) > 0 && Number(state.failed_at) >= updatedAt) {
    issues.push("마지막 자동 수집이 실패함");
  }

  return {
    level: violations.length ? "blocked" : issues.length ? "warn" : "ok",
    updatedAt, ageMs, staleAfter, source: String(state.source || ""), issues, violations,
  };
}

// Node(수집 API·테스트)에서도 같은 판정을 쓴다
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    finishedMatchViolations, pomPollViolations,
    scheduleMatchViolations, dataTrustSummary,
  };
}
