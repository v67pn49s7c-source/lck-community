// ── 대진표 모양 선언 ────────────────────────────────────────────
//
// 여기는 **대진 엔진이 아니다.** 누가 어느 경기에 나가는지는 이미 경기 기록
// (matches.a / matches.b)에 들어 있다 — 리그피디아가 알려 주고, 일정 갱신이 채운다.
// 그래서 이 파일이 할 일은 딱 둘이다:
//   ① 각 경기를 대진표의 **어느 칸**에 놓을 것인가 (열·행)
//   ② 각 자리가 **무슨 자리**인가 ("5위", "R1 승자 →") 와 이기면 무엇을 얻는가
//
// 이렇게 하면 계산이 틀릴 일이 없다. 아직 안 치러진 경기는 팀 자리가 비어 있고,
// 자리 라벨이 "누가 올 자리인지"를 대신 말해 준다 (공식 대진표와 같은 방식).
//
// match: 경기를 찾는 규칙. 우리 경기 id 는 리그피디아 MatchId 에서 오므로
//        (예: lpLCK2026SeasonRoadtoMSI_Round1_1) 그 꼬리로 짚는다.
//        관리자가 손으로 만든 경기는 label 에 마디 이름(R1·PI-F 등)을 적으면 그것도 잡는다.
// win/lose: 이기면·지면 어디로 가는가. kind 는 색 — adv(다음 라운드) · fin(최종 진출) · out(탈락)

const BRACKETS = {
  // ── 2026 LCK Road to MSI (6팀 · 5경기) ──────────────────────
  // 1-2라운드 순위 상위 6팀. 1·2위는 한 경기로 MSI 1시드를 가리고,
  // 3~6위는 아래에서부터 올라온다.
  "lck2026-msi": {
    cols: ["1라운드", "2라운드", "3-4라운드", "최종전"],
    rows: 2,
    nodes: [
      { id: "R1", col: 0, row: 2, title: "Round 1", match: /_Round1_1$/i,
        a: { from: "5위" }, b: { from: "6위" },
        win: { to: "2라운드", kind: "adv" }, lose: { to: "탈락", kind: "out" } },

      { id: "R2", col: 1, row: 2, title: "Round 2", match: /_Round2_1$/i,
        a: { from: "4위" }, b: { from: "R1 승자", arrow: "→" },
        win: { to: "4라운드", kind: "adv" }, lose: { to: "탈락", kind: "out" } },

      { id: "R3", col: 2, row: 1, title: "Round 3", match: /_Round3_1$/i,
        a: { from: "1위" }, b: { from: "2위" },
        win: { to: "MSI 1시드", kind: "fin" }, lose: { to: "최종전", kind: "adv" } },

      { id: "R4", col: 2, row: 2, title: "Round 4", match: /_Round3_2$/i,
        a: { from: "3위" }, b: { from: "R2 승자", arrow: "→" },
        win: { to: "최종전", kind: "adv" }, lose: { to: "탈락", kind: "out" } },

      { id: "F", col: 3, row: 0, title: "Final Round", match: /_Round4_1$/i,
        a: { from: "R3 패자", arrow: "↘" }, b: { from: "R4 승자", arrow: "↗" },
        win: { to: "MSI 2시드", kind: "fin" }, lose: { to: "탈락", kind: "out" } },
    ],
    legend: [["adv", "다음 라운드 진출"], ["fin", "2026 MSI 진출"]],
  },

  // ── 2026 LCK 플레이-인 (4팀 · 3경기 · 8/26~28) ──────────────
  // 2025년의 4팀 더블 엘리미네이션이 아니라 3경기로 압축된 시드 토너먼트다.
  // ⚠ 1라운드 승자는 **바로 플레이오프**로 가고, 2라운드 승자는 한 경기를 더 해야 한다.
  //    같은 열에 있다고 같은 라운드가 아니다.
  "lck2026-playin": {
    cols: ["1·2라운드", "최종전"],
    rows: 2,
    nodes: [
      { id: "PI-R1", col: 0, row: 1, title: "Round 1 (8/26)", match: /_(PI)?R(ound)?1_1$/i,
        a: { from: "레전드 5위" }, b: { from: "라이즈 1위" },
        win: { to: "플레이오프 5시드", kind: "fin" }, lose: { to: "최종전", kind: "adv" } },

      { id: "PI-R2", col: 0, row: 2, title: "Round 2 (8/27)", match: /_(PI)?R(ound)?2_1$/i,
        a: { from: "라이즈 2위" }, b: { from: "라이즈 3위" },
        win: { to: "최종전", kind: "adv" }, lose: { to: "시즌 8위", kind: "out" } },

      { id: "PI-F", col: 1, row: 0, title: "Final Round (8/28)", match: /_(PI)?F(inal)?_?1?$/i,
        a: { from: "R1 패자", arrow: "↘" }, b: { from: "R2 승자", arrow: "↗" },
        win: { to: "플레이오프 6시드", kind: "fin" }, lose: { to: "시즌 7위", kind: "out" } },
    ],
    legend: [["adv", "다음 경기 진출"], ["fin", "플레이오프 진출"]],
  },

  // ── 2026 LCK 플레이오프 (6팀 · 10경기 · 8/29~9/13) ──────────
  // 풀 더블 엘리미네이션. 두 번 지면 탈락, 결승에서 브래킷 리셋은 없다.
  // ⚠ 자리 라벨에 '지목'이 나오는 곳이 둘 있다 — 3시드와 1시드가 상대를 고른다.
  //    우리가 그걸 계산하지는 않는다. 대진이 정해지면 실제 대진이 경기 기록으로 들어오고,
  //    라벨은 "그 자리가 어떻게 정해지는 자리인지"만 말해 준다.
  "lck2026-playoffs": {
    cols: ["1라운드", "2라운드", "3라운드", "4라운드", "결승"],
    rows: 4,
    nodes: [
      // 승자조
      { id: "UB-R1-M1", col: 0, row: 1, title: "승자조 R1 (8/29)", match: /_UBR1M1$/i,
        a: { from: "레전드 3위" }, b: { from: "3시드가 지목", arrow: "PI 통과팀" },
        win: { to: "승자조 R2", kind: "adv" }, lose: { to: "패자조 R1", kind: "out" } },
      { id: "UB-R1-M2", col: 0, row: 2, title: "승자조 R1 (8/30)", match: /_UBR1M2$/i,
        a: { from: "레전드 4위" }, b: { from: "지목받지 않은", arrow: "PI 통과팀" },
        win: { to: "승자조 R2", kind: "adv" }, lose: { to: "패자조 R1", kind: "out" } },

      { id: "UB-R2-M1", col: 1, row: 1, title: "승자조 R2 (9/1)", match: /_UBR2M1$/i,
        a: { from: "레전드 1위" }, b: { from: "1시드가 지목", arrow: "UB R1 승자" },
        win: { to: "승자조 R3", kind: "adv" }, lose: { to: "패자조", kind: "out" } },
      { id: "UB-R2-M2", col: 1, row: 2, title: "승자조 R2 (9/2)", match: /_UBR2M2$/i,
        a: { from: "레전드 2위" }, b: { from: "지목받지 않은", arrow: "UB R1 승자" },
        win: { to: "승자조 R3", kind: "adv" }, lose: { to: "패자조", kind: "out" } },

      { id: "UB-R3", col: 2, row: 1, title: "승자조 R3 (9/5)", match: /_UBR3$/i,
        a: { from: "UB R2-M1 승자", arrow: "↘" }, b: { from: "UB R2-M2 승자", arrow: "↗" },
        win: { to: "결승 직행", kind: "fin" }, lose: { to: "결승 진출전", kind: "adv" } },

      // 패자조
      { id: "LB-R1", col: 1, row: 3, title: "패자조 R1 (9/3)", match: /_LBR1$/i,
        a: { from: "UB R1-M1 패자", arrow: "↘" }, b: { from: "UB R1-M2 패자", arrow: "↗" },
        win: { to: "패자조 R2", kind: "adv" }, lose: { to: "시즌 6위", kind: "out" } },
      { id: "LB-R2", col: 2, row: 3, title: "패자조 R2 (9/4)", match: /_LBR2$/i,
        a: { from: "LB R1 승자", arrow: "↘" }, b: { from: "UB R2 패자 중 낮은 시드" },
        win: { to: "패자조 R3", kind: "adv" }, lose: { to: "시즌 5위", kind: "out" } },
      { id: "LB-R3", col: 3, row: 3, title: "패자조 R3 (9/6)", match: /_LBR3$/i,
        a: { from: "UB R2 패자 중 높은 시드" }, b: { from: "LB R2 승자", arrow: "↗" },
        win: { to: "결승 진출전", kind: "adv" }, lose: { to: "시즌 4위", kind: "out" } },
      { id: "LB-F", col: 3, row: 1, title: "결승 진출전 (9/12)", match: /_LBF$/i,
        a: { from: "UB R3 패자", arrow: "↘" }, b: { from: "LB R3 승자", arrow: "↗" },
        win: { to: "결승", kind: "adv" }, lose: { to: "시즌 3위", kind: "out" } },

      { id: "GF", col: 4, row: 0, title: "결승 (9/13)", match: /_GF$/i,
        a: { from: "UB R3 승자", arrow: "↘" }, b: { from: "결승 진출전 승자", arrow: "↗" },
        win: { to: "2026 LCK 우승", kind: "fin" }, lose: { to: "준우승", kind: "out" } },
    ],
    legend: [["adv", "다음 라운드 진출"], ["fin", "결승 직행 · 우승"]],
  },
};

/** 대회 하나의 대진표를 그릴 재료를 만든다.
 *  경기를 못 찾은 마디도 **그대로 돌려준다** — 아직 안 치러진 경기는 빈 칸으로 보여야 한다. */
function bracketOf(tid) {
  const spec = BRACKETS[tid];
  if (!spec) return null;
  const ms = (Cache.matches || []).filter(m => m.tid === tid);
  const used = new Set();
  const nodes = spec.nodes.map(n => {
    const m = ms.find(x => !used.has(x.id) &&
      ((n.match && n.match.test(x.id)) || (x.label || "").trim().toUpperCase() === n.id));
    if (m) used.add(m.id);
    return { ...n, match: m || null };
  });
  return { ...spec, tid, nodes };
}

// ── 대진표 그리기 ──────────────────────────────────────────────
// 열 = 라운드, 행 = 위/아래 가지. 아직 팀이 안 정해진 자리는 라벨만 보여 준다.
// ⚠ 이 결과는 **#bracket-body 안에** 들어간다. 그 요소가 곧 .bracket(가로 flex) 이므로
//   여기서 .bracket 을 또 만들면 안 되고, 범례도 여기 넣으면 열 옆에 붙는다.
//   범례는 bracketLegendHTML() 로 따로 뽑아 화면 아래쪽 자리에 넣는다.
function bracketHTML(spec) {
  return spec.cols.map((name, ci) => {
    const inCol = spec.nodes.filter(n => n.col === ci);
    return `
      <div class="bracket-col">
        <div class="bracket-col-title">${esc(name)}</div>
        <div class="bracket-col-body" style="--rows:${spec.rows || 1}">
          ${inCol.map(n => nodeHTML(n, spec)).join("")}
        </div>
      </div>`;
  }).join("");
}

function bracketLegendHTML(spec) {
  const keys = (spec.legend || []).map(([k, t]) =>
    `<span class="bl-key"><i class="${k}"></i>${esc(t)}</span>`).join("");
  return keys + ` <span class="bl-key" style="color:var(--text-dim)">경기 칸을 누르면 그 경기 페이지로 갑니다</span>`;
}

function nodeHTML(n, spec) {
  const m = n.match;
  const done = m && m.status === "done" && m.scoreA != null && m.scoreB != null;
  const winSide = !done ? null : (m.scoreA > m.scoreB ? "a" : m.scoreA < m.scoreB ? "b" : null);

  const slot = side => {
    const meta = n[side] || {};
    const team = m ? (side === "a" ? m.a : m.b) : null;
    const score = m ? (side === "a" ? m.scoreA : m.scoreB) : null;
    const t = team ? TEAM_MAP[team] : null;
    const won = winSide === side;
    const lost = winSide && winSide !== side;
    // 이겨서 무엇을 얻었나 — 색이 갈린다 (범례와 짝)
    const kind = won ? (n.win && n.win.kind) || "adv" : "";
    return `
      <div class="bm-slot ${t ? "" : "tbd"} ${won ? "winner" : ""} ${kind === "fin" ? "adv-final" : ""} ${lost ? "loser" : ""}">
        <span class="bm-from">${esc(meta.from || "")}${meta.arrow ? `<span class="arrow">${esc(meta.arrow)}</span>` : ""}</span>
        <span class="bm-who">${t ? teamLogoHTML(t, 22) : `<span class="team-logo tbd-logo"></span>`}
          <span>${t ? esc(t.abbr) : "TBD"}</span></span>
        <span class="score">${score != null ? score : ""}</span>
      </div>`;
  };

  const when = m && m.at
    ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" }).format(new Date(m.at))
    : "";
  const inner = `
    <div class="bm-head"><span>${esc(n.title)}</span><span class="bm-date">${esc(when)}</span></div>
    ${slot("a")}${slot("b")}`;

  const style = n.row ? `style="grid-row:${n.row}"` : `style="grid-row:1 / -1; align-self:center"`;
  return m
    ? `<a class="bracket-match" ${style} href="/match/${q(m.id)}">${inner}</a>`
    : `<div class="bracket-match" ${style}>${inner}</div>`;
}
