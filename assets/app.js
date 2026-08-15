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
  const light = TEAM_LOGO_LIGHT[team.id]
    ? `<img class="lg-light" src="assets/logos/${encodeURIComponent(team.id + " light")}.svg" alt="">` : "";
  return `<span class="team-logo${light ? " has-light" : ""}" style="width:${s}px;height:${s}px">
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

/** 헤더 오른쪽 계정 칸.
 *
 *  ⚠ "프로필 설정 필요" 는 **확인된 사실일 때만** 말한다.
 *     예전에는 Auth.profile 이 비어 있기만 하면 그렇게 적었는데, 프로필은
 *     스냅샷으로 먼저 그린 뒤 서버 답을 나중에 받는 구조라 "아직 모르는" 순간이
 *     늘 있다. 그래서 멀쩡한 운영자 계정이 한 번씩 '프로필 설정 필요' 로 보였다.
 *     (2026-08-14 제보) 모를 때는 아무 단정도 하지 않고 조용히 기다린다. */
function authSlotHTML(activeMenu) {
  // ⚠ '내 기록' 과 닉네임 칩은 **둘 다 my.html 로 가던 같은 버튼**이었다.
  //    로그인하면 나란히 두 개가 떠서 무슨 차이인지 알 수 없었다 (사장님 지적 2026-08-15).
  //    이제 하나만 나온다 — 로그인 전엔 '내 기록', 로그인 후엔 내 닉네임.
  //    (비로그인도 예측·평점이 이 브라우저에 쌓이므로 볼 것이 있다. 2026-08-07)
  if (!Auth.session) {
    const on = activeMenu === "MY" ? " on" : "";
    return `<a class="btn-login my-link${on}" href="my.html" title="내 기록 · 팬 여권">내 기록</a>`
      + `<a class="btn-login" href="login.html">로그인</a>`;
  }
  const out = Auth.profile
    ? `<a class="user-chip" href="my.html" title="내 기록 · 팬 여권">${esc(Auth.profile.nick)}</a>`
    : (Auth.profileKnown
      ? `<a class="user-chip" href="login.html" title="닉네임·응원팀을 설정해 주세요">프로필 설정 필요</a>`
      : `<a class="user-chip is-loading" href="my.html" title="불러오는 중">내 계정</a>`);
  return out + `<button class="btn-login" id="btn-signout">로그아웃</button>`;
}

/** 서버 답이 도착하면 계정 칸만 조용히 고쳐 그린다 (헤더 전체를 다시 그리면 깜빡인다). */
function refreshAuthSlot() {
  const slot = document.getElementById("auth-slot");
  if (!slot) return;
  const next = authSlotHTML(document.querySelector(".main-nav a.active")?.textContent === "MY" ? "MY" : null);
  if (slot.innerHTML === next) return;
  slot.innerHTML = next;
  slot.querySelector("#btn-signout")?.addEventListener("click", async () => {
    await sbSignOut();
    location.reload();
  });
}

/** 상단 팀 줄 — **로고만** 둔다.
 *  약자(BFX·BRO…)를 로고 밑에 또 적으면 로고 자체에 이미 이름이 들어 있어 겹쳐 읽힌다.
 *  이미 그 팀 게시판에 들어와 있으면(activeTeamId) 줄 자체를 그리지 않는다 —
 *  화면 안에 팀 배너가 크게 있어서 같은 정보를 두 번 말하게 된다. (2026-08-14) */
function teamStripHTML(activeTeamId) {
  if (activeTeamId) return "";
  return `
  <div class="team-strip">
    <div class="container team-strip-inner">
      ${TEAMS.map(t => `
        <a class="team-link" style="--team-color:${t.color}" href="team.html?team=${t.id}"
          title="${esc(t.name)} 게시판" aria-label="${esc(t.name)} 게시판">
          ${teamLogoHTML(t, 30)}
        </a>`).join("")}
    </div>
  </div>`;
}

/** 전체 메뉴 서랍 — 하단 탭바·상단 가로 메뉴에 다 못 들어간 곳으로 가는 통로.
 *  묶음과 그 안의 갈래를 한 번에 펼쳐 둔다 (두 번 눌러 들어가게 하지 않는다). */
function navDrawerHTML(groupName, activeTeamId) {
  const item = (href, label, on) =>
    `<a href="${href}" class="nd-item${on ? " on" : ""}">${esc(label)}</a>`;
  return `
  <div class="nav-drawer" id="nav-drawer" hidden>
    <div class="nav-drawer-back" data-close></div>
    <nav class="nav-drawer-panel" aria-label="전체 메뉴">
      <div class="nav-drawer-head">
        <b>전체 메뉴</b>
        <button type="button" class="btn-icon" data-close aria-label="닫기">✕</button>
      </div>
      <div class="nd-groups">
        ${NAV_GROUPS.map(g => `
          <div class="nd-group">
            ${item(g.href, g.menu, g.menu === groupName)}
            ${(g.subs || []).length > 1
              ? `<div class="nd-subs">${g.subs.map(([n, h]) => `<a href="${h}">${esc(n)}</a>`).join("")}</div>`
              : ""}
          </div>`).join("")}
        <div class="nd-group">${item("my.html", "MY · 팬 여권", groupName === "MY")}</div>
      </div>
      <div class="nd-teams-head">팀 게시판</div>
      <div class="nd-teams">
        ${TEAMS.map(t => `
          <a href="team.html?team=${t.id}" class="nd-team${t.id === activeTeamId ? " on" : ""}"
            style="--team-color:${t.color}">${teamLogoHTML(t, 26)}<span>${esc(t.abbr)}</span></a>`).join("")}
      </div>
    </nav>
  </div>`;
}

function bindNavDrawer(root) {
  const drawer = root.querySelector("#nav-drawer");
  const opener = root.querySelector("#nav-open");
  if (!drawer || !opener) return;
  const setOpen = on => {
    drawer.hidden = !on;
    opener.setAttribute("aria-expanded", String(on));
    // 서랍이 열려 있는 동안 뒤 본문이 같이 스크롤되면 어디를 보고 있는지 잃는다
    document.body.classList.toggle("nav-open-lock", on);
    if (on) drawer.querySelector(".nd-item")?.focus();
  };
  opener.addEventListener("click", () => setOpen(drawer.hidden));
  drawer.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", () => setOpen(false)));
  addEventListener("keydown", e => { if (e.key === "Escape" && !drawer.hidden) setOpen(false); });
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
      <!-- 전체 메뉴 — 하단 탭바 5칸에 못 들어간 곳(선수·팀·순위·대진표·수상 등)과
           10개 팀 게시판으로 가는 유일한 통로. 휴대폰에서는 상단 가로 메뉴가
           숨겨지므로 이 버튼이 없으면 갈 수 없는 화면이 생긴다. (2026-08-14) -->
      <button class="btn-icon nav-open" id="nav-open" aria-label="전체 메뉴 열기"
        aria-expanded="false" aria-controls="nav-drawer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      </button>
      <a class="brand" href="index.html" title="The Nexus">
        <img class="brand-full light" src="${brandLogoURL("desktop-light", "assets/brand/nexus-desktop.png?v=20260815e")}" alt="The Nexus">
        <img class="brand-full dark" src="${brandLogoURL("desktop-dark", "assets/brand/nexus-desktop-dark.png?v=20260815e")}" alt="The Nexus">
        <img class="brand-icon" src="${brandLogoURL("mobile", "assets/brand/nexus-icon.png?v=20260815e")}" alt="The Nexus">
      </a>
      <nav class="main-nav">
        ${NAV_GROUPS.map(g => `<a href="${g.href}" class="${g.menu === groupName ? "active" : ""}">${g.menu}</a>`).join("")}
      </nav>
      <div class="header-actions">
        <button class="btn-icon" id="theme-toggle"></button>
        <span id="auth-slot">${authSlotHTML(activeMenu)}</span>
      </div>
    </div>
  </header>
  ${subNavHTML}
  ${teamStripHTML(activeTeamId)}
  ${navDrawerHTML(groupName, activeTeamId)}`;
  document.body.prepend(header);
  bindNavDrawer(header);

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
  if (fav) fav.href = brandLogoURL("mobile", "assets/brand/nexus-icon.png?v=20260815e");

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

// 같은 포지션 두 선수 비교용 육각형. 포지션별 축 자체가 다르므로 호출하는 화면에서
// 반드시 동일 포지션 선수만 넘긴다. 회색 평균 대신 두 선수의 실제 백분위를 겹쳐 본다.
function radarCompareSVG(aAxes, bAxes, opts) {
  const o = opts || {};
  const size = o.size || 300, c = size / 2, R = c - 48;
  const n = aAxes.length;
  const pt = (i, r) => {
    const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [c + Math.cos(ang) * r, c + Math.sin(ang) * r];
  };
  const points = axes => axes.map((ax, i) =>
    pt(i, R * Math.max(.04, Number(ax.score || 0) / 100)).map(x => x.toFixed(1)).join(",")).join(" ");
  const rings = [1, .75, .5, .25].map(f =>
    `<polygon points="${aAxes.map((_, i) => pt(i, R * f).map(x => x.toFixed(1)).join(",")).join(" ")}"
      fill="${f === 1 ? "var(--bg-soft)" : "none"}" stroke="var(--line)" stroke-width="1"/>`).join("");
  const spokes = aAxes.map((_, i) =>
    `<line x1="${c}" y1="${c}" x2="${pt(i, R)[0].toFixed(1)}" y2="${pt(i, R)[1].toFixed(1)}" stroke="var(--line)"/>`).join("");
  const labels = aAxes.map((ax, i) => {
    const [x, y] = pt(i, R + 24);
    const anchor = Math.abs(x - c) < 6 ? "middle" : (x > c ? "start" : "end");
    const b = bAxes[i] || { score: 0 };
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}"
      dominant-baseline="middle" class="rd-label">${esc(ax.label)}
      <tspan x="${x.toFixed(1)}" dy="14" class="rd-compare-score">${ax.score} · ${b.score}</tspan></text>`;
  }).join("");
  const aName = esc(o.aName || "선수 A"), bName = esc(o.bName || "선수 B");
  return `<svg class="radar radar-compare" viewBox="0 0 ${size} ${size}" role="img"
    aria-label="${aName}와 ${bName}의 동일 포지션 육각형 비교">
    ${rings}${spokes}
    <polygon class="rd-player-b" points="${points(bAxes)}"/>
    <polygon class="rd-player-a" points="${points(aAxes)}"/>
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
  // ⚠ 다섯 번째 칸은 **MY** 다 (선수·팀이 아니다).
  //   휴대폰에서는 상단 메뉴(.main-nav)와 '내 기록' 버튼(.my-link)이 둘 다 숨겨져서,
  //   마이페이지로 갈 길이 하나도 없었다. 내 활동·팬 여권은 자주 들어가는 곳이라
  //   탭바에 있어야 한다. 선수·팀은 아래 푸터에 링크를 남겨 뒀다. (2026-08-14)
  { menu: "MY", href: "my.html", label: "MY",
    icon: `<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>` },
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
        <!-- 선수·팀은 하단 탭바에서 MY 에 자리를 내줬다. 휴대폰에서는 상단 메뉴도
             숨겨지므로, 여기 링크가 없으면 들어갈 길이 아예 사라진다. -->
        · <a href="players.html">선수·팀</a>
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

// 가장 가까운 경기 날짜의 1~2경기를 홈의 경기 바와 핵심 경기 카드가 함께 사용한다.
// 한쪽만 별도로 계산하면 새 데이터가 들어온 순간 서로 다른 날짜를 가리킬 수 있다.
function homeNearestGames() {
  const now = Date.now();
  const candidates = sortedMatches().filter(m => knownTeams(m) && m.status !== "done" &&
    (m.status === "live" || new Date(m.at).getTime() > now));
  const first = candidates.find(m => m.status === "live") || candidates[0];
  if (!first) return [];
  const day = fmtDayKey(first.at);
  return candidates.filter(m => fmtDayKey(m.at) === day).slice(0, 2);
}

function homePreviousMeeting(match) {
  return sortedMatches().filter(m => m.id !== match.id && m.status === "done" &&
    new Date(m.at).getTime() < new Date(match.at).getTime() &&
    ((m.a === match.a && m.b === match.b) || (m.a === match.b && m.b === match.a)))
    .sort((a, b) => new Date(b.at) - new Date(a.at))[0] || null;
}

// 히어로에 세울 경기 — **서사가 강한 쪽**이 먼저다.
// 같은 날 "1위 vs 2위"와 "그냥 재대결"이 같이 있으면 앞의 것이 오늘의 이야기다.
// 그 다음이 팬 참여 수, 마지막이 늦게 열리는 경기(황금 시간대) 순.
// 특정 팀을 하드코딩하지 않아 10개 팀을 같은 기준으로 다룬다.
const STORY_WEIGHT = { admin: 5, playoff: 4, standings: 3, streak: 2, rematch: 1 };
function homeStoryWeight(m) {
  const s = typeof storyFor === "function" ? storyFor(m) : null;
  if (!s) return 0;
  return s.source === "admin" ? STORY_WEIGHT.admin : (STORY_WEIGHT[s.type] || 1);
}
function homeFeaturedMatch(games) {
  return games.slice().sort((a, b) => {
    const storyGap = homeStoryWeight(b) - homeStoryWeight(a);
    if (storyGap) return storyGap;
    const voteGap = communityPct(b).n - communityPct(a).n;
    return voteGap || new Date(b.at) - new Date(a.at);
  })[0] || null;
}

// ── 홈 히어로: 오늘의 서사 ───────────────────────────────────────
// 예전 카드는 "GEN vs DK · 17:00" 한 줄이었다. 그건 일정표지 이야기가 아니다.
// 이제 같은 자리에서 **왜 이 경기를 봐야 하는지**를 먼저 말한다.
//
// 3단 폴백 — 어느 단계에서 멈춰도 화면은 멀쩡하다:
//   ① 운영자가 넣은 서사 (선수 얼굴까지)  ② 기록에서 뽑은 사실 서사  ③ 팀·시간만
// 지어낸 라이벌 서사는 ②에 절대 들어가지 않는다 (story.js 참고).

/** 두 팀의 대표 선수를 **같은 포지션으로 짝지어** 고른다.
 *
 *  ⚠ 예전엔 팀마다 따로 골라서 정글 vs 미드처럼 엉뚱하게 붙었다 (사장님 지적).
 *    대결 구도인데 라인이 다르면 "왜 저 둘이 붙지?" 가 된다.
 *
 *  포지션을 먼저 고르고, 그 라인의 두 선수를 세운다. 포지션은 **근거 점수 합**이
 *  가장 큰 라인 — 근거는 이 순서다:
 *    ① 내가 찜한 최애선수  ② 팬들이 MVP 로 많이 뽑은 선수(POM)  ③ 팬 평점
 *  어느 라인에도 근거가 없으면 null 두 개 → 팀 로고로 내려앉는다.
 *  (포지션을 '미드니까' 로 고정하지 않는다 — 그건 근거가 아니라 편애다)
 */
const HERO_POS = ["탑", "정글", "미드", "원딜", "서폿"];
function heroPlayerScore(p) {
  if (!p) return -1;
  const mine = typeof getFavPlayers === "function" ? getFavPlayers() : [];
  if (mine.includes(p.id)) return 1e9;
  if (typeof pomPointsFor === "function") {
    const pts = pomPointsFor(p.id);
    if (pts > 0) return 1e6 + pts;
  }
  if (typeof matchRatingsForPlayer === "function") {
    const rows = matchRatingsForPlayer(p.id);
    if (rows.length >= 2) {
      const n = rows.reduce((s, r) => s + r.n, 0);
      if (n) return rows.reduce((s, r) => s + r.avg * r.n, 0) / n;   // 0~10
    }
  }
  return 0;
}
function heroDuo(teamA, teamB) {
  const at = {}, bt = {};
  teamPlayers(teamA).forEach(p => { if (!at[p.pos]) at[p.pos] = p; });
  teamPlayers(teamB).forEach(p => { if (!bt[p.pos]) bt[p.pos] = p; });
  const best = HERO_POS
    .filter(pos => at[pos] && bt[pos])
    .map(pos => ({ pos, score: heroPlayerScore(at[pos]) + heroPlayerScore(bt[pos]) }))
    .sort((x, y) => y.score - x.score)[0];
  if (!best || best.score <= 0) return [null, null];
  return [at[best.pos], bt[best.pos]];
}

/** 히어로 한쪽 — 선수 상반신을 **박스 없이 그대로** 세운다.
 *
 *  ⚠ 라이엇 공식 선수 사진은 배경이 **투명한 컷아웃**이다 (모서리 알파 0 확인).
 *    그래서 틀에 가두지 않고 그냥 세워 두면 선수가 카드 안에 서 있는 것처럼 보인다.
 *    바닥은 검정 그라데이션으로 잠기게 하고, 그 위에 팀 로고와 이름을 얹는다.
 *    (박스에 넣으면 증명사진처럼 답답해진다 — 2026-08-15 사장님 지적) */
function heroSideHTML(team, player, side) {
  const photo = player && typeof playerPhotoURL === "function" ? playerPhotoURL(player, 320) : null;
  return `
    <div class="hero-side ${side}${photo ? "" : " no-photo"}" style="--team-color:${esc(team.color)}">
      ${photo
        ? `<img class="hero-cut" src="${esc(photo)}" alt="${esc(player.nick)}" loading="eager" decoding="async"
             onerror="this.closest('.hero-side').classList.add('no-photo')">`
        : ""}
      <span class="hero-name">
        ${teamLogoHTML(team, photo ? 34 : 44)}
        ${player ? `<b>${esc(player.nick)}</b>` : `<b>${esc(team.abbr)}</b>`}
      </span>
    </div>`;
}

function renderHomeFeature() {
  const card = document.getElementById("home-hero");
  if (!card) return;
  const match = homeFeaturedMatch(homeNearestGames());
  if (!match) { card.style.display = "none"; return; }

  const A = TEAM_MAP[match.a], B = TEAM_MAP[match.b];
  const story = typeof storyFor === "function" ? storyFor(match) : null;
  const picked = typeof storyPlayers === "function" ? storyPlayers(story) : [];
  // 운영자가 주인공을 지정했으면 그 선수, 아니면 **같은 포지션 짝**을 찾는다.
  const duo = heroDuo(match.a, match.b);
  const pA = picked.find(p => p.team === match.a) || duo[0];
  const pB = picked.find(p => p.team === match.b) || duo[1];
  const hasFace = !!(pA || pB);

  const when = match.status === "live" ? "LIVE" : `${homeDayLabel(match.at)} ${fmtHM(match.at)}`;
  const eyebrow = story ? story.eyebrow : "다음 경기";
  const headline = story ? story.headline : `${A.abbr} vs ${B.abbr}`;
  // ⚠ 같은 말을 두 번 하지 않는다. 제목에 이미 팀 이름이 들어 있으면 부제를 접는다.
  //   (예전엔 "3위 HLE vs 5위 KT" 아래 "한화생명 vs kt 롤스터" 아래 "HLE vs KT 17:00"
  //    까지 세 줄이 같은 대진을 반복해서, 내용은 없는데 카드만 컸다.)
  const subRaw = story && story.subheadline ? story.subheadline : "";
  const sub = (subRaw && ![A.abbr, B.abbr].every(x => headline.includes(x))) ? subRaw : "";
  const desc = story && story.description ? story.description : "";
  const fav = typeof getFavTeam === "function" ? getFavTeam() : null;
  const href = `/match/${q(match.id)}`;

  // 응원 버튼은 **아직 팀을 안 고른 사람에게만**. 이미 고른 사람에겐 아무 일도 안 하는
  // 버튼이 둘 늘어날 뿐이라, 그만큼 정작 눌러야 할 '예측하기'가 묻힌다.
  const cheer = fav === null
    ? `<div class="hero-cheer" role="group" aria-label="응원팀 고르기">
        ${[A, B].map(t => `<button type="button" class="hero-cheer-btn" data-team="${esc(t.id)}"
          style="--team-color:${esc(t.color)}">${teamLogoHTML(t, 18)}<span>${esc(t.abbr)} 응원</span></button>`).join("")}
      </div>`
    : "";

  card.style.display = "";
  card.className = `card home-hero${hasFace ? " has-face" : ""}`;
  card.innerHTML = `
    <div class="hero-copy">
      <p class="hero-eyebrow">${esc(eyebrow)}</p>
      <h2 class="hero-headline">${esc(headline)}</h2>
      ${sub ? `<p class="hero-sub">${esc(sub)}</p>` : ""}
      ${desc ? `<p class="hero-desc">${esc(desc)}</p>` : ""}
    </div>
    <div class="hero-stage">
      ${heroSideHTML(A, pA, "a")}
      <span class="hero-vs" aria-hidden="true">VS</span>
      ${heroSideHTML(B, pB, "b")}
    </div>
    <div class="hero-actions">
      <time class="hero-when">${esc(when)}</time>
      ${cheer}
      <a class="btn-primary" href="${href}#fanpulse-card">승부 예측하기</a>
      <a class="hero-more" href="${href}#preview-card">관전 포인트 ›</a>
    </div>`;

  // 응원하기 = 그 팀을 내 응원팀으로 (안 고른 사람에게만 뜨는 버튼이다)
  card.querySelectorAll(".hero-cheer-btn").forEach(btn => btn.addEventListener("click", async () => {
    card.querySelectorAll(".hero-cheer-btn").forEach(b => { b.disabled = true; });
    const r = await setFavTeam(btn.dataset.team);
    if (r && r.error) {
      alert(r.error);
      card.querySelectorAll(".hero-cheer-btn").forEach(b => { b.disabled = false; });
      return;
    }
    document.getElementById("fanpick-bar")?.style.setProperty("display", "none");
    renderHomeFeature();
    renderHomeMyTeam();
  }));
}

// ── 내 응원 한 줄 ────────────────────────────────────────────────
// 최애팀 + 관심팀(최대 2) + 오늘 뛰는 최애선수를 **한 덩어리**로 보여 준다.
// ⚠ 다른 팀 정보를 밀어내지 않게 아직도 '줄' 이다 — 카드로 키우면 홈 본문이 아래로 밀린다.
// 권리는 최애팀에만 있다 (관심팀은 열람·노출뿐 — store.js 의 A안 주석 참고).
function renderHomeMyTeam() {
  const el = document.getElementById("home-myteam");
  if (!el) return;
  const fav = typeof getFavTeam === "function" ? getFavTeam() : null;
  const team = fav ? TEAM_MAP[fav] : null;
  const subs = (typeof getSubTeams === "function" ? getSubTeams() : []).map(id => TEAM_MAP[id]).filter(Boolean);
  const favPlayers = typeof getFavPlayers === "function" ? getFavPlayers() : [];
  if (!team && !subs.length && !favPlayers.length) { el.style.display = "none"; return; }

  const now = Date.now();
  const upcoming = sortedMatches().filter(m => knownTeams(m) && m.status !== "done" &&
    (m.status === "live" || new Date(m.at).getTime() > now));
  const nextOf = id => upcoming.find(m => m.a === id || m.b === id);

  el.style.display = "";
  el.style.setProperty("--team-color", team ? team.color : "var(--accent)");

  // ① 최애팀 줄
  let html = "";
  if (team) {
    const next = nextOf(fav);
    const foe = next ? TEAM_MAP[next.a === fav ? next.b : next.a] : null;
    html += `
      <div class="myteam-row">
        <span class="myteam-tag">MY TEAM</span>
        ${teamLogoHTML(team, 26)}<b class="myteam-name">${esc(team.abbr)}</b>
        ${next ? `
          <span class="myteam-when">${next.status === "live" ? "지금 경기 중"
            : `${esc(homeDayLabel(next.at))} ${esc(fmtHM(next.at))}`}</span>
          <span class="myteam-foe">vs ${teamLogoHTML(foe, 18)}<i>${esc(foe.abbr)}</i></span>
          <a class="myteam-go" href="/match/${q(next.id)}">응원하러 가기 ›</a>`
        : `<span class="myteam-when">예정된 경기 없음</span>
           <a class="myteam-go" href="team.html?team=${q(team.id)}">팀 홈 ›</a>`}
      </div>`;
  }

  // ② 관심팀 — 다음 경기만 짧게. 권리가 없으므로 '응원하러 가기' 대신 경기 링크만.
  if (subs.length) {
    html += `
      <div class="myteam-row subs">
        <span class="myteam-tag sub">관심팀</span>
        ${subs.map(t => {
          const n = nextOf(t.id);
          const foe = n ? TEAM_MAP[n.a === t.id ? n.b : n.a] : null;
          return `<a class="myteam-sub" href="${n ? `/match/${q(n.id)}` : `team.html?team=${q(t.id)}`}"
            style="--team-color:${esc(t.color)}">
            ${teamLogoHTML(t, 18)}<b>${esc(t.abbr)}</b>
            <span>${n ? (n.status === "live" ? "경기 중" : `${esc(fmtHM(n.at))} vs ${esc(foe.abbr)}`) : "경기 없음"}</span>
          </a>`;
        }).join("")}
      </div>`;
  }

  // ③ 오늘 뛰는 최애선수 — 경기가 있는 선수만. 없으면 줄 자체를 안 만든다.
  const todayKey = fmtDayKey(new Date());
  const playing = favPlayers.map(id => getPlayer(id)).filter(Boolean).map(p => {
    const m = upcoming.find(x => (x.a === p.team || x.b === p.team) && fmtDayKey(x.at) === todayKey);
    return m ? { p, m } : null;
  }).filter(Boolean);
  if (playing.length) {
    html += `
      <div class="myteam-row players">
        <span class="myteam-tag sub">오늘 출전</span>
        ${playing.map(({ p, m }) => {
          const t = TEAM_MAP[p.team];
          const foe = TEAM_MAP[m.a === p.team ? m.b : m.a];
          const photo = typeof playerPhotoURL === "function" ? playerPhotoURL(p, 64) : null;
          return `<a class="myteam-player" href="/match/${q(m.id)}" style="--team-color:${esc(t.color)}">
            ${photo ? `<img src="${esc(photo)}" alt="" loading="lazy" decoding="async">` : teamLogoHTML(t, 18)}
            <b>${esc(p.nick)}</b><span>${esc(fmtHM(m.at))} vs ${esc(foe.abbr)}</span>
          </a>`;
        }).join("")}
      </div>`;
  }

  el.innerHTML = html;
}

/** 응원팀 고르기 바 — 아직 응원팀을 안 고른 사람에게만 뜨는 얇은 한 줄.
 *
 *  왜 큰 온보딩 화면이 아니라 바인가 — 홈 위쪽엔 이미 '오늘의 경기 바'와
 *  '팀 스트립'이 있다. 세 번째 큰 덩어리를 얹으면 실제 내용이 화면 아래로 밀린다.
 *  그래서 본문 맨 위에 한 줄만 두고, 고르는 순간 사라지게 한다.
 *
 *  비회원도 고를 수 있다 — setFavTeam 이 프로필 없으면 이 브라우저(localStorage)에만
 *  저장한다. 나중에 가입하면 그때 서버 값이 우선한다(getFavTeam).
 *
 *  안 보이는 조건: 이미 골랐거나(중립 '' 포함), 이번 방문에서 '다음에'를 눌렀을 때.
 */
function renderFanPickBar(onPick) {
  const bar = document.getElementById("fanpick-bar");
  if (!bar) return;
  // getFavTeam 은 '중립'을 빈 문자열로 돌려준다. null 일 때만 = 한 번도 안 고른 사람.
  const chosen = typeof getFavTeam === "function" ? getFavTeam() : null;
  const snoozed = sessionStorage.getItem("nexus_fanpick_snooze") === "1";
  if (chosen !== null || snoozed) { bar.style.display = "none"; return; }

  bar.style.display = "";
  bar.innerHTML = `
    <div class="fanpick-head">
      <b>어느 팀을 응원하시나요?</b>
      <span>고르면 그 팀 경기·글이 먼저 보여요 · 가입 안 해도 됩니다</span>
    </div>
    <div class="fanpick-teams" role="group" aria-label="응원팀 선택">
      ${TEAMS.map(t => `
        <button type="button" class="fanpick-team" data-team="${esc(t.id)}"
          style="--team-color:${esc(t.color)}" title="${esc(t.name)}">
          ${teamLogoHTML(t, 22)}<span>${esc(t.abbr)}</span>
        </button>`).join("")}
    </div>
    <button type="button" class="fanpick-skip" id="fanpick-skip">다음에</button>`;

  bar.querySelectorAll(".fanpick-team").forEach(b => b.addEventListener("click", async () => {
    const id = b.dataset.team;
    bar.querySelectorAll("button").forEach(x => { x.disabled = true; });
    const r = await setFavTeam(id);
    if (r && r.error) {                       // 서버가 막으면(회원 30일 제한 등) 되돌린다
      alert(r.error);
      bar.querySelectorAll("button").forEach(x => { x.disabled = false; });
      return;
    }
    bar.style.display = "none";
    if (typeof onPick === "function") onPick();
  }));
  bar.querySelector("#fanpick-skip")?.addEventListener("click", () => {
    // ⚠ 여기서 setFavTeam("") 을 부르면 안 된다. 그건 '중립'이라는 **실제 선택**이라
    //   회원이면 서버에 저장되고 30일 잠금까지 먹는다. 이번 방문만 접어 둔다.
    sessionStorage.setItem("nexus_fanpick_snooze", "1");
    bar.style.display = "none";
  });
}

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

  const games = homeNearestGames();
  if (!games.length) { bar.style.display = "none"; return; }
  const first = games[0];

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
          const shown = pct.n >= 10;
          // 이 경기를 볼 이유 한 줄. 서사가 없으면 줄 자체가 안 생긴다.
          const hook = typeof storyHook === "function" ? storyHook(m) : "";
          return `<a class="home-match-game${hook ? " has-hook" : ""}" href="/match/${q(m.id)}"
            aria-label="${fmtHM(m.at)} ${esc(A.abbr)} 대 ${esc(B.abbr)} 승부 예측">
            <time>${m.status === "live" ? "LIVE" : fmtHM(m.at)}</time>
            ${hook ? `<span class="home-match-hook">${esc(hook)}</span>` : ""}
            <span class="home-match-team">${teamLogoHTML(A, 26)}<b>${esc(A.abbr)}</b></span>
            ${shown
              ? `<span class="home-match-rate"><b>${pct.a}%</b><i><span style="width:${pct.a}%"></span></i><b>${pct.b}%</b></span>`
              : `<span class="home-match-rate home-match-rate-pending">${pct.n ? `${pct.n}명 참여` : "예측 대기"}</span>`}
            <span class="home-match-team right"><b>${esc(B.abbr)}</b>${teamLogoHTML(B, 26)}</span>
            <span class="home-match-cta"><span class="home-match-cta-long">예측하기</span><span class="home-match-cta-short">예측</span></span>
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
  // 홈의 "전체 게시판"은 **커뮤니티 게시판(전체) 글만** 보여 준다.
  //   · 팀 글 제외 — 팀 게시판은 그 팀 팬 전용이라 홈에 새어 나오면 안 된다
  //   · 자동 [경기 토론] 방 제외 — 사람이 쓴 글이 아니고, 경기 페이지에 이미 있다
  const meaningful = p => {
    const title = String(p.title || "").trim();
    return p.cat === "공지" || title.length >= 5;
  };
  const isAutoRoom = p => !!p.match_id || /^\[경기 토론\]/.test(String(p.title || "").trim());
  const posts = getPosts()
    .filter(p => !p.team && !isAutoRoom(p))
    .filter(meaningful)
    .filter(p => homeBoardCat === "전체" || p.cat === homeBoardCat)
    .sort((a, b) => (b.cat === "공지") - (a.cat === "공지") || b.ts - a.ts)
    .slice(0, 5);
  if (!posts.length) {
    el.innerHTML = `<div class="empty-note">이 분류의 최신 글이 없습니다 —
      <a href="write.html" style="text-decoration:underline">첫 글을 남겨 보세요</a></div>`;
  } else {
    el.innerHTML = posts.map(p => {
      const t = p.team ? TEAM_MAP[p.team] : null;
      const stats = [p.up > 0 ? `<b>▲ ${p.up}</b>` : "", p.comments.length > 0 ? `<span>댓글 ${p.comments.length}</span>` : ""]
        .filter(Boolean).join("");
      return `
      <a class="home-post-row" href="post.html?id=${q(p.id)}">
        <span class="home-board-name" style="--home-team:${t ? t.color : "var(--accent)"}">${t ? esc(t.abbr) : "전체"}</span>
        <span class="home-post-copy"><strong>${esc(p.title)}</strong><small>${esc(p.nick)} · ${fmtAgo(p.ts)}</small></span>
        ${stats ? `<span class="home-post-stats">${stats}</span>` : ""}
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
    const hook = typeof storyHook === "function" ? storyHook(m) : "";
    return `${label}<a class="home-schedule-row${hook ? " has-hook" : ""}" href="/match/${q(m.id)}">
      <time>${m.status === "live" ? "LIVE" : fmtHM(m.at)}</time>
      <span>${teamLogoHTML(A, 20)}${esc(A.abbr)}</span><b>VS</b>
      <span>${teamLogoHTML(B, 20)}${esc(B.abbr)}</span>
      ${hook ? `<em class="home-schedule-hook">${esc(hook)}</em>` : ""}
    </a>`;
  }).join("");
}

// ── LCK 뉴스 ────────────────────────────────────────────────────
// 서버(/api/news)가 구글 뉴스 RSS 를 정리해 준다. 한 번만 받고, 실패하면
// **카드 자체를 감춘다** — 빈 상자나 오류 문구가 홈에 남는 것보다 없는 편이 낫다.
let newsLoaded = false;
async function renderHomeNews() {
  const card = document.getElementById("home-news-card");
  if (!card || newsLoaded) return;
  newsLoaded = true;
  let items = [];
  try {
    const r = await fetch("/api/news?limit=6");
    if (!r.ok) return;
    const j = await r.json();
    // ⚠ api/_lib.js 의 ok() 는 본문을 **그대로** 보낸다 (data 로 감싸지 않는다).
    //    j.data.items 로 읽으면 늘 비어서 카드가 영영 안 뜬다.
    items = (j && (j.items || (j.data && j.data.items))) || [];
  } catch { return; }        // 로컬 개발 등 서버 함수가 없으면 조용히 넘어간다
  if (!items.length) return;

  card.style.display = "";
  document.getElementById("home-news-body").innerHTML = items.map(n => `
    <a class="news-row" href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">
      <span class="news-title">${esc(n.title)}</span>
      <span class="news-meta">${n.source ? esc(n.source) : ""}${n.at ? ` · ${esc(fmtAgo(n.at))}` : ""}</span>
    </a>`).join("");
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
  card.querySelector("#home-pulse-votes").innerHTML = total >= 10
    ? ranked.map(x => `<span><b>${esc(x.label)}</b> ${Math.round(x.n / total * 100)}%</span>`).join("")
    : `<span><b>${total ? `${total}명 참여` : "집계 준비 중"}</b></span>`;
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
  // 운영자는 창립 팬 자리를 차지하지 않는다 (서버도 막는다 — schema30).
  // 100인은 "먼저 온 진짜 팬" 이라는 가치가 전부라, 운영자가 한 칸을 쓰면
  // 그 자리 하나가 팬에게서 사라진다.
  const isAdmin = !!(Auth.profile && Auth.profile.is_admin);

  // 참여 동선: 회원+응원팀 → 바로 등록 버튼 / 회원인데 팀 미설정 → 홈에서 팀 고르기 /
  // 비회원 → 가입 안내. "어디서 하는 건지 모르겠다"가 없도록 버튼 하나로.
  const cta = isAdmin
    ? `<span class="fh-note">운영자 계정은 창립 팬에 등록하지 않습니다 — 자리는 팬들 몫입니다.</span>`
    : myNo
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
    renderFanPickBar(draw);   // 팀을 고르면 내 팀 기준으로 홈을 다시 그린다
    renderHomeMatchBar();
    renderHomeFeature();
    renderHomeMyTeam();
    renderHotPosts();
    renderHomeUpcomingSchedule();
    renderHomePulse();
    renderHomeNews();
    setupSidebarStandings();
  };
  draw();
  // 스냅샷으로 먼저 그린 뒤 최신 경기·게시글·순위·투표가 오면 한 번 더 갱신한다.
  storeFresh.then(draw).catch(() => {});
  // 경기 결과가 방금 들어왔을 때도 이 방문자에게 바로 보여 준다 (새로고침 없이)
  onStoreRefresh(draw);
  renderFooter();
}

// ── 세트 스코어보드 ──────────────────────────────────────────────
// 한 세트의 '경기 전체 기록'을 한눈에: 진영·시간·밴픽·오브젝트·골드.
// 재료는 match_details.game (수집기가 리그피디아 ScoreboardGames 에서 담는다).
// 아직 재수집하지 않은 세트는 game 이 비어 있으므로 아무것도 그리지 않는다.
//
// game 안의 a/b 는 **언제나 그 경기의 a팀/b팀** 기준이다 (블루/레드가 아니다).
// 블루가 어느 쪽이었는지는 game.blue 가 따로 알려 준다.

// 목표물 — 막대그래프 대신 **아이콘 + 개수**로 보여 준다.
// 예전에는 항목마다 좌우로 뻗는 막대를 그렸는데, 0 이 많은 줄이 대부분이라
// 빈 막대만 8줄 늘어서서 정작 무엇을 얼마나 먹었는지가 안 읽혔다.
//
// optional = 시즌·패치에 따라 맵에 없을 수 있는 목표물.
// 양쪽 다 0 이면 아예 그리지 않는다 — 없는 목표물을 "0" 으로 보여 주면
// 그게 있는 건데 아무도 못 먹은 것처럼 읽힌다.
// (아타칸은 2026 시즌 맵에 없다. 칸은 계속 받아 두니, 다시 생기면 저절로 나타난다)
// 바깥쪽부터 안쪽으로. 오른쪽은 이 순서를 뒤집어 **같은 목표물이 서로 마주 보게** 한다.
const SB_OBJ = [
  { k: "barons",  name: "바론" },
  { k: "elders",  name: "장로" },
  { k: "atakhan", name: "아타칸", optional: true },
  { k: "heralds", name: "전령" },
  { k: "grubs",   name: "공허충", optional: true },
  { k: "towers",  name: "타워" },
  { k: "inhib",   name: "억제기" },
];

// ── 목표물 아이콘 ────────────────────────────────────────
// **라이엇 공식 게임 자산**(미니맵 아이콘)을 그대로 쓴다.
// 직접 그려도 봤지만 원본만큼 안 나온다 — 사람들이 인게임에서 늘 보던 그림이라
// 조금만 달라도 어색하게 읽힌다.
// ⚠ 외부 저장소라 그 서버가 죽으면 그림이 안 뜬다. 그래서 개수(숫자)는 아이콘과
//   따로 그려 두고, 그림이 실패하면 그림만 감춘다 (개수는 계속 보인다).
const OBJ_ICON_ROOT = "https://raw.communitydragon.org/latest/game/assets/ux/minimap/icons/";
const OBJ_ICON_FILE = {
  barons: "baron.png", elders: "dragon_elder.png", heralds: "riftherald.png",
  grubs: "grub.png", atakhan: "atakhan_r.png", towers: "tower.png", inhib: "inhibitor.png",
};
function gameIconHTML(file, cls) {
  // ⚠ loading="lazy" 를 쓰면 안 된다 — 이 카드는 처음에 display:none 으로 시작해서
  //   지연 로딩이 발동하지 않고 아이콘이 영영 안 뜬다. 작고 개수도 적으니 바로 받는다.
  return `<img class="obj-ic ${cls || ""}" src="${OBJ_ICON_ROOT}${file}" alt=""
    decoding="async" onerror="this.style.visibility='hidden'">`;
}
function objIconHTML(kind) {
  const f = OBJ_ICON_FILE[kind];
  return f ? gameIconHTML(f) : "";
}
function drakeIconHTML(kind, cls) {
  return gameIconHTML(kind === "elder" ? "dragon_elder.png" : `dragon_${kind}.png`, cls);
}

// 드래곤 종류 — 리그피디아가 종류별로 세어 준다.
const DRAKE_KO = {
  infernal: "화염", mountain: "대지", ocean: "바다", cloud: "바람",
  hextech: "마공학", chemtech: "화학공학", elder: "장로",
};
// 영혼 칩의 테두리·바탕에 쓰는 원소색 (아이콘 자체는 공식 이미지라 색이 이미 들어 있다)
const DRAKE_COLOR = {
  infernal: "#ff7043", ocean: "#29b6d8", mountain: "#c9962e", cloud: "#4fc3ad",
  hextech: "#5c86ff", chemtech: "#5cb85c", elder: "#b39ddb",
};
const SOUL_AT = 4;

// 어떤 영혼인가 — **3번째 드래곤의 원소**가 그 판의 영혼이 되고,
// 4마리를 먼저 모은 팀이 그 영혼을 얻는다. 1·2번째는 무작위, 3번째부터는 전부 같은 원소다.
// 우리는 순서를 못 받지만 **양 팀 개수를 합치면** 역산할 수 있다:
//   전체가 n마리면 영혼 원소는 최소 (n-2)마리 — 즉 가장 많은 원소가 영혼이다.
// 단정할 수 없으면(동수라 어느 쪽인지 모를 때) null 을 돌려주고 종류를 말하지 않는다.
// (아는 것보다 더 말하지 않는다)
// 원소 드래곤 마리 수 — **장로를 뺀 값**.
// ⚠ 리그피디아의 dragons 총계에는 장로가 포함돼 있다 (전 세트 확인: 불일치 16건이
//   전부 `총계 = 원소합 + 장로`). 그대로 쓰면 장로를 먹은 팀만 드래곤 칸이 하나 더
//   생겨 "용은 4마리까지인데 왜 5칸이지" 가 된다.
function elementalDragons(g, side) {
  const d = ((g.drakes || {})[side]) || {};
  return Math.max(0, (+((g.dragons || {})[side]) || 0) - (+d.elder || 0));
}

function soulKind(g) {
  const tot = {};
  ["a", "b"].forEach(s => {
    const d = (g.drakes || {})[s] || {};
    Object.keys(d).forEach(k => { if (k !== "elder") tot[k] = (tot[k] || 0) + (+d[k] || 0); });
  });
  const all = Object.keys(tot).reduce((n, k) => n + tot[k], 0);
  if (all < 3) return null;                                  // 3번째가 아직 안 나왔다
  const sorted = Object.keys(tot).sort((x, y) => tot[y] - tot[x]);
  const top = sorted[0];
  if (tot[top] < all - 2) return null;                       // 규칙에 안 맞는 기록 — 단정하지 않는다
  if (sorted[1] && tot[sorted[1]] === tot[top]) return null; // 동수 — 어느 쪽인지 모른다
  return top;
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
      ${teamLogoHTML(t, 40)}
      <span class="sb-team-txt">
        <b class="team-text" style="--team-color:${t.color}">${esc(t.abbr)}</b>
        <small>${suspect ? `<span class="sb-wl l" title="세트 기록이 최종 스코어와 달라 확인 중입니다">검수 중</span>`
                         : `<span class="sb-wl ${won ? "w" : "l"}">${won ? "승리" : "패배"}</span>`}${sideChip(s)}</small>
      </span>
    </div>`;

  // 밴·픽 — 순서 그대로. 밴은 흐리게 + 사선.
  // 빈 자리는 건너뛴다 — 손으로 일부만 채운 세트는 자리를 지키려고 빈 칸을 남겨 둔다
  // (관리자 편집기가 1·3번 픽만 넣어도 라인이 안 밀리게 하려는 것)
  const champs = (list, kind) => (list || []).filter(Boolean).map(c =>
    `<span class="sb-ch ${kind}" title="${esc(c)}">${ddChampHTML(c, 26) || esc(c)}</span>`).join("");
  const pickBanRow = (label, key, kind) => {
    const v = g[key];
    if (!v || (!(v.a || []).filter(Boolean).length && !(v.b || []).filter(Boolean).length)) return "";
    return `<div class="sb-pb">
      <div class="sb-pb-side">${champs(v.a, kind)}</div>
      <div class="sb-pb-lb">${label}</div>
      <div class="sb-pb-side r">${champs(v.b, kind)}</div>
    </div>`;
  };

  // 킬은 위쪽 큰 점수로. 골드는 양쪽으로 뻗는 막대 하나 — 격차가 한눈에 보인다.
  // (목표물처럼 0 이 많은 항목이 아니라 늘 큰 두 숫자의 비교라 막대가 맞다)
  const kA = +((g.kills || {}).a) || 0, kB = +((g.kills || {}).b) || 0;
  const gA = +((g.gold || {}).a) || 0, gB = +((g.gold || {}).b) || 0;
  const gMax = Math.max(gA, gB, 1);
  const goldLine = (gA || gB) ? `
    <div class="sb-gold" role="group" aria-label="골드 ${gA} 대 ${gB}">
      <span class="sb-gold-bar l"><i style="width:${Math.round(gA / gMax * 100)}%;background:${A.color}"></i></span>
      <b class="${gA >= gB ? "hi" : ""}">${gA.toLocaleString()}</b>
      <em>골드</em>
      <b class="${gB >= gA ? "hi" : ""}">${gB.toLocaleString()}</b>
      <span class="sb-gold-bar r"><i style="width:${Math.round(gB / gMax * 100)}%;background:${B.color}"></i></span>
    </div>` : "";

  // ── 목표물 — 좌우 대립 구도 ──────────────────────────────
  // 같은 목표물이 가운데를 사이에 두고 **서로 마주 본다** (오른쪽은 순서를 뒤집는다).
  // 못 먹은 것(0)은 회색, 먹은 것만 제 색이 나와서 누가 뭘 가져갔는지 한눈에 보인다.
  // 장로는 원소 드래곤이 아니라 목표물 칸에 둔다 (아래 드래곤 줄과 구분).
  const objList = SB_OBJ.filter(r => {
    if (r.k === "elders") return !!(g.drakes && ((g.drakes.a || {}).elder || (g.drakes.b || {}).elder));
    const v = g[r.k];
    if (!v || (v.a == null && v.b == null)) return false;
    return !r.optional || ((+v.a || 0) + (+v.b || 0)) > 0;   // 맵에 없는 목표물은 그리지 않는다
  });
  const objCount = (r, s) => (r.k === "elders"
    ? +(((g.drakes || {})[s] || {}).elder) || 0
    : +((g[r.k] || {})[s]) || 0);
  const objChips = (s, flip) => {
    const list = flip ? [...objList].reverse() : objList;
    return list.map(r => {
      const n = objCount(r, s);
      return `<span class="obj-chip${n ? "" : " zero"}" title="${esc(r.name)} ${n}">
        ${objIconHTML(r.k)}<b>${n}</b><i>${esc(r.name)}</i></span>`;
    }).join("");
  };

  // 드래곤 — **먹은 마리마다 한 칸**, 그 칸에 그 용의 속성 아이콘을 넣는다.
  // 종류가 기록되지 않은 세트는 마리 수만큼 무채색 칸으로 둔다.
  const drakeSlots = s => {
    const d = (g.drakes || {})[s] || {};
    // 3번째부터는 전부 영혼 원소이므로, **영혼 원소를 맨 뒤로** 놓으면 실제 잡은 순서에
    // 가깝게 읽히고 영혼 표시도 마지막 칸에 자연스럽게 붙는다.
    const order = Object.keys(DRAKE_KO)
      .filter(k => k !== "elder")                          // 장로는 위 목표물 칸으로 뺐다
      .sort((x, y) => (x === soulKindNow ? 1 : 0) - (y === soulKindNow ? 1 : 0));
    const out = [];
    order.forEach(k => { for (let i = 0; i < (+d[k] || 0); i++) out.push(k); });
    while (out.length < elementalDragons(g, s)) out.push(null);   // 종류가 기록 안 된 마리
    return out;
  };
  const soulKindNow = soulKind(g);
  // 드래곤 칸 — 영혼이 4마리째에 나오므로 **한 팀당 최소 4칸**을 깔아 두고,
  // 먹은 자리에만 그 용의 속성 아이콘을 채운다. 빈 칸은 점선 — 영혼까지 얼마나
  // 남았는지가 칸만 봐도 읽힌다.
  const drakeSlotN = Math.max(SOUL_AT, drakeSlots("a").length, drakeSlots("b").length);
  // 영혼은 **4마리째 칸 자체를 강조**해서 보여 준다 — 옆에 글자로 또 적으면
  // 칸을 만들어 둔 의미가 없고 자리만 넓게 먹는다.
  const drakeRow = (s, flip) => {
    const taken = drakeSlots(s);
    const gotSoul = taken.length >= SOUL_AT;
    // 영혼 표시는 **영혼 원소 칸**에 붙인다. 자리 번호로 붙이면 엉뚱한 원소 칸에
    // "화학공학 드래곤 — 마공학 영혼" 처럼 앞뒤가 안 맞는 안내가 나온다.
    const soulIdx = !gotSoul ? -1
      : (soulKindNow && taken.lastIndexOf(soulKindNow) >= 0 ? taken.lastIndexOf(soulKindNow) : SOUL_AT - 1);
    const soulNm = soulKindNow ? `${DRAKE_KO[soulKindNow]} 영혼` : "드래곤 영혼";
    const slots = taken.concat(Array(Math.max(0, drakeSlotN - taken.length)).fill(undefined));
    return slots.map((k, i) => {
      // 영혼을 완성시킨 칸 = 먹은 것 중 4번째
      const isSoul = i === soulIdx;
      const cls = "obj-chip drake" + (isSoul ? " got-soul" : "");
      const style = isSoul ? ` style="--soul-color:${soulKindNow ? DRAKE_COLOR[soulKindNow] : "var(--accent-solid)"}"` : "";
      if (k === undefined) return `<span class="obj-chip drake empty" title="아직 안 먹은 드래곤"><span class="obj-ic" aria-hidden="true"></span></span>`;
      if (k === null) return `<span class="${cls} unknown"${style} title="드래곤 (종류 미기록)"><span class="obj-ic" aria-hidden="true"></span></span>`;
      return `<span class="${cls}"${style} title="${esc(DRAKE_KO[k])} 드래곤${isSoul ? ` — ${esc(soulNm)} 획득` : ""}">
        ${drakeIconHTML(k)}<i>${esc(DRAKE_KO[k])}${isSoul ? ` · ${esc(soulNm)}` : ""}</i></span>`;
    }).reduce((acc, cell, i) => flip ? cell + acc : acc + cell, "");
  };

  // ⚠ 한 줄(3칸)씩 따로 감싼다. 3열 격자에 자식을 죽 늘어놓으면 라벨이 한 칸을
  //   차지한 뒤부터 자리가 통째로 밀려 좌우가 어긋난다 (실제로 그랬다).
  const objLine = (left, right, cls) => `
    <div class="sb-obj-line">
      <div class="${cls}">${left}</div>
      <span class="sb-obj-mid" aria-hidden="true"></span>
      <div class="${cls} r">${right}</div>
    </div>`;
  const objBlock = `<div class="sb-obj">
      <div class="sb-obj-lb">목표물</div>
      ${objLine(objChips("a", false), objChips("b", true), "sb-obj-side")}
      ${/* 먹은 용은 가운데 선 쪽에, 빈 칸은 바깥쪽으로 — 양쪽 다 안쪽부터 채워진 것처럼 보인다 */
        objLine(drakeRow("a", true), drakeRow("b", false), "sb-obj-drakes")}
    </div>`;

  const links = [
    g.mh ? `<a href="${esc(g.mh)}" target="_blank" rel="noopener">라이엇 전적</a>` : "",
    g.patch ? `<span>패치 ${esc(g.patch)}</span>` : "",
  ].filter(Boolean).join("");

  return `<div class="scoreboard">
    <div class="sb-head">
      ${head(A, "a", wonA)}
      <div class="sb-score">
        <b class="${kA >= kB ? "hi" : ""}">${kA}</b><em>:</em><b class="${kB >= kA ? "hi" : ""}">${kB}</b>
        <span>${g.len ? esc(g.len) : "경기 시간"}</span>
      </div>
      ${head(B, "b", !wonA)}
    </div>
    ${goldLine}
    ${objBlock}
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
