// P0-2 회귀 테스트 — node tests/invariants.test.js
// 실제 사고(m8)를 fixture 로 박제한다. 이 테스트가 깨지면 정합성 검사가 무너진 것이다.
const { finishedMatchViolations, pomPollViolations } = require("../assets/invariants");

let pass = 0, failCnt = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; return; }
  failCnt++;
  console.error(`✗ ${name}\n   기대: ${JSON.stringify(want)}\n   실제: ${JSON.stringify(got)}`);
}
function truthy(name, got) {
  if (got) { pass++; return; }
  failCnt++; console.error(`✗ ${name} — 위반을 잡아야 하는데 못 잡음`);
}
function empty(name, got) {
  if (Array.isArray(got) && !got.length) { pass++; return; }
  failCnt++; console.error(`✗ ${name} — 정상 데이터를 위반으로 판정: ${JSON.stringify(got)}`);
}

// ── ① 실제 사고 재현: m8 = BFX 0:2 BRO, 두 세트 모두 a(BFX) 승 ──
truthy("m8 모순(0:2 인데 세트 2개가 a 승)을 잡는다",
  finishedMatchViolations({ status: "done", score_a: 0, score_b: 2 },
    [{ win: "a", _idx: 0 }, { win: "a", _idx: 1 }]).length >= 2);

// ── ② 정상 경기: 2:1, 세트 a·b·a ──
empty("정상 2:1 경기",
  finishedMatchViolations({ status: "done", score_a: 2, score_b: 1 },
    [{ win: "a" }, { win: "b" }, { win: "a" }]));

// ── ③ scoreA/scoreB 표기(브라우저 캐시 모양)도 같은 판정 ──
truthy("scoreA/scoreB 표기로도 잡는다",
  finishedMatchViolations({ status: "done", scoreA: 0, scoreB: 2 },
    [{ win: "a" }, { win: "a" }]).length >= 2);

// ── ④ 세트 일부만 수집: 2:0 인데 1세트만 저장 — 위반 아님 ──
empty("일부 수집(2:0, 세트 1개)은 통과",
  finishedMatchViolations({ status: "done", score_a: 2, score_b: 0 }, [{ win: "a" }]));

// ── ⑤ 일부 수집이라도 승수가 스코어를 넘으면 위반 ──
truthy("일부 수집이어도 b 승 2개 > score_b 1 이면 잡는다",
  finishedMatchViolations({ status: "done", score_a: 2, score_b: 1 },
    [{ win: "b" }, { win: "b" }]).length >= 1);

// ── ⑥ 승자 값이 a/b 가 아니면 위반 ──
truthy("승자가 a/b 가 아니면 잡는다",
  finishedMatchViolations({ status: "done", score_a: 1, score_b: 0 },
    [{ win: "blue" }]).length >= 1);

// ── ⑦ 동점·빈 스코어 ──
truthy("종료 경기 동점을 잡는다",
  finishedMatchViolations({ status: "done", score_a: 1, score_b: 1 }, []).length >= 1);
truthy("종료 경기 빈 스코어를 잡는다",
  finishedMatchViolations({ status: "done", score_a: null, score_b: 2 }, []).length >= 1);

// ── ⑧ 진행 중·예정 경기는 검사하지 않는다 ──
empty("예정 경기는 통과",
  finishedMatchViolations({ status: "upcoming", score_a: null, score_b: null }, []));

// ── ⑨ POM 후보: 승리팀 아닌 선수·미출전 선수 ──
truthy("POM 후보에 패배팀 선수가 섞이면 잡는다",
  pomPollViolations({ options: ["Zeus (HLE 탑)", "Faker (T1 미드)"] }, "HLE", new Set(["Zeus"])).length >= 1);
truthy("POM 후보에 미출전 선수가 있으면 잡는다",
  pomPollViolations({ options: ["Zeus (HLE 탑)", "Bluffing (HLE 서폿)"] }, "HLE",
    new Set(["Zeus", "Kanavi", "Zeka", "Gumayusi", "Delight"])).length >= 1);
empty("정상 POM 후보는 통과",
  pomPollViolations({ options: ["Zeus (HLE 탑)", "Delight (HLE 서폿)"] }, "HLE",
    new Set(["Zeus", "Delight"])));

console.log(`\ninvariants.test: ${pass} 통과, ${failCnt} 실패`);
process.exit(failCnt ? 1 : 0);
