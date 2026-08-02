// ── 게시판 공용 (목록 · 글보기 · 글쓰기) ─────────────────
const BOARD_CATS = ["전체", "자유", "경기 분석", "밴픽·메타", "선수·팀", "영상·짤", "질문", "공지"];
const PAGE_SIZE = 15;

function boardPosts(teamId) {
  const all = getPosts();
  // 팀 게시판: 해당 팀 태그 글 + 공지 / 통합 게시판: 전체
  if (teamId) return all.filter(p => p.team === teamId || p.cat === "공지");
  return all;
}

function fmtBoardDate(ts) {
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString())
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

// state: {teamId, cat, page, query}
function renderBoardList(el, state) {
  let posts = boardPosts(state.teamId);
  if (state.cat && state.cat !== "전체") posts = posts.filter(p => p.cat === state.cat);
  if (state.query) {
    const q = state.query.toLowerCase();
    posts = posts.filter(p => p.title.toLowerCase().includes(q) || p.nick.toLowerCase().includes(q));
  }
  posts = posts.slice().sort((a, b) => b.ts - a.ts);
  const notices = posts.filter(p => p.cat === "공지");
  const normal = posts.filter(p => p.cat !== "공지");

  const totalPages = Math.max(1, Math.ceil(normal.length / PAGE_SIZE));
  state.page = Math.min(Math.max(1, state.page || 1), totalPages);
  const pageItems = normal.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
  const startNo = normal.length - (state.page - 1) * PAGE_SIZE;

  const rowHTML = (p, no, isNotice) => {
    const t = p.team ? TEAM_MAP[p.team] : null;
    return `
    <tr class="${isNotice ? "notice" : ""}">
      <td class="col-no">${isNotice ? `<span class="cat-chip notice">공지</span>` : no}</td>
      <td class="col-cat"><span class="cat-chip">${esc(p.cat)}</span></td>
      <td class="col-title">
        <a href="post.html?id=${p.id}">
          ${!state.teamId && t ? teamLogoHTML(t, 16) : ""}
          <span class="title-text">${esc(p.title)}</span>
          ${p.comments.length ? `<span class="cmt-count">[${p.comments.length}]</span>` : ""}
        </a>
      </td>
      <td class="col-nick">${esc(p.nick)}</td>
      <td class="col-date">${fmtBoardDate(p.ts)}</td>
      <td class="col-views">${p.views}</td>
      <td class="col-up">${p.up}</td>
    </tr>`;
  };

  el.innerHTML = `
    <div class="board-toolbar">
      <div class="filter-tabs">
        ${BOARD_CATS.map(c => `<button data-cat="${c}" class="${(state.cat || "전체") === c ? "active" : ""}">${c}</button>`).join("")}
      </div>
      <form class="board-search" id="board-search">
        <input type="search" placeholder="제목·글쓴이 검색" value="${esc(state.query || "")}">
        <button class="btn-secondary" type="submit">검색</button>
      </form>
    </div>
    <table class="board-table">
      <thead><tr>
        <th class="col-no">번호</th><th class="col-cat">분류</th><th class="col-title">제목</th>
        <th class="col-nick">글쓴이</th><th class="col-date">날짜</th><th class="col-views">조회</th><th class="col-up">추천</th>
      </tr></thead>
      <tbody>
        ${notices.map(p => rowHTML(p, "", true)).join("")}
        ${pageItems.length
          ? pageItems.map((p, i) => rowHTML(p, startNo - i, false)).join("")
          : `<tr><td colspan="7"><div class="empty-note">글이 없습니다. 첫 글을 남겨 보세요!</div></td></tr>`}
      </tbody>
    </table>
    <div class="board-foot">
      <div class="pager">
        ${Array.from({ length: totalPages }, (_, i) => i + 1).map(n =>
          `<button data-page="${n}" class="${n === state.page ? "active" : ""}">${n}</button>`).join("")}
      </div>
      <a class="btn-primary" href="write.html${state.teamId ? "?team=" + state.teamId : ""}">글쓰기</a>
    </div>`;

  el.querySelectorAll("[data-cat]").forEach(b => b.addEventListener("click", () => {
    state.cat = b.dataset.cat; state.page = 1;
    renderBoardList(el, state);
  }));
  el.querySelectorAll("[data-page]").forEach(b => b.addEventListener("click", () => {
    state.page = Number(b.dataset.page);
    renderBoardList(el, state);
  }));
  el.querySelector("#board-search").addEventListener("submit", e => {
    e.preventDefault();
    state.query = e.target.querySelector("input").value.trim();
    state.page = 1;
    renderBoardList(el, state);
  });
}

// ── 글 보기 페이지 ──
function initPostPage() {
  renderHeader("커뮤니티", null);
  const id = new URLSearchParams(location.search).get("id");
  const post = getPost(id);
  const el = document.getElementById("post-view");

  if (!post) {
    el.innerHTML = `<div class="empty-note">글을 찾을 수 없습니다.</div>`;
    initSidebar(); renderFooter();
    return;
  }

  // 조회수 (세션당 1회)
  const seenKey = "lck_seen_" + id;
  if (!sessionStorage.getItem(seenKey)) {
    updatePost(id, { views: post.views + 1 });
    post.views += 1;
    sessionStorage.setItem(seenKey, "1");
  }

  const t = post.team ? TEAM_MAP[post.team] : null;
  document.title = `${post.title} — LCK 라운지`;

  const render = () => {
    const cur = getPost(id);
    el.innerHTML = `
      <div class="post-view-head">
        <div style="margin-bottom:6px; display:flex; gap:6px; align-items:center;">
          ${t ? `<span class="tag-team" style="--tag-color:${t.color}">${teamLogoHTML(t, 16)} ${t.abbr}</span>` : ""}
          <span class="cat-chip ${cur.cat === "공지" ? "notice" : ""}">${esc(cur.cat)}</span>
        </div>
        <h1>${esc(cur.title)}</h1>
        <div class="post-view-meta">
          <b>${esc(cur.nick)}</b>
          <span>${new Date(cur.ts).toLocaleString("ko-KR")}</span>
          <span>조회 ${cur.views}</span>
          <span>추천 ${cur.up}</span>
        </div>
      </div>
      <div class="post-content">${esc(cur.body)}</div>
      <div class="post-actions">
        <button class="vote-btn" id="btn-up">▲ 추천 ${cur.up}</button>
        <a class="btn-secondary" href="${t ? "team.html?team=" + t.id : "community.html"}">목록</a>
      </div>
      <div class="comments-head">댓글 <em>${cur.comments.length}</em></div>
      <div id="comment-list">
        ${cur.comments.map(c => `
          <div class="comment-row">
            <div class="c-meta"><b>${esc(c.nick)}</b><span>${fmtAgo(c.ts)}</span></div>
            <div class="c-body">${esc(c.body)}</div>
          </div>`).join("") || `<div class="empty-note">첫 댓글을 남겨 보세요</div>`}
      </div>
      <form class="comment-form" id="comment-form">
        <input class="nick" placeholder="닉네임" value="${esc(getNick())}" required maxlength="12">
        <input class="body" placeholder="댓글을 입력하세요 (비방·혐오 표현은 제재됩니다)" required maxlength="300">
        <button class="btn-primary" type="submit">등록</button>
      </form>`;

    el.querySelector("#btn-up").addEventListener("click", () => {
      const upKey = "lck_up_" + id;
      if (localStorage.getItem(upKey)) { alert("이미 추천한 글입니다."); return; }
      localStorage.setItem(upKey, "1");
      updatePost(id, { up: getPost(id).up + 1 });
      render();
    });
    el.querySelector("#comment-form").addEventListener("submit", e => {
      e.preventDefault();
      const nick = e.target.querySelector(".nick").value.trim();
      const body = e.target.querySelector(".body").value.trim();
      if (!nick || !body) return;
      setNick(nick);
      addComment(id, nick, body);
      render();
    });
  };
  render();
  initSidebar();
  renderFooter();
}

// ── 글쓰기 페이지 ──
function initWritePage() {
  renderHeader("커뮤니티", null);
  const preTeam = new URLSearchParams(location.search).get("team") || "";
  const form = document.getElementById("write-form");

  document.getElementById("write-team").innerHTML = `
    <option value="">전체 게시판 (팀 태그 없음)</option>
    ${TEAMS.map(t => `<option value="${t.id}" ${t.id === preTeam ? "selected" : ""}>${t.name} (${t.abbr})</option>`).join("")}`;
  document.getElementById("write-cat").innerHTML =
    BOARD_CATS.filter(c => c !== "전체" && c !== "공지").map(c => `<option>${c}</option>`).join("");
  document.getElementById("write-nick").value = getNick();

  form.addEventListener("submit", e => {
    e.preventDefault();
    const nick = document.getElementById("write-nick").value.trim();
    const team = document.getElementById("write-team").value || null;
    const cat = document.getElementById("write-cat").value;
    const title = document.getElementById("write-title").value.trim();
    const body = document.getElementById("write-body").value.trim();
    if (!nick || !title || !body) return;
    setNick(nick);
    const pid = addPost({ team, cat, title, body, nick });
    location.href = "post.html?id=" + pid;
  });

  initSidebar();
  renderFooter();
}

// ── 커뮤니티(통합) 게시판 페이지 ──
function initCommunityPage() {
  renderHeader("커뮤니티", null);
  renderBoardList(document.getElementById("board-root"), { teamId: null, cat: "전체", page: 1, query: "" });
  initSidebar();
  renderFooter();
}

// ── 팀 게시판 페이지 ──
function teamRecordText(teamId) {
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

function initTeamPage() {
  const id = new URLSearchParams(location.search).get("team");
  const team = TEAM_MAP[id] || TEAMS[0];
  renderHeader("커뮤니티", team.id);
  document.title = `${team.name} 게시판 — LCK 라운지`;

  const hero = document.getElementById("team-hero");
  hero.style.background = `linear-gradient(120deg, ${team.dark} 0%, #12141b 70%)`;
  hero.innerHTML = `
    <div class="container team-hero-inner">
      ${teamLogoHTML(team, 56)}
      <div class="team-hero-info">
        <h1>${team.name === team.abbr
          ? `<span style="color:${team.color}">${team.name}</span>`
          : `${team.name} <span style="color:${team.color}">${team.abbr}</span>`} 게시판</h1>
        <p class="desc">2026 스플릿 3 · ${teamRecordText(team.id)}</p>
      </div>
    </div>`;

  renderBoardList(document.getElementById("board-root"), { teamId: team.id, cat: "전체", page: 1, query: "" });
  initSidebar();
  renderFooter();
}
