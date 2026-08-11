// Leaguepedia 기존 경기 재수집 회귀 테스트 — node tests/leaguepedia-integrity.test.js
// 운영 DB나 외부 API 없이 팀 기준 변환과 오염 상세 차단을 확인한다.
const handler = require("../api/leaguepedia");
const {
  EXISTING_MATCH_SELECT,
  scoreboardWinner,
  resolveGameWinner,
  seriesCompletionProof,
  newFallbackCompletion,
  sideForTeam,
  detailRowForSave,
  filterSafeDetailRows,
  gateNewFinishedMatches,
} = handler.__test;

let pass = 0, failCnt = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; return; }
  failCnt++;
  console.error(`✗ ${name}\n   기대: ${JSON.stringify(want)}\n   실제: ${JSON.stringify(got)}`);
}
function truthy(name, got) {
  if (got) { pass++; return; }
  failCnt++;
  console.error(`✗ ${name}`);
}

function rawPlayers(a, b) {
  return [
    ...Array.from({ length: 5 }, (_, i) => ({
      pid: `${a}${i}`, team: a, champ: `A${i}`, spell: "", k: i, d: 0, a: 1,
      cs: 100, gold: 10, items: "", trinket: "", runes: "", pos: "", dmg: 1000, vs: 10, penta: 0,
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      pid: `${b}${i}`, team: b, champ: `B${i}`, spell: "", k: i, d: 1, a: 0,
      cs: 90, gold: 9, items: "", trinket: "", runes: "", pos: "", dmg: 900, vs: 9, penta: 0,
    })),
  ];
}

const teamMap = { "BNK FEARX": "bfx", "OKSavingsBank BRION": "bro" };
const rawSet = {
  n: 1,
  // Leaguepedia 첫 세트 블루팀(BRO)이 이겼지만, 저장 경기의 A팀은 BFX인 사례.
  winTeam: "bro",
  blueName: "OKSavingsBank BRION",
  players: rawPlayers("bfx", "bro"),
  stats: {
    len: "31:00", byTeam: {
      "BNK FEARX": { kills: 5 },
      "OKSavingsBank BRION": { kills: 12 },
    },
  },
};

// 사고 원인 자체를 고정한다. a/b가 다시 SELECT에서 빠지면 이 테스트가 바로 실패한다.
const selected = new Set(EXISTING_MATCH_SELECT.split(","));
truthy("기존 경기 조회에 a가 포함됨", selected.has("a"));
truthy("기존 경기 조회에 b가 포함됨", selected.has("b"));

// ScoreboardGames.Winner는 명시적인 1/2만 허용하고, WinTeam 및 PlayerWin과
// 하나의 승리팀으로 합의될 때만 사용한다. 모호하면 아래 상세 저장 게이트가 차단한다.
eq("Winner 1과 같은 WinTeam은 Team1로 확정",
  scoreboardWinner({ Team1: "BFX", Team2: "BRO", Winner: "1", WinTeam: "BFX" }),
  { team: "BFX", invalid: false });
eq("Winner 2와 같은 WinTeam은 Team2로 확정",
  scoreboardWinner({ Team1: "BFX", Team2: "BRO", Winner: "2", WinTeam: "BRO" }),
  { team: "BRO", invalid: false });
eq("Winner가 비었어도 일치하는 WinTeam 하나는 사용",
  scoreboardWinner({ Team1: "BFX", Team2: "BRO", Winner: "", WinTeam: "BFX" }),
  { team: "BFX", invalid: false });
eq("1/2가 아닌 Winner를 Team2로 추정하지 않음",
  scoreboardWinner({ Team1: "BFX", Team2: "BRO", Winner: "3", WinTeam: "BRO" }),
  { team: null, invalid: true });
eq("Winner와 WinTeam이 충돌하면 무효",
  scoreboardWinner({ Team1: "BFX", Team2: "BRO", Winner: "1", WinTeam: "BRO" }),
  { team: null, invalid: true });
eq("두 팀에 없는 WinTeam은 무효",
  scoreboardWinner({ Team1: "BFX", Team2: "BRO", Winner: "", WinTeam: "T1" }),
  { team: null, invalid: true });

const playerWinner = {
  BFX: { win: true },
  BRO: { win: false },
};
eq("PlayerWin 한 팀만 있으면 그 팀으로 확정",
  resolveGameWinner(playerWinner, null), "BFX");
eq("PlayerWin과 스코어보드가 같은 한 팀이면 확정",
  resolveGameWinner(playerWinner,
    { Team1: "BFX", Team2: "BRO", Winner: "1", WinTeam: "BFX" }), "BFX");
eq("PlayerWin과 스코어보드가 충돌하면 승리팀 없음",
  resolveGameWinner(playerWinner,
    { Team1: "BFX", Team2: "BRO", Winner: "2", WinTeam: "BRO" }), null);
eq("PlayerWin이 없어도 잘못된 Winner와 WinTeam 조합은 승리팀 없음",
  resolveGameWinner({ BFX: { win: false }, BRO: { win: false } },
    { Team1: "BFX", Team2: "BRO", Winner: "0", WinTeam: "BRO" }), null);
eq("PlayerWin이 양 팀 모두 승리라면 첫 팀을 고르지 않음",
  resolveGameWinner({ BFX: { win: true }, BRO: { win: true } },
    { Team1: "BFX", Team2: "BRO", Winner: "1", WinTeam: "BFX" }), null);
eq("어느 출처에도 승리팀이 없으면 확정하지 않음",
  resolveGameWinner({ BFX: { win: false }, BRO: { win: false } }, null), null);

const oneZeroBo3 = newFallbackCompletion(
  { scoreA: 1, scoreB: 0, aName: "BFX", bName: "BRO" },
  { BestOf: "3", Team1: "BFX", Team2: "BRO", Team1Score: "1", Team2Score: "0", Winner: "BFX" });
eq("실제 신규 fallback 생성 경로는 BO3 1:0을 done으로 만들지 않음", oneZeroBo3.matchState, null);
truthy("BO3 필요 승수 미달 이유를 남김", oneZeroBo3.reason.includes("필요 승수 2"));

eq("BO3 2:0은 필요 승수를 채워 신규 종료 행 생성",
  newFallbackCompletion(
    { scoreA: 2, scoreB: 0, aName: "BFX", bName: "BRO" },
    { BestOf: "3", Team1: "BFX", Team2: "BRO" }).matchState,
  { status: "done", score_a: 2, score_b: 0 });
eq("BO5 3:1도 필요 승수를 채워 신규 종료 행 생성",
  newFallbackCompletion(
    { scoreA: 3, scoreB: 1, aName: "BFX", bName: "BRO" },
    { BestOf: "5", Team1: "BRO", Team2: "BFX" }).matchState,
  { status: "done", score_a: 3, score_b: 1 });
eq("BO1은 1승이 시리즈 종료 증거",
  newFallbackCompletion(
    { scoreA: 1, scoreB: 0, aName: "BFX", bName: "BRO" },
    { BestOf: "1", Team1: "BFX", Team2: "BRO" }).matchState,
  { status: "done", score_a: 1, score_b: 0 });
eq("BestOf가 있어도 일정의 두 팀이 다른 경기면 종료로 믿지 않음",
  newFallbackCompletion(
    { scoreA: 2, scoreB: 0, aName: "BFX", bName: "BRO" },
    { BestOf: "3", Team1: "T1", Team2: "GEN" }).matchState,
  null);
eq("BestOf나 공식 최종 결과가 없으면 2:0도 추정 저장하지 않음",
  newFallbackCompletion(
    { scoreA: 2, scoreB: 0, aName: "BFX", bName: "BRO" }, null).matchState, null);

const reversedOfficialFinal = seriesCompletionProof(
  { scoreA: 2, scoreB: 1, aName: "BFX", bName: "BRO" },
  { Team1: "BRO", Team2: "BFX", Team1Score: "1", Team2Score: "2", Winner: "BFX" });
eq("BestOf 없는 옛 일정도 팀·스코어·승자가 역순까지 정확히 일치하면 종료 증명",
  reversedOfficialFinal.complete, true);
eq("BestOf 없는 일정의 최종 스코어가 다르면 종료로 추정하지 않음",
  seriesCompletionProof(
    { scoreA: 2, scoreB: 0, aName: "BFX", bName: "BRO" },
    { Team1: "BFX", Team2: "BRO", Team1Score: "2", Team2Score: "1", Winner: "BFX" }).complete,
  false);

eq("저장 경기 BFX(A)-BRO(B) 기준으로 BRO 승은 b",
  detailRowForSave("m8", rawSet, "bfx", "bro", teamMap).row.win, "b");
eq("선수 side도 저장 경기 기준 5:5",
  detailRowForSave("m8", rawSet, "bfx", "bro", teamMap).row.players
    .reduce((n, p) => { n[p.side]++; return n; }, { a: 0, b: 0 }),
  { a: 5, b: 5 });
eq("블루 진영도 저장 경기 기준 b로 변환",
  detailRowForSave("m8", rawSet, "bfx", "bro", teamMap).row.game.blue, "b");

// 저장 일정의 팀 순서가 반대면 같은 원본도 결과가 정확히 반대로 매핑돼야 한다.
const reversed = detailRowForSave("m-rev", rawSet, "bro", "bfx", teamMap);
eq("저장 경기 BRO(A)-BFX(B) 기준으로 BRO 승은 a", reversed.row.win, "a");
eq("팀을 증명할 수 없으면 B로 추정하지 않음", sideForTeam("t1", "bfx", "bro"), null);

const unknownWinner = detailRowForSave("m-bad", { ...rawSet, winTeam: "t1" }, "bfx", "bro", teamMap);
eq("경기 두 팀이 아닌 승리팀은 저장 차단", unknownWinner.row, null);
truthy("승리팀 연결 실패 이유를 남김",
  unknownWinner.violations.some(v => v.includes("승리팀")));

const partial = detailRowForSave("m-partial",
  { ...rawSet, players: rawSet.players.slice(0, 9) }, "bfx", "bro", teamMap);
eq("페이지 경계의 5:4 부분 명단은 저장 차단", partial.row, null);
truthy("5:5 위반 이유를 남김", partial.violations.some(v => v.includes("5:5")));

const unresolved = detailRowForSave("m-unresolved",
  { ...rawSet, players: rawSet.players.map((p, i) => i ? p : { ...p, pid: null }) },
  "bfx", "bro", teamMap);
eq("연결 안 된 선수가 섞인 세트는 저장 차단", unresolved.row, null);
truthy("선수 연결 누락 이유를 남김",
  unresolved.violations.some(v => v.includes("선수 연결 누락")));

const normalRows = [
  { match_id: "ok", set_index: 0, win: "b", players: [] },
  { match_id: "ok", set_index: 1, win: "b", players: [] },
];
const corruptRows = [
  { match_id: "bad", set_index: 0, win: "a", players: [] },
  { match_id: "bad", set_index: 1, win: "a", players: [] },
];
const filtered = filterSafeDetailRows(new Map([
  ["ok", { status: "done", score_a: 0, score_b: 2 }],
  ["bad", { status: "done", score_a: 0, score_b: 2 }],
]), [...normalRows, ...corruptRows]);
eq("정상 경기 상세는 그대로 저장 대상", filtered.rows, normalRows);
eq("m8형 모순 경기 전체를 격리", filtered.blocked, ["bad"]);
truthy("격리 이유에 세트 승수 모순이 있음",
  filtered.violations[0].messages.some(v => v.includes("세트 승")));

const donePartial = filterSafeDetailRows(new Map([
  ["partial-done", { status: "done", score_a: 0, score_b: 2 }],
]), [{ match_id: "partial-done", set_index: 0, win: "b", players: [] }]);
eq("종료 경기 일부 세트만 온 요청은 기존 상세와 섞지 않고 차단", donePartial.rows, []);
truthy("종료 경기 완전집합 누락 이유를 남김",
  donePartial.violations[0].messages.some(v => v.includes("완전집합")));

const livePartialRows = [{ match_id: "partial-live", set_index: 0, win: "b", players: [] }];
const livePartial = filterSafeDetailRows(new Map([
  ["partial-live", { status: "live", score_a: 0, score_b: 1 }],
]), livePartialRows);
eq("진행 중 경기는 정상적인 부분 세트 저장을 유지", livePartial.rows, livePartialRows);

const validNewDoneRows = [
  { match_id: "new-ok", set_index: 0, win: "b", players: [] },
  { match_id: "new-ok", set_index: 1, win: "b", players: [] },
];
const validNewDone = gateNewFinishedMatches([
  { id: "new-ok", status: "done", score_a: 0, score_b: 2 },
], validNewDoneRows, [], []);
eq("신규 종료 경기는 스코어와 전 세트가 완전히 맞으면 경기 행 저장",
  validNewDone.matchRows.map(r => r.id), ["new-ok"]);
eq("정상 신규 종료 경기의 상세도 함께 저장", validNewDone.detailRows, validNewDoneRows);

const allInvalidNewDone = gateNewFinishedMatches([
  { id: "new-all-bad", status: "done", score_a: 0, score_b: 2 },
], [], ["new-all-bad"], []);
eq("전 세트 변환 실패 신규 종료 경기는 경기 행도 격리", allInvalidNewDone.matchRows, []);
eq("전 세트 변환 실패 신규 종료 경기는 상세도 없음", allInvalidNewDone.detailRows, []);
eq("전 세트 변환 실패 경기 id를 보고", allInvalidNewDone.blocked, ["new-all-bad"]);

const acceptedBeforePartialFailure = [
  { match_id: "new-partial-bad", set_index: 0, win: "b", players: [] },
];
const partialInvalidNewDone = gateNewFinishedMatches([
  // 실패한 세트의 승리팀은 스코어에도 더해지지 않아 1:0과 한 행만 보면 정상처럼 보인다.
  { id: "new-partial-bad", status: "done", score_a: 0, score_b: 1 },
], acceptedBeforePartialFailure, ["new-partial-bad"], []);
eq("일부 세트만 통과한 신규 종료 경기는 경기 행 격리", partialInvalidNewDone.matchRows, []);
eq("일부 통과 상세도 경기 행과 함께 격리", partialInvalidNewDone.detailRows, []);
truthy("겉보기 스코어가 맞아도 세트 변환 실패 이유를 남김",
  partialInvalidNewDone.violations[0].messages.some(v => v.includes("변환")));

const incompleteNewDone = gateNewFinishedMatches([
  { id: "new-incomplete", status: "done", score_a: 0, score_b: 2 },
], [{ match_id: "new-incomplete", set_index: 0, win: "b", players: [] }], [], []);
eq("빌드 실패 표시가 없어도 종료 경기 전 세트가 없으면 경기 행 격리",
  incompleteNewDone.matchRows, []);
eq("불완전한 신규 종료 경기 상세도 함께 격리", incompleteNewDone.detailRows, []);
truthy("신규 종료 경기 완전집합 누락 이유를 남김",
  incompleteNewDone.violations[0].messages.some(v => v.includes("완전집합")));

const filteredNewDone = gateNewFinishedMatches([
  { id: "new-filter-bad", status: "done", score_a: 1, score_b: 0 },
], [{ match_id: "new-filter-bad", set_index: 0, win: "a", players: [] }],
[], ["new-filter-bad"]);
eq("최종 정합성 검사 실패 신규 종료 경기 역시 격리", filteredNewDone.matchRows, []);
eq("최종 정합성 검사 실패 상세도 함께 격리", filteredNewDone.detailRows, []);

const liveNewRows = [{ match_id: "new-live", set_index: 0, win: "a", players: [] }];
const liveAndExisting = gateNewFinishedMatches([
  { id: "new-live", status: "live", score_a: 1, score_b: 0 },
], [...liveNewRows, { match_id: "existing", set_index: 0, win: "b", players: [] }],
["new-live", "existing"], ["new-live", "existing"]);
eq("진행 중 신규 경기 행은 종료 경기 격리 규칙의 영향을 받지 않음",
  liveAndExisting.matchRows.map(r => r.id), ["new-live"]);
eq("진행 중·기존 경기 상세 동작도 그대로 유지", liveAndExisting.detailRows.map(r => r.match_id),
  ["new-live", "existing"]);

console.log(`\nleaguepedia-integrity.test: ${pass} 통과, ${failCnt} 실패`);
process.exit(failCnt ? 1 : 0);
