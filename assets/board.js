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

// 오늘 글이면 시:분, 아니면 월.일 — 모두 한국 시간(KST) 기준
function fmtBoardDate(ts) {
  return fmtDayKey(ts) === fmtDayKey(Date.now()) ? fmtHM(ts) : fmtMD(ts);
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
        <a href="post.html?id=${q(p.id)}">
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


// 이 글에 댓글을 달 수 있나 — **서버(create_comment)와 같은 규칙**이다.
// 진짜 차단은 서버가 한다. 여기서 막는 건 "쓰고 나서 거절당하는" 일을 없애기 위한 안내다.
//   · 팀 게시판 글은 그 팀 팬 회원만 (관리자 예외)
//   · 팀이 없는 글(전체 게시판·공지·[경기 토론])은 누구나
function canCommentHere(post) {
  const team = post && post.team;
  if (!team) return true;
  if (Auth.profile && Auth.profile.is_admin) return true;
  return !!(Auth.profile && Auth.profile.fav_team === team);
}
// 이 글을 **읽을** 수 있나 — 팀 게시판 글은 그 팀 팬 회원만 열어 볼 수 있다.
//   · 목록(제목)까지는 누구나 볼 수 있지만, 글을 열면 여기서 막힌다
//   · 응원팀은 30일에 한 번만 바꿀 수 있어(schema19) 팀을 옮겨 다니며 훔쳐볼 수 없다
//   · 공지는 팀 게시판에도 걸리므로 예외로 둔다 (운영 안내는 누구나 읽어야 한다)
//
// ⚠ **이 판정은 안내용이다. 진짜 차단은 서버가 한다** (schema26 의 get_post_body).
//   그래서 규칙이 서버와 **정확히 같아야** 한다 — 특히 비회원은 읽을 수 없다.
//   서버는 비회원이 어느 팀 팬인지 확인할 방법이 없다(응원팀이 브라우저에만 있다).
//   여기서 localStorage 의 응원팀을 인정해 버리면, 화면은 열리는데 본문만 비는
//   이상한 상태가 된다.
function canReadPost(post) {
  const team = post && post.team;
  if (!team) return true;
  if (post.cat === "공지") return true;
  if (!Auth.profile) return false;            // 비회원 — 서버가 신원을 확인할 수 없다
  if (Auth.profile.is_admin) return true;
  return Auth.profile.fav_team === team;
}
function whyNoRead(post) {
  const t = TEAM_MAP[post.team];
  const name = t ? t.name : "이 팀";
  const abbr = t ? t.abbr : "";
  if (!Auth.session) {
    return `${name} 팬들끼리 이야기하는 게시판입니다. 가입하고 응원팀을 ${abbr} 로 정하면 읽을 수 있습니다.`;
  }
  const my = Auth.profile && Auth.profile.fav_team;
  if (!my) return `${name} 팬 전용 게시판입니다. 응원팀을 ${abbr} 로 정하면 읽을 수 있습니다.`;
  return `${name} 팬 전용 게시판입니다. 내 응원팀은 ${(TEAM_MAP[my] || {}).name || "중립"} 이라 이 글은 볼 수 없습니다.`;
}

function whyNoComment(post) {
  const t = TEAM_MAP[post.team];
  const name = t ? t.name : "이 팀";
  if (!Auth.session) return `${name} 팬 게시판이라 ${t ? t.abbr : ""} 팬 회원만 댓글을 쓸 수 있습니다.`;
  const my = Auth.profile && Auth.profile.fav_team;
  return my
    ? `${name} 팬 게시판입니다. 내 응원팀은 ${(TEAM_MAP[my] || {}).name || "미설정"} 이라 댓글을 쓸 수 없습니다.`
    : `${name} 팬 게시판입니다. 응원팀을 ${t ? t.abbr : ""} 로 설정하면 댓글을 쓸 수 있습니다.`;
}

// 글 보기 페이지의 사이드바 — **그 글이 속한 게시판과 똑같이** 맞춘다.
//   · 팀 글  → 최신 콘텐츠 · 창립 팬 100인 · 다음 경기 예측 · LCK 순위 (team.html 과 동일)
//   · 전체 글 → 다음 경기 예측 · LCK 순위 (community.html 과 동일)
function initPostSidebar(teamId) {
  const t = teamId ? TEAM_MAP[teamId] : null;
  if (t) {
    renderTeamContent(t.id);                 // 카드는 받아온 콘텐츠가 있을 때만 스스로 나타난다
    const card = document.getElementById("founding-card");
    if (card) card.style.display = "";
    renderFoundingPanel(t);
  }
  initSidebar();
}

// ── 글 보기 페이지 ──
async function initPostPage() {
  await storeReady;
  renderHeader("커뮤니티", null);
  const id = new URLSearchParams(location.search).get("id");
  const post = getPost(id);
  const el = document.getElementById("post-view");

  if (!post) {
    el.innerHTML = `<div class="empty-note">글을 찾을 수 없습니다. 지워졌거나 주소가 잘못됐습니다.<br>
      <a class="btn-secondary" href="community.html" style="display:inline-block;margin-top:10px;text-decoration:none">커뮤니티로</a></div>`;
    noIndex();   // 없는 주소가 검색에 잡히지 않게
    initSidebar(); renderFooter();
    return;
  }

  // ── 팀 게시판 잠금 ──
  // 다른 팀 팬은 **글을 열 수 없다.** 목록에서 제목까지는 보이지만 여기서 막힌다.
  // 조회수·본문·댓글 어느 것도 그리기 전에 끝내야 한다 (본문이 meta 설명으로도 새면 안 된다).
  const showLocked = () => {
    const lt = TEAM_MAP[post.team];
    setPageIdentity(["id"], {
      title: `${lt ? lt.name : "팀"} 팬 게시판 — The Nexus`,
      desc: `${lt ? lt.name : "이 팀"} 팬들만 볼 수 있는 게시판입니다.`,
    });
    noIndex();   // 팀 팬 전용 글이 검색에 잡히면 안 된다
    el.innerHTML = `
      <div class="post-locked">
        <div class="post-locked-mark">${lt ? teamLogoHTML(lt, 44) : "🔒"}</div>
        <h2>${esc(lt ? lt.name : "팀")} 팬 게시판입니다</h2>
        <p>${esc(whyNoRead(post))}</p>
        <div class="post-locked-acts">
          <a class="btn-secondary" href="team.html?team=${q(post.team)}">게시판 목록으로</a>
          ${!Auth.session
            ? `<a class="btn-primary" href="login.html">가입하고 읽기</a>`
            : `<a class="btn-secondary" href="my.html">내 응원팀 보기</a>`}
        </div>
      </div>`;
    initPostSidebar(post.team); renderFooter();
  };
  if (!canReadPost(post)) { showLocked(); return; }

  // ── 본문 받아오기 ──
  // 목록에는 본문이 없다(schema26). 여기서 서버 창구로 받으며, **서버가 최종 판정자**다.
  // 위 canReadPost 를 통과했더라도 서버가 거절하면(응원팀이 방금 바뀌었다든지) 잠금 화면.
  const got = await loadPostBody(id);
  if (!got.ok) { showLocked(); return; }
  post.body = got.body;

  // 조회수 (세션당 1회)
  const seenKey = "lck_seen_" + id;
  if (!sessionStorage.getItem(seenKey)) {
    bumpPostView(id);
    sessionStorage.setItem(seenKey, "1");
  }

  const t = post.team ? TEAM_MAP[post.team] : null;
  // 글마다 다른 주소·제목 (고정 canonical 이면 131개 글이 한 장으로 합쳐진다)
  setPageIdentity(["id"], {
    title: `${post.title} — The Nexus`,
    desc: (post.body || "").replace(/\s+/g, " ").slice(0, 120) || "The Nexus 커뮤니티 글",
  });

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
          ${c.id != null ? `<button class="c-like ${myCommentLike(c.id) ? "liked" : ""}" data-cid="${esc(c.id)}"
            style="margin-left:auto;color:${myCommentLike(c.id) ? "var(--accent)" : "var(--text-dim)"};font-size:11px;font-weight:700">
            ▲ ${likes}</button>` : ""}
          ${c.id != null ? `<button class="c-del" data-cid="${esc(c.id)}"
            style="color:var(--text-dim);font-size:11px">삭제</button>` : ""}
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
          <span>${fmtFullKST(cur.ts)}</span>
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
        <span style="margin-left:auto; display:flex; gap:8px">
          <button class="btn-secondary" id="btn-edit">수정</button>
          <button class="btn-danger" id="btn-del">삭제</button>
        </span>
      </div>
      <div class="comments-head">댓글 <em>${cur.comments.length}</em></div>
      <div id="comment-list">
        ${ordered.map(commentHTML).join("") || `<div class="empty-note">첫 댓글을 남겨 보세요</div>`}
      </div>
      ${canCommentHere(cur)
        ? `<form class="comment-form" id="comment-form">
        <input class="nick" value="${esc(Auth.profile ? Auth.profile.nick : "익명 (자동 부여)")}" readonly
          title="${Auth.profile ? "회원 닉네임은 프로필에서만 바꿀 수 있습니다" : "비회원 댓글은 익명으로 등록됩니다"}" style="max-width:150px">
        ${Auth.session ? "" : `<input class="pw" type="password" placeholder="비밀번호(4자 이상)" required minlength="4" maxlength="20" autocomplete="new-password" style="max-width:150px">`}
        <input class="body" placeholder="댓글을 입력하세요 (비방·혐오 표현은 제재됩니다)" required maxlength="300">
        <button class="btn-primary" type="submit">등록</button>
      </form>`
        : `<div class="empty-note">${esc(whyNoComment(cur))}${Auth.session ? ""
             : `<br><a href="login.html" style="text-decoration:underline;font-weight:700">회원가입 하러 가기 →</a>`}</div>`}`;

    if (poll) {
      const m = poll.match_id ? getMatches().find(x => x.id === poll.match_id) : null;
      // 공식(관리자·phase 있음)과 회원 자유 투표를 화면에서도 구분한다 (P0-1)
      const box = el.querySelector("#post-poll");
      box.insertAdjacentHTML("beforebegin",
        `<div class="poll-kind" style="font-size:11px;font-weight:700;color:var(--text-dim);margin:10px 0 4px">
           ${poll.phase ? "공식 팬심지수 투표" : "글쓴이가 만든 자유 투표"}</div>`);
      renderPollInto(box, poll, m ? { teamA: m.a, teamB: m.b } : {});
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
      // 1인 1표는 이제 서버가 보증한다 (브라우저 저장소는 지우면 그만이었다)
      if (!upvotePost(id)) { alert("이미 추천한 글입니다."); return; }
      render();
    });
    // ⚠ 팀 게시판에서는 폼이 아예 없다 → ?. 없이 붙이면 글 상세가 통째로 멈춘다
    el.querySelector("#comment-form")?.addEventListener("submit", e => {
      e.preventDefault();
      const nick = Auth.profile ? Auth.profile.nick : ""; // 닉네임은 서버가 정한다
      const body = e.target.querySelector(".body").value.trim();
      const pw = e.target.querySelector(".pw")?.value || "";
      if (!body) return;
      if (!Auth.session && pw.length < 4) { alert("비밀번호를 4자 이상 입력해 주세요. (댓글 삭제에 씁니다)"); return; }
      addComment(id, nick, body, pw).then(r => {
        if (r && r.error) alert("댓글을 등록하지 못했습니다.\n" + (r.error.message || ""));
        render();
      });
      render();
    });

    // ── 댓글 삭제 (비회원은 비밀번호) ──
    el.querySelectorAll(".c-del").forEach(b => b.addEventListener("click", () => {
      const cid = Number(b.dataset.cid);
      const pw = Auth.session ? "" : prompt("댓글을 쓸 때 정한 비밀번호를 입력하세요.");
      if (!Auth.session && !pw) return;
      if (!confirm("이 댓글을 삭제할까요?")) return;
      removeComment(cid, pw).then(r => {
        if (r.error) alert("삭제하지 못했습니다.\n" + (r.error.message || ""));
        render();
      });
    }));

    // ── 글 수정 (제목·내용) ──
    el.querySelector("#btn-edit").addEventListener("click", () => {
      const pw = Auth.session ? "" : prompt("글을 쓸 때 정한 비밀번호를 입력하세요.");
      if (!Auth.session && !pw) return;
      const box = el.querySelector(".post-content");
      const c = getPost(id);
      box.innerHTML = `
        <form id="edit-form" class="write-form" style="gap:10px">
          <input id="edit-title" value="${esc(c.title)}" maxlength="80" required>
          <textarea id="edit-body" required style="min-height:200px">${esc(c.body)}</textarea>
          <div class="row" style="justify-content:flex-end; flex:0">
            <button class="btn-secondary" type="button" id="edit-cancel">취소</button>
            <button class="btn-primary" type="submit">저장</button>
          </div>
        </form>`;
      box.querySelector("#edit-cancel").addEventListener("click", render);
      box.querySelector("#edit-form").addEventListener("submit", ev => {
        ev.preventDefault();
        const title = box.querySelector("#edit-title").value.trim();
        const body = box.querySelector("#edit-body").value.trim();
        if (!title || !body) return;
        editPost(id, pw, title, body).then(r => {
          if (r.error) { alert("수정하지 못했습니다.\n" + (r.error.message || "")); return; }
          document.title = `${title} — The Nexus`;
          render();
        });
      });
    });

    // ── 글 삭제 ──
    el.querySelector("#btn-del").addEventListener("click", () => {
      const pw = Auth.session ? "" : prompt("글을 쓸 때 정한 비밀번호를 입력하세요.");
      if (!Auth.session && !pw) return;
      if (!confirm("이 글을 삭제할까요? 되돌릴 수 없습니다.")) return;
      removePost(id, pw).then(r => {
        if (r.error) { alert("삭제하지 못했습니다.\n" + (r.error.message || "")); return; }
        location.href = t ? "team.html?team=" + t.id : "community.html";
      });
    });
  };
  render();
  // 반응·댓글 추천 수는 서버 집계에서 오므로, 스냅샷으로 먼저 그렸다면 도착 후 다시 그린다.
  // 단, 댓글을 쓰고 있거나 수정 폼을 열어 둔 상태면 건드리지 않는다 (쓰던 글이 날아간다).
  storeFresh.then(async () => {
    const busy = [...document.querySelectorAll("#post-view textarea, #post-view input")]
      .some(el => el === document.activeElement || (el.value || "").trim());
    if (busy) return;
    // 서버 확인이 끝나면 자격이 달라져 있을 수 있다 (로그인 만료·응원팀 변경).
    // 목록을 새로 받으면서 본문이 비었다면 다시 받아 보고, 거절당하면 잠금 화면으로 바꾼다.
    const fresh = getPost(id);
    if (!fresh) return;
    if (!canReadPost(fresh)) { showLocked(); return; }
    if (!fresh.bodyLoaded) {
      const again = await loadPostBody(id);
      if (!again.ok) { showLocked(); return; }
      fresh.body = again.body;
    }
    render();
  }).catch(() => {});
  initPostSidebar(post.team);
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
  // 로그인은 했는데 프로필(닉네임)이 없으면 글을 쓸 수 없다
  if (Auth.session && !Auth.profile) {
    document.querySelector(".stack").innerHTML = `
      <div class="page-title-row"><h1 class="page-title">글쓰기</h1></div>
      <section class="card"><div class="admin-note" style="border-top:none">
        닉네임·응원팀을 먼저 설정해 주세요.
        <a href="login.html" style="text-decoration:underline">프로필 설정하러 가기</a>
      </div></section>`;
    initSidebar(); renderFooter();
    return;
  }

  // 닉네임은 직접 정하지 않는다 — 회원은 프로필 닉네임 고정, 비회원은 서버가 유동닉 부여
  const nickInput = document.getElementById("write-nick");
  nickInput.readOnly = true;
  nickInput.value = Auth.profile ? Auth.profile.nick : "익명 (자동 부여)";
  nickInput.title = Auth.profile
    ? "회원 닉네임은 프로필에서만 바꿀 수 있습니다"
    : "비회원 글은 익명으로 등록되며, 글마다 다른 번호가 붙습니다";

  // 회원은 계정으로 본인 글을 확인할 수 있어 비밀번호가 필요 없다
  const pwWrap = document.getElementById("write-pw-wrap");
  const pwInput = document.getElementById("write-pw");
  const pwHint = document.getElementById("write-pw-hint");
  if (Auth.session) {
    pwWrap.style.display = "none";
    pwHint.textContent = Auth.profile?.is_admin
      ? "관리자 계정입니다. 비밀번호 없이 모든 글을 수정·삭제할 수 있습니다."
      : "로그인 상태라 비밀번호 없이 내 글을 수정·삭제할 수 있습니다.";
  } else {
    pwInput.required = true;
    pwHint.textContent = "비회원은 익명으로 등록되며 닉네임은 글마다 자동으로 붙습니다. "
      + "비밀번호는 이 글을 수정·삭제할 때 쓰니 꼭 기억해 주세요.";
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    // 닉네임은 서버가 정한다 (회원=프로필 닉, 비회원=자동 유동닉)
    const nick = Auth.profile ? Auth.profile.nick : "";
    const team = document.getElementById("write-team").value || null;
    const cat = document.getElementById("write-cat").value;
    const title = document.getElementById("write-title").value.trim();
    const body = document.getElementById("write-body").value.trim();
    if (!title || !body) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "등록 중..."; }
    const fail = msg => {
      alert(msg);
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "등록"; }
    };

    const pw = document.getElementById("write-pw").value;
    if (!Auth.session && pw.length < 4) { fail("비밀번호를 4자 이상 입력해 주세요. (글 수정·삭제에 씁니다)"); return; }
    if (!Auth.session) sessionStorage.setItem("lck_pw_hint", "1");

    const pid = addPost({ team, cat, title, body, nick, match_id: matchId }, pw);
    // 저장이 끝난 뒤에만 이동 (이동하면 진행 중인 요청이 끊기는 문제 방지)
    const { error } = await addPost.lastSave;
    if (error) {
      Cache.posts = Cache.posts.filter(x => x.id !== pid); // 화면 캐시만 원복 (서버엔 안 들어갔음)
      fail("글을 등록하지 못했습니다.\n" + (error.message || ""));
      return;
    }
    // 투표 첨부 (회원) — RPC 로만 만든다. match_id 는 넘기지 않는다:
    // 회원 투표가 경기(match_id)에 걸리면 공식 팬심지수 화면에 끼어들 수 있어
    // 서버가 금지한다 (schema22 · P0-1).
    if (Auth.session && document.getElementById("poll-attach")?.checked) {
      const options = document.getElementById("poll-options").value
        .split("\n").map(s => s.trim()).filter(Boolean).slice(0, 10);
      if (options.length >= 2) {
        const closes = document.getElementById("poll-closes").value;
        createMemberPoll({
          post_id: pid,
          question: title, options,
          multi: document.getElementById("poll-multi").checked,
          closes_at: closes ? closes + ":00+09:00" : null,
        });
        const pr = await createMemberPoll.lastSave;
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
  // 팀마다 다른 주소·제목 (10개 팀 게시판이 한 장으로 합쳐지지 않게)
  setPageIdentity(["team"], {
    title: `${team.name} 팬 게시판 — The Nexus`,
    desc: `${team.name}(${team.abbr}) 팬들이 모이는 게시판, 공식 SNS 최신 콘텐츠, 창립 팬 100인.`,
  });

  renderTeamContent(team.id);  // 공식 YouTube · Instagram · X 최신 콘텐츠

  const hero = document.getElementById("team-hero");
  hero.style.background = `linear-gradient(120deg, ${team.dark} 0%, #12141b 70%)`;
  hero.innerHTML = `
    <div class="container team-hero-inner">
      ${teamLogoHTML(team, 56)}
      <div class="team-hero-info">
        <h1>${team.name === team.abbr
          ? `<span style="color:${team.color}">${team.name}</span>`
          : `${team.name} <span style="color:${team.color}">${team.abbr}</span>`} 게시판</h1>
        <p class="desc">2026 정규 라운드 3-4 · ${teamRecordText(team.id)}</p>
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
