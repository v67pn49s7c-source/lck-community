// ── 게시판 공용 (목록 · 글보기 · 글쓰기) ─────────────────
const BOARD_CATS = ["전체", "자유", "경기 분석", "밴픽·메타", "선수·팀", "영상·짤", "질문", "공지"];
const PAGE_SIZE = 15;

function boardPosts(teamId) {
  const all = getPosts();
  // 팀 게시판: 해당 팀 글 + 운영 공지만 (다른 팀·전체 글과 섞이지 않음)
  if (teamId) return all.filter(p => p.team === teamId || p.cat === "공지");
  // 전체 게시판: 팀 소속이 아닌 글만 (팀 게시판과 독립)
  return all.filter(p => !p.team);
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
          ${getPollByPost(p.id) ? `<span class="poll-ic" title="투표가 있는 글">🗳️</span>` : ""}
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
      ${state.teamId && !canPostToTeam(state.teamId)
        ? `<button class="btn-primary" id="btn-write-blocked" style="opacity:.6">글쓰기</button>`
        : `<a class="btn-primary" href="write.html${state.teamId ? "?team=" + state.teamId : ""}">글쓰기</a>`}
    </div>`;

  el.querySelector("#btn-write-blocked")?.addEventListener("click", () => {
    const t = TEAM_MAP[state.teamId];
    alert(Auth.session
      ? `${t.name} 게시판은 응원팀이 ${t.abbr}인 팬 회원만 글을 쓸 수 있습니다.\n(내 응원팀: ${Auth.profile?.fav_team ? (TEAM_MAP[Auth.profile.fav_team]?.name || "-") : "미설정"})`
      : `${t.name} 게시판은 ${t.abbr} 팬 회원 전용입니다.\n회원가입 시 응원팀을 ${t.abbr}로 설정하면 글을 쓸 수 있어요.`);
    if (!Auth.session) location.href = "login.html";
  });

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
async function initPostPage() {
  await storeReady;
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
  document.title = `${post.title} — The Nexus`;

  const render = () => {
    const cur = getPost(id);
    const poll = getPollByPost(id);
    const rc = reactionCounts(id);
    const myRx = myReactions(id);
    // 베스트 댓글: 추천 1개 이상 중 최다
    let bestId = null, bestN = 0;
    cur.comments.forEach(c => {
      if (c.id != null) {
        const n = commentLikeCount(c.id);
        if (n > bestN) { bestN = n; bestId = c.id; }
      }
    });
    const commentHTML = c => {
      const likes = c.id != null ? commentLikeCount(c.id) : 0;
      return `
      <div class="comment-row">
        <div class="c-meta">
          <b>${nickHTML(c.nick, c.author_team)}</b>
          ${c.id === bestId && bestN > 0 ? `<span class="cat-chip notice">BEST</span>` : ""}
          <span>${fmtAgo(c.ts)}</span>
          ${c.id != null ? `<button class="c-like ${myCommentLike(c.id) ? "liked" : ""}" data-cid="${c.id}"
            style="margin-left:auto;color:${myCommentLike(c.id) ? "var(--accent)" : "var(--text-dim)"};font-size:11px;font-weight:700">
            ▲ ${likes}</button>` : ""}
        </div>
        <div class="c-body">${esc(c.body)}</div>
      </div>`;
    };
    // 베스트 댓글 상단 고정
    const ordered = cur.comments.slice().sort((a, b) =>
      (a.id === bestId && bestN > 0 ? -1 : 0) - (b.id === bestId && bestN > 0 ? -1 : 0));

    el.innerHTML = `
      <div class="post-view-head">
        <div style="margin-bottom:6px; display:flex; gap:6px; align-items:center;">
          ${t ? `<span class="tag-team" style="--tag-color:${t.color}">${teamLogoHTML(t, 16)} ${t.abbr}</span>` : ""}
          <span class="cat-chip ${cur.cat === "공지" ? "notice" : ""}">${esc(cur.cat)}</span>
          ${poll ? `<span class="cat-chip">투표</span>` : ""}
        </div>
        <h1>${esc(cur.title)}</h1>
        <div class="post-view-meta">
          <b>${nickHTML(cur.nick, cur.author_team)}</b>
          <span>${new Date(cur.ts).toLocaleString("ko-KR")}</span>
          <span>조회 ${cur.views}</span>
          <span>추천 ${cur.up}</span>
        </div>
      </div>
      <div class="post-content">${esc(cur.body)}</div>
      ${poll ? `<div class="poll-box" id="post-poll" style="border-top:1px solid var(--line)"></div>` : ""}
      <div class="post-actions" style="flex-wrap:wrap">
        ${REACTION_KINDS.map(k => `
          <button class="btn-secondary rx-btn ${myRx.has(k.kind) ? "on" : ""}" data-kind="${k.kind}"
            style="${myRx.has(k.kind) ? "color:var(--accent);border-color:var(--accent)" : ""}">
            ${k.emoji} ${k.label} ${rc[k.kind] || 0}</button>`).join("")}
        <button class="vote-btn" id="btn-up">▲ 추천 ${cur.up}</button>
        <a class="btn-secondary" href="${t ? "team.html?team=" + t.id : "community.html"}">목록</a>
      </div>
      <div class="comments-head">댓글 <em>${cur.comments.length}</em></div>
      <div id="comment-list">
        ${ordered.map(commentHTML).join("") || `<div class="empty-note">첫 댓글을 남겨 보세요</div>`}
      </div>
      <form class="comment-form" id="comment-form">
        <input class="nick" placeholder="닉네임" value="${esc(getNick())}" required maxlength="12" ${Auth.profile ? "readonly" : ""}>
        <input class="body" placeholder="댓글을 입력하세요 (비방·혐오 표현은 제재됩니다)" required maxlength="300">
        <button class="btn-primary" type="submit">등록</button>
      </form>`;

    if (poll) {
      const m = poll.match_id ? getMatches().find(x => x.id === poll.match_id) : null;
      renderPollInto(el.querySelector("#post-poll"), poll, m ? { teamA: m.a, teamB: m.b } : {});
    }
    el.querySelectorAll(".rx-btn").forEach(b => b.addEventListener("click", () => {
      toggleReaction(id, b.dataset.kind);
      render();
    }));
    el.querySelectorAll(".c-like").forEach(b => b.addEventListener("click", () => {
      if (!likeComment(Number(b.dataset.cid))) { alert("이미 추천한 댓글입니다."); return; }
      render();
    }));
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
async function initWritePage() {
  await storeFresh; // 글쓴이 닉네임·권한은 정확해야 하므로 서버 확인까지 기다린다
  renderHeader("커뮤니티", null);
  const params = new URLSearchParams(location.search);
  const preTeam = params.get("team") || "";
  const matchId = params.get("match") || null;
  const form = document.getElementById("write-form");

  // 회원만 투표 첨부 가능 (서버 규칙과 동일)
  if (Auth.session) document.getElementById("poll-attach-wrap").style.display = "";
  document.getElementById("poll-attach")?.addEventListener("change", e => {
    const f = document.getElementById("poll-fields");
    f.style.display = e.target.checked ? "flex" : "none";
  });
  if (matchId) {
    const m = getMatches().find(x => x.id === matchId);
    if (m) document.getElementById("write-title").placeholder =
      `${slotName(m.a)} vs ${slotName(m.b)} 경기에 대한 글 제목을 입력하세요`;
  }

  // 게시판 선택: 전체 게시판 + (내가 글 쓸 수 있는 팀 게시판만)
  const writableTeams = TEAMS.filter(t => canPostToTeam(t.id));
  const validPre = writableTeams.some(t => t.id === preTeam) ? preTeam : "";
  document.getElementById("write-team").innerHTML = `
    <option value="">전체 게시판</option>
    ${writableTeams.map(t => `<option value="${t.id}" ${t.id === validPre ? "selected" : ""}>${t.name} (${t.abbr}) 팬 게시판</option>`).join("")}`;
  if (preTeam && !validPre) {
    const t = TEAM_MAP[preTeam];
    if (t) alert(`${t.name} 게시판은 ${t.abbr} 팬 회원 전용이라 전체 게시판으로 작성됩니다.\n응원팀은 회원가입 시 설정할 수 있어요.`);
  }
  document.getElementById("write-cat").innerHTML =
    BOARD_CATS.filter(c => c !== "전체" && c !== "공지").map(c => `<option>${c}</option>`).join("");
  document.getElementById("write-nick").value = getNick();

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const nick = document.getElementById("write-nick").value.trim();
    const team = document.getElementById("write-team").value || null;
    const cat = document.getElementById("write-cat").value;
    const title = document.getElementById("write-title").value.trim();
    const body = document.getElementById("write-body").value.trim();
    if (!nick || !title || !body) return;
    setNick(nick);

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "등록 중..."; }
    const fail = msg => {
      alert(msg);
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "등록"; }
    };

    const pid = addPost({ team, cat, title, body, nick, match_id: matchId });
    // 저장이 끝난 뒤에만 이동 (이동하면 진행 중인 요청이 끊기는 문제 방지)
    const { error } = await addPost.lastSave;
    if (error) {
      deletePost(pid); // 캐시 원복
      fail(error.message.includes("row-level security")
        ? "이 게시판에 글을 쓸 권한이 없습니다. 응원팀 팬 회원만 작성할 수 있어요."
        : "글 등록에 실패했습니다: " + error.message);
      return;
    }
    // 투표 첨부 (회원)
    if (Auth.session && document.getElementById("poll-attach")?.checked) {
      const options = document.getElementById("poll-options").value
        .split("\n").map(s => s.trim()).filter(Boolean).slice(0, 10);
      if (options.length >= 2) {
        const closes = document.getElementById("poll-closes").value;
        createPoll({
          post_id: pid, match_id: matchId,
          question: title, options,
          multi: document.getElementById("poll-multi").checked,
          closes_at: closes ? closes + ":00+09:00" : null,
        });
        const pr = await createPoll.lastSave;
        if (pr.error) alert("글은 등록됐지만 투표 생성에 실패했습니다: " + pr.error.message);
      } else if (options.length) {
        alert("투표 보기는 2개 이상이어야 해서 투표 없이 글만 등록했습니다.");
      }
    }
    location.href = "post.html?id=" + pid;
  });

  initSidebar();
  renderFooter();
}

// ── 커뮤니티(통합) 게시판 페이지 ──
async function initCommunityPage() {
  await storeReady;
  renderHeader("커뮤니티", null);
  renderBoardList(document.getElementById("board-root"), { teamId: null, cat: "전체", page: 1, query: "" });
  initSidebar();
  renderFooter();
}

// ── 팀 게시판 페이지 ──
function teamRecordText(teamId) {
  const r = cumulativeRankOf(teamId);
  if (!r) return "";
  return `시즌 누적 <b>${r.rank}위</b> · <b>${r.w}승 ${r.l}패</b> · 세트 <b>${r.sw}-${r.sl}</b> · 포인트 <b>${r.pt}</b>`;
}

async function initTeamPage() {
  await storeReady;
  const id = new URLSearchParams(location.search).get("team");
  const team = TEAM_MAP[id] || TEAMS[0];
  renderHeader("커뮤니티", team.id);
  document.title = `${team.name} 게시판 — The Nexus`;

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
  renderFoundingPanel(team);
  initSidebar();
  renderFooter();
}

// ── 창립 팬 100인 패널 ──
function renderFoundingPanel(team) {
  const el = document.getElementById("founding-panel");
  if (!el) return;
  const list = foundingList(team.id);
  document.getElementById("founding-count").textContent = `${list.length} / 100`;
  const myNo = myFoundingNo(team.id);
  const canJoin = Auth.profile?.fav_team === team.id && myNo == null && list.length < 100;

  el.innerHTML = `
    <div style="font-size:12px; color:var(--text-sub)">
      The Nexus에서 최초로 ${esc(team.abbr)} 팬덤을 만드는 100명 —
      영구 창립 배지와 운영 의견 투표권이 주어집니다.
    </div>
    <div class="founding-bar"><span style="width:${list.length}%"></span></div>
    ${myNo != null ? `<div style="font-weight:800; color:#d8b64a; font-size:13px; margin-bottom:6px">나는 FOUNDING ${esc(team.abbr)} FAN #${myNo}</div>` : ""}
    ${canJoin ? `<button class="btn-primary" id="founding-join" style="width:100%; margin-bottom:8px">창립 팬 등록하기 (#${list.length + 1})</button>` : ""}
    ${!Auth.session ? `<a class="btn-secondary" href="login.html" style="display:block; text-align:center; margin-bottom:8px">가입하고 창립 팬 되기</a>` : ""}
    <div class="founding-names">
      ${list.length
        ? list.slice(0, 15).map(f => `<b>#${f.no}</b> ${esc(f.nick)}`).join(" · ") + (list.length > 15 ? ` · 외 ${list.length - 15}명` : "")
        : "아직 아무도 없습니다. 1호 창립 팬이 되어 보세요!"}
    </div>`;

  el.querySelector("#founding-join")?.addEventListener("click", async () => {
    const res = await claimFounding(team.id);
    if (res.error) { alert(res.error.message); return; }
    alert(`축하합니다! FOUNDING ${team.abbr} FAN #${res.no} 배지가 부여되었습니다.`);
    renderFoundingPanel(team);
  });
}
