// Leaguepedia 저장 전송 계약 — node tests/leaguepedia-atomic-transport.test.js
// DB 없이도 한 경기당 원자 RPC 한 번, tid 전용 교정, fallback 부재를 고정한다.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const handler = require("../api/leaguepedia");
const {
  PERSIST_MATCH_RPC,
  buildPersistenceBundles,
  persistMatchBundles,
  shouldBlockIncompleteFallback,
} = handler.__test;

const source = fs.readFileSync(path.join(__dirname, "../api/leaguepedia.js"), "utf8");

(async () => {
  const transportPlayers = Array.from({ length: 10 }, (_, i) => ({
    pid: `p${i + 1}`,
    side: i < 5 ? "a" : "b",
  }));
  const newMatch = {
    id: "new-a", lp_id: "LP-new-a", tid: "tid-a", stage: "테스트",
    at: "2026-08-09T10:00:00Z", a: "t1", b: "gen", label: "",
    odds_a: 2, odds_b: 2, status: "done", score_a: 2, score_b: 0,
  };
  const details = [
    { match_id: "new-a", set_index: 0, win: "a", players: transportPlayers },
    { match_id: "new-a", set_index: 1, win: "a", players: transportPlayers },
    { match_id: "existing-b", set_index: 0, win: "a", players: transportPlayers },
  ];
  const tidFixes = [
    { id: "existing-b", tid: "tid-correct" },
    { id: "tid-only", tid: "tid-only-correct" },
  ];

  const plan = buildPersistenceBundles([newMatch], details, tidFixes);
  assert.deepStrictEqual(plan.map(x => x.matchId), ["new-a", "existing-b", "tid-only"]);
  assert.strictEqual(plan[0].match, newMatch, "신규 경기 행은 자기 상세 묶음에만 붙어야 함");
  assert.strictEqual(plan[1].details.length, 1, "기존 경기 상세도 경기별로 묶어야 함");
  assert.strictEqual(plan[1].tid, "tid-correct", "상세와 tid 교정은 같은 묶음이어야 함");
  assert.deepStrictEqual(plan[2].details, [], "tid 전용 교정은 빈 상세 묶음이어야 함");

  const calls = [];
  await persistMatchBundles(async (endpoint, init) => {
    calls.push({ endpoint, init, body: JSON.parse(init.body) });
    return { ok: true };
  }, [newMatch], details, tidFixes);

  assert.strictEqual(calls.length, 3, "한 경기당 정확히 RPC 한 번만 호출해야 함");
  assert(calls.every(x => x.endpoint === PERSIST_MATCH_RPC), "모든 저장은 원자 RPC만 사용해야 함");
  assert.deepStrictEqual(calls.map(x => x.body.p_match_id), ["new-a", "existing-b", "tid-only"]);
  assert.deepStrictEqual(calls.map(x => x.body.p_details.length), [2, 1, 0]);
  assert.strictEqual(calls[1].body.p_match, null, "기존 경기는 신규 행으로 덮지 않아야 함");
  assert.strictEqual(calls[1].body.p_tid, "tid-correct", "상세+tid를 한 RPC로 보내야 함");
  assert.strictEqual(calls[2].body.p_tid, "tid-only-correct", "tid 전용 교정도 RPC를 사용해야 함");

  let failedCalls = 0;
  await assert.rejects(
    () => persistMatchBundles(async endpoint => {
      failedCalls++;
      assert.strictEqual(endpoint, PERSIST_MATCH_RPC);
      throw new Error("RPC missing");
    }, [newMatch], details.slice(0, 2), []),
    /RPC missing/
  );
  assert.strictEqual(failedCalls, 1, "RPC 실패 뒤 직접 REST fallback을 시도하지 않아야 함");
  assert.throws(
    () => buildPersistenceBundles([newMatch], [], []),
    /상세가 없어/,
    "신규 경기 단독 저장 계획을 만들면 안 됨"
  );

  assert.strictEqual(shouldBlockIncompleteFallback(null, false), true,
    "페이지 미완료+기존 경기 없음은 신규 fallback을 차단해야 함");
  assert.strictEqual(shouldBlockIncompleteFallback({ id: "existing" }, false), false,
    "기존 경기는 페이지 미완료만으로 신규 fallback 취급하면 안 됨");
  const incompleteGuard = source.indexOf("if (shouldBlockIncompleteFallback(prev, doneOf[pg]))");
  const incompleteBlock = source.indexOf("blockedFallbackMatchIds.add(id)", incompleteGuard);
  const blockedUnion = source.indexOf("new Set([...blockedFallbackMatchIds", incompleteBlock);
  const pomGuard = source.indexOf("if (blockedNewMatchIds.has(id)) return", blockedUnion);
  assert(incompleteGuard >= 0 && incompleteBlock > incompleteGuard
    && blockedUnion > incompleteBlock && pomGuard > blockedUnion,
  "미완료 신규 fallback id가 상세와 POM 공용 차단 집합까지 이어져야 함");

  assert(!source.includes('sb("match_details?on_conflict=match_id,set_index"'),
    "match_details 직접 upsert 경로를 남기면 안 됨");
  assert(!source.includes('sb("matches?on_conflict=id"'),
    "부분 matches upsert(tid 교정 포함) 경로를 남기면 안 됨");

  console.log("✓ Leaguepedia 경기별 원자 RPC/대회 교정/미완료 POM 차단 전송 계약");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
