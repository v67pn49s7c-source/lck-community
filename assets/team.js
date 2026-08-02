// ── 팀 게시판 페이지 ─────────────────────────────────────
const BOARD_CATS = ["전체", "자유", "경기 분석", "밴픽·메타", "선수·팀", "영상·짤", "질문", "공지"];

function getTeamFromURL() {
  const id = new URLSearchParams(location.search).get("team");
  return TEAM_MAP[id] || TEAMS[0];
}

function loadUserPosts(teamId) {
  try { return JSON.parse(localStorage.getItem("lck_posts_" + teamId)) || []; }
  catch { return []; }
}
function saveUserPosts(teamId, posts) {
  localStorage.setItem("lck_posts_" + teamId, JSON.stringify(posts));
}

function teamRecord(teamId) {
  for (const group of ["legend", "rise"]) {
    const row = STANDINGS[group].find(r => r.team === teamId);
    if (row) {
      const label = group === "legend" ? "레전드 그룹" : "라이즈 그룹";
      const rank = STANDINGS[group].indexOf(row) + 1;
      return `${label} <b>${rank}위</b> · <b>${row.w}승 ${row.l}패</b> · 포인트 <b>${row.pt}</b>`;
    }
  }
  return "";
}

function renderBoard(team, cat) {
  const el = document.getElementById("board-body");
  const base = (BOARD_POSTS[team.id] || []).concat(BOARD_POSTS.common);
  const user = loadUserPosts(team.id).map(p => ({ ...p, mine: true }));
  let posts = user.concat(base);
  if (cat && cat !== "전체") posts = posts.filter(p => p.cat === cat);

  document.querySelectorAll(".board-tabs button").forEach(b =>
    b.classList.toggle("active", b.dataset.cat === cat));

  if (!posts.length) {
    el.innerHTML = `<div class="empty-note">아직 글이 없습니다. 첫 글을 남겨 보세요!</div>`;
    return;
  }
  el.innerHTML = posts.map(p => `
    <div class="post-row">
      <span class="tag-team no-logo" style="--tag-color:${team.color}">${p.cat}</span>
      <span class="post-title">${p.title}</span>
      <span class="post-meta">
        <span>${p.nick}</span>
        <span class="up">▲ ${p.up}</span>
        <span class="cmt">💬 ${p.cmt}</span>
        <span>${p.time}</span>
      </span>
    </div>`).join("");
}

function initTeamPage() {
  const team = getTeamFromURL();
  renderHeader("커뮤니티", team.id);
  document.title = `${team.name} 게시판 — LCK 라운지`;

  // 팀 배너
  const hero = document.getElementById("team-hero");
  // 배너는 테마와 무관하게 항상 다크 톤 (흰색 로고 대비 확보)
  hero.style.background = `linear-gradient(120deg, ${team.dark} 0%, #12141b 70%)`;
  hero.innerHTML = `
    <div class="container team-hero-inner">
      ${teamLogoHTML(team, 64)}
      <div class="team-hero-info">
        <h1>${team.name === team.abbr
          ? `<span style="color:${team.color}">${team.name}</span>`
          : `${team.name} <span style="color:${team.color}">${team.abbr}</span>`} 게시판</h1>
        <p class="desc">2026 스플릿 3 · ${teamRecord(team.id)}</p>
      </div>
    </div>`;

  // 카테고리 탭
  const tabs = document.getElementById("board-tabs");
  tabs.innerHTML = BOARD_CATS.map(c => `<button data-cat="${c}">${c}</button>`).join("");
  tabs.querySelectorAll("button").forEach(b =>
    b.addEventListener("click", () => renderBoard(team, b.dataset.cat)));

  // 글 작성
  document.getElementById("composer-submit").addEventListener("click", () => {
    const titleEl = document.getElementById("composer-title");
    const bodyEl = document.getElementById("composer-body");
    const title = titleEl.value.trim();
    if (!title) { titleEl.focus(); return; }
    const posts = loadUserPosts(team.id);
    posts.unshift({ cat: "자유", title, nick: "나", up: 0, cmt: 0, time: "방금" });
    saveUserPosts(team.id, posts);
    titleEl.value = ""; bodyEl.value = "";
    renderBoard(team, "전체");
  });

  renderBoard(team, "전체");

  // 사이드바: 다음 경기 예측 + 순위 (홈과 동일)
  renderPredictWidget();
  renderStandings("legend");
  document.querySelectorAll(".standing-tabs button").forEach(b =>
    b.addEventListener("click", () => renderStandings(b.dataset.group)));

  renderFooter();
}
