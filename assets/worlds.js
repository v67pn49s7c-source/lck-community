// 2026 월즈 홈 — 공식 데이터가 들어온 만큼만 보여 준다.
// 참가팀·대진·승률을 추정해서 채우지 않는 것이 이 화면의 가장 중요한 규칙이다.
(function () {
  "use strict";

  const escW = value => String(value == null ? "" : value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
  const team = id => TEAM_MAP[id] || null;
  const logo = (t, size) => t
    ? `<img src="${escW(t.logo || `assets/logos/${t.id}.svg`)}" width="${size}" height="${size}" alt="" onerror="this.style.visibility='hidden'">`
    : `<i class="team-placeholder" aria-hidden="true">?</i>`;
  const matchTime = at => new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(at)).replace("24:", "00:") + " KST";
  const matchHref = m => `/match/${encodeURIComponent(m.id)}`;
  const worldsMatches = () => Cache.matches.filter(m => m.tid === "worlds2026")
    .sort((a, b) => new Date(a.at) - new Date(b.at));
  const knownMatch = m => !!(team(m.a) && team(m.b));

  function renderAuth() {
    const el = document.getElementById("worlds-auth");
    if (!el) return;
    if (!Auth.session) {
      el.innerHTML = `<a href="my.html">내 기록</a><a href="login.html">로그인</a>`;
      return;
    }
    const name = Auth.profile ? Auth.profile.nick : "내 계정";
    el.innerHTML = `<a href="my.html">${escW(name)}</a><button type="button" id="worlds-signout">로그아웃</button>`;
    document.getElementById("worlds-signout").onclick = async () => {
      await sb.auth.signOut();
      location.reload();
    };
  }

  function renderCountdown(matches) {
    const n = document.getElementById("worlds-countdown");
    const label = document.getElementById("worlds-countdown-label");
    const now = Date.now();
    const live = matches.find(m => m.status === "live");
    if (live) {
      n.textContent = "LIVE";
      label.textContent = live.stage || "대회 진행 중";
      document.body.dataset.previewMode = "live";
      return;
    }
    const next = matches.find(m => m.status !== "done" && new Date(m.at).getTime() >= now);
    if (next) {
      const days = Math.max(0, Math.ceil((new Date(next.at).getTime() - now) / 86400000));
      n.textContent = days ? String(days) : "D-DAY";
      label.textContent = days ? "DAYS TO NEXT MATCH" : "오늘 월즈 경기";
      return;
    }
    // 경기 시간이 아직 없을 때는 공식 발표의 현지 개막일까지만 날짜 단위로 센다.
    const start = Date.UTC(2026, 9, 15);
    const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
    const days = Math.ceil((start - today) / 86400000);
    n.textContent = days > 0 ? String(days) : "—";
    label.textContent = days > 0 ? "DAYS TO WORLDS" : "공식 경기 시간 발표 대기";
  }

  function stripGame(m) {
    const a = team(m.a), b = team(m.b);
    return `<a class="strip-game" href="${matchHref(m)}">
      <time>${escW(m.status === "live" ? "LIVE" : m.stage || "WORLDS")}</time>
      <span class="team">${logo(a, 30)}${escW(a ? a.abbr : "미정")}</span><b>VS</b>
      <span class="team right">${escW(b ? b.abbr : "미정")}${logo(b, 30)}</span><em>경기 보기</em>
    </a>`;
  }

  function renderStrip(matches) {
    const now = Date.now();
    const candidates = matches.filter(m => knownMatch(m) && (m.status === "live" || (m.status !== "done" && new Date(m.at).getTime() >= now))).slice(0, 2);
    const title = candidates.length ? "오늘·다음 월즈" : "월즈 개막";
    const sub = candidates.length ? `${candidates.length}경기 확인` : "10.15 · LOS ANGELES";
    document.getElementById("worlds-match-strip").innerHTML = `
      <div class="strip-title"><span>${title}</span><strong>${sub}</strong></div>
      ${candidates.length ? candidates.map(stripGame).join("")
        : `<div class="strip-empty"><b>공식 대진 발표 대기</b><span>참가팀과 경기 시간이 확정되면 자동으로 표시됩니다.</span></div>`}`;
  }

  function renderSquads() {
    const ids = worldsLckSeeds();
    const box = document.getElementById("worlds-squad-grid");
    box.innerHTML = [0, 1, 2, 3].map(i => {
      const t = team(ids[i]);
      return `<a class="squad-card${i === 0 ? " seed-one" : ""}" href="${t ? `team.html?team=${encodeURIComponent(t.id)}` : "#"}">
        <span class="seed">LCK #${i + 1}</span>${logo(t, 54)}
        <b>${escW(t ? t.abbr : "확정 대기")}</b>
        <small>${t ? "공식 등록된 LCK 대표팀" : "공식 확정 후 표시"}</small><i>→</i>
      </a>`;
    }).join("");
    document.getElementById("worlds-squad-note").textContent = ids.length
      ? `현재 공식 등록된 LCK 대표팀 ${ids.length}팀 · 시드 순서 기준`
      : "공식 진출팀 확정 후 실제 시드와 팀으로 표시됩니다.";
  }

  function renderSwiss(matches) {
    const ids = worldsLckSeeds();
    const swiss = matches.filter(m => m.stage === "스위스 스테이지" && m.status === "done" && knownMatch(m));
    if (!ids.length || !swiss.length) return;
    const rows = ids.map(id => {
      const related = swiss.filter(m => m.a === id || m.b === id);
      let w = 0, l = 0;
      related.forEach(m => {
        const mine = m.a === id ? Number(m.scoreA) : Number(m.scoreB);
        const other = m.a === id ? Number(m.scoreB) : Number(m.scoreA);
        if (mine > other) w++; else if (mine < other) l++;
      });
      return { id, w, l };
    }).filter(x => x.w + x.l);
    if (!rows.length) return;
    document.getElementById("worlds-swiss-panel").hidden = false;
    document.getElementById("worlds-swiss-list").innerHTML = rows.map(x => {
      const t = team(x.id), pct = Math.min(100, Math.round((x.w / 3) * 100));
      const state = x.w >= 3 ? "8강 진출" : x.l >= 3 ? "탈락" : x.w === 2 ? "진출까지 1승" : x.l === 2 ? "탈락까지 1패" : "스위스 진행 중";
      return `<div>${logo(t, 27)}<b>${escW(t.abbr)}</b><span class="record${x.l >= 2 ? " danger" : ""}">${x.w}승 ${x.l}패</span><i><u style="width:${pct}%"></u></i><em>${state}</em></div>`;
    }).join("");
  }

  function renderPosts() {
    const posts = Cache.posts.filter(p => !p.deleted_at).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
    document.getElementById("worlds-posts").innerHTML = posts.length ? posts.map(p => `
      <a class="post-row" href="post.html?id=${encodeURIComponent(p.id)}">
        <span>${escW(p.cat || "자유")}</span><b>${escW(p.title || "제목 없음")}</b>
        <em>${Number(p.upvotes || 0) ? `▲ ${Number(p.upvotes || 0)} · ` : ""}댓글 ${Number(p.comment_count || 0)}</em>
      </a>`).join("") : `<div class="worlds-empty">아직 글이 없습니다. 첫 월즈 이야기를 남겨 보세요.</div>`;
  }

  function renderNext(matches) {
    const now = Date.now();
    const m = matches.find(x => knownMatch(x) && (x.status === "live" || (x.status !== "done" && new Date(x.at).getTime() >= now)));
    const box = document.getElementById("worlds-next-match");
    if (!m) {
      box.innerHTML = `<div class="next-time"><b>KST 일정 발표 대기</b><span>공식 대진과 경기 시간이 등록되면 자동 반영됩니다.</span></div>
        <div class="versus"><div>${logo(null, 38)}<b>LCK</b><small>대표팀 확정 대기</small></div><strong>VS</strong><div>${logo(null, 38)}<b>TBD</b><small>상대 미정</small></div></div>`;
      return;
    }
    const a = team(m.a), b = team(m.b);
    document.getElementById("worlds-next-title").textContent = m.status === "live" ? "지금 진행 중" : "다음 월즈 경기";
    box.innerHTML = `<div class="next-time"><b>${escW(matchTime(m.at))}</b><span>${escW(m.stage || "2026 월즈")}</span></div>
      <div class="versus"><div>${logo(a, 45)}<b>${escW(a.abbr)}</b><small>${escW(a.name)}</small></div><strong>VS</strong><div>${logo(b, 45)}<b>${escW(b.abbr)}</b><small>${escW(b.name)}</small></div></div>
      <a class="wide-cta" href="${matchHref(m)}">${m.status === "live" ? "경기 보러 가기" : "승부 예측하기"}</a>`;
    document.getElementById("worlds-prediction-copy").textContent = `${a.abbr} vs ${b.abbr} 팬 예측에 참여해 보세요.`;
  }

  function markStage(matches) {
    const active = matches.find(m => m.status === "live") || matches.find(m => m.status !== "done");
    const name = active ? active.stage : "";
    document.querySelectorAll(".stage-rail .stage").forEach(el => el.classList.toggle("active", el.dataset.stage === name));
  }

  window.initWorldsHome = async function () {
    await storeReady;
    renderAuth();
    const matches = worldsMatches();
    renderCountdown(matches);
    renderStrip(matches);
    renderSquads();
    renderSwiss(matches);
    renderPosts();
    renderNext(matches);
    markStage(matches);
    storeFresh.then(() => {
      const fresh = worldsMatches();
      renderAuth(); renderCountdown(fresh); renderStrip(fresh); renderSquads();
      renderSwiss(fresh); renderPosts(); renderNext(fresh); markStage(fresh);
    }).catch(() => {});
  };
})();
