// ── LCK 경우의 수 엔진 ──────────────────────────────────────
// race.html(화면)·cards.html(공유 카드)·경기 카드의 "경우의 수 한 줄"이 같이 쓴다.
//
// 무엇을 돌리나 — 2026 LCK 대회 규정집 2.7.2.2 의 순위 규칙을 그대로 따른다:
//     ① 승리 경기 수  ② 세트 득실(승점)  ③ 상대 전적(2팀 동률에만)  ④ 타이브레이커 경기
//   경기마다 승자 2가지 × 세트 마진 2가지(2:0·2:1)를 전부 세운다 → 실현 4^n 개.
//   ①②③ 은 그 안에서 **정확히** 갈리고, ④(타이브레이커 경기)만 우리가 알 수 없다.
//   잔여가 많아 4^n 이 RACE_EXACT_MAX 를 넘으면 상한·하한 근사로 내려간다.
//   그 근사는 '없는 불가를 만들지 않는' 쪽으로만 틀리게 짜여 있다.
//
// 정직성 규칙 — 발행물의 신뢰가 여기 달려 있다:
//   · "확정"은 못 가르는 자리(타이브레이커)가 **전부 반대로 나와도** 되는 경우만.
//   · "불가"는 못 가르는 자리가 **전부 내 편이어도** 안 되는 경우만.
//     이 둘은 서로의 부정이 아니다 — 가운데(아직 모름)가 있다.
//
// 내부 용어 (화면에는 이 말을 그대로 쓰지 않는다 — raceSay() 가 사람 말로 바꾼다):
//   safe = 그만큼 이기면 **다른 경기 결과와 무관하게** 그 순위 안이 보장되는 최소 승수.
//   hope = 승수 동률조차 없이 그 순위 안이 되는 최소 승수.
//   live = 동률을 거쳐서라도 그 순위 안이 될 수 있는 최소 승수 (hope 보다 작거나 같다).

// ⚠ 마스크는 32비트 정수다. n 이 31 이면 1<<n 이 **음수**가 되어 루프가 한 번도 안 돌고,
//   모든 팀이 조용히 "확정"으로 뒤집힌다. 이 상한을 30 이상으로 올리지 마라.
//   (실무 상한은 어차피 속도다 — 20경기 약 0.4초, 22경기부터 2초를 넘는다)
const RACE_MAX_N = 20;

/** 컷 하나에 대한 팀의 처지를 **넷**으로 나눈다.
 *
 *  왜 셋이 아니라 넷인가 — 예전 코드는 "동률 없이 컷 안(above+tie<=k-1)" 하나로
 *  가능/불가를 갈랐다. 그러면 **승수로는 못 닿지만 동률까지는 가는** 처지가
 *  통째로 "불가"로 넘어간다. 실제로 그런 자리가 있다:
 *    KT 가 DK 를 이기면 → DK 의 2위 안은 승수만으로는 막히지만,
 *    17승 4팀 동률로 세트 득실 승부까지는 갈 수 있다.
 *  그걸 "불가능합니다" 라고 쓰면 거짓말이다. 그래서 네 번째 칸이 필요하다.
 *
 *    lock  모든 조합에서 above+tie <= k-1   → 확정 (동률조차 없음)
 *    clean above+tie <= k-1 인 조합이 있음   → 승수만으로 가능
 *    tie   above <= k-1 인 조합은 있는데
 *          above+tie <= k-1 인 조합은 없음  → 동률(세트 득실) 승부만 남음
 *    dead  above <= k-1 인 조합이 없음      → 진짜 불가
 *
 *  ⚠ 두 시험은 **여집합이 아니다.** 가운데 띠(above<=k-1 이면서 above+tie>k-1)는
 *    양쪽에 걸친다. 그래서 if/else 로 갈라 담으면 안 되고 독립된 if 두 개여야 한다.
 */
const RACE_STATE_ORDER = { dead: 0, tie: 1, clean: 2, lock: 3 };

// teams: 그룹 팀 id · base: {id:{w,l,sw,sl}} 현재 누적 · remain: [{id,a,b}] 잔여 경기
// cuts: [{k:2, label:"2위 안", what:"…"}, …]
/** 세트 스코어까지 전부 돌리는 "정확 계산"의 상한.
 *  경기마다 승자 2가지 × 마진 2가지(2:0·2:1) = 4가지라 실현이 4^ن 개다.
 *  잔여 11경기 = 419만(약 1.2초). 12경기부터는 초 단위를 넘어 근사로 내려간다. */
const RACE_EXACT_MAX = 5e6;

function raceCompute(teams, base, remain, cutsIn, opts) {
  const n = remain.length;
  if (!(n >= 0 && n <= RACE_MAX_N)) return null;
  const nt = teams.length;
  // 정원이 팀 수 이상인 컷은 뜻이 없다 (4팀에 "4위 안" → 전원 확정으로 도배된다)
  const cuts = (cutsIn || []).filter(c => c.k >= 1 && c.k < nt);
  if (nt < 2 || !cuts.length) return null;

  const total = 1 << n, full = total - 1, nc = cuts.length;
  const ti = {}; teams.forEach((t, i) => { ti[t] = i; });
  const baseW = teams.map(t => (base[t] || { w: 0 }).w | 0);
  const remT = teams.map(t => remain.filter(m => m.a === t || m.b === t).length);
  // 지금까지의 세트 득실. 아래 "따라잡을 수 있는가" 판정에 쓴다.
  const baseP = teams.map(t => { const r = base[t] || {}; return (r.sw || 0) - (r.sl || 0); });
  const A = remain.map(m => ti[m.a]), B = remain.map(m => ti[m.b]);
  const K1 = cuts.map(c => c.k - 1);
  const MK = Math.max(0, ...remT) + 1;

  // 잔여 승수(k)별 — 화면의 "몇 승이면 되는가"
  const allSafe  = teams.map((_, i) => cuts.map(() => Array(remT[i] + 1).fill(true)));   // 모든 조합에서 엄격 안
  const anyIn    = teams.map((_, i) => cuts.map(() => Array(remT[i] + 1).fill(false)));  // 엄격 안 조합 존재
  const anyLoose = teams.map((_, i) => cuts.map(() => Array(remT[i] + 1).fill(false)));  // 관대 안 조합 존재

  // 경기 하나를 못 박았을 때를 알기 위한 비트마스크. 비트 g = 1 이면 remain[g] 에서 a팀 승.
  // 한 번의 순회로 **모든 경기·모든 팀**의 조건부 판정을 함께 얻는다.
  const P = nt * nc, Z = () => new Int32Array(P);
  const posA = Z(), posB = Z();          // above <= k-1        (관대 가능)
  const strA = Z(), strB = Z();          // above+tie <= k-1    (엄격 가능)
  const nsA  = Z(), nsB  = Z();          // above+tie >  k-1    (엄격 위반)
  const nsKA = new Int32Array(P * MK), nsKB = new Int32Array(P * MK);   // 위를 k별로
  const anyPos = new Uint8Array(P), anyStr = new Uint8Array(P), anyNs = new Uint8Array(P);

  const tieCnt = cuts.map(() => 0);
  const wins = new Array(nt), ptHi = new Array(nt), ptLo = new Array(nt);
  const pts = new Array(nt);
  // 정확 계산을 할 수 있는가 — 세트 스코어까지 4^n 을 다 돌린다.
  const exact = Math.pow(4, n) <= RACE_EXACT_MAX;
  // 상대 전적 재료 (raceFromCache 가 넘겨준다). 없으면 상대 전적을 안 보고 넘어간다.
  const h2hP = (opts && opts.h2hPast) || null;
  const pA = (opts && opts.pairA) || null, pB = (opts && opts.pairB) || null;
  const hasH2H = !!(h2hP && pA && pB);
  // 32비트 정수의 1 비트 개수 (맞대결 승수 세기용)
  const popcnt = v => { v = v - ((v >> 1) & 0x55555555);
    v = (v & 0x33333333) + ((v >> 2) & 0x33333333);
    return (((v + (v >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24; };

  /** 한 조합에서 각 팀의 판정을 담는다.
   *
   *  ⚠ '가능'과 '확정'은 **서로 반대가 아니다.** 못 가르는 자리(타이브레이커 경기 등)를
   *    가능 쪽에서는 내 편으로, 확정 쪽에서는 반대편으로 쳐야 한다.
   *    예전에 '가능'의 부정을 '확정'으로 썼다가, 실제로는 확정이 아닌 자리를
   *    "플레이오프 직행 확정"이라고 잘못 말했다 (2026-08-09).
   *
   *  possible : 못 가르는 것이 전부 내 편이라 쳐도 컷 안인가
   *  cleanPos : 승수 동률조차 없이 컷 안인가 → '동률 승부만 남음'과 가르는 기준
   *  guaranteed: 못 가르는 것이 전부 반대라 쳐도 컷 안인가
   */
  function record(bA, bB, i, k, ci, possible, cleanPos, guaranteed) {
    const p = i * nc + ci;
    if (possible) {
      posA[p] |= bA; posB[p] |= bB; anyPos[p] = 1; anyLoose[i][ci][k] = true;
      if (cleanPos) { strA[p] |= bA; strB[p] |= bB; anyStr[p] = 1; anyIn[i][ci][k] = true; }
    }
    if (!guaranteed) {
      nsA[p] |= bA; nsB[p] |= bB; anyNs[p] = 1;
      nsKA[p * MK + k] |= bA; nsKB[p * MK + k] |= bB;
      allSafe[i][ci][k] = false;
    }
  }

  for (let mask = 0; mask < total; mask++) {
    for (let i = 0; i < nt; i++) wins[i] = baseW[i];
    for (let g = 0; g < n; g++) wins[(mask >> g) & 1 ? A[g] : B[g]]++;

    const sorted = wins.slice().sort((x, y) => y - x);
    for (let ci = 0; ci < nc; ci++) if (sorted[cuts[ci].k - 1] === sorted[cuts[ci].k]) tieCnt[ci]++;

    const bA = mask, bB = ~mask & full;   // ~ 는 32비트 부호값이지만 & full 로 하위 n비트만 남는다

    if (exact) {
      // ── 정확: 이 승패 조합 안에서 세트 마진(2:0 이냐 2:1 이냐)까지 전부 돌린다 ──
      for (let sm = 0; sm < total; sm++) {
        for (let i = 0; i < nt; i++) pts[i] = baseP[i];
        for (let g = 0; g < n; g++) {
          const w = (mask >> g) & 1 ? A[g] : B[g], l = (mask >> g) & 1 ? B[g] : A[g];
          const d = ((sm >> g) & 1) ? 2 : 1;      // 2:0 이면 ±2, 2:1 이면 ±1
          pts[w] += d; pts[l] -= d;
        }
        for (let i = 0; i < nt; i++) {
          // 규정집 2.7.2.2 — 승리 경기 수 → 세트 득실 → 상대 전적(2팀 동률에만) → 타이브레이커.
          //   better  = 어떤 경우에도 나보다 위인 팀 수
          //   murky   = 아직 못 가르는 팀 수 (3팀 이상 동률 → 타이브레이커 경기라 결과를 모른다)
          let better = 0, murky = 0, wtie = 0, dead = 0;
          for (let j = 0; j < nt; j++) {
            if (j === i) continue;
            if (wins[j] === wins[i]) wtie++;
            if (wins[j] > wins[i] || (wins[j] === wins[i] && pts[j] > pts[i])) { better++; continue; }
            if (wins[j] < wins[i] || pts[j] < pts[i]) continue;      // 내가 위
            dead++;                                                   // 승수·세트 득실까지 완전 동점
          }
          if (dead === 1 && hasH2H) {
            // 2팀 동률 → 상대 전적으로 **경기 없이** 갈린다 (2.8.5).
            // 승률 50% 초과인 쪽이 위. 딱 반반이면 타이브레이커 경기라 결과를 모른다.
            let j = -1;
            for (let x = 0; x < nt; x++) if (x !== i && wins[x] === wins[i] && pts[x] === pts[i]) { j = x; break; }
            const myW = h2hP[i][j] + popcnt(mask & pA[i][j]) + popcnt(~mask & full & pB[i][j]);
            const opW = h2hP[j][i] + popcnt(mask & pA[j][i]) + popcnt(~mask & full & pB[j][i]);
            if (opW > myW) better++;
            else if (opW === myW) murky++;                            // 상대 전적도 동률 → 경기로 가림
          } else {
            murky += dead;                                            // 3팀 이상 동률 → 타이브레이커 경기
          }
          const k = wins[i] - baseW[i];
          for (let ci = 0; ci < nc; ci++) {
            const k1 = K1[ci];
            record(bA, bB, i, k, ci,
              better <= k1,                    // 가능   — 못 가른 자리가 전부 내 편
              better + wtie <= k1,             // 깨끗   — 승수 동률조차 없음
              better + murky <= k1);           // 확정   — 못 가른 자리가 전부 반대
          }
        }
      }
    } else {
      // ── 근사: 세트 스코어를 다 돌리기엔 너무 크다. 대신 **상한·하한**으로 가른다.
      //    Bo3 라 한 경기가 득실을 ±2 이상 못 움직이는 것이 근거다.
      //      천장 = 이긴 건 전부 2:0, 진 건 전부 1:2  →  기존 + 3·승 − 잔여
      //      바닥 = 이긴 건 전부 2:1, 진 건 전부 0:2  →  기존 + 3·승 − 2·잔여
      //    이 갈래는 '불가'를 놓칠 수는 있어도 **없는 불가를 만들지는 않는다**.
      for (let i = 0; i < nt; i++) {
        const w = wins[i] - baseW[i];
        ptHi[i] = baseP[i] + 3 * w - remT[i];
        ptLo[i] = baseP[i] + 3 * w - 2 * remT[i];
      }
      for (let i = 0; i < nt; i++) {
        let above = 0, tie = 0, blocked = 0;
        for (let j = 0; j < nt; j++) {
          if (j === i) continue;
          if (wins[j] > wins[i]) { above++; blocked++; }
          else if (wins[j] === wins[i]) {
            tie++;
            // ⚠ 부등호는 반드시 **<** 다. <= 로 하면 '천장 == 바닥' 인 상대까지
            //   가로막는 것으로 세는데, 그건 **똑같아질 수 있다**는 뜻이지 진다는 뜻이 아니다.
            //   실제로 <= 로 했다가 DK 2위 안을 '완전 무산'이라고 잘못 말했다 (2026-08-08).
            if (ptHi[i] < ptLo[j]) blocked++;
          }
        }
        const k = wins[i] - baseW[i];
        for (let ci = 0; ci < nc; ci++) {
          const k1 = K1[ci];
          // 근사 갈래에서는 동률을 가릴 재료가 없다 → 확정은 '승수 동률조차 없을 때'만
          record(bA, bB, i, k, ci, blocked <= k1, above + tie <= k1, above + tie <= k1);
        }
      }
    }
  }

  const rows = teams.map((t, i) => {
    const r = base[t] || { w: 0, l: 0, sw: 0, sl: 0 };
    const per = cuts.map((c, ci) => {
      let safe = null;
      for (let w = 0; w <= remT[i] && safe == null; w++) {
        let ok = true;
        for (let k = w; k <= remT[i]; k++) if (!allSafe[i][ci][k]) { ok = false; break; }
        if (ok) safe = w;
      }
      let hope = null, live = null;
      for (let w = 0; w <= remT[i] && hope == null; w++) if (anyIn[i][ci][w]) hope = w;
      for (let w = 0; w <= remT[i] && live == null; w++) if (anyLoose[i][ci][w]) live = w;
      return { k: c.k, label: c.label, what: c.what, short: c.short,
               endsSeason: !!c.endsSeason, safe, hope, live };
    });
    return { team: t, w: r.w, l: r.l, pt: (r.sw || 0) - (r.sl || 0), remaining: remT[i], cuts: per };
  }).sort(standingsSort);

  const idx = {}; teams.forEach((t, i) => { idx[t] = i; });
  const bit = (arr, p, g) => (arr[p] >>> g) & 1;      // >>> 로 부호 오염 차단

  // 아무 조건 없는 지금 처지
  function stateNow(teamId, ci) {
    const i = idx[teamId];
    if (i == null || !(ci >= 0 && ci < nc)) return null;
    const p = i * nc + ci;
    if (!anyPos[p]) return "dead";
    if (!anyNs[p]) return "lock";
    return anyStr[p] ? "clean" : "tie";
  }
  // 잔여 g번째 경기를 side("a"|"b") 로 못 박았을 때의 처지
  // ⚠ g 검사는 반드시 있어야 한다. JS 는 시프트 수를 32로 나눈 나머지를 쓰므로
  //   x >>> -1 은 x >>> 31 이고, 그러면 같은 칸이 "불가"이자 "확정"으로 읽힌다.
  function stateAt(g, side, teamId, ci) {
    const i = idx[teamId];
    if (i == null || !(ci >= 0 && ci < nc) || !(Number.isInteger(g) && g >= 0 && g < n)) return null;
    const p = i * nc + ci, a = side === "a";
    if (!bit(a ? posA : posB, p, g)) return "dead";
    if (!bit(a ? nsA : nsB, p, g)) return "lock";
    return bit(a ? strA : strB, p, g) ? "clean" : "tie";
  }
  /** 그 경기를 못 박았을 때의 **자력 확보선** — 그 경기 이후 몇 승이면 확정인가.
   *  ⚠ 경기 뒤 기준(k')으로 봐야 한다. 경기 전 기준(k)으로 세면, 그 조건에서
   *    일어날 수 없는 승수 칸이 "위반 없음"으로 읽혀 **지는 쪽이 더 유리해 보인다.**
   *    (실제로 그렇게 나왔다 — DK 가 지는데 자력 확보선이 생기는 모순) */
  function safeAt(g, side, teamId, ci) {
    const i = idx[teamId];
    if (i == null || !(ci >= 0 && ci < nc) || !(Number.isInteger(g) && g >= 0 && g < n)) return null;
    const p = i * nc + ci, arr = side === "a" ? nsKA : nsKB;
    const plays = A[g] === i || B[g] === i;
    const won = plays && ((side === "a") === (A[g] === i));
    const rem2 = remT[i] - (plays ? 1 : 0), shift = won ? 1 : 0;
    for (let w = 0; w <= rem2; w++) {
      let ok = true;
      for (let k2 = w; k2 <= rem2; k2++) if ((arr[p * MK + k2 + shift] >>> g) & 1) { ok = false; break; }
      if (ok) return w;
    }
    return null;
  }

  return { rows, cuts, scenarioCount: total, remainCount: n, exact,
           tiePct: tieCnt.map(c => Math.round((c / total) * 100)),
           stateNow, stateAt, safeAt, teamOrder: teams };
}

// 2026 LCK 공식 규정 기준 — 정규 라운드 3-4 가 끝나면 **그룹별 순위**로 다음이 갈린다.
//   레전드 1·2위 → 플레이오프 승자조 2라운드 직행 (1·2번 시드)
//   레전드 3·4위 → 플레이오프 승자조 1라운드     (3·4번 시드)
//   레전드 5위   → 플레이-인
//   라이즈 1위   → 플레이-인 1라운드 (이기면 바로 플레이오프 5번 시드)
//   라이즈 2·3위 → 플레이-인 2라운드 (두 번 이겨야 플레이오프)
//   라이즈 4·5위 → 시즌 종료 (최종 9·10위)
// label 은 표의 열 제목, what 은 그 선을 넘으면 무엇이 되는지, why 는 왜 중요한지.
// 그룹 이름은 **id 로** 정한다. 이름 문자열에서 '레전드'를 찾아 없으면 라이즈로 치던
// 코드가 있었는데, 스테이지 이름을 한 번만 바꿔도 카드에 엉뚱한 그룹이 찍힌다.
// 공유 카드는 한 번 나가면 회수가 안 된다. (2026-08-07)
const RACE_GROUP = { r34L: "레전드 그룹", r34R: "라이즈 그룹" };

// short 는 경기 카드처럼 좁은 자리에서 쓰는 짧은 이름 (영문 약어는 쓰지 않는다).
// endsSeason 은 "여기 못 들면 시즌 종료"인 컷 — 문구를 세게 쓸지 판단하는 데 쓴다.
const RACE_CUTS = {
  r34L: [
    { k: 2, label: "2위 안", short: "2라운드 직행", what: "플레이오프 2라운드 직행",
      why: "1·2번 시드. 첫 경기를 건너뛰고 위에서 시작한다", endsSeason: false },
    { k: 4, label: "4위 안", short: "플레이오프 직행", what: "플레이오프 직행",
      why: "플레이-인을 거치지 않고 바로 플레이오프", endsSeason: false },
  ],
  r34R: [
    { k: 1, label: "1위", short: "플레이-인 1라운드", what: "플레이-인 1라운드",
      why: "한 번만 이겨도 플레이오프. 2·3위는 두 번 이겨야 한다", endsSeason: false },
    { k: 3, label: "3위 안", short: "플레이-인 진출", what: "플레이-인 진출",
      why: "여기 못 들면 시즌이 끝난다 (최종 9·10위)", endsSeason: true },
  ],
};

// 같은 자료로 두 번 계산하지 않는다. 화면은 저장본·서버본으로 두 번 그리고,
// 경기 카드는 경기마다 결과를 묻는다 — 메모가 없으면 잔여 20경기(0.4초)에서 화면이 멈춘다.
const _raceMemo = {};

// Cache(store.js)에서 재료를 꺼내 그룹 하나를 계산한다
function raceFromCache(stageId, opts) {
  const stage = Cache.records.find(s => s.id === stageId);
  const cutDefs = RACE_CUTS[stageId];
  if (!stage || !cutDefs) return null;
  const teams = (stage.records || []).map(r => r.team).filter(t => TEAM_MAP[t]);
  if (teams.length < 2) return null;

  const base = {};
  cumulativeStandings().forEach(r => { if (teams.includes(r.team)) base[r.team] = r; });

  const key = x => String(x || "").trim().toLowerCase();
  const names = new Set(Cache.records.filter(stageInTotal).map(s => key(s.name)));
  const inTotal = m => names.has(key(m.stage)) && TEAM_MAP[m.a] && TEAM_MAP[m.b];
  // ⚠ "아직 안 끝난 경기"의 기준을 전적 집계와 **똑같이** 맞춘다.
  //   전적은 matchWinner(승자를 가릴 수 있는 경기)만 센다. 여기서 status!=="done" 을 쓰면
  //   'done 인데 점수가 비었거나 1:1' 인 경기가 전적에도 잔여에도 안 들어가 증발한다.
  const unfinished = m => !matchWinner(m);
  const remain = Cache.matches.filter(m =>
    unfinished(m) && inTotal(m) && teams.includes(m.a) && teams.includes(m.b));

  // 정합성 게이트 — 전제가 깨졌으면 조용히 틀리는 대신 아무 말도 하지 않는다.
  // 전수 계산은 "이 5팀의 최종 승수 상한이 잔여 경기로 완전히 정해진다"를 깔고 있다.
  // 그룹 팀이 낀 미종료 경기가 remain 밖에 하나라도 있으면 그 전제가 깨진다.
  const touching = Cache.matches.filter(m =>
    unfinished(m) && inTotal(m) && (teams.includes(m.a) || teams.includes(m.b))).length;
  if (touching !== remain.length) return null;

  // ── 상대 전적 재료 (2026 LCK 규정집 2.7.2.2 / 2.8.5) ──────────────
  // 정규 라운드 최종 순위: 승리 경기 수 → 세트 득실 → **상대 전적**(2팀 동률에만) → 타이브레이커.
  // 맞대결 결과는 이미 계산 안(잔여 조합)에 들어 있으니 그대로 쓸 수 있다.
  //   h2hPast[i][j] = 이미 치른 경기에서 i 가 j 를 이긴 수
  //   pairA[i][j]   = 잔여 경기 중 'i 가 a쪽' 인 자리의 비트 (그 비트가 1이면 i 승)
  //   pairB[i][j]   = 잔여 경기 중 'j 가 a쪽' 인 자리의 비트 (그 비트가 0이면 i 승)
  const idx = {}; teams.forEach((t, i) => { idx[t] = i; });
  const nt0 = teams.length;
  const h2hPast = Array.from({ length: nt0 }, () => new Int32Array(nt0));
  Cache.matches.forEach(m => {
    if (!inTotal(m)) return;
    const wSide = matchWinner(m); if (!wSide) return;
    const i = idx[wSide === "a" ? m.a : m.b], j = idx[wSide === "a" ? m.b : m.a];
    if (i == null || j == null) return;
    h2hPast[i][j]++;
  });
  const pairA = Array.from({ length: nt0 }, () => new Int32Array(nt0));
  const pairB = Array.from({ length: nt0 }, () => new Int32Array(nt0));
  remain.forEach((m, g) => {
    const a = idx[m.a], b = idx[m.b];
    if (a == null || b == null) return;
    pairA[a][b] |= (1 << g);   // 이 비트가 1 이면 a 승
    pairB[b][a] |= (1 << g);   // b 입장에서는 같은 비트가 0 이어야 b 승
  });

  const res = raceCompute(teams, base, remain, cutDefs, { ...(opts || {}), h2hPast, pairA, pairB });
  if (!res) return null;
  // 경기 id → 비트 자리. 화면이 배열 위치를 다시 세지 않게 여기서 한 번만 만든다.
  // (화면들이 remain 을 날짜순으로 다시 정렬하는 곳이 있어, 위치로 찾으면 다른 경기의 결과가 붙는다)
  const bitOf = new Map(remain.map((m, g) => [m.id, g]));
  return { ...res, remain, bitOf, cuts: res.cuts, stageId, stageName: stage.name };
}

/** 위와 같지만 같은 자료면 다시 계산하지 않는다. 경기 카드처럼 여러 번 묻는 쪽이 쓴다.
 *  지문에는 **계산에 실제로 쓰이는 것만** 넣는다 — 경기의 승패·스테이지, 그리고 전적표.
 *  조회수·득표수까지 넣으면 아무것도 안 바뀌었는데 매번 다시 계산한다. */
function raceFingerprint() {
  return Cache.matches.map(m => `${m.id}|${m.stage}|${m.status}|${m.scoreA}|${m.scoreB}`).join(",")
    + "#" + Cache.records.map(s => `${s.id}:${(s.records || []).map(r => `${r.team}${r.w}-${r.l}`).join("")}`).join(",");
}
const _raceExactMemo = {};

/** 화면이 쓰는 입구.
 *  정확본이 이미 만들어져 있으면 그걸 주고, 아니면 **빠른 근사본**을 준다.
 *  정확본은 세트 스코어까지 419만 가지를 돌려 1초를 넘기므로, 첫 그리기를 붙잡으면 안 된다.
 *  (근사본도 '없는 불가'를 만들지 않으니, 잠깐 근사본이 보여도 거짓말은 아니다) */
function raceCached(stageId) {
  const fp = raceFingerprint();
  const ex = _raceExactMemo[stageId];
  if (ex && ex.fp === fp) return ex.val;
  const hit = _raceMemo[stageId];
  if (hit && hit.fp === fp) return hit.val;
  const val = raceFromCache(stageId, { exact: false });
  _raceMemo[stageId] = { fp, val };
  return val;
}

/** 유휴 시간에 정확본을 만들어 둔다. 다 되면 done(바뀐 게 있나) 를 부른다.
 *  화면은 이걸 받아 한 번 더 그리면 된다 — 저장본 → 서버본 과 같은 방식이다. */
function raceWarmExact(done) {
  const fp = raceFingerprint();
  const todo = Object.keys(RACE_CUTS)
    .filter(s => !(_raceExactMemo[s] && _raceExactMemo[s].fp === fp));
  if (!todo.length) { if (done) done(false); return; }
  const idle = window.requestIdleCallback ? window.requestIdleCallback.bind(window)
                                          : (f => setTimeout(f, 60));
  let changed = false;
  const step = () => {
    const sid = todo.shift();
    if (sid) {
      try {
        const val = raceFromCache(sid, { exact: true });
        // 정확 계산이 불가능한 크기면(잔여가 많으면) 근사본이 돌아온다. 그건 저장하지 않는다.
        if (val && val.exact) { _raceExactMemo[sid] = { fp, val }; changed = true; }
      } catch (e) { /* 한 그룹이 실패해도 나머지는 계속 */ }
    }
    if (todo.length) idle(step);
    else if (done) done(changed);
  };
  idle(step);
}

// "이 경기를 이기면/지면" — 경기 하나의 결과를 못 박고 다시 계산한다
function raceWhatIf(stageId, matchId, side) {
  const r0 = raceFromCache(stageId);
  if (!r0) return null;
  const m = r0.remain.find(x => x.id === matchId);
  if (!m) return null;
  const base = {};
  r0.rows.forEach(r => { base[r.team] = { w: r.w, l: r.l, sw: 0, sl: r.pt >= 0 ? -r.pt : 0 }; });
  // 득실은 표시용이 아니므로 승패만 반영한다
  const winT = side === "a" ? m.a : m.b, loseT = side === "a" ? m.b : m.a;
  base[winT] = { ...base[winT], w: base[winT].w + 1 };
  base[loseT] = { ...base[loseT], l: base[loseT].l + 1 };
  const remain = r0.remain.filter(x => x.id !== matchId);
  const teams = r0.rows.map(r => r.team);
  return raceCompute(teams, base, remain, r0.cuts);
}

// ── 경기 하나에 붙는 "경우의 수 한 줄" ─────────────────────
//
// 나무위키 LCK 문서처럼 "KT 승리 시: DK 플레이오프 R2 직행 불가" 같은 줄을 만든다.
// 두 가지 규율을 지킨다:
//
//  ① **대조가 있어야만 쓴다.** 양쪽 결과에서 판정이 같으면 그 경기와 무관한 사실이다.
//     예: DNS 는 이미 탈락이라 누가 이겨도 불가인데, 그걸 "BRO 승리 시 DNS 탈락"이라고
//     쓰면 인과가 없는데 있는 것처럼 읽힌다. 실측에서 라이즈 '불가' 줄의 88%가 이런 것이었다.
//  ② **확정과 가능은 기준이 다르다.** 확정은 엄격(동률조차 없음), 불가는 관대(동률 포함).
//     섞으면 한쪽은 과대주장, 다른 쪽은 거짓 사망선고가 된다.
//
// tone 은 좋은 소식·나쁜 소식이 짝을 이룬다. 한쪽만 만들면 "이기면 이렇다"는 나오는데
// "지면 저렇다"가 안 나와서 경우의 수가 반쪽이 된다 (실제로 그랬다).
//   lock ↔ dead   확정 ↔ 완전 무산
//   tie  ↔ revive 동률 승부만 남음 ↔ 승수만으로 다시 가능
//   self ↔ keep   자력 상실 ↔ 자력 유지
//   magic         확정까지 남은 승수가 줄어듦
const RACE_TONE_RANK = { lock: 6, dead: 6, tie: 4, revive: 4, self: 3, keep: 3, magic: 1 };

/** 경기 id 하나에 붙일 줄들. 없으면 null.
 *  { group, lines: [{ side, winner, team, tone, text }] }  side 는 "a"|"b" */
function matchStakes(matchId, opts) {
  const max = (opts && opts.max) || 2;
  for (const sid of Object.keys(RACE_CUTS)) {
    const r = raceCached(sid);
    if (!r || !r.bitOf.has(matchId)) continue;
    const g = r.bitOf.get(matchId);
    const m = r.remain[g];
    const nm = t => (TEAM_MAP[t] ? TEAM_MAP[t].abbr : t);
    const cand = [];

    r.teamOrder.forEach(team => r.cuts.forEach((c, ci) => {
      const sA = r.stateAt(g, "a", team, ci), sB = r.stateAt(g, "b", team, ci);
      const fA = r.safeAt(g, "a", team, ci), fB = r.safeAt(g, "b", team, ci);
      if (sA == null || sB == null) return;
      if (sA === sB && fA === fB) return;                       // ① 대조가 없으면 버린다
      const inMatch = team === m.a || team === m.b;
      const what = c.short || c.what || c.label;

      // 조사를 붙여야 한다. "1라운드을" 같은 말이 나오면 자동 생성 티가 확 난다.
      const eun = typeof josa === "function" ? josa(what, "은는") : what + "은";
      const eul = typeof josa === "function" ? josa(what, "을를") : what + "을";

      // 양쪽을 각각 문장으로. 더 센 쪽만 남긴다.
      [["a", m.a, sA, fA, sB, fB], ["b", m.b, sB, fB, sA, fA]].forEach(([side, winner, st, sf, ost, osf]) => {
        let tone = null, text = null;
        // 이긴 팀 자신의 이야기면 이름을 두 번 부르지 않는다 ("KT 승리 시 — KT, …" 는 어색하다)
        const head = team === winner ? `${nm(winner)} 승리 시 — ` : `${nm(winner)} 승리 시 — ${nm(team)}, `;
        if (st === "lock" && ost !== "lock") {
          tone = "lock"; text = head + `${what} 확정`;
        } else if (st === "dead" && ost !== "dead") {
          tone = "dead"; text = head + `${eun} 완전히 무산`;
        } else if (st === "tie" && (ost === "clean" || ost === "lock")) {
          tone = "tie"; text = head + `${eun} 승수로는 막히고 동률 승부만 남음`;
        } else if (st === "clean" && ost === "tie") {
          tone = "revive"; text = head + `${eun} 승수만으로 다시 가능`;
        } else if (sf == null && osf != null) {
          tone = "self"; text = head + `${eul} 스스로 정하지 못하고 남의 결과에 달림`;
        } else if (sf != null && osf == null) {
          tone = "keep";
          text = head + (sf === 0 ? `${what} 확정` : `${what} 자력 유지 (${sf}승 남음)`);
        } else if (sf != null && osf != null && sf < osf) {
          tone = "magic";
          text = head + (sf === 0 ? `${what} 확정` : `${what}까지 ${sf}승 남음`);
        }
        if (tone) cand.push({ side, winner, team, tone, text, inMatch, k: c.k });
      });
    }));

    if (!cand.length) return null;
    // 뛰는 두 팀 이야기가 하나라도 있으면 그것만 쓴다.
    // 안 그러면 "DNS vs NS" 카드에 BFX·KRX 이야기만 뜨는 일이 생긴다 — 사실이긴 해도
    // 그 경기를 보러 온 사람이 찾는 말이 아니다. 뛰는 팀 이야기가 없을 때만 남을 빌린다.
    // ⚠ own 이 비면 pool 이 cand **와 같은 배열**이 된다. 예전에 여기서 cand 를
    //   비우고 다시 채웠더니 자기 자신을 비워 줄이 통째로 사라졌다 (DNS vs NS).
    //   그래서 원본을 건드리지 않고 사본으로만 고른다.
    const own = cand.filter(c => c.inMatch);
    const pool = (own.length ? own : cand).slice()
      .sort((x, y) => RACE_TONE_RANK[y.tone] - RACE_TONE_RANK[x.tone] || x.k - y.k);

    // 되도록 **양쪽 결과를 한 줄씩** 보여 준다 — "이기면 이렇고 지면 저렇다"가
    // 한눈에 읽혀야 경우의 수다. 한쪽에만 할 말이 있으면 그쪽에서 두 줄을 쓴다.
    const bestA = pool.find(c => c.side === "a"), bestB = pool.find(c => c.side === "b");
    const out = (bestA && bestB) ? [bestA, bestB] : pool.slice(0, max);
    if (!out.length) return null;
    return { group: RACE_GROUP[sid] || r.stageName, lines: out.slice(0, max) };
  }
  return null;
}

// 커뮤니티 게시용 텍스트 표 — 그 글만 봐도 완결되게, 링크 없이
/** 숫자 두 개(자력·산술)를 사람이 읽는 말로 바꾼다.
 *
 *  "자력 확보선 2 / 산술 가능선 1" 이라고 쓰면 아무도 못 알아본다.
 *  팬이 알고 싶은 건 딱 하나다 — **몇 번 이기면 되는가.**
 *  race.html 과 cards.js 가 같은 말을 쓰도록 여기 한 곳에 모아 둔다.
 *
 *  tone: done(이미 됨) · safe(이기면 확정) · hope(남의 도움 필요) · none(불가)
 */
function raceSay(row, c) {
  const n = row.remaining;
  const { safe, hope } = c;

  if (safe === 0) {
    return { tone: "done", head: "확정", line: `이미 ${c.label} 확정입니다`,
             sub: "남은 경기 결과와 상관없습니다" };
  }
  // "1위은" 같은 조사 오류를 막는다 (josa 는 assets/app.js — 항상 먼저 읽힌다)
  const L = typeof josa === "function" ? josa(c.label, "은는") : c.label + "은";
  if (safe != null) {
    const head = safe === n ? `전승 (${safe}승)` : `${safe}승`;
    const line = safe === n
      ? `남은 ${n}경기를 다 이기면 확정입니다`
      : `남은 ${n}경기 중 ${safe}승만 하면 확정입니다`;
    const sub = hope == null || hope >= safe
      ? "다른 경기 결과와 상관없이 확정됩니다"
      : hope === 0
        ? "다 져도 가능성은 남습니다 (다른 경기 결과에 따라)"
        : `${hope}승이어도 가능성은 남습니다 (다른 경기 결과에 따라)`;
    return { tone: "safe", head, line, sub };
  }
  if (hope != null) {
    const head = hope === 0 ? "도움 필요" : `${hope}승+`;
    const line = hope === 0
      ? `우리 힘만으로는 안 되고, 다른 경기 결과가 따라줘야 합니다`
      : `우리가 ${hope}승 이상 하고, 다른 경기 결과도 따라줘야 합니다`;
    return { tone: "hope", head, line, sub: "우리 경기만 이겨서는 확정되지 않습니다" };
  }
  // ⚠ 여기서 곧장 "불가능"이라고 하면 **거짓말이 된다.**
  //   hope 는 '동률조차 없이' 드는 경우만 센다. 승수로는 못 닿아도 동률까지 가서
  //   세트 득실로 갈리는 자리가 남아 있을 수 있고, 그건 아직 열려 있는 문이다.
  //   미래 세트 득실은 계산하지 않기로 했으므로(이 파일 맨 위 정직성 규칙),
  //   할 수 있는 말은 "승수로는 안 되고 동률 승부만 남았다"까지다. (2026-08-08)
  if (c.live != null) {
    return { tone: "tie", head: "동률 승부",
             line: `${L} 승수만으로는 닿지 않습니다`,
             sub: "같은 승수까지 간 뒤 세트 득실로 갈리는 경우만 남았습니다" };
  }
  return { tone: "none", head: "불가", line: `${L} 이제 불가능합니다`,
           sub: "남은 경기를 다 이겨도 순위가 모자랍니다" };
}

function raceCopyText(stageId) {
  const r = raceFromCache(stageId);
  if (!r) return "";
  const today = new Date();
  const md = `${today.getMonth() + 1}/${today.getDate()}`;
  const nm = t => (TEAM_MAP[t] ? TEAM_MAP[t].abbr : t);
  const pad = (s, w) => String(s) + " ".repeat(Math.max(0, w - String(s).replace(/[가-힣]/g, "xx").length));

  let out = `[정리] ${md} 기준 LCK ${RACE_GROUP[r.stageId] || r.stageName} 경우의 수\n`;
  out += `(잔여 ${r.remainCount}경기 · 승패 조합 ${r.scenarioCount.toLocaleString()}가지 전수 계산)\n\n`;
  out += `순위 | 팀 | 전적 | 세트득실 | 잔여\n`;
  r.rows.forEach((row, i) => {
    out += `${i + 1}위  ${nm(row.team)}  ${row.w}승 ${row.l}패  ${row.pt > 0 ? "+" : ""}${row.pt}  잔여 ${row.remaining}\n`;
  });
  r.cuts.forEach((c, ci) => {
    out += `\n■ ${c.label} = ${c.what} — 몇 승이면 확정인가\n`;
    r.rows.forEach(row => {
      const x = row.cuts[ci], s = raceSay(row, x);
      // ⚠ 새 상태(tie)를 빠뜨리면 "불가능"으로 떨어진다. 이 글은 커뮤니티에 붙여넣는
      //   완성 문장이라 한 번 나가면 회수가 안 된다. 상태마다 말을 반드시 정해 둘 것.
      const t = s.tone === "done" ? "확정"
        : s.tone === "safe" ? `${x.safe}승이면 확정 (잔여 ${row.remaining})`
        : s.tone === "hope" ? `우리 힘만으론 불가 · ${x.hope}승+ 이고 남의 도움 필요`
        : s.tone === "tie" ? "승수로는 불가 · 동률 뒤 세트 득실 승부만 남음"
        : "불가능";
      out += `  ${nm(row.team)}  ${t}\n`;
    });
    out += `  * 조합의 ${r.tiePct[ci]}%는 이 경계가 승수 동률 — 그 경우 세트득실로 갈립니다.\n`;
  });
  out += `\n(Leaguepedia 기록 기준 · 비영리 팬 제작 · 틀린 곳 있으면 알려주세요)`;
  return out;
}

/** 계산 결과가 없을 때 **왜** 없는지 알려 준다.
 *  예전에는 무조건 "아직 계산할 경기가 없습니다" 였는데, 실제로는 잔여 경기가
 *  너무 많아 거부된 경우(라운드 초반)일 수도 있어 사실과 달랐다. */
function raceWhyEmpty(stageId) {
  const stage = Cache.records.find(s => s.id === stageId);
  if (!stage || !RACE_CUTS[stageId]) return "이 그룹은 아직 준비 중입니다";
  const teams = (stage.records || []).map(r => r.team).filter(t => TEAM_MAP[t]);
  const key = x => String(x || "").trim().toLowerCase();
  const names = new Set(Cache.records.filter(stageInTotal).map(s => key(s.name)));
  const left = Cache.matches.filter(m =>
    m.status !== "done" && names.has(key(m.stage)) &&
    teams.includes(m.a) && teams.includes(m.b)).length;
  if (!left) return "이 그룹은 남은 경기가 없습니다 — 순위가 모두 확정됐습니다";
  if (left > 20) return `남은 ${left}경기는 조합이 100만 가지가 넘어 전수 계산을 하지 않습니다. `
    + `경기가 몇 번 더 치러지면 자동으로 나타납니다.`;
  return "아직 계산할 경기가 없습니다";
}
