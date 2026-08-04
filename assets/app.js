// ── 공통 유틸 ───────────────────────────────────────────
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// 주소(URL)에 값을 넣을 때 — DB에서 온 id는 화면 코드가 만든 값이라는 보장이 없다.
// 따옴표·꺾쇠가 섞여 있으면 링크 태그를 탈출해 스크립트가 되므로 반드시 통과시킨다.
function q(v) { return encodeURIComponent(String(v ?? "")); }

function teamLogoHTML(team, size) {
  const s = size || 24;
  const cut = Math.max(4, Math.round(s * 0.2));
  return `<span class="team-logo" style="width:${s}px;height:${s}px;
    clip-path:polygon(0 0, 100% 0, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, 0 100%);">
    <img src="assets/logos/${team.id}.svg" alt="${team.abbr} 로고"></span>`;
}

// 팀 슬롯: 실제 팀이면 로고, 아니면 "미정 자리" 표시 (토너먼트 대진용)
// v 값: 팀 id("t1") 또는 자유 텍스트("레전드 3위", "UB R1 승자") 또는 빈 값
function placeholderLogoHTML(size) {
  const s = size || 24;
  const cut = Math.max(4, Math.round(s * 0.2));
  return `<span class="team-logo placeholder" style="width:${s}px;height:${s}px;font-size:${Math.round(s * 0.45)}px;
    clip-path:polygon(0 0, 100% 0, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, 0 100%);">?</span>`;
}
function slotLogoHTML(v, size) {
  const t = TEAM_MAP[v];
  return t ? teamLogoHTML(t, size) : placeholderLogoHTML(size);
}
function slotName(v) {
  const t = TEAM_MAP[v];
  if (t) return t.abbr;
  return v ? esc(v) : "미정";
}
function isRealTeam(v) { return !!TEAM_MAP[v]; }
function knownTeams(m) { return isRealTeam(m.a) && isRealTeam(m.b); }

// 닉네임 + 응원팀 배지 (+ 창립 팬 번호)
function nickHTML(nick, teamId) {
  const t = teamId ? TEAM_MAP[teamId] : null;
  if (!t) return esc(nick);
  const fno = foundingNoOf(nick, teamId);
  return `${esc(nick)}<span class="nick-badge" title="${t.name} 팬">${teamLogoHTML(t, 14)}</span>`
    + (fno ? `<span class="founding-chip" title="${t.abbr} 창립 팬 #${fno}">#${fno}</span>` : "");
}

// KST 기준 날짜 표기
const KST_FMT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", month: "numeric", day: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: false,
});
const KST_DAY_FMT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", year: "2-digit", month: "2-digit", day: "2-digit", weekday: "short",
});
const KST_TIME_FMT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false,
});
function fmtWhen(iso) { return KST_FMT.format(new Date(iso)) + " KST"; }
function fmtDay(iso) { return KST_DAY_FMT.format(new Date(iso)); }
function fmtTime(iso) { return KST_TIME_FMT.format(new Date(iso)); }
function isTodayKST(iso) { return fmtDayKey(iso) === fmtDayKey(new Date().toISOString()); }
function fmtDayKey(iso) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(iso));
}
function fmtAgo(ts) {
  const d = Date.now() - ts;
  if (d < 60e3) return "방금";
  if (d < 3600e3) return Math.floor(d / 60e3) + "분 전";
  if (d < 86400e3) return Math.floor(d / 3600e3) + "시간 전";
  const dt = new Date(ts);
  return `${String(dt.getMonth() + 1).padStart(2, "0")}.${String(dt.getDate()).padStart(2, "0")}`;
}

// 배당률 → 예상 승률
function impliedPct(m) {
  const ia = 1 / (m.oddsA || 2), ib = 1 / (m.oddsB || 2);
  const a = Math.round((ia / (ia + ib)) * 1000) / 10;
  return { a, b: Math.round((100 - a) * 10) / 10 };
}

// ── 테마 ──
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("lck_theme", theme);
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.textContent = theme === "dark" ? "☀" : "☾";
    btn.title = theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환";
  }
}

// ── 헤더 / 푸터 ──
const NAV_MENUS = [
  ["홈", "index.html"], ["경기", "matches.html"], ["순위", "standings.html"], ["승부예측", "predict.html"],
  ["오늘의 경기", "live.html"], ["커뮤니티", "community.html"], ["팀", "teams.html"], ["선수", "players.html"],
  ["수상", "awards.html"], ["랭킹", "ranking.html"],
];

function renderHeader(activeMenu, activeTeamId) {
  document.body.classList.add("app-ready"); // 데이터 로드 완료 → 화면 표시
  window.__readyMs = Math.round(performance.now()); // 로딩 체감 측정용
  const header = document.createElement("div");
  header.innerHTML = `
  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="index.html" title="The Nexus">
        <img class="brand-full light" src="${brandLogoURL("desktop-light", "assets/brand/nexus-desktop.png")}" alt="The Nexus">
        <img class="brand-full dark" src="${brandLogoURL("desktop-dark", "assets/brand/nexus-desktop-dark.png")}" alt="The Nexus">
        <img class="brand-icon" src="${brandLogoURL("mobile", "assets/brand/nexus-mobile.png")}" alt="The Nexus">
      </a>
      <nav class="main-nav">
        ${NAV_MENUS.map(([m, href]) => `<a href="${href}" class="${m === activeMenu ? "active" : ""}">${m}</a>`).join("")}
      </nav>
      <div class="header-actions">
        <button class="btn-icon" id="theme-toggle"></button>
        ${Auth.session
          ? (Auth.profile
            ? `<span class="user-chip" title="${esc(Auth.session.user.email || "")}">${esc(Auth.profile.nick)}</span>`
            : `<a class="user-chip" href="login.html" title="닉네임·응원팀을 설정해 주세요">프로필 설정 필요</a>`)
            + `<button class="btn-login" id="btn-signout">로그아웃</button>`
          : `<a class="btn-login" href="login.html">로그인</a>`}
      </div>
    </div>
  </header>
  <div class="team-strip">
    <div class="container team-strip-inner">
      ${TEAMS.map(t => `
        <a class="team-link ${t.id === activeTeamId ? "active" : ""}" style="--team-color:${t.color}" href="team.html?team=${t.id}" title="${t.name} 게시판">
          ${teamLogoHTML(t, 30)}
          <span class="team-abbr">${t.abbr}</span>
        </a>`).join("")}
    </div>
  </div>`;
  document.body.prepend(header);

  header.querySelector("#theme-toggle").addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });
  applyTheme(document.documentElement.dataset.theme || "dark");

  header.querySelector("#btn-signout")?.addEventListener("click", async () => {
    await sbSignOut();
    location.reload();
  });

  // 좁은 화면에서 메뉴가 가로로 밀려 있을 때, 지금 보고 있는 메뉴를 보이게
  const activeLink = header.querySelector(".main-nav a.active");
  if (activeLink) {
    const nav = header.querySelector(".main-nav");
    nav.scrollLeft = Math.max(0, activeLink.offsetLeft - (nav.clientWidth - activeLink.offsetWidth) / 2);
  }

  // 파비콘도 업로드된 모바일 로고를 따라감
  const fav = document.querySelector('link[rel="icon"]');
  if (fav) fav.href = brandLogoURL("mobile", "assets/brand/nexus-mobile.png");
}

function renderFooter() {
  const f = document.createElement("footer");
  f.className = "site-footer";
  f.innerHTML = `
    <div class="container">
      <p class="foot-disclaimer">
        <b>THE NEXUS</b>는 독립적으로 운영되는 비공식 팬 커뮤니티입니다.
        Riot Games, LCK 및 각 참가 구단과 제휴·후원·승인 관계가 없습니다.
        Riot Games, League of Legends, LCK 및 관련 명칭·로고·상표는 각 권리자에게 귀속됩니다.
      </p>
      <p class="foot-disclaimer en" lang="en">
        THE NEXUS is an independent, unofficial fan community. It is not affiliated with,
        sponsored by, or endorsed by Riot Games, LCK, or any participating team.
        Riot Games, League of Legends, LCK, and all associated names, logos, and trademarks
        are the property of their respective owners.
      </p>
      <p class="foot-links">
        모든 예측 참여는 무료이며 포인트는 환전·거래할 수 없습니다.
        · <a href="terms.html">이용약관</a> · 문의: report@lcklounge.example · <a href="admin.html">관리자</a>
      </p>
    </div>`;
  document.body.appendChild(f);
}

// ── 사이드바 (다음 경기 예측 + 순위) ──
function renderPredictWidget() {
  const el = document.getElementById("predict-widget");
  if (!el) return;
  // 양 팀이 확정된 경기만 예측 대상 (토너먼트 미정 슬롯 제외)
  const candidates = sortedMatches().filter(m => m.status !== "done" && knownTeams(m));
  const now = Date.now();
  const live = candidates.find(m => m.status === "live");
  const match = live
    || candidates.find(m => new Date(m.at) > now)
    || candidates[0];
  if (!match) { el.innerHTML = `<div class="empty-note">예정된 경기가 없습니다</div>`; return; }

  const A = TEAM_MAP[match.a], B = TEAM_MAP[match.b];
  const voted = getVotes()[match.id];
  const pct = communityPct(match);

  const whenEl = document.getElementById("predict-when");
  if (whenEl) whenEl.textContent = live ? "LIVE" : fmtWhen(match.at);

  el.innerHTML = `
    ${live
      ? `<div class="live-badge" style="margin-bottom:8px">● LIVE 진행 중</div>`
      : `<div class="countdown" id="countdown"></div>`}
    <div class="predict-vs">
      <div class="predict-team" style="--team-color:${A.color}">
        <button data-vote="a" class="${voted === "a" ? "voted" : ""}">
          ${teamLogoHTML(A, 38)}
          <span class="pct" style="color:${voted ? "var(--blue)" : "var(--text)"}">${pct.a}%</span>
        </button>
      </div>
      <span class="vs-label">VS</span>
      <div class="predict-team" style="--team-color:${B.color}">
        <button data-vote="b" class="${voted === "b" ? "voted" : ""}">
          ${teamLogoHTML(B, 38)}
          <span class="pct" style="color:${voted ? "var(--accent)" : "var(--text)"}">${pct.b}%</span>
        </button>
      </div>
    </div>
    <div class="predict-bar">
      <span class="a" style="width:${pct.a}%"></span>
      <span class="b" style="width:${pct.b}%"></span>
    </div>
    <p class="predict-note">${voted
      ? `<em>${voted === "a" ? A.abbr : B.abbr} 승리</em>에 예측했습니다 · 마감: 경기 시작 5분 전`
      : `나의 <em>포인트</em>로 승부 예측하기!`}</p>`;

  el.querySelectorAll("[data-vote]").forEach(btn => {
    btn.addEventListener("click", () => {
      setVote(match.id, btn.dataset.vote);
      renderPredictWidget();
    });
  });

  if (!live) {
    const target = new Date(match.at).getTime();
    const tick = () => {
      const el2 = document.getElementById("countdown");
      if (!el2) return;
      let diff = Math.max(0, target - Date.now());
      const d = Math.floor(diff / 86400e3), h = Math.floor(diff / 3600e3) % 24;
      const mn = Math.floor(diff / 60e3) % 60, s = Math.floor(diff / 1e3) % 60;
      const cell = (v, u) => `<span class="count-cell">${String(v).padStart(2, "0")}<span class="unit">${u}</span></span>`;
      el2.innerHTML = [cell(d, "일"), cell(h, "시"), cell(mn, "분"), cell(s, "초")]
        .join('<span style="color:var(--text-dim)">:</span>');
    };
    tick();
    clearInterval(window.__countdownTimer);
    window.__countdownTimer = setInterval(tick, 1000);
  }
}

// 순위 테이블 HTML (rows: {team,w,l,sw,sl,pt}) — full 옵션 시 세트 스코어 컬럼 포함
function standingsTableHTML(rows, opts) {
  opts = opts || {};
  if (!rows.length) return `<div class="empty-note">전적 데이터가 없습니다</div>`;
  return `
    <table class="standings">
      <thead><tr><th>순위</th><th>팀</th><th>승-패</th>${opts.full ? "<th>세트</th>" : ""}<th>포인트</th></tr></thead>
      <tbody>
        ${rows.map((r, i) => {
          const t = TEAM_MAP[r.team];
          if (!t) return "";
          const rate = Math.round((r.w / ((r.w + r.l) || 1)) * 100);
          return `<tr>
            <td class="rank">${i + 1}</td>
            <td><a class="team-cell" href="team.html?team=${t.id}">${teamLogoHTML(t, 20)} ${t.abbr}</a></td>
            <td class="wl"><b>${r.w}W ${r.l}L</b> &nbsp;${rate}%</td>
            ${opts.full ? `<td class="wl">${r.sw}W ${r.sl}L</td>` : ""}
            <td class="pt">${r.pt}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;
}

// 사이드바 순위: 시즌 누적 (1라운드부터 전부 합산)
function setupSidebarStandings() {
  const body = document.getElementById("standings-body");
  if (!body) return;
  const card = body.closest(".card");
  card?.querySelector(".standing-tabs")?.remove();
  const title = card?.querySelector(".card-title");
  if (title) title.innerHTML = `LCK 순위 <span class="sub">2026 시즌 누적</span>`;
  const head = card?.querySelector(".card-head");
  if (head && !head.querySelector("a.card-more"))
    head.insertAdjacentHTML("beforeend", `<a class="card-more" href="standings.html">라운드별 ›</a>`);
  body.innerHTML = standingsTableHTML(cumulativeStandings());
}

function initSidebar() {
  renderPredictWidget();
  setupSidebarStandings();
}

// ── 경기 일정 렌더링 (홈/경기 페이지 공용) ──
function scheduleHTML(matches, opts) {
  opts = opts || {};
  const byDay = {};
  matches.forEach(m => {
    const key = fmtDayKey(m.at);
    (byDay[key] = byDay[key] || []).push(m);
  });
  const days = Object.keys(byDay).sort();
  if (!days.length) return `<div class="empty-note">등록된 경기가 없습니다. 관리자 메뉴에서 경기를 추가하세요.</div>`;

  return days.map(day => {
    const list = byDay[day].sort((a, b) => new Date(a.at) - new Date(b.at));
    const today = isTodayKST(list[0].at);
    return `
    <div class="day-label">${fmtDay(list[0].at)}${today ? '<span class="chip-today">오늘</span>' : ""}</div>
    ${list.map(m => {
      const done = m.status === "done", live = m.status === "live";
      const score = (done || live)
        ? `<span class="match-score">
             <span class="${m.scoreA >= m.scoreB ? "win" : "lose"}">${m.scoreA ?? 0}</span><span style="color:var(--text-dim)">:</span>
             <span class="${m.scoreB >= m.scoreA ? "win" : "lose"}">${m.scoreB ?? 0}</span></span>`
        : `<span class="match-score vs">VS</span>`;
      const status = live ? `<span class="match-status live">LIVE</span>`
        : done ? `<span class="match-status done">경기 종료</span>`
        : `<span class="match-status upcoming">예정</span>`;
      const pct = communityPct(m);
      // 종료 경기: 공식 POM(경기 MVP) + 팬 선정 POG(평점 1위)
      const pom = done ? pomForMatch(m.id) : null;
      const pomPl = pom ? getPlayer(pom.player_id) : null;
      const pog = done ? pogForMatch(m.id) : null;
      const pogPl = pog ? getPlayer(pog.pid) : null;
      const right = done
        ? `${pomPl ? `<span class="chip-pom" title="LCK 공식 POM · ${pom.pts}pt">POM ${esc(pomPl.nick)}</span>` : ""}
           ${pogPl ? `<span class="chip-pog" title="팬 선정 POG · ${pog.n}명 평가">👑 ${esc(pogPl.nick)} <b>${pog.avg.toFixed(1)}</b></span>` : ""}
           ${opts.showStage ? `<span class="chip-stage">${esc(shortStage(m.stage))}</span>` : ""}`
        : `<div class="odds" title="승부예측 비율${pct.n ? ` · ${pct.n}명 참여` : " (예상)"}">
            <span class="odds-pill"><b>${Math.round(pct.a)}%</b></span>
            <span class="odds-pill"><b>${Math.round(pct.b)}%</b></span>
          </div>`;
      return `
      <a class="match-row" href="live.html?match=${q(m.id)}">
        <span class="match-time">${fmtTime(m.at)}</span>
        ${status}
        <div class="match-teams">
          <span class="match-side ${isRealTeam(m.a) ? "" : "tbd"}">${slotLogoHTML(m.a, 24)} ${slotName(m.a)}</span>
          ${score}
          <span class="match-side right ${isRealTeam(m.b) ? "" : "tbd"}">${slotName(m.b)} ${slotLogoHTML(m.b, 24)}</span>
        </div>
        <div class="match-right">${right}</div>
        <span class="match-arrow">›</span>
      </a>`;
    }).join("")}`;
  }).join("");
}
function shortStage(stage) {
  return (stage || "").replace("라운드 ", "R").replace(" 그룹", "");
}

// ── 팬심지수 투표 위젯 (경기·게시글·홈 공용) ──────────────
// ctx: { teamA, teamB (팀 id·팬덤 비교용), compact(홈 카드) }
function renderPollInto(el, poll, ctx) {
  ctx = ctx || {};
  const open = pollOpen(poll);
  const mine = myPollVote(poll.id);
  let choosing = open && !mine; // 아직 투표 전이면 선택 화면
  let picked = new Set(mine ? mine.choices : []);

  const A = ctx.teamA ? TEAM_MAP[ctx.teamA] : null;
  const B = ctx.teamB ? TEAM_MAP[ctx.teamB] : null;

  function pct(c, t) { return t ? Math.round((c / t) * 100) : 0; }

  function resultsHTML() {
    const r = pollResults(poll, ctx.teamA, ctx.teamB);
    const mySet = new Set(myPollVote(poll.id)?.choices || []);
    const canBreak = !!Auth.session && (A || B);
    return `
      ${poll.options.map((opt, i) => {
        const p = pct(r.overall.counts[i], r.overall.total);
        return `
        <div class="poll-opt-result ${mySet.has(i) ? "mine" : ""}">
          <div class="por-top">
            <span class="por-label">${esc(opt)} ${mySet.has(i) ? '<span class="por-my">내 선택</span>' : ""}</span>
            <b class="por-pct">${p}%</b>
          </div>
          <div class="por-bar"><span style="width:${p}%"></span></div>
          ${(A || B) ? (canBreak ? `
            <div class="por-break">
              ${A ? `<span style="color:${A.color}">${A.abbr}팬 ${pct(r.teamA.counts[i], r.teamA.total)}%</span>` : ""}
              ${B ? `<span style="color:${B.color}">${B.abbr}팬 ${pct(r.teamB.counts[i], r.teamB.total)}%</span>` : ""}
              <span>중립 ${pct(r.neutral.counts[i], r.neutral.total)}%</span>
            </div>` : "") : ""}
        </div>`;
      }).join("")}
      ${(A || B) && !canBreak ? `
        <div class="poll-gate">
          <div class="poll-gate-blur">
            ${A ? `${A.abbr}팬 ▮▮▮▮▮ · ` : ""}${B ? `${B.abbr}팬 ▮▮▮▮ · ` : ""}중립 ▮▮▮
          </div>
          <a class="btn-primary" href="login.html">간편 가입하고 팬덤별 결과 보기</a>
        </div>` : ""}
      <div class="poll-foot">
        <span>${r.voters}명 참여${poll.closes_at ? ` · ${open ? "마감 " + fmtWhen(poll.closes_at) : "마감됨"}` : ""}</span>
        <span class="poll-foot-btns">
          ${open && myPollVote(poll.id) ? `<button class="poll-change">선택 변경</button>` : ""}
          ${ctx.share !== false && (A || B) ? `<button class="poll-share">결과 카드 저장</button>` : ""}
        </span>
      </div>`;
  }

  function chooseHTML() {
    return `
      ${poll.options.map((opt, i) => `
        <button class="poll-choice ${picked.has(i) ? "picked" : ""}" data-i="${i}">${esc(opt)}</button>`).join("")}
      ${poll.multi ? `<button class="btn-primary poll-submit" style="width:100%">투표하기</button>` : ""}
      <div class="poll-foot"><span>${poll.multi ? "복수 선택 가능" : "하나를 선택하면 바로 투표됩니다"}${poll.closes_at ? ` · 마감 ${fmtWhen(poll.closes_at)}` : ""}</span></div>`;
  }

  function draw() {
    el.innerHTML = `
      <div class="poll-q">${esc(poll.question)}</div>
      ${choosing ? chooseHTML() : resultsHTML()}`;

    el.querySelectorAll(".poll-choice").forEach(b => b.addEventListener("click", () => {
      const i = Number(b.dataset.i);
      if (poll.multi) {
        picked.has(i) ? picked.delete(i) : picked.add(i);
        draw();
      } else {
        votePoll(poll.id, [i]);
        choosing = false;
        draw();
      }
    }));
    el.querySelector(".poll-submit")?.addEventListener("click", () => {
      if (!picked.size) { alert("하나 이상 선택해 주세요."); return; }
      votePoll(poll.id, [...picked]);
      choosing = false;
      draw();
    });
    el.querySelector(".poll-change")?.addEventListener("click", () => {
      picked = new Set(myPollVote(poll.id)?.choices || []);
      choosing = true;
      draw();
    });
    el.querySelector(".poll-share")?.addEventListener("click", () => sharePollCard(poll, ctx));
  }
  draw();
}

// 투표 결과 세로 공유 카드 (PNG 저장)
function sharePollCard(poll, ctx) {
  const r = pollResults(poll, ctx.teamA, ctx.teamB);
  const A = ctx.teamA ? TEAM_MAP[ctx.teamA] : null;
  const B = ctx.teamB ? TEAM_MAP[ctx.teamB] : null;
  const W = 720, H = 900;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");

  g.fillStyle = "#0f1015"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#ff4655"; g.fillRect(0, 0, W, 8);
  g.fillStyle = "#ff4655"; g.font = "bold 30px sans-serif";
  g.fillText("THE NEXUS", 48, 78);
  g.fillStyle = "#9aa1b0"; g.font = "600 22px sans-serif";
  g.fillText("팬심지수", 48, 112);

  // 질문 (줄바꿈)
  g.fillStyle = "#e9ebf1"; g.font = "bold 34px sans-serif";
  const words = poll.question.split(" ");
  let line = "", y = 180;
  words.forEach(w => {
    if (g.measureText(line + w).width > W - 96) { g.fillText(line, 48, y); y += 46; line = ""; }
    line += w + " ";
  });
  g.fillText(line.trim(), 48, y); y += 60;

  const pctOf = (cnt, tot) => tot ? Math.round((cnt / tot) * 100) : 0;
  poll.options.forEach((opt, i) => {
    const p = pctOf(r.overall.counts[i], r.overall.total);
    g.fillStyle = "#9aa1b0"; g.font = "600 24px sans-serif";
    g.fillText(opt, 48, y);
    g.fillStyle = "#e9ebf1"; g.font = "bold 24px sans-serif";
    g.textAlign = "right"; g.fillText(p + "%", W - 48, y); g.textAlign = "left";
    y += 14;
    g.fillStyle = "#1f232e"; g.fillRect(48, y, W - 96, 14);
    g.fillStyle = "#ff4655"; g.fillRect(48, y, (W - 96) * p / 100, 14);
    y += 20;
    if (Auth.session && (A || B)) {
      g.fillStyle = "#667080"; g.font = "500 18px sans-serif";
      const parts = [];
      if (A) parts.push(`${A.abbr}팬 ${pctOf(r.teamA.counts[i], r.teamA.total)}%`);
      if (B) parts.push(`${B.abbr}팬 ${pctOf(r.teamB.counts[i], r.teamB.total)}%`);
      parts.push(`중립 ${pctOf(r.neutral.counts[i], r.neutral.total)}%`);
      g.fillText(parts.join(" · "), 48, y + 8); y += 26;
    }
    y += 18;
  });

  g.fillStyle = "#667080"; g.font = "600 20px sans-serif";
  g.fillText(`${r.voters}명 참여 · 팬덤별 여론은 THE NEXUS에서`, 48, H - 72);
  g.fillStyle = "#9aa1b0";
  g.fillText(location.host + (poll.match_id ? "/live.html?match=" + poll.match_id : ""), 48, H - 40);

  c.toBlob(async blob => {
    const file = new File([blob], "nexus-poll.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "THE NEXUS 팬심지수" }); return; } catch {}
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "nexus-poll.png";
    a.click();
  });
}

// 팬심 평점 결과 공유 카드 (PNG 저장 · 팀별 좌우 배치)
function shareRatingCard(match) {
  const A = TEAM_MAP[match.a], B = TEAM_MAP[match.b];
  if (!A || !B) return;
  const voters = new Set(Cache.ratings.filter(r => r.match_id === match.id).map(r => r.voter)).size;
  if (!voters) { alert("아직 이 경기에 매겨진 평점이 없습니다."); return; }

  const rows = fanRatingRows(match); // 포지션별 좌우 짝
  const pog = pogForMatch(match.id);
  const pogPl = pog ? getPlayer(pog.pid) : null;
  const tierColor = a => a >= 9 ? "#f5b942" : a >= 8 ? "#2fbf71" : a >= 7 ? "#4a8cff" : a >= 6 ? "#6b7484" : "#ff4655";

  const nRows = rows.length;
  const W = 720, rowH = 64, topY = 258, H = topY + nRows * rowH + 118;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");

  g.fillStyle = "#0f1015"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#ff4655"; g.fillRect(0, 0, W, 8);
  g.fillStyle = "#ff4655"; g.font = "bold 30px sans-serif";
  g.fillText("THE NEXUS", 48, 74);
  g.fillStyle = "#9aa1b0"; g.font = "600 22px sans-serif";
  g.fillText("팬심 평점", 48, 106);

  // 스코어 라인
  g.textAlign = "center";
  g.fillStyle = "#e9ebf1"; g.font = "bold 36px sans-serif";
  g.fillText(`${A.abbr}  ${match.scoreA ?? 0} : ${match.scoreB ?? 0}  ${B.abbr}`, W / 2, 158);
  g.fillStyle = "#667080"; g.font = "500 18px sans-serif";
  g.fillText(match.label || match.stage || "", W / 2, 186);

  // POG 배너
  if (pogPl) {
    g.fillStyle = "#f5b942"; g.fillRect(48, 202, W - 96, 34);
    g.fillStyle = "#221a06"; g.font = "bold 20px sans-serif";
    g.fillText(`👑 팬 선정 POG — ${pogPl.nick} ${pog.avg.toFixed(1)}`, W / 2, 226);
  }
  g.textAlign = "left";

  // 후푸식 미러 배치: 이름 바깥쪽 · 점수 배지 안쪽 · 가운데 포지션
  g.fillStyle = A.color || "#9aa1b0"; g.font = "bold 20px sans-serif";
  g.fillText(A.abbr, 48, topY - 14);
  g.textAlign = "right";
  g.fillStyle = B.color || "#9aa1b0";
  g.fillText(B.abbr, W - 48, topY - 14);
  g.textAlign = "left";

  const badgeW = 56, innerL = W / 2 - 44, innerR = W / 2 + 44;
  const cut = v => v ? v.avg.toFixed(1) : "—";
  rows.forEach((r, i) => {
    const y = topY + i * rowH;
    // 가운데 포지션 라벨
    g.fillStyle = "#667080"; g.font = "bold 15px sans-serif"; g.textAlign = "center";
    g.fillText(r.pos, W / 2, y + 17);
    g.textAlign = "left";
    // 왼쪽 팀
    if (r.a) {
      g.fillStyle = "#e9ebf1"; g.font = "bold 20px sans-serif";
      g.fillText(r.a.p.nick, 48, y + 18);
      if (r.a.s.all) {
        g.fillStyle = tierColor(r.a.s.all.avg);
        g.fillRect(innerL - badgeW, y - 2, badgeW, 26);
        g.fillStyle = r.a.s.all.avg >= 9 ? "#221a06" : "#fff";
        g.font = "bold 18px sans-serif"; g.textAlign = "center";
        g.fillText(r.a.s.all.avg.toFixed(1), innerL - badgeW / 2, y + 17);
        g.textAlign = "left";
        g.fillStyle = "#667080"; g.font = "500 13px sans-serif";
        g.fillText(`아군 ${cut(r.a.s.home)} · 상대 ${cut(r.a.s.opp)} · 중립 ${cut(r.a.s.neu)}`, 48, y + 40);
      } else {
        g.fillStyle = "#3a4150"; g.font = "bold 18px sans-serif"; g.textAlign = "center";
        g.fillText("—", innerL - badgeW / 2, y + 17); g.textAlign = "left";
        g.fillStyle = "#3a4150"; g.font = "500 13px sans-serif";
        g.fillText("평가 없음", 48, y + 40);
      }
    }
    // 오른쪽 팀 (미러)
    if (r.b) {
      g.textAlign = "right";
      g.fillStyle = "#e9ebf1"; g.font = "bold 20px sans-serif";
      g.fillText(r.b.p.nick, W - 48, y + 18);
      if (r.b.s.all) {
        g.fillStyle = tierColor(r.b.s.all.avg);
        g.fillRect(innerR, y - 2, badgeW, 26);
        g.fillStyle = r.b.s.all.avg >= 9 ? "#221a06" : "#fff";
        g.font = "bold 18px sans-serif"; g.textAlign = "center";
        g.fillText(r.b.s.all.avg.toFixed(1), innerR + badgeW / 2, y + 17);
        g.textAlign = "right";
        g.fillStyle = "#667080"; g.font = "500 13px sans-serif";
        g.fillText(`아군 ${cut(r.b.s.home)} · 상대 ${cut(r.b.s.opp)} · 중립 ${cut(r.b.s.neu)}`, W - 48, y + 40);
      } else {
        g.fillStyle = "#3a4150"; g.font = "bold 18px sans-serif"; g.textAlign = "center";
        g.fillText("—", innerR + badgeW / 2, y + 17);
        g.textAlign = "right";
        g.fillStyle = "#3a4150"; g.font = "500 13px sans-serif";
        g.fillText("평가 없음", W - 48, y + 40);
      }
      g.textAlign = "left";
    }
  });

  g.fillStyle = "#667080"; g.font = "600 20px sans-serif";
  g.fillText(`${voters}명 참여 · 아군·상대·중립 팬심 평점은 THE NEXUS에서`, 48, H - 66);
  g.fillStyle = "#9aa1b0";
  g.fillText(location.host + "/live.html?match=" + match.id, 48, H - 36);

  c.toBlob(async blob => {
    const file = new File([blob], "nexus-rating.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "THE NEXUS 팬심 평점" }); return; } catch {}
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "nexus-rating.png";
    a.click();
  });
}

// ── 홈 ──
function renderHomeSchedule() {
  const el = document.getElementById("schedule-body");
  if (!el) return;
  // 오늘 이후 7일 + 최근 결과
  const ms = sortedMatches();
  el.innerHTML = scheduleHTML(ms.slice(0, 10));
}

function renderHotPosts() {
  const el = document.getElementById("hot-posts");
  if (!el) return;
  const posts = getPosts().slice().sort((a, b) => b.up - a.up).slice(0, 7);
  el.innerHTML = posts.map(p => {
    const t = p.team ? TEAM_MAP[p.team] : null;
    return `
    <a class="post-row" href="post.html?id=${q(p.id)}">
      ${t ? `<span class="tag-team" style="--tag-color:${t.color}">${teamLogoHTML(t, 16)} ${t.abbr}</span>`
          : `<span class="tag-team no-logo">전체</span>`}
      <span class="tag-cat">${esc(p.cat)}</span>
      ${getPollByPost(p.id) ? `<span title="투표가 있는 글">🗳️</span>` : ""}
      <span class="post-title">${esc(p.title)}</span>
      <span class="post-meta"><span class="up">▲ ${p.up}</span><span class="cmt">💬 ${p.comments.length}</span><span>${fmtAgo(p.ts)}</span></span>
    </a>`;
  }).join("");
}

function renderPredictRanking() {
  const el = document.getElementById("predict-ranking");
  if (!el) return;
  el.innerHTML = PREDICT_RANKING.map((r, i) => `
    <div class="rank-row">
      <span class="no ${i < 3 ? "top" : ""}">${i + 1}</span>
      <span class="nick">${esc(r.nick)}</span>
      <span class="detail">${r.hit}/${r.total} 적중</span>
      <span class="rate">${Math.round((r.hit / r.total) * 100)}%</span>
    </div>`).join("");
}

// 홈 "오늘의 투표": 마감이 가장 가까운 진행 중 투표
function renderTodayPoll() {
  const card = document.getElementById("today-poll-card");
  if (!card) return;
  const open = getPolls().filter(pollOpen)
    .sort((a, b) => (a.closes_at ? new Date(a.closes_at) : Infinity) - (b.closes_at ? new Date(b.closes_at) : Infinity));
  const poll = open[0];
  if (!poll) { card.style.display = "none"; return; }
  card.style.display = "";
  const m = poll.match_id ? getMatches().find(x => x.id === poll.match_id) : null;
  const link = card.querySelector("#today-poll-link");
  if (link && m) { link.href = "live.html?match=" + m.id; link.style.display = ""; }
  else if (link) link.style.display = "none";
  renderPollInto(card.querySelector("#today-poll"), poll,
    m ? { teamA: m.a, teamB: m.b } : {});
}

async function initHome() {
  await storeReady;
  renderHeader("홈", null);
  renderTodayPoll();
  renderHomeSchedule();
  renderHotPosts();
  renderPredictRanking();
  initSidebar();
  renderFooter();
}
