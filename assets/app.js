// ── 공통 렌더링 유틸 ─────────────────────────────────────
function teamLogoHTML(team, size) {
  const s = size || 26;
  const cut = Math.max(4, Math.round(s * 0.2));
  return `<span class="team-logo" style="width:${s}px;height:${s}px;
    clip-path:polygon(0 0, 100% 0, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, 0 100%);">
    <img src="assets/logos/${team.id}.svg" alt="${team.abbr} 로고"></span>`;
}

// 라이트/다크 테마
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("lck_theme", theme);
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.textContent = theme === "dark" ? "☀" : "☾";
    btn.title = theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환";
  }
}

function renderHeader(activeMenu, activeTeamId) {
  const menus = ["홈", "경기", "승부예측", "라이브", "커뮤니티", "팀", "랭킹"];
  const header = document.createElement("div");
  header.innerHTML = `
  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="index.html"><span class="brand-badge">L</span>LCK <em>라운지</em></a>
      <nav class="main-nav">
        ${menus.map(m => `<a href="${m === "홈" ? "index.html" : "#"}" class="${m === activeMenu ? "active" : ""}">${m}</a>`).join("")}
      </nav>
      <div class="header-actions">
        <button class="btn-icon" id="theme-toggle"></button>
        <button class="btn-login">로그인</button>
      </div>
    </div>
  </header>
  <div class="team-strip">
    <div class="container team-strip-inner">
      ${TEAMS.map(t => `
        <a class="team-link ${t.id === activeTeamId ? "active" : ""}" style="--team-color:${t.color}" href="team.html?team=${t.id}" title="${t.name} 게시판">
          ${teamLogoHTML(t, 34)}
          <span class="team-abbr">${t.abbr}</span>
        </a>`).join("")}
    </div>
  </div>`;
  document.body.prepend(header);

  const themeBtn = header.querySelector("#theme-toggle");
  themeBtn.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });
  applyTheme(document.documentElement.dataset.theme || "dark");
}

function renderFooter() {
  const f = document.createElement("footer");
  f.className = "site-footer";
  f.innerHTML = `
    <div class="container">
      <b>LCK 라운지</b>는 Riot Games 및 LCK와 무관한 <b>비공식 팬 프로젝트</b>입니다.
      모든 예측 참여는 무료이며 포인트는 환전·거래할 수 없습니다.<br>
      팀명·로고에 대한 권리는 각 구단 및 Riot Games에 있습니다. · 문의 및 신고: report@lcklounge.example
    </div>`;
  document.body.appendChild(f);
}

// ── 홈 화면 렌더링 ───────────────────────────────────────
function renderSchedule() {
  const el = document.getElementById("schedule-body");
  if (!el) return;
  el.innerHTML = SCHEDULE.map(day => `
    <div class="day-label">${day.date}${day.today ? '<span class="chip-today">오늘</span>' : ""}</div>
    ${day.matches.map(m => {
      const A = TEAM_MAP[m.a], B = TEAM_MAP[m.b];
      const done = m.status === "done";
      const score = done
        ? `<span class="match-score">
             <span class="${m.scoreA > m.scoreB ? "win" : "lose"}">${m.scoreA}</span><span style="color:var(--text-dim)">:</span>
             <span class="${m.scoreB > m.scoreA ? "win" : "lose"}">${m.scoreB}</span></span>`
        : `<span class="match-score vs">VS</span>`;
      const status = done
        ? `<span class="match-status done">경기 종료</span>`
        : `<span class="match-status upcoming">예정</span>`;
      const odds = done ? "" : `
        <div class="odds">
          <span class="odds-pill">1 <b>${m.oddsA.toFixed(2)}</b></span>
          <span class="odds-pill">2 <b>${m.oddsB.toFixed(2)}</b></span>
        </div>`;
      return `
      <div class="match-row">
        <span class="match-time">${m.time}</span>
        ${status}
        <div class="match-teams">
          <span class="match-side">${teamLogoHTML(A, 26)} ${A.abbr}</span>
          ${score}
          <span class="match-side right">${B.abbr} ${teamLogoHTML(B, 26)}</span>
        </div>
        <span class="match-arrow">›</span>
      </div>
      ${odds ? `<div style="padding:0 18px 10px; display:flex; justify-content:flex-end;">${odds}</div>` : ""}`;
    }).join("")}
  `).join("");
}

function renderHotPosts() {
  const el = document.getElementById("hot-posts");
  if (!el) return;
  el.innerHTML = HOT_POSTS.map(p => {
    const t = TEAM_MAP[p.team];
    return `
    <a class="post-row" href="team.html?team=${t.id}">
      <span class="tag-team" style="--tag-color:${t.color}">${teamLogoHTML(t, 18)} ${t.abbr}</span>
      <span class="tag-cat">${p.cat}</span>
      <span class="post-title">${p.title}</span>
      <span class="post-meta"><span class="up">▲ ${p.up}</span><span class="cmt">💬 ${p.cmt}</span><span>${p.time}</span></span>
    </a>`;
  }).join("");
}

function renderStandings(group) {
  const el = document.getElementById("standings-body");
  if (!el) return;
  const rows = STANDINGS[group];
  el.innerHTML = `
    <table class="standings">
      <thead><tr><th>순위</th><th>팀</th><th>승-패</th><th>포인트</th></tr></thead>
      <tbody>
        ${rows.map((r, i) => {
          const t = TEAM_MAP[r.team];
          const rate = Math.round((r.w / (r.w + r.l || 1)) * 100);
          return `<tr>
            <td class="rank">${i + 1}</td>
            <td><a class="team-cell" href="team.html?team=${t.id}">${teamLogoHTML(t, 22)} ${t.abbr}</a></td>
            <td class="wl"><b>${r.w}W ${r.l}L</b> &nbsp;${rate}%</td>
            <td class="pt">${r.pt > 0 ? r.pt : r.pt}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;
  document.querySelectorAll(".standing-tabs button").forEach(b =>
    b.classList.toggle("active", b.dataset.group === group));
}

function renderPredictRanking() {
  const el = document.getElementById("predict-ranking");
  if (!el) return;
  el.innerHTML = PREDICT_RANKING.map((r, i) => `
    <div class="rank-row">
      <span class="no ${i < 3 ? "top" : ""}">${i + 1}</span>
      <span class="nick">${r.nick}</span>
      <span class="detail">${r.hit}/${r.total} 적중</span>
      <span class="rate">${Math.round((r.hit / r.total) * 100)}%</span>
    </div>`).join("");
}

// ── 승부예측 위젯 ────────────────────────────────────────
function nextPredictMatch() {
  const now = Date.now();
  const all = SCHEDULE.flatMap(d => d.matches).filter(m => m.startsAt);
  // 아직 시작하지 않은 가장 가까운 경기, 없으면 마지막 경기
  return all.find(m => new Date(m.startsAt).getTime() > now) || all[all.length - 1];
}

function renderPredictWidget() {
  const el = document.getElementById("predict-widget");
  if (!el) return;
  const match = nextPredictMatch();
  const A = TEAM_MAP[match.a], B = TEAM_MAP[match.b];
  const voteKey = `lck_vote_${match.a}_${match.b}`;
  const voted = localStorage.getItem(voteKey);
  // 예측 비율: 데이터에 없으면 배당률로 추정
  let pctA = match.pctA, pctB = match.pctB;
  if (pctA == null) {
    const ia = 1 / match.oddsA, ib = 1 / match.oddsB;
    pctA = Math.round((ia / (ia + ib)) * 1000) / 10;
    pctB = Math.round((100 - pctA) * 10) / 10;
  }
  const whenEl = document.getElementById("predict-when");
  if (whenEl) {
    // 표기는 항상 한국 시간(KST) 기준
    const fmt = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul", month: "numeric", day: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    whenEl.textContent = fmt.format(new Date(match.startsAt)) + " KST";
  }

  el.innerHTML = `
    <div class="countdown" id="countdown"></div>
    <div class="predict-vs">
      <div class="predict-team" style="--team-color:${A.color}">
        <button data-vote="a" class="${voted === "a" ? "voted" : ""}">
          ${teamLogoHTML(A, 40)}
          <span class="pct" style="color:${voted ? "var(--blue)" : "var(--text)"}">${pctA}%</span>
        </button>
      </div>
      <span class="vs-label">VS</span>
      <div class="predict-team" style="--team-color:${B.color}">
        <button data-vote="b" class="${voted === "b" ? "voted" : ""}">
          ${teamLogoHTML(B, 40)}
          <span class="pct" style="color:${voted ? "var(--accent)" : "var(--text)"}">${pctB}%</span>
        </button>
      </div>
    </div>
    <div class="predict-bar">
      <span class="a" style="width:${pctA}%"></span>
      <span class="b" style="width:${pctB}%"></span>
    </div>
    <p class="predict-note">${voted
      ? `<em>${voted === "a" ? A.abbr : B.abbr} 승리</em>에 예측했습니다. 마감: 경기 시작 5분 전`
      : `나의 <em>포인트</em>로 승부 예측하기!`}</p>`;

  el.querySelectorAll("[data-vote]").forEach(btn => {
    btn.addEventListener("click", () => {
      localStorage.setItem(voteKey, btn.dataset.vote);
      renderPredictWidget();
    });
  });

  // 카운트다운
  const target = new Date(match.startsAt).getTime();
  function tick() {
    const el2 = document.getElementById("countdown");
    if (!el2) return;
    let diff = Math.max(0, target - Date.now());
    const d = Math.floor(diff / 86400000);
    const h = Math.floor(diff / 3600000) % 24;
    const mn = Math.floor(diff / 60000) % 60;
    const s = Math.floor(diff / 1000) % 60;
    const cell = (v, u) => `<span class="count-cell">${String(v).padStart(2, "0")}<span class="unit">${u}</span></span>`;
    el2.innerHTML = [cell(d, "일"), cell(h, "시"), cell(mn, "분"), cell(s, "초")].join('<span style="color:var(--text-dim)">:</span>');
  }
  tick();
  if (!window.__countdownTimer) window.__countdownTimer = setInterval(tick, 1000);
}

// ── 홈 초기화 ───────────────────────────────────────────
function initHome() {
  renderHeader("홈", null);
  renderSchedule();
  renderHotPosts();
  renderStandings("legend");
  renderPredictRanking();
  renderPredictWidget();
  renderFooter();
  document.querySelectorAll(".standing-tabs button").forEach(b =>
    b.addEventListener("click", () => renderStandings(b.dataset.group)));
}
