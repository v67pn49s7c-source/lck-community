// ── 공통 유틸 ───────────────────────────────────────────
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

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
  ["라이브", "live.html"], ["커뮤니티", "community.html"], ["팀", "teams.html"], ["선수", "players.html"], ["랭킹", "ranking.html"],
];

function renderHeader(activeMenu, activeTeamId) {
  const header = document.createElement("div");
  header.innerHTML = `
  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="index.html" title="The Nexus">
        <img class="brand-full light" src="assets/brand/nexus-desktop.png" alt="The Nexus">
        <img class="brand-full dark" src="assets/brand/nexus-desktop-dark.png" alt="The Nexus">
        <img class="brand-icon" src="assets/brand/nexus-mobile.png" alt="The Nexus">
      </a>
      <nav class="main-nav">
        ${NAV_MENUS.map(([m, href]) => `<a href="${href}" class="${m === activeMenu ? "active" : ""}">${m}</a>`).join("")}
      </nav>
      <div class="header-actions">
        <button class="btn-icon" id="theme-toggle"></button>
        ${Auth.session
          ? `<span class="user-chip" title="${esc(Auth.session.user.email || "")}">${esc(Auth.profile ? Auth.profile.nick : "회원")}</span>
             <button class="btn-login" id="btn-signout">로그아웃</button>`
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
}

function renderFooter() {
  const f = document.createElement("footer");
  f.className = "site-footer";
  f.innerHTML = `
    <div class="container">
      <b>The Nexus</b>는 Riot Games 및 LCK와 무관한 <b>비공식 팬 프로젝트</b>입니다.
      모든 예측 참여는 무료이며 포인트는 환전·거래할 수 없습니다.<br>
      팀명·로고에 대한 권리는 각 구단 및 Riot Games에 있습니다.
      · 문의: report@lcklounge.example · <a href="admin.html">관리자</a>
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
      const right = done
        ? (opts.showStage ? `<span class="chip-stage">${esc(shortStage(m.stage))}</span>` : "")
        : `<div class="odds" title="승부예측 비율${pct.n ? ` · ${pct.n}명 참여` : " (예상)"}">
            <span class="odds-pill"><b>${pct.a}%</b></span>
            <span class="odds-pill"><b>${pct.b}%</b></span>
          </div>`;
      return `
      <a class="match-row" href="live.html?match=${m.id}">
        <span class="match-time">${fmtTime(m.at)}</span>
        ${status}
        <div class="match-teams">
          <span class="match-side ${isRealTeam(m.a) ? "" : "tbd"}">${slotLogoHTML(m.a, 24)} ${slotName(m.a)}</span>
          ${score}
          <span class="match-side right ${isRealTeam(m.b) ? "" : "tbd"}">${slotName(m.b)} ${slotLogoHTML(m.b, 24)}</span>
        </div>
        <div style="text-align:right">${right}</div>
        <span class="match-arrow">›</span>
      </a>`;
    }).join("")}`;
  }).join("");
}
function shortStage(stage) {
  return (stage || "").replace("라운드 ", "R").replace(" 그룹", "");
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
    <a class="post-row" href="post.html?id=${p.id}">
      ${t ? `<span class="tag-team" style="--tag-color:${t.color}">${teamLogoHTML(t, 16)} ${t.abbr}</span>`
          : `<span class="tag-team no-logo">전체</span>`}
      <span class="tag-cat">${esc(p.cat)}</span>
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

async function initHome() {
  await storeReady;
  renderHeader("홈", null);
  renderHomeSchedule();
  renderHotPosts();
  renderPredictRanking();
  initSidebar();
  renderFooter();
}
