// ── 모의밴픽 엔진 ────────────────────────────────────────
// 화면과 분리된 **규칙만** 담는다. 여기가 틀리면 화면을 아무리 잘 만들어도 소용없어서
// 따로 떼어 테스트로 굳혔다 (tests/draft.test.js).
//
// 담는 것
//   ① 프로 대회 밴픽 **순서** (누가 몇 번째로 밴/픽 하는가)
//   ② **피어리스** — 앞 세트에서 쓴 챔피언은 다음 세트에서 못 쓴다
//   ③ 지금 고를 수 없는 챔피언 판정 (이미 밴·픽됐거나 피어리스로 잠긴 것)

const DRAFT_LANES = ["탑", "정글", "미드", "원딜", "서폿"];

// 프로 대회 표준 순서 — 밴5·픽5씩, 두 단계로 나뉜다.
//   1차 밴  블루 레드 블루 레드 블루 레드
//   1차 픽  블루 / 레드 레드 / 블루 블루 / 레드
//   2차 밴  레드 블루 레드 블루
//   2차 픽  레드 / 블루 블루 / 레드
// (각 칸은 "몇 번째 밴/픽인지"까지 들고 있어야 중간을 비워 두고 뒤를 못 채운다)
const DRAFT_STEPS = (() => {
  const steps = [];
  let bBan = 0, rBan = 0, bPick = 0, rPick = 0;
  const ban = side => steps.push({ kind: "ban", side, no: side === "blue" ? bBan++ : rBan++ });
  const pick = side => steps.push({ kind: "pick", side, no: side === "blue" ? bPick++ : rPick++ });

  ["blue", "red", "blue", "red", "blue", "red"].forEach(ban);          // 1차 밴 6
  ["blue", "red", "red", "blue", "blue", "red"].forEach(pick);         // 1차 픽 6
  ["red", "blue", "red", "blue"].forEach(ban);                         // 2차 밴 4
  ["red", "blue", "blue", "red"].forEach(pick);                        // 2차 픽 4
  return steps;
})();

function draftEmptySet() {
  return {
    bans: { blue: [null, null, null, null, null], red: [null, null, null, null, null] },
    // 픽은 **고른 순서대로** 담는다. 라인은 고를 때 함께 정한다.
    // 순서를 그대로 두어야 "몇 번째 픽이었나"를 나중에 다시 그릴 수 있다.
    picks: { blue: [], red: [] },
  };
}

function draftEmpty(blueTeam, redTeam) {
  return { v: 1, blueTeam: blueTeam || null, redTeam: redTeam || null, sets: [draftEmptySet()] };
}

// 한 세트에서 실제로 **쓴**(픽된) 챔피언. 피어리스 잠금은 픽 기준이다 —
// 밴은 아무도 안 쓴 것이라 다음 세트에 다시 나올 수 있다.
function draftSetPicks(set) {
  if (!set) return [];
  return ["blue", "red"].flatMap(s => (set.picks[s] || []).map(p => p && p.champ).filter(Boolean));
}

// 피어리스 — 이 세트보다 **앞선 세트에서 픽된** 챔피언은 전부 잠긴다.
function draftFearlessBans(draft, setIndex) {
  const out = [];
  for (let i = 0; i < setIndex; i++) out.push(...draftSetPicks((draft.sets || [])[i]));
  return [...new Set(out)];
}

// 이 세트에서 이미 자리를 차지한 챔피언 (밴 + 픽)
function draftTakenInSet(set) {
  if (!set) return [];
  const bans = ["blue", "red"].flatMap(s => (set.bans[s] || []).filter(Boolean));
  return [...new Set(bans.concat(draftSetPicks(set)))];
}

// 지금 고를 수 없는 챔피언 → { champ: 이유 }
//   'fearless' = 앞 세트에서 썼다 · 'taken' = 이 세트에서 이미 밴/픽됐다
function draftBlocked(draft, setIndex) {
  const out = {};
  draftFearlessBans(draft, setIndex).forEach(c => { out[c] = "fearless"; });
  draftTakenInSet((draft.sets || [])[setIndex]).forEach(c => { out[c] = "taken"; });
  return out;
}

// 지금 차례 — 앞에서부터 처음 비어 있는 칸. 다 찼으면 null.
function draftNextStep(set) {
  if (!set) return null;
  for (let i = 0; i < DRAFT_STEPS.length; i++) {
    const st = DRAFT_STEPS[i];
    const filled = st.kind === "ban"
      ? !!(set.bans[st.side] || [])[st.no]
      : !!((set.picks[st.side] || [])[st.no] || {}).champ;
    if (!filled) return { ...st, at: i };
  }
  return null;
}

// 한 챔피언을 지금 차례 칸에 넣는다. 규칙에 어긋나면 { error } 를 돌려준다.
//   · 밴은 라인이 없다. 픽은 라인이 필요하고, 그 팀에서 이미 쓴 라인이면 안 된다.
function draftPlace(draft, setIndex, champ, lane) {
  const set = (draft.sets || [])[setIndex];
  if (!set) return { error: "세트가 없습니다" };
  const step = draftNextStep(set);
  if (!step) return { error: "이 세트는 이미 다 찼습니다" };

  const blocked = draftBlocked(draft, setIndex)[champ];
  if (blocked === "fearless") return { error: "피어리스 — 앞 세트에서 이미 쓴 챔피언입니다" };
  if (blocked === "taken") return { error: "이 세트에서 이미 밴/픽된 챔피언입니다" };

  if (step.kind === "ban") {
    set.bans[step.side][step.no] = champ;
    return { step };
  }
  if (!DRAFT_LANES.includes(lane)) return { error: "라인을 골라 주세요" };
  if ((set.picks[step.side] || []).some(p => p && p.lane === lane)) {
    return { error: `${step.side === "blue" ? "블루" : "레드"} ${lane} 자리는 이미 찼습니다` };
  }
  set.picks[step.side][step.no] = { lane, champ };
  return { step };
}

// 마지막에 넣은 것 하나 되돌리기
function draftUndo(draft, setIndex) {
  const set = (draft.sets || [])[setIndex];
  if (!set) return false;
  const next = draftNextStep(set);
  const at = (next ? next.at : DRAFT_STEPS.length) - 1;
  if (at < 0) return false;
  const st = DRAFT_STEPS[at];
  if (st.kind === "ban") set.bans[st.side][st.no] = null;
  else set.picks[st.side][st.no] = undefined;
  return true;
}

// 라인 순서로 정리한 픽 (화면에 라인별 고정칸으로 그릴 때 쓴다)
function draftPicksByLane(set, side) {
  const map = {};
  (((set || {}).picks || {})[side] || []).forEach((p, i) => {
    if (p && p.champ) map[p.lane] = { champ: p.champ, order: i };
  });
  return DRAFT_LANES.map(l => ({ lane: l, ...(map[l] || {}) }));
}

// 저장 전에 한 번 훑는다 — 화면 버그로 이상한 값이 들어가도 DB 까지 가지 않게.
function draftValidate(draft) {
  if (!draft || !Array.isArray(draft.sets) || !draft.sets.length) return "세트가 없습니다";
  if (draft.sets.length > 5) return "세트는 5개까지입니다";
  for (let i = 0; i < draft.sets.length; i++) {
    const set = draft.sets[i];
    const all = draftTakenInSet(set);
    const flat = ["blue", "red"].flatMap(s => (set.bans[s] || []).filter(Boolean))
      .concat(draftSetPicks(set));
    if (flat.length !== all.length) return `${i + 1}세트에 같은 챔피언이 두 번 들어갔습니다`;
    const fear = new Set(draftFearlessBans(draft, i));
    const dup = draftSetPicks(set).find(c => fear.has(c));
    if (dup) return `${i + 1}세트: 피어리스 규칙 위반 (${dup})`;
    for (const s of ["blue", "red"]) {
      const lanes = (set.picks[s] || []).filter(Boolean).map(p => p.lane);
      if (new Set(lanes).size !== lanes.length) return `${i + 1}세트 ${s === "blue" ? "블루" : "레드"} 라인이 겹칩니다`;
    }
  }
  return null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DRAFT_LANES, DRAFT_STEPS, draftEmpty, draftEmptySet, draftFearlessBans, draftBlocked,
    draftNextStep, draftPlace, draftUndo, draftPicksByLane, draftValidate, draftSetPicks,
  };
}
