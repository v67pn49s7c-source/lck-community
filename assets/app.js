// ── 공통 유틸 ───────────────────────────────────────────
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// 주소(URL)에 값을 넣을 때 — DB에서 온 id는 화면 코드가 만든 값이라는 보장이 없다.
// 따옴표·꺾쇠가 섞여 있으면 링크 태그를 탈출해 스크립트가 되므로 반드시 통과시킨다.
function q(v) { return encodeURIComponent(String(v ?? "")); }

// 라이트 모드에서 안 보이던 팀들 — 원래 로고가 흰색이라 밝은 바탕에서 사라진다.
// 팀 색이 들어간 별도 파일을 받아 두었다 (assets/logos/<팀> light.svg).
// 두 장을 겹쳐 두고 CSS 가 테마에 따라 하나만 보여 준다 — 테마를 바꿔도 다시 그릴 필요가 없다.
const TEAM_LOGO_LIGHT = { bro: 1, dk: 1, dns: 1, krx: 1, hle: 1 };

function teamLogoHTML(team, size) {
  const s = size || 24;
  const cut = Math.max(4, Math.round(s * 0.2));
  const light = TEAM_LOGO_LIGHT[team.id]
    ? `<img class="lg-light" src="assets/logos/${encodeURIComponent(team.id + " light")}.svg" alt="">` : "";
  return `<span class="team-logo${light ? " has-light" : ""}" style="width:${s}px;height:${s}px;
    clip-path:polygon(0 0, 100% 0, 100% calc(100% - ${cut}px), calc(100% - ${cut}px) 100%, 0 100%);">
    <img class="lg-dark" src="assets/logos/${team.id}.svg" alt="${team.abbr} 로고">${light}</span>`;
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

// 사이트의 모든 시각은 보는 사람 위치와 상관없이 한국 시간(KST) 기준으로 표시한다.
// (브라우저 기본 함수는 기기 시간대를 따라가서, 해외에서 보면 다른 시각이 찍힌다)
const KST_PARTS_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
function kstParts(ts) {
  const out = {};
  KST_PARTS_FMT.formatToParts(new Date(ts)).forEach(p => { out[p.type] = p.value; });
  return out;
}
function fmtMD(ts) { const p = kstParts(ts); return `${p.month}.${p.day}`; }            // 08.04
function fmtHM(ts) { const p = kstParts(ts); return `${p.hour}:${p.minute}`; }          // 14:30
function fmtFullKST(ts) {                                                              // 2026. 08. 04. 14:30 KST
  const p = kstParts(ts);
  return `${p.year}. ${p.month}. ${p.day}. ${p.hour}:${p.minute} KST`;
}

function fmtAgo(ts) {
  const d = Date.now() - ts;
  if (d < 60e3) return "방금";
  if (d < 3600e3) return Math.floor(d / 60e3) + "분 전";
  if (d < 86400e3) return Math.floor(d / 3600e3) + "시간 전";
  return fmtMD(ts);
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
// 메뉴는 여섯 묶음. 묶음 안의 갈래는 두 번째 줄(하위 탭)에서 고른다.
//
// ⚠ 예전에는 열한 개가 한 줄에 있었다. 그러면 좁은 화면에 다 못 들어가서
//   뒤쪽 절반(선수·수상·랭킹)은 옆으로 밀어야만 보였다 — 사실상 없는 메뉴였다.
//   게다가 겹치는 것이 셋이었다:
//     · 경기 / 오늘의 경기      → 목록과 그 상세가 나란히 최상위에
//     · 승부예측 / 랭킹         → 주간 랭킹은 여기, 시즌 랭킹은 저기
//     · 순위(팀) / 랭킹(회원)   → 이름만 봐서는 구분이 안 됨
//   묶은 뒤에도 페이지는 하나도 안 없앴다. 주소가 그대로라 기존 링크·검색 노출이 산다.
//   (2026-08-08)
const NAV_GROUPS = [
  { menu: "홈", href: "index.html" },
  { menu: "경기", href: "matches.html", subs: [
    ["경기 홈", "matches.html"], ["오늘의 경기", "live.html"],
    ["전체 경기 일정", "schedule.html"], ["대진표", "bracket.html"]] },
  { menu: "순위", href: "standings.html", subs: [
    ["순위표", "standings.html"], ["경우의 수", "race.html"]] },
  { menu: "승부예측", href: "predict.html", subs: [
    ["예측하기", "predict.html"], ["예측 랭킹", "ranking.html"]] },
  { menu: "커뮤니티", href: "community.html" },
  { menu: "선수·팀", href: "players.html", subs: [
    ["선수", "players.html"], ["팀", "teams.html"], ["수상", "awards.html"]] },
];

// 옛 메뉴 이름 → 새 묶음. 페이지들이 renderHeader("수상") 처럼 예전 이름으로 부르고 있어서,
// 그 호출을 전부 고치는 대신 여기서 옮겨 준다. 고칠 곳이 한 군데면 틀릴 곳도 한 군데다.
const NAV_ALIAS = {
  "오늘의 경기": "경기", "경우의 수": "순위", "랭킹": "승부예측",
  "팀": "선수·팀", "선수": "선수·팀", "수상": "선수·팀",
};

/** 지금 보고 있는 파일 이름으로 묶음과 갈래를 찾는다.
 *  넘겨받은 메뉴 이름보다 이쪽을 먼저 믿는다 — 호출부가 17군데라 어긋나기 쉽다. */
function navHere() {
  let file = (location.pathname.split("/").pop() || "").toLowerCase();
  // 뿌리 주소(/)만 홈으로 친다. 확장자 없는 다른 주소(/match/… 같은)까지 홈으로 치면
  // 엉뚱한 메뉴에 불이 켜진다 — 그런 주소는 넘겨받은 이름에 맡긴다.
  if (!file) file = "index.html";
  if (!file.endsWith(".html")) return null;
  for (const g of NAV_GROUPS) {
    if (g.href.toLowerCase() === file) return { group: g, sub: g.href };
    const hit = (g.subs || []).find(([, h]) => h.toLowerCase() === file);
    if (hit) return { group: g, sub: hit[1] };
  }
  return null;
}

// ?id= 처럼 **내용이 갈리는 주소**는 canonical·og:url 도 그 주소여야 한다.
// 고정 canonical 이면 검색엔진이 131개 글과 50명 선수를 한 장으로 합쳐 버린다.
// 제목·설명도 함께 바꿔 공유·검색 결과가 그 페이지를 가리키게 한다. (2026-08-07)
function setPageIdentity(keys, opts) {
  opts = opts || {};
  const q = new URLSearchParams(location.search);
  const keep = new URLSearchParams();
  (keys || []).forEach(k => { const v = q.get(k); if (v) keep.set(k, v); });
  const qs = keep.toString();
  const url = location.origin + location.pathname + (qs ? "?" + qs : "");
  const set = (sel, attr, val) => {
    if (!val) return;
    const el = document.head.querySelector(sel);
    if (el) el.setAttribute(attr, val);
  };
  set('link[rel="canonical"]', "href", url);
  set('meta[property="og:url"]', "content", url);
  if (opts.title) {
    document.title = opts.title;
    set('meta[property="og:title"]', "content", opts.title);
  }
  if (opts.desc) {
    set('meta[name="description"]', "content", opts.desc);
    set('meta[property="og:description"]', "content", opts.desc);
  }
}

/** 한국어 조사 붙이기 — "T1는 몇 승이면" 같은 어색한 문장을 막는다.
 *
 *  팀 약칭이 T1·KT·GEN 처럼 영문·숫자라, 받침을 글자 모양으로는 알 수 없다.
 *  읽는 소리 기준으로 판단한다 (T1=티원 → 받침 ㄴ → "은", KT=케이티 → "는").
 *
 *  josa("T1", "은는") → "T1은"   ·   josa("KT", "이가") → "KT가"
 */
const JOSA_TAIL = {                       // 읽었을 때 받침이 있는 영문자·숫자
  L: 1, M: 1, N: 1, R: 1,                 // 엘·엠·엔·알
  0: 1, 1: 1, 3: 1, 6: 1, 7: 1, 8: 1,     // 영·일·삼·육·칠·팔
};
function hasTail(word) {
  const c = String(word || "").trim().slice(-1);
  if (!c) return false;
  const code = c.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;   // 한글: 받침 유무
  return !!JOSA_TAIL[c.toUpperCase()];
}
function josa(word, pair) {
  const [withTail, without] = [pair.slice(0, pair.length / 2), pair.slice(pair.length / 2)];
  return word + (hasTail(word) ? withTail : without);
}

/** 없는 글·없는 선수처럼 "내용이 없는 주소"를 검색에서 빼 달라고 알린다.
 *  이걸 안 하면 ?id=아무거나 가 전부 색인돼서, 검색 결과에 빈 페이지가 쌓인다. */
function noIndex() {
  if (document.head.querySelector('meta[name="robots"]')) return;
  const m = document.createElement("meta");
  m.name = "robots";
  m.content = "noindex, follow";
  document.head.appendChild(m);
}

function renderHeader(activeMenu, activeTeamId) {
  document.body.classList.add("app-ready"); // 데이터 로드 완료 → 화면 표시
  window.__readyMs = Math.round(performance.now()); // 로딩 체감 측정용

  const here = navHere();
  const groupName = here ? here.group.menu : (NAV_ALIAS[activeMenu] || activeMenu);
  const group = NAV_GROUPS.find(g => g.menu === groupName);
  const subNavHTML = group && group.subs ? `
  <nav class="sub-nav" aria-label="${esc(group.menu)} 하위 메뉴">
    <div class="container sub-nav-inner">
      ${group.subs.map(([label, href]) => `
        <a href="${href}" class="${here && here.sub === href ? "active" : ""}"
           ${here && here.sub === href ? 'aria-current="page"' : ""}>${label}</a>`).join("")}
    </div>
  </nav>` : "";

  const header = document.createElement("div");
  header.innerHTML = `
  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="index.html" title="The Nexus">
        <img class="brand-full light" src="${brandLogoURL("desktop-light", "assets/brand/nexus-desktop.png?v=20260811e")}" alt="The Nexus">
        <img class="brand-full dark" src="${brandLogoURL("desktop-dark", "assets/brand/nexus-desktop-dark.png?v=20260811e")}" alt="The Nexus">
        <img class="brand-icon" src="${brandLogoURL("mobile", "assets/brand/nexus-icon.png?v=20260811e")}" alt="The Nexus">
      </a>
      <nav class="main-nav">
        ${NAV_GROUPS.map(g => `<a href="${g.href}" class="${g.menu === groupName ? "active" : ""}">${g.menu}</a>`).join("")}
      </nav>
      <div class="header-actions">
        <button class="btn-icon" id="theme-toggle"></button>
        <!-- 내 기록으로 가는 길. 예전에는 로그인한 사람의 닉네임 칩뿐이라,
             데스크톱에서 비로그인 방문자는 마이페이지에 갈 방법이 아예 없었다.
             비로그인도 예측·평점 기록이 이 브라우저에 쌓이므로 볼 것이 있다. (2026-08-07) -->
        <a class="btn-login my-link ${activeMenu === "MY" ? "on" : ""}" href="my.html" title="내 기록 · 팬 여권">내 기록</a>
        ${Auth.session
          ? (Auth.profile
            ? `<a class="user-chip" href="my.html" title="팬 여권 보기">${esc(Auth.profile.nick)}</a>`
            : `<a class="user-chip" href="login.html" title="닉네임·응원팀을 설정해 주세요">프로필 설정 필요</a>`)
            + `<button class="btn-login" id="btn-signout">로그아웃</button>`
          : `<a class="btn-login" href="login.html">로그인</a>`}
      </div>
    </div>
  </header>
  ${subNavHTML}
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

  // 좁은 화면에서 줄이 밀려 있을 때, 지금 보고 있는 곳을 보이게
  header.querySelectorAll(".main-nav, .sub-nav-inner").forEach(nav => {
    const on = nav.querySelector("a.active");
    if (on) nav.scrollLeft = Math.max(0, on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2);
  });

  // 파비콘도 업로드된 모바일 로고를 따라감
  const fav = document.querySelector('link[rel="icon"]');
  if (fav) fav.href = brandLogoURL("mobile", "assets/brand/nexus-icon.png?v=20260811e");

  renderTabBar(groupName);
}

// ── 포지션별 선수 지표 육각형 (SVG 직접 그리기, 라이브러리 없음) ──
// 바깥 테두리 = 같은 포지션 상위권, 가운데 = 하위권. 회색은 동 포지션 평균.
function radarSVG(axes, opts) {
  const o = opts || {};
  const size = o.size || 260, c = size / 2, R = c - 42;
  const n = axes.length;
  const pt = (i, r) => {
    const ang = (Math.PI * 2 * i) / n - Math.PI / 2;               // 12시 방향부터 시계방향
    return [c + Math.cos(ang) * r, c + Math.sin(ang) * r];
  };
  const poly = (vals, k) => vals.map((v, i) => pt(i, R * Math.max(0.04, (v || 0) / 100) * k).map(x => x.toFixed(1)).join(",")).join(" ");

  const rings = [1, 0.75, 0.5, 0.25].map(f =>
    `<polygon points="${axes.map((_, i) => pt(i, R * f).map(x => x.toFixed(1)).join(",")).join(" ")}"
      fill="${f === 1 ? "var(--bg-soft)" : "none"}" stroke="var(--line)" stroke-width="1"/>`).join("");
  const spokes = axes.map((_, i) =>
    `<line x1="${c}" y1="${c}" x2="${pt(i, R)[0].toFixed(1)}" y2="${pt(i, R)[1].toFixed(1)}" stroke="var(--line)" stroke-width="1"/>`).join("");

  const labels = axes.map((ax, i) => {
    const [x, y] = pt(i, R + 22);
    const anchor = Math.abs(x - c) < 6 ? "middle" : (x > c ? "start" : "end");
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}"
      dominant-baseline="middle" class="rd-label">${esc(ax.label)}
      <tspan x="${x.toFixed(1)}" dy="13" class="rd-score">${ax.score}</tspan></text>`;
  }).join("");

  return `
  <svg class="radar" viewBox="0 0 ${size} ${size}" role="img" aria-label="선수 지표 그래프">
    ${rings}${spokes}
    <polygon class="rd-avg" points="${poly(axes.map(a => a.avgScore), 1)}"/>
    <polygon class="rd-me" points="${poly(axes.map(a => a.score), 1)}"/>
    ${axes.map((ax, i) => { const [x, y] = pt(i, R * Math.max(0.04, ax.score / 100));
      return `<circle class="rd-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3"/>`; }).join("")}
    ${labels}
  </svg>`;
}

// 육각형 옆에 붙는 막대 목록 (포지션 백분위 · 계산에 사용한 실측값 · 동 포지션 평균)
function radarBarsHTML(axes) {
  return `<div class="rd-bars">` + axes.map(ax => `
    <div class="rd-bar ${ax.available === false ? "is-missing" : ""}">
      <span class="rd-bar-label">${esc(ax.label)}</span>
      <span class="rd-bar-track"><i style="width:${Math.max(2, ax.score)}%"></i></span>
      <b>${ax.available === false ? "-" : ax.score}</b>
      <span class="rd-bar-raw">${esc(ax.text)}</span>
      <span class="rd-bar-avg">동 포지션 평균 ${ax.avgScore}</span>
    </div>`).join("") + `</div>`;
}

// ── 응원팀 온보딩 + 내 팀 중심 홈 히어로 ────────────────────
// 첫 방문: "어느 팀을 응원하시나요?" → 선택하면 홈 상단이 내 팀 다음 경기와
// 예측 중심으로 바뀐다. 팬 여권(내 기록)으로 이어지는 입구이기도 하다.
let fanHeroChoosing = false;   // '변경'을 눌러 팀 선택 화면을 강제로 연 상태

function renderFanHero() {
  const el = document.getElementById("fan-hero");
  if (!el) return;
  const fav = getFavTeam();

  // ① 아직 안 물어봤거나, 변경을 누른 경우 → 팀 고르기
  if (fav === null || fanHeroChoosing) {
    el.style.display = "";
    el.innerHTML = `
      <div class="onboard">
        <h2>어느 팀을 응원하시나요?</h2>
        <p>팀을 고르면 홈이 우리 팀 다음 경기와 예측 중심으로 바뀝니다.</p>
        <div class="onboard-grid">
          ${TEAMS.map(t => `
            <button type="button" class="onboard-team" data-team="${t.id}" style="--team-color:${t.color}">
              ${teamLogoHTML(t, 34)}<span>${t.abbr}</span>
            </button>`).join("")}
        </div>
        <button type="button" class="onboard-skip" id="onboard-skip">중립으로 볼게요</button>
      </div>`;
    // 서버가 쿨다운으로 막을 수 있으므로 결과를 받아 그대로 알려 준다
    el.querySelectorAll(".onboard-team").forEach(b => b.addEventListener("click", async () => {
      const r = await setFavTeam(b.dataset.team);   // 회원은 프로필에도 저장된다
      if (r && r.error) { alert(r.error); return; }
      fanHeroChoosing = false;
      renderFanHero();
    }));
    el.querySelector("#onboard-skip").addEventListener("click", async () => {
      const r = await setFavTeam("");
      if (r && r.error) { alert(r.error); return; }
      fanHeroChoosing = false;
      renderFanHero();
    });
    return;
  }

  // ② 중립 선택 → 조용한 한 줄 안내만
  if (!fav) {
    el.style.display = "";
    el.innerHTML = `
      <div class="onboard-slim">
        <span>응원팀을 고르면 홈이 우리 팀 중심으로 바뀝니다</span>
        <span style="display:flex;gap:8px">
          <a class="btn-secondary" href="my.html" style="text-decoration:none">내 기록</a>
          <button type="button" class="btn-secondary" id="onboard-open">팀 고르기</button>
        </span>
      </div>`;
    el.querySelector("#onboard-open").addEventListener("click", () => {
      fanHeroChoosing = true;
      renderFanHero();
    });
    return;
  }

  // ③ 내 팀 홈
  const t = TEAM_MAP[fav];
  if (!t) { el.style.display = "none"; return; }
  el.style.display = "";

  // 예측 위젯과 같은 규칙: 진행 중 > 아직 안 온 경기 > (없으면) 첫 미종료 경기
  const mine = sortedMatches().filter(m =>
    m.status !== "done" && (m.a === fav || m.b === fav) && knownTeams(m));
  const nowMs = Date.now();
  const next = mine.find(m => m.status === "live")
    || mine.find(m => new Date(m.at) > nowMs)
    || mine[0];
  const rec = myFanRecord();
  const my = next ? getVotes()[next.id] : null;

  let matchHTML = `<div class="empty-note">예정된 ${esc(t.abbr)} 경기가 없습니다</div>`;
  if (next) {
    const A = TEAM_MAP[next.a], B = TEAM_MAP[next.b];
    const pct = communityPct(next);
    const usPct = next.a === fav ? pct.a : pct.b; // 우리 팀 승리를 예측한 비율
    const live = next.status === "live";
    matchHTML = `
      <a class="fh-match" href="/match/${q(next.id)}">
        <span class="fh-side">${teamLogoHTML(A, 34)} <b>${esc(A.abbr)}</b></span>
        <span class="fh-mid">${live ? `<span class="live-badge">● LIVE</span>` : `<em>VS</em><span>${fmtWhen(next.at)}</span>`}</span>
        <span class="fh-side right"><b>${esc(B.abbr)}</b> ${teamLogoHTML(B, 34)}</span>
      </a>
      <div class="fh-predict">
        ${my
          ? `<span class="fh-note"><b style="color:var(--accent)">${esc((my === "a" ? A : B).abbr)} 승리</b> 예측 중${
               pct.n ? ` · 전체 예측 중 ${esc(t.abbr)} 승리 ${usPct}% · ${pct.n}명 참여` : ""}</span>
             <button type="button" class="btn-secondary" id="fh-share">📷 예측 카드</button>`
          : `<span class="fh-note">아직 예측 전 — 누가 이길까요?</span>
             <button type="button" class="btn-secondary fh-vote" data-side="a">${esc(A.abbr)} 승</button>
             <button type="button" class="btn-secondary fh-vote" data-side="b">${esc(B.abbr)} 승</button>`}
      </div>`;
  }

  el.innerHTML = `
    <div class="fan-hero" style="--team-color:${t.color}">
      <div class="fh-head">
        <span class="fh-team">${teamLogoHTML(t, 26)} <b>${esc(t.name)}</b><em>내 응원팀</em></span>
        <span class="fh-actions">
          <a href="team.html?team=${q(t.id)}">팀 홈</a>
          <button type="button" id="fh-change">변경</button>
        </span>
      </div>
      ${matchHTML}
      <a class="fh-record" href="my.html">
        <span>이번 시즌 <b>${rec.matches}경기</b> 참여</span>
        <span>예측 적중률 <b>${rec.accuracy == null ? "-" : rec.accuracy + "%"}</b></span>
        <span>연속 참여 <b>${rec.streak}</b></span>
        <em>팬 여권 →</em>
      </a>
    </div>`;

  el.querySelector("#fh-change").addEventListener("click", () => {
    fanHeroChoosing = true;
    renderFanHero();
  });
  el.querySelectorAll(".fh-vote").forEach(b => b.addEventListener("click", e => {
    e.preventDefault();
    setVote(next.id, b.dataset.side);
    renderFanHero();
    renderPredictWidget?.();
  }));
  el.querySelector("#fh-share")?.addEventListener("click", () => sharePredictionCard(next, my));
}

// 밖으로 나가는 카드에 참여 인원을 적는 최소 기준.
// 이보다 적을 때 "2명 참여"가 박힌 카드가 돌면, 퍼뜨리려고 만든 물건이
// 사이트가 비어 있다는 증거를 스스로 광고하게 된다 (2026-08-06).
const CARD_MIN_N = 20;

// 공식 SNS 계정·문의 메일 — 카드·푸터·캡션이 전부 이 한 곳을 참조한다 (인스타그램·스레드 공용)
const SNS_HANDLE = "@thenexus.lolgg";
const SNS_URL = "https://instagram.com/thenexus.lolgg";
const CONTACT_EMAIL = "thenexus.lolgg@gmail.com";

// ── 예측 공유 카드 ("나는 ○○ 승리를 예측했습니다") ─────────
// 그리기와 저장을 나눠 둔다 — 미리보기·검증에서 그리기만 따로 쓸 수 있게.
function drawPredictionCard(match, side) {
  const A = TEAM_MAP[match.a], B = TEAM_MAP[match.b];
  if (!A || !B || !side) return null;
  const pick = side === "a" ? A : B;
  const pct = communityPct(match);
  const W = 720, H = 480;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  const F = (w, px) => `${w} ${px}px -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
  const rr = (x, y, w, h, r) => {
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
  };

  // 바탕 — 위가 살짝 밝은 세로 그라데이션 + 양 팀 색의 은은한 빛
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#151824"); bg.addColorStop(1, "#0b0c11");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = (x, color) => {
    const r = g.createRadialGradient(x, 205, 10, x, 205, 170);
    r.addColorStop(0, color + "2e"); r.addColorStop(1, color + "00");
    g.fillStyle = r; g.fillRect(x - 170, 35, 340, 340);
  };
  glow(W * 0.26, A.color || "#4a8cff");
  glow(W * 0.74, B.color || "#ff4655");
  g.fillStyle = "#ff4655"; g.fillRect(0, 0, W, 6);

  // 머리 — 브랜드 + 날짜 알약
  g.fillStyle = "#ff4655"; g.font = F("bold", 24);
  g.fillText("THE NEXUS", 44, 62);
  g.fillStyle = "#7c8496"; g.font = F("600", 16);
  g.fillText("승부예측", 44, 88);
  const when = fmtWhen(match.at);
  g.font = F("600", 15);
  const dw = g.measureText(when).width + 28;
  g.strokeStyle = "#2a2f3d"; g.lineWidth = 1;
  rr(W - 44 - dw, 44, dw, 32, 16); g.stroke();
  g.fillStyle = "#9aa1b0"; g.textAlign = "center";
  g.fillText(when, W - 44 - dw / 2, 65);

  // 대진 — 팀 컬러 약칭 + 가운데 VS
  g.font = F("bold", 78);
  g.fillStyle = A.color || "#e9ebf1"; g.fillText(A.abbr, W * 0.26, 235);
  g.fillStyle = B.color || "#e9ebf1"; g.fillText(B.abbr, W * 0.74, 235);
  g.fillStyle = "#3a4150"; g.font = F("bold", 26); g.fillText("VS", W / 2, 222);

  // 내 예측 — 팀 이름만 그 팀 색으로
  const parts = [["나는 ", "#e9ebf1"], [pick.abbr, pick.color || "#ff4655"], [" 승리를 예측했습니다", "#e9ebf1"]];
  g.font = F("bold", 32);
  const total = parts.reduce((s, [t]) => s + g.measureText(t).width, 0);
  let x = (W - total) / 2;
  g.textAlign = "left";
  parts.forEach(([t, col]) => { g.fillStyle = col; g.fillText(t, x, 316); x += g.measureText(t).width; });

  // 참여 비율 — 실제 표가 있을 때만, 양쪽을 각 팀 색으로 (2026-08-07 새 디자인)
  if (pct.n) {
    const bx = 64, bw = W - 128, by = 356, bh = 16;
    const aW = Math.max(bh, Math.min(bw - bh, bw * pct.a / 100)); // 0%여도 둥근 끝이 보이게
    rr(bx, by, bw, bh, 8); g.fillStyle = "#232838"; g.fill();
    rr(bx, by, aW - 1, bh, 8); g.fillStyle = A.color || "#4a8cff"; g.fill();
    rr(bx + aW + 1, by, bw - aW - 1, bh, 8); g.fillStyle = B.color || "#ff4655"; g.fill();
    g.font = F("bold", 19);
    g.textAlign = "left"; g.fillStyle = A.color || "#9aa1b0";
    g.fillText(`${A.abbr} ${pct.a}%`, bx, by + 46);
    g.textAlign = "right"; g.fillStyle = B.color || "#9aa1b0";
    g.fillText(`${pct.b}% ${B.abbr}`, bx + bw, by + 46);
    if (pct.n >= CARD_MIN_N) {
      g.textAlign = "center"; g.fillStyle = "#667080"; g.font = F("600", 15);
      g.fillText(`${pct.n}명 참여`, W / 2, by + 46);
    }
  } else {
    g.textAlign = "center"; g.fillStyle = "#9aa1b0"; g.font = F("600", 20);
    g.fillText("당신의 예상은?", W / 2, 372);
  }

  // 꼬리 — 주소는 짧게(홈만), 계정은 오른쪽. 겹침 방지를 위해 경기 주소는 넣지 않는다
  g.strokeStyle = "#232838"; g.beginPath(); g.moveTo(44, H - 58); g.lineTo(W - 44, H - 58); g.stroke();
  g.font = F("600", 15);
  g.textAlign = "left"; g.fillStyle = "#5b6373"; g.fillText(location.host, 44, H - 28);
  g.textAlign = "right"; g.fillStyle = "#7c8496"; g.fillText(SNS_HANDLE, W - 44, H - 28);
  g.textAlign = "left";
  return c;
}
function sharePredictionCard(match, side) {
  const c = drawPredictionCard(match, side);
  if (!c) return;
  c.toBlob(async blob => {
    const file = new File([blob], "nexus-predict.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "THE NEXUS 승부예측" }); return; } catch {}
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "nexus-predict.png";
    a.click();
  });
}

// ── 팀 공식 SNS 최신 콘텐츠 ────────────────────────────────
// 서버 함수가 YouTube RSS와, 설정된 경우 Instagram·X 공식 API를 같은 형태로 합친다.
function contentPlatformIcon(platform) {
  if (platform === "youtube") return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.6 7.2a2.8 2.8 0 0 0-2-2C17.8 4.7 12 4.7 12 4.7s-5.8 0-7.6.5a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2 12a29 29 0 0 0 .4 4.8 2.8 2.8 0 0 0 2 2c1.8.5 7.6.5 7.6.5s5.8 0 7.6-.5a2.8 2.8 0 0 0 2-2A29 29 0 0 0 22 12a29 29 0 0 0-.4-4.8ZM10 15.2V8.8l5.5 3.2-5.5 3.2Z"/></svg>`;
  if (platform === "instagram") return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.5" cy="6.6" r="1"/></svg>`;
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.7 3h3.7l-8.1 9.3L23.8 21h-7.5l-5.9-7.7L3.7 21H0l8.7-10L-.4 3h7.7l5.3 7 6.1-7Zm-1.3 16h2L6.2 4.9H4.1L17.4 19Z"/></svg>`;
}

const CONTENT_PLATFORM_NAME = { youtube: "YouTube", instagram: "Instagram", x: "X" };

async function renderTeamContent(teamId) {
  const card = document.getElementById("content-card");
  const box = document.getElementById("content-feed");
  if (!card || !box) return;
  try {
    const r = await fetch("/api/team-feed?team=" + encodeURIComponent(teamId));
    if (!r.ok) return;
    const j = await r.json();
    const list = ((j.items && j.items.length) ? j.items : (j.videos || []).map(v => ({ ...v, platform: "youtube" })))
      .slice(0, 18);
    if (!list.length) return;
    card.style.display = "";
    let index = 0;
    const prev = document.getElementById("content-prev");
    const next = document.getElementById("content-next");
    const counter = document.getElementById("content-counter");
    const paint = () => {
      const item = list[index];
      const platform = CONTENT_PLATFORM_NAME[item.platform] || "SNS";
      const published = Date.parse(item.published || "");
      const media = item.thumb
        ? `<img src="${esc(item.thumb)}" alt="" loading="lazy" decoding="async">`
        : `<span class="content-placeholder-mark">${contentPlatformIcon(item.platform)}</span>`;
      box.innerHTML = `
        <a class="content-slide platform-${esc(item.platform)}" href="${esc(item.url)}"
          target="_blank" rel="noopener noreferrer" aria-label="${esc(platform)}에서 콘텐츠 열기">
          <span class="content-media">${media}
            <span class="content-platform">${contentPlatformIcon(item.platform)} ${esc(platform)}</span>
          </span>
          <span class="content-copy">
            <strong>${esc(item.title || `${platform} 새 콘텐츠`)}</strong>
            <span>${Number.isFinite(published) ? fmtAgo(published) : "공식 계정"} · ${esc(platform)}</span>
          </span>
        </a>`;
      counter.textContent = `${index + 1} / ${list.length}`;
    };
    const move = delta => { index = (index + delta + list.length) % list.length; paint(); };
    prev.disabled = next.disabled = list.length < 2;
    prev.onclick = () => move(-1);
    next.onclick = () => move(1);
    card.onkeydown = event => {
      if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
      if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
    };
    paint();
  } catch (e) { /* SNS 카드가 없어도 게시판은 정상 동작해야 한다 */ }
}

// 오래된 호출 이름을 쓰는 캐시된 페이지와의 호환.
const renderTeamVideos = renderTeamContent;

// ── 모바일 하단 탭바 ──────────────────────────────────────
// 휴대폰에서는 위쪽 가로 메뉴가 엄지에서 멀다. 자주 쓰는 다섯 곳을 아래에 고정한다.
// alt 는 "이 탭에 불을 켜 둘 다른 묶음" — 여섯 묶음을 다섯 칸에 넣느라 둘이 겹쳐 산다.
const TAB_BAR = [
  { menu: "홈", href: "index.html", label: "홈",
    icon: `<path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>` },
  { menu: "경기", href: "matches.html", label: "경기", alt: ["순위"],
    icon: `<rect x="3" y="4.5" width="18" height="17" rx="2"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/>` },
  { menu: "승부예측", href: "predict.html", label: "예측",
    icon: `<path d="M12 3l2.6 5.6 6.4.8-4.7 4.3 1.3 6.3L12 17l-5.6 3 1.3-6.3L3 9.4l6.4-.8z"/>` },
  { menu: "커뮤니티", href: "community.html", label: "커뮤니티",
    icon: `<path d="M21 12a8 8 0 1 1-3.2-6.4L21 4l-1 4.2A8 8 0 0 1 21 12z"/><path d="M8 11h8M8 14.5h5"/>` },
  { menu: "선수·팀", href: "players.html", label: "선수·팀",
    icon: `<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0M13.5 20a4 4 0 0 1 7 0"/>` },
];

function renderTabBar(activeMenu) {
  document.getElementById("tab-bar")?.remove();
  const nav = document.createElement("nav");
  nav.id = "tab-bar";
  nav.className = "tab-bar";
  nav.innerHTML = TAB_BAR.map(t => {
    const on = t.menu === activeMenu || (t.alt || []).includes(activeMenu);
    return `<a href="${t.href}" class="${on ? "active" : ""}" aria-label="${esc(t.label)}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${t.icon}</svg>
      <span>${esc(t.label)}</span>
    </a>`;
  }).join("");
  document.body.appendChild(nav);
  document.body.classList.add("has-tab-bar");
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
      <p class="foot-disclaimer en" lang="en">
        Some content is provided courtesy of Leaguepedia, under a CC-BY-SA 3.0 license.
      </p>
      <p class="foot-links">
        모든 예측 참여는 무료이며 포인트는 환전·거래할 수 없습니다.
        · <a href="terms.html">이용약관</a> · <a href="privacy.html">개인정보 처리방침</a>
        · 문의·신고: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>
          / <a href="${SNS_URL}" target="_blank" rel="noopener noreferrer">인스타그램 ${SNS_HANDLE} DM</a>
        · <a href="admin.html">관리자</a>
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
  // 표가 0건이면 communityPct 는 배당(2:2) 기반 추정치를 돌려준다 → 화면에는 정확히 50:50.
  // 아무도 예측하지 않았는데 "팬심이 반반"이라고 말하는 셈이라 절대 그대로 쓰면 안 된다.
  // (store.js communityPct 주석의 규칙 — 다른 화면은 지키는데 이 위젯만 빠져 있었다)
  const shown = pct.n > 0;

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
          <span class="pct" style="color:${voted ? "var(--blue)" : "var(--text)"}">${shown ? pct.a + "%" : "—"}</span>
        </button>
      </div>
      <span class="vs-label">VS</span>
      <div class="predict-team" style="--team-color:${B.color}">
        <button data-vote="b" class="${voted === "b" ? "voted" : ""}">
          ${teamLogoHTML(B, 38)}
          <span class="pct" style="color:${voted ? "var(--accent)" : "var(--text)"}">${shown ? pct.b + "%" : "—"}</span>
        </button>
      </div>
    </div>
    <div class="predict-bar">
      <span class="a" style="width:${shown ? pct.a : 0}%"></span>
      <span class="b" style="width:${shown ? pct.b : 0}%"></span>
    </div>
    <p class="predict-note">${voted
      ? `<em>${voted === "a" ? A.abbr : B.abbr} 승리</em>에 예측했습니다 · ${shown ? `${pct.n}명 참여 · ` : ""}마감: 경기 시작 5분 전`
      : shown
      ? `${pct.n}명이 예측했습니다 · 한 번 눌러서 참여하세요`
      : `<em>아직 아무도 예측하지 않았습니다</em> · 첫 예측을 남겨 보세요`}</p>`;

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
        : pct.n
          ? `<div class="odds" title="승부예측 비율 · ${pct.n}명 참여">
              <span class="odds-pill"><b>${Math.round(pct.a)}%</b></span>
              <span class="odds-pill"><b>${Math.round(pct.b)}%</b></span>
            </div>`
          // 표가 0건일 때 배당 추정치를 그대로 보여 주면 "팬심 50:50"이라는 거짓말이 된다
          : `<div class="odds" title="아직 예측이 없습니다"><span class="odds-pill">예측 대기</span></div>`;
      return `
      <a class="match-row" href="/match/${q(m.id)}">
        <span class="match-time">${fmtTime(m.at)}</span>
        ${status}
        <div class="match-teams">
          <span class="match-side ${isRealTeam(m.a) ? "" : "tbd"}">${slotLogoHTML(m.a, 24)} ${slotName(m.a)}</span>
          ${score}
          <span class="match-side right ${isRealTeam(m.b) ? "" : "tbd"}">${slotName(m.b)} ${slotLogoHTML(m.b, 24)}</span>
        </div>
        <div class="match-right">${right}</div>
        <span class="match-arrow">›</span>
        ${stakesHTML(m)}
      </a>`;
    }).join("")}`;
  }).join("");
}
function shortStage(stage) {
  return (stage || "").replace("라운드 ", "R").replace(" 그룹", "");
}

/** 경기 카드에 붙는 "이기면 무엇이 달라지는가" 한두 줄.
 *  race.js 가 없는 화면(예전 페이지)에서도 안 깨지게 함수 존재를 먼저 확인한다.
 *  붙일 말이 없으면 **아무것도 안 붙인다** — 빈 줄이 억지 문장보다 낫다. */
function stakesHTML(m) {
  if (typeof matchStakes !== "function" || !m || m.status === "done") return "";
  let s = null;
  try { s = matchStakes(m.id); } catch (e) { return ""; }
  if (!s || !s.lines.length) return "";
  return `<div class="match-stakes">${s.lines.map(l =>
    `<span class="stake stake-${l.tone}">${esc(l.text)}</span>`).join("")}</div>`;
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
              <span title="제3팀 팬·응원팀 미등록 포함">기타 ${pct(r.neutral.counts[i], r.neutral.total)}%</span>
            </div>` : "") : ""}
        </div>`;
      }).join("")}
      ${(A || B) && !canBreak ? `
        <div class="poll-gate">
          <div class="poll-gate-blur">
            ${A ? `${A.abbr}팬 ▮▮▮▮▮ · ` : ""}${B ? `${B.abbr}팬 ▮▮▮▮ · ` : ""}기타 ▮▮▮
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
      // '중립'이라 쓰면 거짓 — 이 통에는 제3팀 팬과 비로그인이 함께 들어간다
      parts.push(`기타 ${pctOf(r.neutral.counts[i], r.neutral.total)}%`);
      g.fillText(parts.join(" · "), 48, y + 8); y += 26;
    }
    y += 18;
  });

  g.fillStyle = "#667080"; g.font = "600 20px sans-serif";
  g.fillText(`${r.voters >= CARD_MIN_N ? r.voters + "명 참여 · " : ""}팬덤별 여론은 THE NEXUS에서`, 48, H - 72);
  // 경기 주소는 길어서 계정명과 겹친다 — 홈 주소만 짧게 (긴 링크는 어차피 첫 댓글에)
  g.fillStyle = "#9aa1b0";
  g.fillText(location.host, 48, H - 40);
  g.textAlign = "right"; g.fillStyle = "#667080"; g.fillText(SNS_HANDLE, W - 48, H - 40); g.textAlign = "left";

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
  const voters = matchRatingVoters(match.id);
  if (!voters) { alert("아직 이 경기에 매겨진 평점이 없습니다."); return; }

  const rows = fanRatingRows(match);
  const pog = pogForMatch(match.id);
  const pogPl = pog ? getPlayer(pog.pid) : null;
  const tierColor = a => a >= 9 ? "#f5b942" : a >= 8 ? "#2fbf71" : a >= 7 ? "#4a8cff" : a >= 6 ? "#6b7484" : "#ff4655";

  // 팬덤별 값은 **있는 것만** 적는다. 예전에는 참여가 적으면
  // "아군 9.0 · 상대 — · 중립 —" 처럼 줄표만 늘어서 지저분했다.
  const splitText = s => {
    const parts = [];
    if (s.home) parts.push(`아군 ${s.home.avg.toFixed(1)}`);
    if (s.opp) parts.push(`상대 ${s.opp.avg.toFixed(1)}`);
    if (s.neu) parts.push(`기타 ${s.neu.avg.toFixed(1)}`);
    return parts.length > 1 ? parts.join(" · ") : "";
  };

  const W = 720, rowH = 56, padX = 44;
  const headH = pogPl ? 236 : 190;
  const H = headH + rows.length * rowH + 66;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  const F = (w, px) => `${w} ${px}px -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;

  g.fillStyle = "#0f1015"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#ff4655"; g.fillRect(0, 0, W, 6);

  // 머리말 — 한 줄로 (예전에는 두 줄이라 위가 답답했다)
  g.fillStyle = "#ff4655"; g.font = F("bold", 24);
  g.fillText("THE NEXUS", padX, 62);
  g.fillStyle = "#667080"; g.font = F("600", 17);
  g.fillText("팬심 평점", padX + g.measureText("THE NEXUS").width + 132, 62);

  // 스코어
  g.textAlign = "center";
  g.fillStyle = "#e9ebf1"; g.font = F("bold", 38);
  g.fillText(`${A.abbr}  ${match.scoreA ?? 0} : ${match.scoreB ?? 0}  ${B.abbr}`, W / 2, 122);
  g.fillStyle = "#5c6472"; g.font = F("500", 16);
  g.fillText(match.label || match.stage || "", W / 2, 150);

  // POG 배너 (팀 이름표와 겹치지 않게 넉넉히 띄운다)
  if (pogPl) {
    g.fillStyle = "#f5b942"; g.fillRect(padX, 176, W - padX * 2, 32);
    g.fillStyle = "#221a06"; g.font = F("bold", 18);
    g.fillText(`팬 선정 POG   ${pogPl.nick}  ${pog.avg.toFixed(1)}`, W / 2, 199);
  }
  g.textAlign = "left";

  const badgeW = 52, innerL = W / 2 - 40, innerR = W / 2 + 40;
  rows.forEach((r, i) => {
    const y = headH + i * rowH;
    if (i) { g.fillStyle = "#1b1e26"; g.fillRect(padX, y - 16, W - padX * 2, 1); }

    g.fillStyle = "#4a5160"; g.font = F("600", 13); g.textAlign = "center";
    g.fillText(r.pos, W / 2, y + 14);
    g.textAlign = "left";

    const draw = (x, dir) => {
      if (!x) return;
      const right = dir === "r";
      const nameX = right ? W - padX : padX;
      const bx = right ? innerR : innerL - badgeW;
      const team = right ? B : A;
      g.textAlign = right ? "right" : "left";

      // 이름 앞(뒤)에 팀 색 점 — 팀 이름표를 따로 두지 않아도 어느 팀인지 보인다
      g.fillStyle = team.color || "#9aa1b0";
      g.beginPath(); g.arc(right ? nameX + 9 : nameX - 9, y + 6, 4, 0, 7); g.fill();

      g.fillStyle = "#e9ebf1"; g.font = F("bold", 19);
      g.fillText(x.p.nick, nameX, y + 12);

      if (x.s.all) {
        g.fillStyle = tierColor(x.s.all.avg);
        g.fillRect(bx, y - 6, badgeW, 25);
        g.fillStyle = x.s.all.avg >= 9 ? "#221a06" : "#fff";
        g.font = F("bold", 17); g.textAlign = "center";
        g.fillText(x.s.all.avg.toFixed(1), bx + badgeW / 2, y + 12);
        g.textAlign = right ? "right" : "left";
        const sub = splitText(x.s);
        if (sub) {
          g.fillStyle = "#5c6472"; g.font = F("500", 12);
          g.fillText(sub, nameX, y + 32);
        }
      } else {
        g.fillStyle = "#2a2f3a"; g.font = F("bold", 17); g.textAlign = "center";
        g.fillText("—", bx + badgeW / 2, y + 12);
        g.textAlign = right ? "right" : "left";
      }
      // 교체 출전이면 표시 (한 세트만 뛴 선수가 왜 여기 있는지 보이게)
      if (x.setsComplete && x.sets && x.totalSets && x.sets < x.totalSets) {   // 세트를 다 모은 경기에서만
        g.fillStyle = "#4a5160"; g.font = F("500", 12);
        g.fillText(`${x.sets}세트 출전`, nameX, y + (x.s.all && splitText(x.s) ? 32 : 30));
      }
      g.textAlign = "left";
    };
    draw(r.a, "l");
    draw(r.b, "r");
  });

  // 꼬리말 — 주소는 빼고 한 줄만 (인원은 충분히 모였을 때만 적는다)
  g.fillStyle = "#4a5160"; g.font = F("600", 15);
  g.fillText(voters >= CARD_MIN_N ? `${voters}명 참여` : "팬 평점", padX, H - 26);
  g.textAlign = "right";
  g.fillStyle = "#2f3542";
  g.fillText(`THE NEXUS · ${SNS_HANDLE}`, W - padX, H - 26);
  g.textAlign = "left";

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
const HOME_DAY_FMT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", weekday: "short",
});
function homeDayLabel(at) {
  const p = kstParts(at);
  return `${Number(p.month)}. ${Number(p.day)}. ${HOME_DAY_FMT.format(new Date(at))}`;
}

// 가장 가까운 경기 날짜의 모든 경기를 팀 메뉴 바로 위 얇은 바로 보여 준다.
// LCK는 보통 하루 2경기지만 휴식기·플레이오프의 1경기도 같은 코드로 자연스럽게 처리한다.
function renderHomeMatchBar() {
  const strip = document.querySelector(".team-strip");
  if (!strip) return;
  let bar = document.getElementById("home-match-bar");
  if (!bar) {
    bar = document.createElement("section");
    bar.id = "home-match-bar";
    bar.className = "home-match-bar";
    bar.setAttribute("aria-label", "오늘의 경기 예측");
    strip.before(bar);
  }

  const now = Date.now();
  const candidates = sortedMatches().filter(m => knownTeams(m) && m.status !== "done" &&
    (m.status === "live" || new Date(m.at).getTime() > now));
  const first = candidates.find(m => m.status === "live") || candidates[0];
  if (!first) { bar.style.display = "none"; return; }
  const day = fmtDayKey(first.at);
  const games = candidates.filter(m => fmtDayKey(m.at) === day).slice(0, 2);
  if (!games.length) { bar.style.display = "none"; return; }

  bar.style.display = "";
  bar.dataset.count = String(games.length);
  bar.innerHTML = `
    <div class="container home-match-inner">
      <div class="home-match-date">
        <span>${fmtDayKey(first.at) === fmtDayKey(new Date()) ? "오늘의 경기" : "다음 경기"}</span>
        <strong>${homeDayLabel(first.at)} · ${games.length}경기</strong>
      </div>
      <div class="home-match-list">
        ${games.map(m => {
          const A = TEAM_MAP[m.a], B = TEAM_MAP[m.b];
          const pct = communityPct(m);
          const a = pct.n > 0 ? pct.a : 50;
          const b = pct.n > 0 ? pct.b : 50;
          return `<a class="home-match-game" href="/match/${q(m.id)}"
            aria-label="${fmtHM(m.at)} ${esc(A.abbr)} 대 ${esc(B.abbr)} 승부 예측">
            <time>${m.status === "live" ? "LIVE" : fmtHM(m.at)}</time>
            <span class="home-match-team">${teamLogoHTML(A, 26)}<b>${esc(A.abbr)}</b></span>
            <span class="home-match-rate"><b>${a}%</b><i><span style="width:${a}%"></span></i><b>${b}%</b></span>
            <span class="home-match-team right"><b>${esc(B.abbr)}</b>${teamLogoHTML(B, 26)}</span>
            <em>예측 ›</em>
          </a>`;
        }).join("")}
      </div>
    </div>`;
}

function renderHomeSchedule() {
  const el = document.getElementById("schedule-body");
  if (!el) return;
  // 최근 끝난 경기 3개 + 앞으로의 경기 7개 (예전에는 '가장 오래된 10경기'라
  // 시즌이 진행되면 홈 상단이 계속 옛날 경기로 채워졌다)
  const ms = sortedMatches();
  const now = Date.now();
  const past = ms.filter(m => m.status === "done" || new Date(m.at) <= now);
  const soon = ms.filter(m => m.status !== "done" && new Date(m.at) > now);

  // 오늘 경기가 있으면 맨 위에 경기방 입구를 크게 — 홈의 주 행동은
  // "일정 훑기"가 아니라 "지금 이 경기 이야기하기"다 (경기방 v1, 2026-08-07)
  const today = ms.find(m => {
    if (!m.at || !TEAM_MAP[m.a] || !TEAM_MAP[m.b]) return false;
    const d = new Date(m.at), n = new Date();
    return kstParts(d.getTime()).day === kstParts(n.getTime()).day &&
           kstParts(d.getTime()).month === kstParts(n.getTime()).month;
  });
  const cta = today ? `
    <a class="admin-note" href="/match/${q(today.id)}"
       style="display:flex;align-items:center;gap:8px;text-decoration:none;border-top:none;font-weight:700">
      💬 오늘 ${esc(TEAM_MAP[today.a].abbr)} vs ${esc(TEAM_MAP[today.b].abbr)}
      ${today.status === "done" ? "어떻게 보셨나요? — 평점·토론" : "이야기하기 — 예측·미리보기·토론"}
      <span style="margin-left:auto">→</span>
    </a>` : "";
  el.innerHTML = cta + scheduleHTML([...past.slice(-3), ...soon.slice(0, 7)]);
}

let homeBoardCat = "전체";
function renderHotPosts() {
  const el = document.getElementById("hot-posts");
  if (!el) return;
  // 자동 생성된 공식 토론글은 반응이 전혀 없으면 첫 화면에서 제외한다.
  // 회원 글은 추천 수와 관계없이 최신 글로 보여 줘 새 커뮤니티가 더 비어 보이지 않게 한다.
  const meaningful = p => {
    const title = String(p.title || "").trim();
    return p.cat === "공지" || title.length >= 5;
  };
  const candidates = getPosts().filter(meaningful)
    .filter(p => homeBoardCat === "전체" || p.cat === homeBoardCat)
    .sort((a, b) => (b.cat === "공지") - (a.cat === "공지") || b.ts - a.ts);
  const preferred = candidates.filter(p => {
    const autoRoom = !!p.match_id || /^\[경기 토론\]/.test(String(p.title || "").trim());
    return !autoRoom || p.up >= 2 || p.comments.length >= 1;
  });
  // 양질의 글이 다섯 개보다 적을 때만 반응 없는 자동 경기방을 맨 아래 보충한다.
  // 5개 고정 요구를 지키면서도 빈 자동 글이 정상 글 위로 올라오지 않게 한다.
  const posts = [...preferred, ...candidates.filter(p => !preferred.includes(p))].slice(0, 5);
  if (!posts.length) {
    el.innerHTML = `<div class="empty-note">이 분류의 최신 글이 없습니다 —
      <a href="write.html" style="text-decoration:underline">첫 글을 남겨 보세요</a></div>`;
  } else {
    el.innerHTML = posts.map(p => {
      const t = p.team ? TEAM_MAP[p.team] : null;
      return `
      <a class="home-post-row" href="post.html?id=${q(p.id)}">
        <span class="home-board-name" style="--home-team:${t ? t.color : "var(--accent)"}">${t ? esc(t.abbr) : "전체"}</span>
        <span class="home-post-copy"><strong>${esc(p.title)}</strong><small>${esc(p.nick)} · ${fmtAgo(p.ts)}</small></span>
        <span class="home-post-stats"><b>▲ ${p.up}</b><span>댓글 ${p.comments.length}</span></span>
      </a>`;
    }).join("");
  }

  document.querySelectorAll("[data-home-cat]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.homeCat === homeBoardCat);
    btn.onclick = () => { homeBoardCat = btn.dataset.homeCat; renderHotPosts(); };
  });
}

function renderHomeUpcomingSchedule() {
  const el = document.getElementById("home-schedule-body");
  if (!el) return;
  const now = Date.now();
  const games = sortedMatches().filter(m => knownTeams(m) && m.status !== "done" &&
    (m.status === "live" || new Date(m.at).getTime() > now)).slice(0, 4);
  if (!games.length) { el.innerHTML = `<div class="empty-note">예정된 경기가 없습니다</div>`; return; }

  let day = "";
  el.innerHTML = games.map(m => {
    const key = fmtDayKey(m.at);
    const label = key === day ? "" : `<div class="home-schedule-day">${homeDayLabel(m.at)}</div>`;
    day = key;
    const A = TEAM_MAP[m.a], B = TEAM_MAP[m.b];
    return `${label}<a class="home-schedule-row" href="/match/${q(m.id)}">
      <time>${m.status === "live" ? "LIVE" : fmtHM(m.at)}</time>
      <span>${teamLogoHTML(A, 20)}${esc(A.abbr)}</span><b>VS</b>
      <span>${teamLogoHTML(B, 20)}${esc(B.abbr)}</span>
    </a>`;
  }).join("");
}

function renderHomePulse() {
  const card = document.getElementById("home-pulse-card");
  if (!card) return;
  const poll = getPolls().filter(pollOpen)
    .sort((a, b) => (a.closes_at ? new Date(a.closes_at) : Infinity) - (b.closes_at ? new Date(b.closes_at) : Infinity))[0];
  if (!poll || !poll.options?.length) { card.style.display = "none"; return; }
  const match = poll.match_id ? getMatches().find(m => m.id === poll.match_id) : null;
  const r = pollResults(poll, match?.a, match?.b);
  const ranked = poll.options.map((label, i) => ({ label, n: r.overall.counts[i] || 0 }))
    .sort((a, b) => b.n - a.n).slice(0, 2);
  const total = r.overall.total || 0;

  card.style.display = "";
  card.querySelector("#home-pulse-question").textContent = poll.question;
  card.querySelector("#home-pulse-votes").innerHTML = ranked.map(x =>
    `<span><b>${esc(x.label)}</b> ${total ? Math.round(x.n / total * 100) : 0}%</span>`).join("");
  const link = card.querySelector("#home-pulse-link");
  link.href = match ? `/match/${q(match.id)}` : poll.post_id ? `post.html?id=${q(poll.post_id)}` : "community.html";
}

// ── 창립 팬 100인 레이스 (홈 사이드바) ─────────────────────
// 팀당 선착순 100명 — 응원팀을 등록해야만 참여할 수 있어서,
// 이 위젯이 곧 팬덤별 집계(아군/상대)의 표본을 채우는 입구가 된다.
function renderFoundingRace() {
  const el = document.getElementById("founding-race");
  if (!el) return;
  const counts = TEAMS.map(t => ({ t, n: Cache.founding.filter(f => f.team === t.id).length }))
    .sort((a, b) => b.n - a.n || a.t.abbr.localeCompare(b.t.abbr));
  const total = counts.reduce((s, x) => s + x.n, 0);
  const totalEl = document.getElementById("founding-total");
  if (totalEl) totalEl.textContent = total ? `${total}명 등록` : "";

  const fav = myFanTeam();
  const myNo = fav && Auth.session ? myFoundingNo(fav) : null;
  const favT = fav ? TEAM_MAP[fav] : null;

  // 참여 동선: 회원+응원팀 → 바로 등록 버튼 / 회원인데 팀 미설정 → 홈에서 팀 고르기 /
  // 비회원 → 가입 안내. "어디서 하는 건지 모르겠다"가 없도록 버튼 하나로.
  const cta = myNo
    ? `<a class="btn-secondary" href="team.html?team=${q(fav)}">내 번호 <b>#${myNo}</b> · ${esc(favT.abbr)} 명단 보기 ›</a>`
    : (Auth.session && fav)
    ? `<button type="button" class="btn-primary" id="founding-claim">${esc(favT.abbr)} 창립 팬 번호 받기</button>`
    : Auth.session
    ? `<span class="fh-note">응원팀을 고르면 참여할 수 있어요 — <a href="index.html" style="text-decoration:underline">위에서 팀 고르기</a></span>`
    : `<a class="btn-primary" href="login.html">가입하고 창립 팬 번호 받기</a>`;

  el.innerHTML = `
    ${counts.slice(0, 5).map(({ t, n }) => `
      <div style="display:flex;align-items:center;gap:9px;padding:5px 0">
        <span style="display:inline-flex;align-items:center;gap:6px;width:64px;flex:none">
          ${teamLogoHTML(t, 18)} <b style="font-size:13px">${esc(t.abbr)}</b></span>
        <span style="flex:1;height:8px;border-radius:4px;background:var(--line);overflow:hidden">
          <span style="display:block;height:100%;width:${n}%;background:${t.color};border-radius:4px"></span></span>
        <span style="width:52px;text-align:right;font-size:12.5px;color:var(--text-sub);font-variant-numeric:tabular-nums">${n} / 100</span>
      </div>`).join("")}
    <div style="padding:10px 0 4px;display:flex;flex-direction:column;gap:6px">${cta}</div>
    <div class="admin-note" style="margin-top:8px">각 팀 100명이 차면 그 팀 명단은 영구히 닫힙니다.
      번호는 등록 순서대로 매겨지고, 닉네임 옆에 <b>#번호</b> 배지가 붙습니다.</div>`;

  el.querySelector("#founding-claim")?.addEventListener("click", async () => {
    const btn = el.querySelector("#founding-claim");
    btn.disabled = true; btn.textContent = "등록 중…";
    const r = await claimFounding(fav);
    if (r.error) {
      sbWriteFail(r.error, "claimFounding");
      btn.disabled = false; btn.textContent = `${favT.abbr} 창립 팬 번호 받기`;
    } else renderFoundingRace();
  });
}

function renderPredictRanking() {
  const el = document.getElementById("predict-ranking");
  if (!el) return;
  const rows = predictRanking();
  if (!rows.length) {
    // 빈 랭킹을 홈에 걸어두면 "아무도 없다"는 광고가 된다 — 카드째 접는다.
    // 표본이 생기면 다음 렌더에서 다시 펼쳐진다.
    const card = el.closest(".card");
    if (card) card.style.display = "none";
    return;
  }
  const card0 = el.closest(".card");
  if (card0) card0.style.display = "";
  el.innerHTML = rows.slice(0, 5).map((r, i) => {
    const t = r.team ? TEAM_MAP[r.team] : null;
    return `
    <div class="rank-row">
      <span class="no ${i < 3 ? "top" : ""}">${i + 1}</span>
      <span class="nick">${esc(r.nick)}${t ? `<span class="nick-badge" title="${esc(t.name)} 팬">${teamLogoHTML(t, 14)}</span>` : ""}</span>
      <span class="detail">${r.hit}/${r.total} 적중</span>
      <span class="rate">${r.pct}%</span>
    </div>`;
  }).join("");
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
  if (link && m) { link.href = "/match/" + m.id; link.style.display = ""; }
  else if (link) link.style.display = "none";
  renderPollInto(card.querySelector("#today-poll"), poll,
    m ? { teamA: m.a, teamB: m.b } : {});
}

async function initHome() {
  await storeReady;
  renderHeader("홈", null);
  const draw = () => {
    renderHomeMatchBar();
    renderHotPosts();
    renderHomeUpcomingSchedule();
    renderHomePulse();
    setupSidebarStandings();
  };
  draw();
  // 스냅샷으로 먼저 그린 뒤 최신 경기·게시글·순위·투표가 오면 한 번 더 갱신한다.
  storeFresh.then(draw).catch(() => {});
  renderFooter();
}

// ── 세트 스코어보드 ──────────────────────────────────────────────
// 한 세트의 '경기 전체 기록'을 한눈에: 진영·시간·밴픽·오브젝트·골드.
// 재료는 match_details.game (수집기가 리그피디아 ScoreboardGames 에서 담는다).
// 아직 재수집하지 않은 세트는 game 이 비어 있으므로 아무것도 그리지 않는다.
//
// game 안의 a/b 는 **언제나 그 경기의 a팀/b팀** 기준이다 (블루/레드가 아니다).
// 블루가 어느 쪽이었는지는 game.blue 가 따로 알려 준다.

const SB_ROWS = [
  { k: "kills",   name: "킬",     fmt: v => v },
  { k: "gold",    name: "골드",   fmt: v => (Math.round(v / 100) / 10) + "K" },
  { k: "towers",  name: "타워",   fmt: v => v },
  { k: "inhib",   name: "억제기", fmt: v => v },
  { k: "barons",  name: "바론",   fmt: v => v },
  { k: "dragons", name: "드래곤", fmt: v => v },
  { k: "heralds", name: "전령",   fmt: v => v },
  // optional = 시즌·패치에 따라 맵에 없을 수 있는 오브젝트.
  // 양쪽 다 0 이면 줄을 아예 그리지 않는다 — 없는 오브젝트를 "0 : 0" 으로 보여 주면
  // 그게 있는 건데 아무도 못 먹은 것처럼 읽힌다.
  // (아타칸은 2026 시즌 맵에 없다. 칸은 계속 받아 두니, 다시 생기면 저절로 나타난다)
  { k: "grubs",   name: "공허충", fmt: v => v, optional: true },
  { k: "atakhan", name: "아타칸", fmt: v => v, optional: true },
];

// 드래곤 종류 — 리그피디아가 종류별로 세어 준다.
// ⚠ '영혼'은 드래곤 4마리를 먼저 모은 팀이 얻는다. 종류는 몇 번째 용이었는지에 달렸는데
//   우리는 **개수만** 받으므로 어떤 영혼인지는 알 수 없다. 그래서 종류를 단정하지 않고
//   "영혼"이라고만 적는다. (아는 것보다 더 말하지 않는다)
const DRAKE_KO = {
  infernal: "화염", mountain: "대지", ocean: "바다", cloud: "바람",
  hextech: "마공학", chemtech: "화학공학", elder: "장로드래곤",
};
const SOUL_AT = 4;
const DRAKE_ICON_ROOT = "https://raw.communitydragon.org/latest/game/assets/ux/minimap/icons/";

function drakeIconHTML(kind, label) {
  const file = kind === "elder" ? "dragon_elder.png" : `dragon_${kind}.png`;
  return `<img class="sb-drake-icon" src="${DRAKE_ICON_ROOT}${file}" alt="" loading="lazy" decoding="async"><span>${esc(label)}</span>`;
}

function setScoreboardHTML(match, set) {
  const g = (set && set.game) || {};
  if (!g || !Object.keys(g).length) return "";
  const A = TEAM_MAP[match.a], B = TEAM_MAP[match.b];
  if (!A || !B) return "";

  const wonA = set.win === "a";
  // 정합성 검사 (P0-2) — 세트 승수가 최종 스코어와 어긋난 경기는 승/패 표시를 감춘다.
  // 잘못 저장된 진영(m8: 0:2 인데 두 세트 다 a 승)이 그대로 공개되는 걸 막는다.
  const sets = (typeof getDetails === "function" && (getDetails(match.id) || {}).sets) || [];
  const suspect = typeof finishedMatchViolations === "function"
    && finishedMatchViolations(match, sets).length > 0;
  const sideChip = s => g.blue ? (g.blue === s ? `<span class="sb-side blue">블루</span>`
                                              : `<span class="sb-side red">레드</span>`) : "";
  const head = (t, s, won) => `
    <div class="sb-team ${s}">
      ${teamLogoHTML(t, 22)}
      <b class="team-text" style="--team-color:${t.color}">${esc(t.abbr)}</b>
      ${sideChip(s)}
      ${suspect ? `<span class="sb-wl l" title="세트 기록이 최종 스코어와 달라 확인 중입니다">검수 중</span>`
                : `<span class="sb-wl ${won ? "w" : "l"}">${won ? "승" : "패"}</span>`}
    </div>`;

  // 밴·픽 — 순서 그대로. 밴은 흐리게 + 사선.
  const champs = (list, kind) => (list || []).map(c =>
    `<span class="sb-ch ${kind}" title="${esc(c)}">${ddChampHTML(c, 26) || esc(c)}</span>`).join("");
  const pickBanRow = (label, key, kind) => {
    const v = g[key];
    if (!v || (!(v.a || []).length && !(v.b || []).length)) return "";
    return `<div class="sb-pb">
      <div class="sb-pb-side">${champs(v.a, kind)}</div>
      <div class="sb-pb-lb">${label}</div>
      <div class="sb-pb-side r">${champs(v.b, kind)}</div>
    </div>`;
  };

  // 비교 막대 — 가운데 항목 이름을 두고 양쪽으로 뻗는다.
  // 길이는 그 줄의 큰 값 기준(a/max, b/max)이라 두 값의 차이가 그대로 보인다.
  // 합계 100% 로 나누면 "0 대 0" 같은 줄에서 한쪽이 꽉 차 보여 오해를 준다.
  const bars = SB_ROWS.map(r => {
    const v = g[r.k];
    if (!v || (v.a == null && v.b == null)) return "";
    const a = +v.a || 0, b = +v.b || 0, max = Math.max(a, b);
    if (r.optional && !max) return "";        // 맵에 없는 오브젝트는 줄을 만들지 않는다
    const w = x => (max ? Math.round((x / max) * 1000) / 10 : 0);
    return `<div class="sb-row" role="group" aria-label="${esc(r.name)} ${esc(String(r.fmt(a)))} 대 ${esc(String(r.fmt(b)))}">
      <span class="sb-v ${a >= b ? "hi" : ""}">${esc(String(r.fmt(a)))}</span>
      <span class="sb-bar l">${a ? `<i style="width:${w(a)}%;background:${A.color}"></i>` : ""}</span>
      <span class="sb-k">${esc(r.name)}</span>
      <span class="sb-bar r">${b ? `<i style="width:${w(b)}%;background:${B.color}"></i>` : ""}</span>
      <span class="sb-v ${b >= a ? "hi" : ""}">${esc(String(r.fmt(b)))}</span>
    </div>`;
  }).join("");

  // 드래곤 종류 — 종류별 개수를 아이콘으로. 4마리를 모았으면 '영혼'.
  const drakeSide = s => {
    const d = (g.drakes || {})[s];
    if (!d) return "";
    const total = (g.dragons || {})[s] || 0;
    const chips = Object.keys(DRAKE_KO).filter(k => d[k]).map(k => {
      const nm = DRAKE_KO[k];
      const full = k === "elder" ? nm : `${nm} 드래곤`;
      return `<span class="sb-drake" title="${esc(full)} ${d[k]}마리">${drakeIconHTML(k, full)}${d[k] > 1 ? `<b>${d[k]}</b>` : ""}</span>`;
    }).join("");
    return chips + (total >= SOUL_AT
      ? `<span class="sb-soul" title="드래곤 4마리 — 드래곤 영혼 획득"><span aria-hidden="true">✦</span> 영혼</span>` : "");
  };
  const drakeRow = (g.drakes && (g.drakes.a || g.drakes.b))
    ? `<div class="sb-pb">
         <div class="sb-pb-side drake">${drakeSide("a")}</div>
         <div class="sb-pb-lb">드래곤</div>
         <div class="sb-pb-side drake r">${drakeSide("b")}</div>
       </div>` : "";

  const links = [
    g.mh ? `<a href="${esc(g.mh)}" target="_blank" rel="noopener">라이엇 전적</a>` : "",
    g.patch ? `<span>패치 ${esc(g.patch)}</span>` : "",
  ].filter(Boolean).join("");

  return `<div class="scoreboard">
    <div class="sb-head">
      ${head(A, "a", wonA)}
      <div class="sb-len">${g.len ? esc(g.len) : ""}<span>경기 시간</span></div>
      ${head(B, "b", !wonA)}
    </div>
    ${bars ? `<div class="sb-bars">${bars}</div>` : ""}
    ${drakeRow}
    ${pickBanRow("픽", "picks", "pick")}
    ${pickBanRow("밴", "bans", "ban")}
    ${links ? `<div class="sb-links">${links}</div>` : ""}
  </div>`;
}

// ── 라인 순서 (탑 → 정글 → 미드 → 원딜 → 서폿) ─────────────────
// Leaguepedia 는 세트 안 선수를 **이름 알파벳순**으로 준다. 그대로 그리면
// 탑·미드·서폿·정글·원딜처럼 뒤죽박죽이라, 팬이 라인별로 비교할 수가 없다.
// 세트 기록에 담긴 포지션(pos)을 먼저 쓰고, 없으면 선수 등록 정보를 본다.
const LANE_ORDER = ["탑", "정글", "미드", "원딜", "서폿"];
const LANE_ALIAS = {
  top: "탑", jungle: "정글", jng: "정글", mid: "미드", middle: "미드",
  bot: "원딜", adc: "원딜", ad: "원딜", support: "서폿", sup: "서폿",
};
function lanePos(p) {
  const raw = (p && (p.pos || p.role)) || ((getPlayer(p && p.pid) || {}).pos) || "";
  const k = String(raw).trim();
  return LANE_ALIAS[k.toLowerCase()] || k;
}
function byLanePos(a, b) {
  const ia = LANE_ORDER.indexOf(lanePos(a)), ib = LANE_ORDER.indexOf(lanePos(b));
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
}
