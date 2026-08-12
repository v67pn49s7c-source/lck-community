// 모의밴픽 엔진 — 순서와 피어리스가 정확해야 한다.
// 화면은 나중에 바꿔도 되지만 이 규칙이 틀리면 글에 잘못된 밴픽이 박힌다.
const assert = require("assert");
const d = require("../assets/draft.js");

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };

// ── ① 프로 대회 밴픽 순서 ────────────────────────────────
eq(d.DRAFT_STEPS.length, 20, "밴10 + 픽10 = 20단계");
eq(d.DRAFT_STEPS.slice(0, 6).map(s => s.side),
   ["blue", "red", "blue", "red", "blue", "red"], "1차 밴은 블루부터 번갈아");
eq(d.DRAFT_STEPS.slice(6, 12).map(s => s.side),
   ["blue", "red", "red", "blue", "blue", "red"], "1차 픽은 블루1 · 레드2 · 블루2 · 레드1");
eq(d.DRAFT_STEPS.slice(12, 16).map(s => s.side),
   ["red", "blue", "red", "blue"], "2차 밴은 레드부터");
eq(d.DRAFT_STEPS.slice(16).map(s => s.side),
   ["red", "blue", "blue", "red"], "2차 픽은 레드1 · 블루2 · 레드1");
eq(d.DRAFT_STEPS.filter(s => s.kind === "ban" && s.side === "blue").length, 5, "블루 밴 5개");
eq(d.DRAFT_STEPS.filter(s => s.kind === "pick" && s.side === "red").length, 5, "레드 픽 5개");

// ── ② 순서대로만 채워진다 ────────────────────────────────
const draft = d.draftEmpty("gen", "hle");
eq(d.draftNextStep(draft.sets[0]).kind, "ban", "처음은 밴");
eq(d.draftNextStep(draft.sets[0]).side, "blue", "처음은 블루 밴");
["아리", "야스오", "리신", "럭스", "베인", "쓰레쉬"].forEach(c => d.draftPlace(draft, 0, c));
eq(d.draftNextStep(draft.sets[0]).kind, "pick", "밴 6개 뒤에는 픽 차례");
eq(d.draftNextStep(draft.sets[0]).side, "blue", "1차 픽은 블루가 먼저");

// ── ③ 픽은 라인이 필요하고, 같은 라인을 두 번 못 쓴다 ────
ok(d.draftPlace(draft, 0, "제이스").error, "라인 없이 픽하면 거절");
ok(!d.draftPlace(draft, 0, "제이스", "탑").error, "라인을 주면 픽된다");
// 다음은 레드 픽 두 번
d.draftPlace(draft, 0, "오른", "탑");
ok(d.draftPlace(draft, 0, "말파이트", "탑").error, "레드가 탑을 또 고르면 거절");
ok(!d.draftPlace(draft, 0, "비에고", "정글").error, "다른 라인은 된다");

// ── ④ 같은 세트 중복 금지 ────────────────────────────────
ok(d.draftPlace(draft, 0, "아리", "미드").error, "이 세트에서 이미 밴된 챔피언은 못 고른다");
ok(d.draftPlace(draft, 0, "제이스", "미드").error, "이 세트에서 이미 픽된 챔피언도 못 고른다");

// ── ⑤ 피어리스 — 앞 세트에서 **픽된** 것만 잠긴다 ────────
const f = d.draftEmpty();
f.sets[0].picks.blue = [{ lane: "탑", champ: "제이스" }, { lane: "미드", champ: "아지르" }];
f.sets[0].bans.blue = ["아리", null, null, null, null];
f.sets.push(d.draftEmptySet());
const fear = d.draftFearlessBans(f, 1).sort();
eq(fear, ["아지르", "제이스"], "앞 세트 픽만 잠긴다 (밴은 아무도 안 썼으므로 풀린다)");
ok(!fear.includes("아리"), "앞 세트에서 밴만 된 챔피언은 다음 세트에 쓸 수 있어야 함");
eq(d.draftBlocked(f, 1)["제이스"], "fearless", "잠긴 이유가 피어리스로 나와야 함");
ok(d.draftPlace(f, 1, "제이스").error.includes("피어리스"), "피어리스 챔피언은 거절");
eq(d.draftFearlessBans(f, 0).length, 0, "1세트에는 피어리스 잠금이 없다");

// ── ⑥ 되돌리기 ──────────────────────────────────────────
const u = d.draftEmpty();
d.draftPlace(u, 0, "아리");
eq(u.sets[0].bans.blue[0], "아리", "밴이 들어갔다");
ok(d.draftUndo(u, 0), "되돌리기 성공");
eq(u.sets[0].bans.blue[0], null, "되돌리면 비워진다");
ok(!d.draftUndo(u, 0), "빈 상태에서는 되돌릴 게 없다");

// ── ⑦ 라인별 정리 (화면이 고정칸으로 그릴 때) ────────────
const byLane = d.draftPicksByLane(f.sets[0], "blue");
eq(byLane.map(x => x.lane), d.DRAFT_LANES, "라인 순서 고정 (탑·정글·미드·원딜·서폿)");
eq(byLane[0].champ, "제이스", "탑 자리에 제이스");
eq(byLane[1].champ, undefined, "안 고른 라인은 비어 있다");

// ── ⑧ 저장 전 검사 ──────────────────────────────────────
eq(d.draftValidate(d.draftEmpty()), null, "빈 판은 통과 (아직 만드는 중일 수 있다)");
const bad = d.draftEmpty();
bad.sets[0].bans.blue[0] = "아리";
bad.sets[0].picks.blue[0] = { lane: "미드", champ: "아리" };
ok(/두 번/.test(d.draftValidate(bad)), "같은 세트 중복은 저장 전에 걸러야 함");
const bad2 = d.draftEmpty();
bad2.sets[0].picks.blue[0] = { lane: "탑", champ: "제이스" };
bad2.sets.push(d.draftEmptySet());
bad2.sets[1].picks.red[0] = { lane: "탑", champ: "제이스" };
ok(/피어리스/.test(d.draftValidate(bad2)), "피어리스 위반은 저장 전에 걸러야 함");
const bad3 = d.draftEmpty();
bad3.sets = Array.from({ length: 6 }, () => d.draftEmptySet());
ok(/5개/.test(d.draftValidate(bad3)), "세트는 5개까지");

console.log(`\ndraft.test: ${n} 통과, 0 실패`);
