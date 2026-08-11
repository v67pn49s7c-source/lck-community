// 경우의 수 golden test — node tests/race.golden.test.js
//
// fixture: 2026-08-09 경기 전 실제 순위·잔여 대진·상대 전적 스냅샷.
// 기대값은 같은 날 엔진과 **따로 짠 기준 계산**(승패×세트마진 4^11 전수 + 규정집
// 2.7.2.2/2.8.5/2.8.6)을 두 그룹 419만 실현으로 대조해 불일치 0을 확인한 결과다.
// 이 테스트가 깨지면: 엔진이 후퇴했거나, 규칙을 바꾼 것이다. 바꿨다면 기준 계산부터.
const fs = require("fs"), path = require("path"), vm = require("vm");

// race.js 는 브라우저 전역 스크립트라 require 가 안 된다 — vm 으로 읽는다
const src = fs.readFileSync(path.join(__dirname, "../assets/race.js"), "utf8");
const winRate = r => (r.w + r.l) ? r.w / (r.w + r.l) : 0;
const ctx = {
  console,
  // store.js 의 standingsSort 와 같은 규칙 (승률 → 세트 득실 → id)
  standingsSort: (a, b) => winRate(b) - winRate(a) || b.pt - a.pt || String(a.team).localeCompare(String(b.team)),
};
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: "assets/race.js" });
const { raceCompute } = ctx;

// ── fixture: 레전드 그룹 (2026-08-09 아침, DK-KT 1차전 전) ──
const teams = ["t1", "hle", "gen", "kt", "dk"];
const base = {
  t1:  { w: 16, l: 6, sw: 21, sl: 0 },   // sw-sl = 세트 득실 +21
  hle: { w: 16, l: 6, sw: 19, sl: 0 },
  gen: { w: 16, l: 6, sw: 18, sl: 0 },
  kt:  { w: 15, l: 6, sw: 12, sl: 0 },
  dk:  { w: 13, l: 8, sw: 7,  sl: 0 },
};
const remain = [
  { id: "g0",  a: "dk",  b: "kt"  }, { id: "g1",  a: "kt",  b: "dk"  },
  { id: "g2",  a: "gen", b: "hle" }, { id: "g3",  a: "t1",  b: "dk"  },
  { id: "g4",  a: "hle", b: "kt"  }, { id: "g5",  a: "t1",  b: "gen" },
  { id: "g6",  a: "gen", b: "kt"  }, { id: "g7",  a: "dk",  b: "hle" },
  { id: "g8",  a: "kt",  b: "t1"  }, { id: "g9",  a: "dk",  b: "gen" },
  { id: "g10", a: "hle", b: "t1"  },
];
const cuts = [
  { k: 2, label: "2위 안", what: "플레이오프 2라운드 직행" },
  { k: 4, label: "4위 안", what: "플레이오프 직행" },
];
// 과거 맞대결 (라운드 1-2 + 3-4 치른 경기, 승자→패자 승수)
const H2H = { kt: { dk: 2, t1: 2, hle: 2, gen: 1 }, dk: { kt: 0, t1: 1, hle: 1, gen: 2 },
              t1: { kt: 1, dk: 2, hle: 1, gen: 2 }, hle: { kt: 1, dk: 2, t1: 2, gen: 1 },
              gen: { kt: 2, dk: 1, t1: 1, hle: 2 } };
const ti = {}; teams.forEach((t, i) => ti[t] = i);
const nt = teams.length;
const h2hPast = Array.from({ length: nt }, (_, i) =>
  Int32Array.from(teams.map(t => H2H[teams[i]][t] || 0)));
const pairA = Array.from({ length: nt }, () => new Int32Array(nt));
const pairB = Array.from({ length: nt }, () => new Int32Array(nt));
remain.forEach((m, g) => { pairA[ti[m.a]][ti[m.b]] |= 1 << g; pairB[ti[m.b]][ti[m.a]] |= 1 << g; });

const r = raceCompute(teams, base, remain, cuts, { h2hPast, pairA, pairB });

let pass = 0, failCnt = 0;
const eq = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; return; }
  failCnt++; console.error(`✗ ${name}\n   기대 ${JSON.stringify(want)} · 실제 ${JSON.stringify(got)}`);
};

eq("정확 모드로 계산됐다 (4^11 ≤ 상한)", r.exact, true);

// ── 독립 검증으로 확정한 사실들 (2026-08-09) ──
// ① DK 의 2위 안 — 오늘 경기(g0)를 못 박았을 때
eq("g0 DK 승 → DK 2위 안 = clean", r.stateAt(0, "a", "dk", 0), "clean");
eq("g0 KT 승 → DK 2위 안 = tie (세트득실로는 못 넘고 동률 절차만)", r.stateAt(0, "b", "dk", 0), "tie");
// ② T1 의 플레이오프 직행 확정 — 나무위키·기준 계산과 교차 확인된 유일한 lock 자리
eq("g3 T1 승 → T1 4위 안 = lock", r.stateAt(3, "a", "t1", 1), "lock");
eq("g8 T1 승 → T1 4위 안 = lock", r.stateAt(8, "b", "t1", 1), "lock");
// ③ HLE 는 같은 자리가 lock 이 아니다 (과대주장 회귀 감시 — 실제로 냈던 오류)
eq("g4 HLE 승 → HLE 4위 안 ≠ lock", r.stateAt(4, "a", "hle", 1) === "lock", false);
// ④ 단조성 표본: 당사자는 이겨서 나빠질 수 없다
const ORD = { dead: 0, tie: 1, clean: 2, lock: 3 };
remain.forEach((m, g) => cuts.forEach((c, ci) => [["a", m.a], ["b", m.b]].forEach(([side, t]) => {
  const o = side === "a" ? "b" : "a";
  if (ORD[r.stateAt(g, side, t, ci)] < ORD[r.stateAt(g, o, t, ci)]) {
    failCnt++; console.error(`✗ 단조성 위반: ${t} ${c.label} @${m.id}`);
  } else pass++;
})));

// ── 팀별 safe/hope/live 전량 고정 (기준 계산과 대조된 스냅샷) ──
const GOLD = {
  t1:  [{ safe: 4, hope: 2, live: 1 }, { safe: 2, hope: 0, live: 0 }],
  hle: [{ safe: 4, hope: 2, live: 1 }, { safe: 2, hope: 0, live: 0 }],
  gen: [{ safe: 4, hope: 2, live: 1 }, { safe: 2, hope: 0, live: 0 }],
  kt:  [{ safe: 5, hope: 3, live: 2 }, { safe: 3, hope: 1, live: 0 }],
  dk:  [{ safe: null, hope: 5, live: 4 }, { safe: 5, hope: 3, live: 2 }],
};
teams.forEach(t => {
  const row = r.rows.find(x => x.team === t);
  cuts.forEach((c, ci) => {
    const g = row.cuts[ci];
    eq(`${t} ${c.label} safe/hope/live`, { safe: g.safe, hope: g.hope, live: g.live }, GOLD[t][ci]);
  });
});

console.log(`\nrace.golden.test: ${pass} 통과, ${failCnt} 실패`);
process.exit(failCnt ? 1 : 0);
