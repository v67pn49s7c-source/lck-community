// ── LCK 경우의 수 엔진 ──────────────────────────────────────
// 잔여 경기의 승패 조합을 전부 나열해(2^n) 각 팀의 "자력 확보선"과
// "산술 가능선"을 계산한다. race.html(화면)과 cards.html(카드 스튜디오)이 같이 쓴다.
//
// 정직성 규칙 — 발행물의 신뢰가 여기 달려 있다:
//   · 승수만 전수 계산한다. 미래 경기의 세트 득실은 폭이 너무 커서 단정할 수 없다.
//   · 그래서 "자력 확보"는 승수 동률조차 걸치지 않는 경우만 인정한다.
//     (동률이면 세트득실·규정으로 갈리는데, 그건 아직 결정되지 않았다)
//   · 동률로 갈리는 조합의 비율(tiePct)을 함께 돌려줘 화면이 그대로 밝히게 한다.
//
// 용어:
//   자력 확보선(safe) = 남은 경기에서 그만큼만 이기면 **다른 경기 결과와 무관하게**
//                       그 순위 안이 보장되는 최소 승수. null 이면 자력으로는 불가.
//   산술 가능선(hope) = 다른 경기 결과가 전부 따라줄 때 그 순위 안(동률 없이)이
//                       되는 최소 승수. null 이면 산술상 불가.

// teams: 그룹 팀 id 5개 · base: {id:{w,l,sw,sl}} 현재 누적 · remain: [{a,b}] 잔여 경기
// cuts: [{k:2, label:"2위 안"}, …]
function raceCompute(teams, base, remain, cuts) {
  const n = remain.length;
  if (n > 18) return null;                      // 2^18 넘는 전수는 하지 않는다 (시즌 초반)
  const total = 1 << n;
  const ti = {}; teams.forEach((t, i) => { ti[t] = i; });
  const baseW = teams.map(t => (base[t] || { w: 0 }).w);
  const remT = teams.map(t => remain.filter(m => m.a === t || m.b === t).length);
  const A = remain.map(m => ti[m.a]), B = remain.map(m => ti[m.b]);

  // allSafe[i][ci][k] : 팀 i 가 잔여 k승일 때 **모든** 조합에서 K위 안(동률 없이)인가
  // anyIn [i][ci][k] : 팀 i 가 잔여 k승으로 K위 안(동률 없이)이 되는 조합이 **하나라도** 있는가
  const allSafe = teams.map((_, i) => cuts.map(() => Array(remT[i] + 1).fill(true)));
  const anyIn   = teams.map((_, i) => cuts.map(() => Array(remT[i] + 1).fill(false)));
  const tieCnt = cuts.map(() => 0);

  const wins = new Array(teams.length);
  for (let mask = 0; mask < total; mask++) {
    for (let i = 0; i < wins.length; i++) wins[i] = baseW[i];
    for (let g = 0; g < n; g++) wins[(mask >> g) & 1 ? A[g] : B[g]]++;

    const sorted = wins.slice().sort((x, y) => y - x);
    cuts.forEach((c, ci) => { if (sorted[c.k - 1] === sorted[c.k]) tieCnt[ci]++; });

    for (let i = 0; i < wins.length; i++) {
      let above = 0, tie = 0;
      for (let j = 0; j < wins.length; j++) {
        if (j === i) continue;
        if (wins[j] > wins[i]) above++;
        else if (wins[j] === wins[i]) tie++;
      }
      const k = wins[i] - baseW[i];             // 이 조합에서 팀 i 의 잔여 승수
      cuts.forEach((c, ci) => {
        if (above + tie <= c.k - 1) anyIn[i][ci][k] = true;   // 동률 없이 K위 안
        else allSafe[i][ci][k] = false;
      });
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
      let hope = null;
      for (let w = 0; w <= remT[i] && hope == null; w++) if (anyIn[i][ci][w]) hope = w;
      return { k: c.k, label: c.label, safe, hope };
    });
    return { team: t, w: r.w, l: r.l, pt: (r.sw || 0) - (r.sl || 0), remaining: remT[i], cuts: per };
  }).sort(standingsSort);

  return { rows, scenarioCount: total, remainCount: n,
           tiePct: tieCnt.map(c => Math.round((c / total) * 100)) };
}

// 그룹의 순위표 컷 — 자리(숫자) 기준으로만 말한다.
// 각 자리의 의미(직행·플레이-인 등)는 공식 규정 기준으로 화면에서 따로 설명한다.
const RACE_CUTS = {
  r34L: [{ k: 2, label: "2위 안" }, { k: 4, label: "5위 회피" }],
  r34R: [{ k: 3, label: "3위 안" }],
};

// Cache(store.js)에서 재료를 꺼내 그룹 하나를 계산한다
function raceFromCache(stageId) {
  const stage = Cache.records.find(s => s.id === stageId);
  const cuts = RACE_CUTS[stageId];
  if (!stage || !cuts) return null;
  const teams = (stage.records || []).map(r => r.team).filter(t => TEAM_MAP[t]);
  if (teams.length < 2) return null;

  const base = {};
  cumulativeStandings().forEach(r => { if (teams.includes(r.team)) base[r.team] = r; });

  const key = x => String(x || "").trim().toLowerCase();
  const names = new Set(Cache.records.filter(stageInTotal).map(s => key(s.name)));
  const remain = Cache.matches.filter(m =>
    m.status !== "done" && names.has(key(m.stage)) &&
    teams.includes(m.a) && teams.includes(m.b));

  const res = raceCompute(teams, base, remain, cuts);
  return res && { ...res, remain, cuts, stageId, stageName: stage.name };
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

// 커뮤니티 게시용 텍스트 표 — 그 글만 봐도 완결되게, 링크 없이
function raceCopyText(stageId) {
  const r = raceFromCache(stageId);
  if (!r) return "";
  const today = new Date();
  const md = `${today.getMonth() + 1}/${today.getDate()}`;
  const nm = t => (TEAM_MAP[t] ? TEAM_MAP[t].abbr : t);
  const pad = (s, w) => String(s) + " ".repeat(Math.max(0, w - String(s).replace(/[가-힣]/g, "xx").length));

  let out = `[정리] ${md} 기준 LCK ${r.stageName.includes("레전드") ? "레전드" : r.stageName.includes("라이즈") ? "라이즈" : ""} 그룹 경우의 수\n`;
  out += `(잔여 ${r.remainCount}경기 · 승패 조합 ${r.scenarioCount.toLocaleString()}가지 전수 계산)\n\n`;
  out += `순위 | 팀 | 전적 | 세트득실 | 잔여\n`;
  r.rows.forEach((row, i) => {
    out += `${i + 1}위  ${nm(row.team)}  ${row.w}승 ${row.l}패  ${row.pt > 0 ? "+" : ""}${row.pt}  잔여 ${row.remaining}\n`;
  });
  r.cuts.forEach((c, ci) => {
    out += `\n■ ${c.label} — 자력 확보선 (다른 경기 결과와 무관하게)\n`;
    r.rows.forEach(row => {
      const x = row.cuts[ci];
      const t = x.safe == null
        ? (x.hope == null ? "산술상 불가" : `자력 불가 · 산술 ${x.hope}승`)
        : x.safe === 0 ? "확보"
        : x.safe === row.remaining ? `전승 필요 (${x.safe}승)`
        : `${x.safe}승 / 잔여 ${row.remaining}`;
      out += `  ${nm(row.team)}  ${t}\n`;
    });
    out += `  * 조합의 ${r.tiePct[ci]}%는 이 경계가 승수 동률 — 그 경우 세트득실로 갈립니다.\n`;
  });
  out += `\n(Leaguepedia 기록 기준 · 비영리 팬 제작 · 틀린 곳 있으면 알려주세요)`;
  return out;
}
