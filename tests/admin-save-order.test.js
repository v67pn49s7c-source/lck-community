const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const storeSource = fs.readFileSync(path.join(root, "assets/store.js"), "utf8");
const adminSource = fs.readFileSync(path.join(root, "admin.html"), "utf8");

// 브라우저 전체를 띄우지 않고 updateMatch 함수만 떼어, 성공·서버 오류·통신 예외를 검증한다.
const updateStart = storeSource.indexOf("function updateMatch(id, patch)");
const updateEnd = storeSource.indexOf("\nfunction deleteMatch", updateStart);
assert(updateStart >= 0 && updateEnd > updateStart, "updateMatch 함수를 찾을 수 없음");

let responseMode = "success";
let lastWrite = null;
const shownErrors = [];
const context = {
  Cache: { matches: [{ id: "m1", status: "upcoming", scoreA: null, scoreB: null }] },
  matchToDb: patch => ({ ...patch }),
  sbWriteFail: error => {
    if (error) shownErrors.push(error.message);
    return !!error;
  },
  sb: {
    from(table) {
      assert.strictEqual(table, "matches");
      return {
        update(patch) {
          lastWrite = patch;
          const builder = {
            eq(column, id) {
              assert.strictEqual(column, "id");
              assert.strictEqual(id, "m1");
              return builder;
            },
            select(columns) {
              assert.strictEqual(columns, "id");
              return builder;
            },
            single() {
              if (responseMode === "reject") return Promise.reject(new Error("network down"));
              if (responseMode === "error") return Promise.resolve({ data: null, error: { message: "denied" } });
              return Promise.resolve({ data: { id: "m1" }, error: null });
            },
          };
          return builder;
        },
      };
    },
  },
};
vm.createContext(context);
vm.runInContext(storeSource.slice(updateStart, updateEnd), context);

(async () => {
  const pending = context.updateMatch("m1", { status: "live" });
  assert(pending && typeof pending.then === "function", "updateMatch가 저장 Promise를 반환해야 함");
  assert.strictEqual(context.Cache.matches[0].status, "live", "저장 대기 중에는 낙관적 값을 보여야 함");
  const success = await pending;
  assert.strictEqual(success.error, null, "Supabase 성공 결과를 호출자에게 반환해야 함");
  assert.deepStrictEqual(lastWrite, { status: "live" });

  responseMode = "error";
  const denied = await context.updateMatch("m1", { status: "done", scoreA: 2, scoreB: 0 });
  assert(denied.error, "Supabase 오류 결과를 호출자에게 반환해야 함");
  assert.strictEqual(context.Cache.matches[0].status, "live", "서버 오류면 화면 캐시를 원래대로 복구해야 함");

  responseMode = "reject";
  await assert.rejects(() => context.updateMatch("m1", { scoreA: 3 }), /network down/);
  assert.strictEqual(context.Cache.matches[0].scoreA, null, "통신 예외면 화면 캐시를 원래대로 복구해야 함");
  assert.deepStrictEqual(shownErrors, ["denied", "network down"]);

  // 한 경기 행의 저장/순위 반영/삭제는 같은 잠금을 공유해야 한다.
  const guardStart = adminSource.indexOf("function createRowActionGuard(buttons)");
  const guardEnd = adminSource.indexOf("\n\n    function renderMatchList", guardStart);
  assert(guardStart >= 0 && guardEnd > guardStart, "경기 행 공용 잠금 함수를 찾을 수 없음");
  const guardContext = {};
  vm.createContext(guardContext);
  vm.runInContext(adminSource.slice(guardStart, guardEnd), guardContext);

  const saveControl = { disabled: false };
  const applyControl = { disabled: false };
  const deleteControl = { disabled: false };
  const controls = [saveControl, applyControl, deleteControl];
  const allDisabled = () => controls.every(control => control.disabled);
  const allEnabled = () => controls.every(control => !control.disabled);
  const runRowAction = guardContext.createRowActionGuard(controls);
  const calls = [];

  let releaseSave;
  const saveGate = new Promise(resolve => { releaseSave = resolve; });
  const savePending = runRowAction(async () => {
    calls.push("save:start");
    await saveGate;
    calls.push("save:end");
  });
  assert(allDisabled(), "저장 중에는 세 버튼을 모두 잠가야 함");
  const applyWhileSaving = await runRowAction(async () => { calls.push("apply:overlap"); });
  assert.strictEqual(applyWhileSaving, false, "저장 중 순위 반영은 시작하지 않아야 함");
  const deleteWhileSaving = await runRowAction(async () => { calls.push("delete:overlap"); });
  assert.strictEqual(deleteWhileSaving, false, "저장 중 삭제는 시작하지 않아야 함");
  releaseSave();
  await savePending;
  assert.deepStrictEqual(calls, ["save:start", "save:end"]);
  assert(allEnabled(), "저장 완료 뒤 세 버튼을 복구해야 함");

  let releaseApply;
  const applyGate = new Promise(resolve => { releaseApply = resolve; });
  const applyPending = runRowAction(async () => {
    calls.push("apply:start");
    await applyGate;
    calls.push("apply:end");
  });
  assert(allDisabled(), "순위 반영 중에도 세 버튼을 모두 잠가야 함");
  const saveWhileApplying = await runRowAction(async () => { calls.push("save:overlap"); });
  assert.strictEqual(saveWhileApplying, false, "순위 반영 중 저장은 시작하지 않아야 함");
  const deleteWhileApplying = await runRowAction(async () => { calls.push("delete:overlap"); });
  assert.strictEqual(deleteWhileApplying, false, "순위 반영 중 삭제는 시작하지 않아야 함");
  releaseApply();
  await applyPending;
  assert.deepStrictEqual(calls, ["save:start", "save:end", "apply:start", "apply:end"]);
  assert(allEnabled(), "순위 반영 완료 뒤 세 버튼을 복구해야 함");

  let releaseDelete;
  const deleteGate = new Promise(resolve => { releaseDelete = resolve; });
  const deletePending = runRowAction(async () => {
    calls.push("delete:start");
    await deleteGate;
    calls.push("delete:end");
  });
  assert(allDisabled(), "삭제 중에도 세 버튼을 모두 잠가야 함");
  const saveWhileDeleting = await runRowAction(async () => { calls.push("save:overlap"); });
  assert.strictEqual(saveWhileDeleting, false, "삭제 중 저장은 시작하지 않아야 함");
  const applyWhileDeleting = await runRowAction(async () => { calls.push("apply:overlap"); });
  assert.strictEqual(applyWhileDeleting, false, "삭제 중 순위 반영은 시작하지 않아야 함");
  releaseDelete();
  await deletePending;
  assert.deepStrictEqual(calls, [
    "save:start", "save:end", "apply:start", "apply:end", "delete:start", "delete:end",
  ]);
  assert(allEnabled(), "삭제 완료 뒤 세 버튼을 복구해야 함");

  await assert.rejects(
    () => runRowAction(async () => { throw new Error("apply failed"); }),
    /apply failed/
  );
  assert(allEnabled(), "작업 실패 뒤에도 세 버튼을 복구해야 함");

  // 관리자 저장 버튼은 경기 저장을 await하고, 실패를 중단한 뒤에만 순위 반영을 호출해야 한다.
  const saveStart = adminSource.indexOf('saveBtn.addEventListener("click"');
  const saveEnd = adminSource.indexOf('applyBtn?.addEventListener("click"', saveStart);
  assert(saveStart >= 0 && saveEnd > saveStart, "관리자 경기 저장 핸들러를 찾을 수 없음");
  const saveBlock = adminSource.slice(saveStart, saveEnd);
  assert(saveBlock.includes("runRowAction(async"), "저장 핸들러가 경기 행 공용 잠금을 사용해야 함");
  assert.strictEqual((saveBlock.match(/updateMatch\(/g) || []).length, 1, "경기 저장 호출은 한 번이어야 함");
  const awaitSave = saveBlock.indexOf("await updateMatch(");
  const stopOnError = saveBlock.indexOf("if (!saved || saved.error)");
  const applyRecords = saveBlock.indexOf("await applyMatchToRecords(");
  assert(awaitSave >= 0, "updateMatch 저장 결과를 await해야 함");
  assert(stopOnError > awaitSave, "저장 결과를 확인해야 함");
  assert(applyRecords > stopOnError, "서버 저장 성공을 확인한 뒤에만 순위 반영해야 함");
  const errorGate = saveBlock.slice(stopOnError, applyRecords);
  assert(/\breturn\s*;/.test(errorGate),
    "저장 실패 분기는 순위 반영 전에 반드시 return 해야 함");

  const applyStart = saveEnd;
  const applyEnd = adminSource.indexOf('delBtn.addEventListener("click"', applyStart);
  assert(applyEnd > applyStart, "관리자 순위 반영 핸들러를 찾을 수 없음");
  const applyBlock = adminSource.slice(applyStart, applyEnd);
  assert(applyBlock.includes("runRowAction(async"), "순위 반영 핸들러도 같은 경기 행 잠금을 사용해야 함");

  const deleteStart = applyEnd;
  const deleteEnd = adminSource.indexOf("\n      });\n    }", deleteStart);
  assert(deleteEnd > deleteStart, "관리자 경기 삭제 핸들러를 찾을 수 없음");
  const deleteBlock = adminSource.slice(deleteStart, deleteEnd);
  assert(deleteBlock.includes("runRowAction(async"), "삭제 핸들러도 같은 경기 행 잠금을 사용해야 함");
  assert(
    adminSource.includes("createRowActionGuard([saveBtn, applyBtn, delBtn])"),
    "저장/순위 반영/삭제 버튼이 하나의 경기 행 잠금을 공유해야 함"
  );

  console.log("✓ 관리자 경기 저장 순서/롤백/3버튼 행 잠금 회귀 테스트");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
