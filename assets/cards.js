// ── 카드 스튜디오 (발행 대기함 v1) ──────────────────────────
// SNS 에 올릴 카드 이미지를 사이트 데이터에서 **그 자리에서** 만들어 준다.
// 사람이 보고 [저장] → 직접 올리는 반자동 구조 — 토큰도, 자동 발행도 없다.
//
// 발행물 규칙 (콘텐츠 계획서 07장):
//   · 팀 로고·선수 사진을 넣지 않는다 — 팀 약칭 텍스트만 (상표·초상권)
//   · 참여 인원은 CARD_MIN_N(20) 미만이면 적지 않는다
//   · 모든 숫자는 그리는 순간 DB 에서 다시 계산한다 (박제된 숫자 금지)
//   · 출처(Leaguepedia)와 비영리 표기를 항상 남긴다

const CARD_W = 1080, CARD_H = 1080, CARD_PAD = 76;
const CF = (w, px) => `${w} ${px}px -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;

function cardBegin(tag) {
  const c = document.createElement("canvas");
  c.width = CARD_W; c.height = CARD_H;
  const g = c.getContext("2d");
  g.fillStyle = "#0f1015"; g.fillRect(0, 0, CARD_W, CARD_H);
  g.fillStyle = "#ff4655"; g.fillRect(0, 0, CARD_W, 10);
  g.font = CF("bold", 40); g.fillStyle = "#ff4655";
  g.fillText("THE NEXUS", CARD_PAD, 108);
  g.font = CF("600", 26); g.fillStyle = "#9aa1b0";
  g.fillText(tag, CARD_PAD, 150);
  return { c, g };
}
function cardEnd(g, extra) {
  const d = new Date();
  g.font = CF("600", 24); g.fillStyle = "#667080"; g.textAlign = "left";
  g.fillText(`${d.getMonth() + 1}월 ${d.getDate()}일 기준${extra ? " · " + extra : ""}`, CARD_PAD, CARD_H - 92);
  g.fillText("Leaguepedia 기록 기준 · 비영리 팬 프로젝트", CARD_PAD, CARD_H - 56);
  g.textAlign = "right";
  g.fillStyle = "#9aa1b0"; g.fillText(SNS_HANDLE, CARD_W - CARD_PAD, CARD_H - 92);
  g.fillStyle = "#3a4150"; g.fillText("lck-community.vercel.app", CARD_W - CARD_PAD, CARD_H - 56);
  g.textAlign = "left";
}
function cardSave(c, name) {
  c.toBlob(blob => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  });
}

// ── ① 창립 팬 100인 레이스 ─────────────────────────────────
function drawFoundingCard() {
  const counts = TEAMS.map(t => ({ t, n: Cache.founding.filter(f => f.team === t.id).length }))
    .sort((a, b) => b.n - a.n || a.t.abbr.localeCompare(b.t.abbr));
  const lead = counts[0];
  const { c, g } = cardBegin("창립 팬 100인 레이스");

  g.font = CF("bold", 62); g.fillStyle = "#e9ebf1";
  const title = lead.n === 0 ? "지금 시작하면 1번입니다"
    : `${lead.t.abbr}가 앞서갑니다 — ${lead.n}/100`;
  g.fillText(title, CARD_PAD, 260);

  let y = 350;
  counts.slice(0, 8).forEach(({ t, n }) => {
    g.font = CF("bold", 34); g.fillStyle = "#e9ebf1";
    g.fillText(t.abbr, CARD_PAD, y + 30);
    const barX = CARD_PAD + 130, barW = CARD_W - CARD_PAD - barX - 150;
    g.fillStyle = "#1f232e"; g.fillRect(barX, y, barW, 40);
    if (n) { g.fillStyle = t.color || "#ff4655"; g.fillRect(barX, y, Math.max(8, barW * n / 100), 40); }
    g.font = CF("600", 30); g.fillStyle = "#9aa1b0"; g.textAlign = "right";
    g.fillText(`${n} / 100`, CARD_W - CARD_PAD, y + 31);
    g.textAlign = "left";
    y += 64;
  });

  g.font = CF("600", 30); g.fillStyle = "#9aa1b0";
  g.fillText("각 팀 100명이 차면 그 팀의 창립 팬 명단은", CARD_PAD, y + 46);
  g.fillText("영구히 닫힙니다. 번호는 등록 순서대로.", CARD_PAD, y + 88);

  cardEnd(g);
  return { c, caption:
`창립 팬 100인 — 팀당 선착순, ${lead.n ? `지금 ${lead.t.abbr} ${lead.n}/100` : "아직 전 팀 0명"}.
각 팀 100명이 차면 명단은 영구히 닫히고, 번호는 등록 순서대로 남습니다.
#LCK`,
    firstComment: "참여: https://lck-community.vercel.app (무료 · 비영리 팬 프로젝트)" };
}

// ── ② 생존표 (경우의 수) ───────────────────────────────────
function drawRaceCard(stageId) {
  const r = raceFromCache(stageId);
  if (!r) return null;
  const groupName = r.stageName.includes("레전드") ? "레전드 그룹" : "라이즈 그룹";
  const ci = 0, cut = r.cuts[ci];
  const { c, g } = cardBegin(`경우의 수 · ${groupName}`);

  g.font = CF("bold", 56); g.fillStyle = "#e9ebf1";
  g.fillText(`남은 ${r.remainCount}경기, ${r.scenarioCount.toLocaleString()}가지를`, CARD_PAD, 250);
  g.fillText("전부 계산했습니다", CARD_PAD, 320);

  // 순위표
  let y = 410;
  g.font = CF("600", 26); g.fillStyle = "#667080";
  g.fillText("팀", CARD_PAD, y);
  g.fillText("전적", CARD_PAD + 220, y);
  g.fillText("득실", CARD_PAD + 470, y);
  g.fillText("잔여", CARD_PAD + 640, y);
  g.textAlign = "right"; g.fillText(`${cut.label} 자력`, CARD_W - CARD_PAD, y); g.textAlign = "left";
  y += 20;
  r.rows.forEach(row => {
    const t = TEAM_MAP[row.team];
    y += 62;
    g.font = CF("bold", 38); g.fillStyle = t.color || "#e9ebf1";
    g.fillText(t.abbr, CARD_PAD, y);
    g.font = CF("600", 34); g.fillStyle = "#e9ebf1";
    g.fillText(`${row.w}승 ${row.l}패`, CARD_PAD + 220, y);
    g.fillStyle = "#9aa1b0";
    g.fillText(`${row.pt > 0 ? "+" : ""}${row.pt}`, CARD_PAD + 470, y);
    g.fillText(String(row.remaining), CARD_PAD + 640, y);
    const s = row.cuts[ci].safe;
    g.textAlign = "right";
    g.font = CF("bold", 36);
    g.fillStyle = s == null ? "#667080" : s === row.remaining ? "#f5b942" : "#2fbf71";
    g.fillText(s == null ? "자력 불가" : s === 0 ? "확보" : s === row.remaining ? `전승 (${s}승)` : `${s}승`, CARD_W - CARD_PAD, y);
    g.textAlign = "left";
  });

  y += 92;
  g.font = CF("600", 28); g.fillStyle = "#9aa1b0";
  g.fillText(`· 자력 = 다른 경기 결과와 무관하게 ${cut.label}이 보장되는 승수`, CARD_PAD, y);
  g.fillText(`· 조합의 ${r.tiePct[ci]}%는 경계가 승수 동률 — 세트 득실로 갈립니다`, CARD_PAD, y + 42);

  cardEnd(g, "매일 갱신");
  const lead = r.rows[0], leadT = TEAM_MAP[lead.team];
  return { c, caption:
`${groupName} 남은 ${r.remainCount}경기의 승패 조합 ${r.scenarioCount.toLocaleString()}가지를 전부 계산했습니다.
${cut.label} 자력 확보선 — ${r.rows.map(row => `${TEAM_MAP[row.team].abbr} ${row.cuts[ci].safe == null ? "자력불가" : row.cuts[ci].safe === 0 ? "확보" : row.cuts[ci].safe + "승"}`).join(" · ")}
승수 동률(조합의 ${r.tiePct[ci]}%)은 세트 득실로 갈립니다.
#LCK`,
    firstComment: "팀별 상세·매일 갱신: https://lck-community.vercel.app/race.html" };
}

// ── ③ LCK 넘버 (한 장에 숫자 하나) ─────────────────────────
// 후보는 전부 그 자리에서 다시 계산한다 — 박제 숫자 금지.
function numberCandidates() {
  const done = Cache.matches.filter(m => m.status === "done"
    && m.scoreA != null && m.scoreB != null && m.scoreA !== m.scoreB
    && TEAM_MAP[m.a] && TEAM_MAP[m.b]);
  const out = [];

  // 1세트를 이긴 팀이 경기를 가져간 비율
  let fsTot = 0, fsWin = 0;
  done.forEach(m => {
    const d = Cache.details[m.id];
    if (!d || !d.sets.length) return;
    const first = d.sets.slice().sort((x, y) => x._idx - y._idx)[0];
    if (first.win !== "a" && first.win !== "b") return;
    fsTot++;
    if ((first.win === "a") === (m.scoreA > m.scoreB)) fsWin++;
  });
  if (fsTot >= 30) out.push({
    num: `${Math.round(fsWin / fsTot * 100)}%`,
    fact: `올 시즌 1세트를 이긴 팀이 그 경기를 가져간 비율`,
    tail: `${fsTot}경기 중 ${fsWin}경기 — 1세트를 내주고 뒤집은 건 ${fsTot - fsWin}번뿐입니다`,
  });

  // 2-0 비율 (3판 2선승만)
  const bo3 = done.filter(m => m.scoreA + m.scoreB <= 3);
  const sweeps = bo3.filter(m => Math.min(m.scoreA, m.scoreB) === 0);
  if (bo3.length >= 30) out.push({
    num: String(sweeps.length),
    fact: `올 시즌 3판 2선승 ${bo3.length}경기 중 2-0으로 끝난 경기 수`,
    tail: `열에 ${Math.round(sweeps.length / bo3.length * 10)} — 접전보다 완승이 많은 리그입니다`,
  });

  // 팀별 2-0 최다
  const sw = {};
  sweeps.forEach(m => { const t = m.scoreA > m.scoreB ? m.a : m.b; sw[t] = (sw[t] || 0) + 1; });
  const swTop = Object.entries(sw).sort((a, b) => b[1] - a[1])[0];
  if (swTop && swTop[1] >= 5) out.push({
    num: String(swTop[1]),
    fact: `${TEAM_MAP[swTop[0]].abbr}이(가) 올 시즌 2-0으로 이긴 횟수 — 리그 최다`,
    tail: ``,
  });

  // 챔피언 수 + 승률 극단 (10픽 이상)
  // ⚠ 예전에는 배열 앞 5명을 A팀으로 가정했는데, 명단은 팀별로 묶여 있지 않다
  //   (253세트 전부 섞여 있어 승률이 100% 틀렸다 — 2026-08-07).
  //   반드시 setSides() 로 편을 갈라야 한다.
  const pick = {};
  Object.keys(Cache.details).forEach(mid => {
    const m = Cache.matches.find(x => x.id === mid);
    if (!m) return;
    (Cache.details[mid].sets || []).forEach(s => {
      const sides = setSides(m, s.players);
      (s.players || []).forEach(p => {
        const ch = (p.champ || "").trim();
        if (!ch || !sides[p.pid]) return;
        const r = pick[ch] = pick[ch] || { n: 0, w: 0 };
        r.n++;
        if (s.win === sides[p.pid]) r.w++;
      });
    });
  });
  const champs = Object.keys(pick);
  if (champs.length >= 50) out.push({
    num: String(champs.length),
    fact: `올 시즌 LCK 에 등장한 챔피언 수`,
    tail: `그중 ${champs.filter(ch => pick[ch].n === 1).length}종은 딱 한 번 나오고 사라졌습니다`,
  });
  const elig = champs.filter(ch => pick[ch].n >= 10);
  if (elig.length >= 10) {
    const lo = elig.slice().sort((a, b) => pick[a].w / pick[a].n - pick[b].w / pick[b].n)[0];
    const hi = elig.slice().sort((a, b) => pick[b].w / pick[b].n - pick[a].w / pick[a].n)[0];
    out.push({
      num: `${Math.round(pick[lo].w / pick[lo].n * 100)}%`,
      fact: `${lo}의 올 시즌 승률 — ${pick[lo].n}번 뽑혔는데 10픽 이상 중 최저`,
      tail: `가장 높은 쪽은 ${hi} (${pick[hi].n}픽 ${Math.round(pick[hi].w / pick[hi].n * 100)}%)`,
    });
  }
  return out;
}

function drawNumberCard(cand) {
  const { c, g } = cardBegin("LCK 넘버");
  g.font = CF("bold", 240); g.fillStyle = "#f5b942";
  g.fillText(cand.num, CARD_PAD, 480);

  const wrap = (text, font, x, y, maxW, lh) => {
    g.font = font;
    let line = "";
    text.split(" ").forEach(w => {
      if (g.measureText(line + w).width > maxW) { g.fillText(line.trim(), x, y); y += lh; line = ""; }
      line += w + " ";
    });
    if (line.trim()) { g.fillText(line.trim(), x, y); y += lh; }
    return y;
  };
  g.fillStyle = "#e9ebf1";
  let y = wrap(cand.fact, CF("bold", 52), CARD_PAD, 610, CARD_W - CARD_PAD * 2, 70);
  if (cand.tail) { g.fillStyle = "#9aa1b0"; wrap(cand.tail, CF("600", 34), CARD_PAD, y + 26, CARD_W - CARD_PAD * 2, 48); }

  cardEnd(g);
  return { c, caption: `${cand.num} — ${cand.fact}.\n${cand.tail ? cand.tail + "\n" : ""}#LCK`,
    firstComment: "전 경기 기록: https://lck-community.vercel.app/matches.html" };
}

// ── 방송 그래픽 공통 배경 ──────────────────────────────────
// 사진 없이 방송 중계 그래픽의 질감을 낸다: 어두운 비네트 + 양 팀 색의
// 사선 빛 + 미세한 입자. (선수 사진은 초상권·저작권 문제로 쓰지 않는다)
function broadcastBg(g, colA, colB) {
  const W = CARD_W, H = CARD_H;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#12141d"); bg.addColorStop(0.55, "#0b0c12"); bg.addColorStop(1, "#08090d");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const wash = (x, y, color) => {
    const r = g.createRadialGradient(x, y, 40, x, y, 620);
    r.addColorStop(0, color + "26"); r.addColorStop(1, color + "00");
    g.fillStyle = r; g.fillRect(0, 0, W, H);
  };
  wash(W * 0.12, H * 0.3, colA || "#4a8cff");
  wash(W * 0.88, H * 0.72, colB || "#ff4655");
  // 입자 — 사진 없는 배경이 밋밋해 보이지 않게
  g.fillStyle = "#ffffff";
  for (let i = 0; i < 420; i++) {
    g.globalAlpha = Math.random() * 0.05;
    g.fillRect(Math.random() * W, Math.random() * H, 1.3, 1.3);
  }
  g.globalAlpha = 1;
  g.fillStyle = "#ff4655"; g.fillRect(0, 0, W, 8);
}
const bLine = (g, y, x0, x1) => {
  const ln = g.createLinearGradient(x0, 0, x1, 0);
  ln.addColorStop(0, "#ffffff00"); ln.addColorStop(0.5, "#ffffff59"); ln.addColorStop(1, "#ffffff00");
  g.fillStyle = ln; g.fillRect(x0, y, x1 - x0, 2);
};

// ── ⑤ 경기 결과 캐러셀 (3장) — 헤드라인 · 스코어보드 · 선수 기록 ──
function drawResultCarousel(matchId, headline) {
  const m = Cache.matches.find(x => x.id === matchId);
  if (!m || m.status !== "done" || m.scoreA == null || m.scoreB == null || m.scoreA === m.scoreB) return null;
  const A = TEAM_MAP[m.a], B = TEAM_MAP[m.b];
  if (!A || !B) return null;
  const aWin = m.scoreA > m.scoreB;
  const WIN = aWin ? A : B, LOSE = aWin ? B : A;
  const ws = Math.max(m.scoreA, m.scoreB), ls = Math.min(m.scoreA, m.scoreB);
  const d = m.at ? new Date(m.at) : new Date();
  const kicker = `2026 LCK · ${shortStage(m.stage) || "정규시즌"} · ${d.getMonth() + 1}월 ${d.getDate()}일`;
  const pom = pomForMatch(m.id);
  const pomPl = pom ? getPlayer(pom.player_id) : null;
  const slides = [];

  // ── 1장: 헤드라인 ──
  {
    const c = document.createElement("canvas");
    c.width = CARD_W; c.height = CARD_H;
    const g = c.getContext("2d");
    broadcastBg(g, WIN.color, LOSE.color);
    g.font = CF("bold", 40); g.fillStyle = "#ff4655";
    g.fillText("THE NEXUS", CARD_PAD, 118);

    g.font = CF("600", 30); g.fillStyle = "#8a92a3";
    g.fillText(kicker, CARD_PAD, 560);

    // 헤드라인 — 비우면 자동 문장, 최대 2줄 자동 줄바꿈
    const text = (headline || "").trim() || `${WIN.abbr}, ${LOSE.abbr} ${ws}대${ls} ${ls === 0 ? "제압" : "승리"}`;
    g.fillStyle = "#f2f4f8"; g.font = CF("bold", 96);
    const words = text.split(" "), lines = [""];
    words.forEach(w => {
      const t = (lines[lines.length - 1] + " " + w).trim();
      if (g.measureText(t).width > CARD_W - CARD_PAD * 2 && lines[lines.length - 1]) lines.push(w);
      else lines[lines.length - 1] = t;
    });
    lines.slice(0, 2).forEach((ln, i) => g.fillText(ln, CARD_PAD, 680 + i * 118));

    // 점수 줄 — 팀 약칭은 팀 색으로
    const y = 680 + Math.min(lines.length, 2) * 118 + 40;
    g.font = CF("bold", 52);
    let x = CARD_PAD;
    [[A.abbr, A.color], [`  ${m.scoreA} : ${m.scoreB}  `, "#f2f4f8"], [B.abbr, B.color]].forEach(([t, col]) => {
      g.fillStyle = col; g.fillText(t, x, y); x += g.measureText(t).width;
    });
    cardEnd(g);
    slides.push(c);
  }

  // ── 2장: 스코어보드 (방송 그래픽 구도) ──
  {
    const c = document.createElement("canvas");
    c.width = CARD_W; c.height = CARD_H;
    const g = c.getContext("2d");
    broadcastBg(g, A.color, B.color);
    g.font = CF("bold", 40); g.fillStyle = "#ff4655";
    g.fillText("THE NEXUS", CARD_PAD, 118);

    const cy = CARD_H * 0.47;
    if (pomPl) {
      g.textAlign = "center"; g.font = CF("600", 30); g.fillStyle = "#aab1c0";
      g.fillText(`POM · ${WIN.abbr} ${pomPl.nick}`, CARD_W / 2, cy - 168);
    }
    bLine(g, cy - 128, CARD_PAD, CARD_W - CARD_PAD);
    bLine(g, cy + 96, CARD_PAD, CARD_W - CARD_PAD);

    g.textAlign = "center";
    g.font = CF("bold", 96);
    g.fillStyle = A.color || "#e9ebf1"; g.fillText(A.abbr, CARD_W * 0.17, cy + 34);
    g.fillStyle = B.color || "#e9ebf1"; g.fillText(B.abbr, CARD_W * 0.83, cy + 34);
    g.fillStyle = "#f2f4f8"; g.font = CF("bold", 170);
    g.fillText(String(m.scoreA), CARD_W * 0.40, cy + 58);
    g.fillText(String(m.scoreB), CARD_W * 0.60, cy + 58);
    g.fillStyle = "#ffffff40"; g.fillRect(CARD_W / 2 - 2, cy - 92, 4, 130);

    g.font = CF("bold", 34); g.fillStyle = "#e9ebf1";
    g.fillText("경기 종료", CARD_W / 2, cy + 160);
    g.font = CF("600", 28); g.fillStyle = "#7c8496";
    g.fillText(kicker, CARD_W / 2, cy + 206);
    g.textAlign = "left";
    cardEnd(g);
    slides.push(c);
  }

  // ── 3장: 선수 기록 — 팬 평점이 충분히 모였으면 평점, 아니면 경기 합산 KDA ──
  {
    const det = Cache.details[m.id];
    const rows = (det && det.sets.length) ? fanRatingRows(m) : [];
    if (rows.length) {
      const voters = matchRatingVoters(m.id);
      const useRating = voters >= CARD_MIN_N;   // 표본 부족이면 평점 숫자를 밖에 내지 않는다
      // 경기 합산 KDA
      const kda = {};
      det.sets.forEach(s => (s.players || []).forEach(p => {
        if (!p.pid) return;
        const r = kda[p.pid] = kda[p.pid] || { k: 0, d: 0, a: 0 };
        r.k += +p.k || 0; r.d += +p.d || 0; r.a += +p.a || 0;
      }));

      const c = document.createElement("canvas");
      c.width = CARD_W; c.height = CARD_H;
      const g = c.getContext("2d");
      broadcastBg(g, A.color, B.color);
      g.font = CF("bold", 40); g.fillStyle = "#ff4655";
      g.fillText("THE NEXUS", CARD_PAD, 118);

      g.textAlign = "center";
      g.font = CF("bold", 44); g.fillStyle = "#f2f4f8";
      g.fillText(useRating ? "팬 평점" : "선수 기록", CARD_W / 2, 208);
      g.font = CF("600", 26); g.fillStyle = "#7c8496";
      g.fillText(useRating ? `${voters}명 참여 · 세트 평점 합산` : `${A.abbr} ${m.scoreA} : ${m.scoreB} ${B.abbr} · 경기 합산 K/D/A`, CARD_W / 2, 252);

      const top = 330, rowH = 118;
      const chip = (x, y, color, text) => {
        g.beginPath();
        if (g.roundRect) g.roundRect(x - 74, y - 40, 148, 62, 10); else g.rect(x - 74, y - 40, 148, 62);
        g.fillStyle = color || "#3a4150"; g.fill();
        g.fillStyle = "#ffffff"; g.font = CF("bold", 30);
        g.fillText(text, x, y + 3);
      };
      rows.slice(0, 5).forEach((r, i) => {
        const y = top + i * rowH;
        g.font = CF("600", 24); g.fillStyle = "#5b6373";
        g.fillText(r.pos, CARD_W / 2, y + 3);
        if (r.a) {
          const v = useRating ? (r.a.s.all ? r.a.s.all.avg.toFixed(1) : "—")
            : (x => x ? `${x.k}/${x.d}/${x.a}` : "—")(kda[r.a.p.id]);
          g.textAlign = "left"; g.font = CF("bold", 32); g.fillStyle = "#e9ebf1";
          g.fillText(r.a.p.nick, CARD_PAD, y + 4);
          g.textAlign = "center"; chip(CARD_W * 0.36, y, A.color, v);
        }
        if (r.b) {
          const v = useRating ? (r.b.s.all ? r.b.s.all.avg.toFixed(1) : "—")
            : (x => x ? `${x.k}/${x.d}/${x.a}` : "—")(kda[r.b.p.id]);
          chip(CARD_W * 0.64, y, B.color, v);
          g.textAlign = "right"; g.font = CF("bold", 32); g.fillStyle = "#e9ebf1";
          g.fillText(r.b.p.nick, CARD_W - CARD_PAD, y + 4);
          g.textAlign = "center";
        }
      });
      g.textAlign = "left";
      cardEnd(g, useRating ? "당신의 평점은? 사이트에서" : "팬 평점은 사이트에서");
      slides.push(c);
    }
  }

  const cap = (headline || "").trim() || `${WIN.abbr}, ${LOSE.abbr} ${ws}대${ls} ${ls === 0 ? "제압" : "승리"}`;
  return {
    slides,
    caption: `${cap}\n${A.abbr} ${m.scoreA} : ${m.scoreB} ${B.abbr} · ${shortStage(m.stage) || ""}${pomPl ? `\n공식 POM ${pomPl.nick}` : ""}\n당신의 평점은?\n#LCK #${WIN.abbr}`,
    firstComment: `세트별 팬 평점 참여: https://lck-community.vercel.app/match/${m.id}`,
  };
}

// ── ④ 매치데이 카드 ────────────────────────────────────────
function drawMatchdayCard(matchId) {
  const m = Cache.matches.find(x => x.id === matchId);
  if (!m) return null;
  const A = TEAM_MAP[m.a], B = TEAM_MAP[m.b];
  if (!A || !B) return null;

  // 올 시즌 상대 전적 · 최근 5경기 (전부 실제 기록에서)
  const done = Cache.matches.filter(x => x.status === "done"
    && x.scoreA != null && x.scoreB != null && x.scoreA !== x.scoreB);
  let h2hA = 0, h2hB = 0;
  done.forEach(x => {
    if (x.a === m.a && x.b === m.b) (x.scoreA > x.scoreB ? h2hA++ : h2hB++);
    if (x.a === m.b && x.b === m.a) (x.scoreA > x.scoreB ? h2hB++ : h2hA++);
  });
  const form = t => done.filter(x => x.a === t || x.b === t)
    .sort((x, y) => new Date(y.at) - new Date(x.at)).slice(0, 5).reverse()
    .map(x => ((x.a === t) === (x.scoreA > x.scoreB)) ? "승" : "패").join("");

  const { c, g } = cardBegin("매치데이");
  const when = m.at ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul",
    month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(m.at)) : "";
  g.font = CF("600", 34); g.fillStyle = "#9aa1b0";
  g.fillText(`오늘 ${when}`, CARD_PAD, 250);

  g.textAlign = "center";
  g.font = CF("bold", 110);
  g.fillStyle = A.color || "#e9ebf1"; g.fillText(A.abbr, CARD_W * 0.28, 420);
  g.fillStyle = "#3a4150"; g.font = CF("bold", 60); g.fillText("VS", CARD_W / 2, 405);
  g.fillStyle = B.color || "#e9ebf1"; g.font = CF("bold", 110); g.fillText(B.abbr, CARD_W * 0.72, 420);
  g.textAlign = "left";

  let y = 560;
  g.font = CF("600", 36); g.fillStyle = "#e9ebf1";
  g.fillText(`올 시즌 상대 전적  ${A.abbr} ${h2hA} : ${h2hB} ${B.abbr}`, CARD_PAD, y);
  y += 62;
  g.font = CF("600", 32); g.fillStyle = "#9aa1b0";
  g.fillText(`최근 5경기  ${A.abbr} ${form(m.a) || "-"}  ·  ${B.abbr} ${form(m.b) || "-"}`, CARD_PAD, y);

  // 경우의 수 조건 (같은 그룹 경기일 때만)
  const sid = Object.keys(RACE_CUTS).find(id => {
    const st = Cache.records.find(s => s.id === id);
    const teams = (st?.records || []).map(r => r.team);
    return teams.includes(m.a) && teams.includes(m.b);
  });
  if (sid) {
    const r0 = raceFromCache(sid);
    const inRemain = r0 && r0.remain.some(x => x.id === m.id);
    if (inRemain) {
      const ci = 0, cut = r0.cuts[ci];
      const ifA = raceWhatIf(sid, m.id, "a"), ifB = raceWhatIf(sid, m.id, "b");
      const safeOf = (res, t) => res?.rows.find(x => x.team === t)?.cuts[ci].safe;
      const f = v => v == null ? "자력 불가" : v === 0 ? "확보" : `${v}승`;
      y += 84;
      g.font = CF("bold", 34); g.fillStyle = "#e9ebf1";
      g.fillText(`${cut.label} 자력 확보선이 갈립니다`, CARD_PAD, y);
      y += 56;
      g.font = CF("600", 32); g.fillStyle = "#9aa1b0";
      g.fillText(`${A.abbr} — 이기면 ${f(safeOf(ifA, m.a))}, 지면 ${f(safeOf(ifB, m.a))}`, CARD_PAD, y);
      y += 48;
      g.fillText(`${B.abbr} — 이기면 ${f(safeOf(ifB, m.b))}, 지면 ${f(safeOf(ifA, m.b))}`, CARD_PAD, y);
    }
  }

  g.font = CF("bold", 40); g.fillStyle = "#f5b942";
  g.fillText("여러분의 예상은?", CARD_PAD, 920);

  cardEnd(g);
  return { c, caption:
`오늘 ${when} · ${A.abbr} vs ${B.abbr}
올 시즌 상대 전적 ${h2hA}:${h2hB} · 최근 5경기 ${A.abbr} ${form(m.a) || "-"} / ${B.abbr} ${form(m.b) || "-"}
여러분의 예상은?
#LCK`,
    firstComment: `승부예측 참여: https://lck-community.vercel.app/predict.html` };
}
