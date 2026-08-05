// ── 데이터 계층 (Supabase 연동) ──────────────────────────
// 모든 데이터는 Supabase(서울 리전)에 저장되어 모든 방문자가 공유한다.
// 페이지 로드 시 fetchAll()이 전체 데이터를 한 번에 받아 캐시에 두고,
// 화면 코드는 기존과 동일하게 동기 함수로 읽는다. 쓰기는 낙관적으로
// 캐시를 먼저 고치고 서버에 비동기 저장한다.

const SB_URL = "https://ckbxvhdvhczpxtgkpbsv.supabase.co";
const SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrYnh2aGR2aGN6cHh0Z2twYnN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2NzQ5NzUsImV4cCI6MjEwMTI1MDk3NX0.TbCe1ybebiLNsUegL4s1ZbGa-TZsyPPWj9xzxMAPssU";
const sb = window.supabase.createClient(SB_URL, SB_ANON);

// 로그인 상태 (fetchAll에서 채움)
const Auth = { session: null, profile: null };

// 이 브라우저의 익명 id. 서버에 보내는 값은 **항상 이것**이고, 로그인 상태면
// 서버가 알아서 계정 id로 바꿔 쓴다. 계정 id를 클라이언트가 보내지 않으므로
// 사칭이 불가능하고, 세션이 만료된 줄 모르고 누른 표도 익명 표로 남아 사라지지 않는다.
function anonId() {
  let v = localStorage.getItem("lckdb_voter");
  if (!v) {
    v = "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    localStorage.setItem("lckdb_voter", v);
  }
  return v;
}
// 내 표를 찾을 때 쓰는 신원. 서버가 확정해 준 값이 있으면 그것을 따른다.
function voterId() {
  if (Cache.myVoter) return Cache.myVoter;
  if (Auth.session) return Auth.session.user.id;
  return anonId();
}
// 서버가 나를 어느 팬덤으로 집계하는가 (집계에 즉시 반영할 때 서버와 규칙을 맞추기 위해)
// — 비회원은 응원팀을 골랐더라도 서버에는 프로필이 없으므로 '중립'이다.
function myFanTeam() {
  return (Auth.session && Auth.profile && Auth.profile.fav_team) || "";
}

const Cache = {
  tournaments: [], matches: [], records: [], players: [],
  posts: [], details: {}, settings: {}, pom: [], awards: [],
  polls: [], founding: [], profiles: [],
  // 남의 표는 더 이상 브라우저로 내려오지 않는다. 집계(stats)와 내 표(mine)만 온다.
  stats: { pred: [], rating: [], ratingVoters: [], pollChoice: [], pollVoters: [], reaction: [], commentLike: [], fandom: [] },
  mine: { predictions: [], ratings: [], pollVotes: [], reactions: [], commentLikes: [] },
  idx: null,       // stats를 빠르게 찾기 위한 색인 (indexStats가 채운다)
  myVoter: null,   // 서버가 확정한 내 신원
  statsOk: false,  // 집계를 실제로 받았는가 — 못 받은 것을 "0명 참여"로 위장하지 않기 위해
};

// ── 집계 색인 ──
// 서버가 준 집계 배열은 그대로 두고, 화면에서 자주 찾는 형태로 한 번만 색인한다.
function indexStats() {
  const s = Cache.stats;
  const ix = { pred: {}, rating: {}, ratingByPlayer: {}, ratingVoters: {},
               pollChoice: {}, pollVoters: {}, reaction: {}, commentLike: {} };
  (s.pred || []).forEach(r => (ix.pred[r.match_id] = ix.pred[r.match_id] || []).push(r));
  (s.rating || []).forEach(r => {
    const k = r.match_id + "|" + r.player_id;
    (ix.rating[k] = ix.rating[k] || {})[r.bucket] = r;
    if (r.bucket === "all") (ix.ratingByPlayer[r.player_id] = ix.ratingByPlayer[r.player_id] || []).push(r);
  });
  (s.ratingVoters || []).forEach(r => { ix.ratingVoters[r.match_id] = r.n_voters; });
  (s.pollChoice || []).forEach(r => (ix.pollChoice[r.poll_id] = ix.pollChoice[r.poll_id] || []).push(r));
  (s.pollVoters || []).forEach(r => (ix.pollVoters[r.poll_id] = ix.pollVoters[r.poll_id] || []).push(r));
  (s.reaction || []).forEach(r => { (ix.reaction[r.post_id] = ix.reaction[r.post_id] || {})[r.kind] = r.n; });
  (s.commentLike || []).forEach(r => { ix.commentLike[r.comment_id] = r.n; });
  Cache.idx = ix;
}

// 서버가 받았다고 확인해 준 표에서 '미확정' 표시를 뗀다
function clearPending(list, match) {
  const x = (list || []).find(match);
  if (x) delete x._p;
}

// 집계를 못 받았을 때. 조용히 0으로 두면 "아직 아무도 참여 안 함"과 구분되지 않는다.
function statsFailed() {
  Cache.statsOk = false;
  indexStats();
  if (typeof document !== "undefined" && !document.getElementById("nx-statsfail")) {
    const el = document.createElement("div");
    el.id = "nx-statsfail";
    el.className = "nx-toast";
    el.innerHTML = `<span>팬 참여 정보를 불러오지 못했어요. 참여 수치가 실제와 다를 수 있습니다.</span><button type="button">새로고침</button>`;
    el.querySelector("button").addEventListener("click", () => location.reload());
    addEventListener("DOMContentLoaded", () => document.body.appendChild(el));
    if (document.body) document.body.appendChild(el);
  }
}

// 집계 배열에서 조건에 맞는 행을 찾거나 새로 만든다 (내 표를 즉시 반영할 때)
function statRow(arr, match, make) {
  let r = arr.find(match);
  if (!r) { r = make(); arr.push(r); }
  return r;
}

function sbErr(e, what) { if (e) console.error("[supabase]", what, e.message); }

// 쓰기가 서버에서 거부됐을 때 (마감된 경기 예측 등) 사용자에게 이유를 보여 준다.
// 예전에는 콘솔에만 찍혀서, 눌렀는데 저장이 안 된 것을 알 방법이 없었다.
function sbWriteFail(e, what) {
  if (!e) return false;
  sbErr(e, what);
  const msg = (e.message || "").replace(/^.*?:\s*/, "").trim() || "저장하지 못했습니다";
  const el = document.createElement("div");
  el.className = "nx-toast";
  el.innerHTML = `<span></span><button type="button">닫기</button>`;
  el.querySelector("span").textContent = msg;
  el.querySelector("button").addEventListener("click", () => el.remove());
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 6000);
  return true;
}

// 서버에 아직 함수가 없을 때 (SQL 파일 실행 전) 나는 오류인지
function isMissingFunction(e) {
  return !!e && (e.code === "PGRST202" || /function .* does not exist|Could not find the function/i.test(e.message || ""));
}

// ── 로컬 스냅샷 ──────────────────────────────────────────
// 지난 방문에서 받은 데이터를 브라우저에 저장해 두고, 다음 방문에서는 그것을 먼저
// 그려서 화면을 즉시 띄운다. 서버 데이터는 뒤에서 받아 와 달라진 게 있으면 알린다.
// (서버가 서울에 있어 한 번 다녀오는 데만 0.3~1초씩 걸리므로 체감 차이가 크다)
// v2 = 투표 원본 비공개화. v1 스냅샷에는 **다른 사람들의 표가 통째로** 들어 있으므로
// 키를 올려 버리고 옛 것은 지운다 (서버만 고쳐서는 이미 방문한 기기에 계속 남는다).
const SNAP_KEY = "nexus_snap_v2";
const LOGO_KEY = "nexus_logos_v1";
try { localStorage.removeItem("nexus_snap_v1"); } catch (e) {}
let snapshotUsed = false;

function snapshotSave() {
  try {
    const { settings, idx, myVoter, ...rest } = Cache;
    // idx는 다시 만들면 되고, myVoter(신원)는 저장하면 안 된다 —
    // 지난 방문의 신원이 지금 로그인 상태를 이겨 표가 엉뚱한 계정으로 들어간다.
    // 서버가 아직 받았다고 확인해 주지 않은 표(_p)는 스냅샷에 넣지 않는다.
    // 넣으면 저장에 실패한 표가 다음 방문에도 계속 눌린 것처럼 보인다.
    const mine = {};
    Object.entries(rest.mine || {}).forEach(([k, arr]) => { mine[k] = (arr || []).filter(x => !x._p); });
    rest.mine = mine;
    // 로고(데이터 URL, 수십 KB)는 따로 보관해 스냅샷을 가볍게 유지
    const light = {};
    Object.entries(settings).forEach(([k, v]) => { if (!k.startsWith("logo_")) light[k] = v; });
    localStorage.setItem(SNAP_KEY, JSON.stringify({
      t: Date.now(), c: { ...rest, settings: light },
      a: Auth.profile ? { id: Auth.profile.id, nick: Auth.profile.nick, fav_team: Auth.profile.fav_team, is_admin: !!Auth.profile.is_admin } : null,
      s: Auth.session ? { user: { id: Auth.session.user.id, email: Auth.session.user.email } } : null,
    }));
  } catch (e) { /* 용량 초과 등은 무시 — 스냅샷은 있으면 좋은 것 */ }
}

function snapshotLoad() {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    if (!raw) return false;
    const snap = JSON.parse(raw);
    if (!snap || !snap.c || !snap.c.matches) return false;
    Object.assign(Cache, snap.c);
    indexStats();
    // 헤더의 로그인 표시·내 투표 표시가 깜빡이지 않게 (실제 인증은 서버가 다시 확인한다)
    if (snap.a) Auth.profile = snap.a;
    if (snap.s) Auth.session = snap.s;
    const logos = JSON.parse(localStorage.getItem(LOGO_KEY) || "{}");
    Object.assign(Cache.settings, logos);
    return true;
  } catch (e) { return false; }
}

// 로고는 크기가 커서(수십 KB) 첫 화면을 막지 않도록 따로, 나중에 받는다
async function loadLogosLater() {
  const { data } = await sb.from("site_settings").select("key,value").like("key", "logo_%");
  if (!data) return;
  const logos = Object.fromEntries(data.map(x => [x.key, x.value]));
  Object.assign(Cache.settings, logos);
  try { localStorage.setItem(LOGO_KEY, JSON.stringify(logos)); } catch {}
  // 이미 그려진 헤더·파비콘의 로고를 조용히 바꿔 끼운다
  document.querySelectorAll("img.brand-full.light").forEach(i => { i.src = brandLogoURL("desktop-light", "assets/brand/nexus-desktop.png"); });
  document.querySelectorAll("img.brand-full.dark").forEach(i => { i.src = brandLogoURL("desktop-dark", "assets/brand/nexus-desktop-dark.png"); });
  document.querySelectorAll("img.brand-icon").forEach(i => { i.src = brandLogoURL("mobile", "assets/brand/nexus-mobile.png"); });
}

// ── 초기 로드 ──
// 예전에는 (로그인 조회) → (테이블 10개) → (테이블 8개) 순으로 세 번 기다렸다.
// 서버 왕복이 세 번 = 그만큼 흰 화면. 지금은 한 번에 모두 요청한다.
async function fetchAll() {
  const [auth, t, m, r, pl, po, co, fs, de, st,
         pq, ff, pf, pm, aw] = await Promise.all([
    sb.auth.getSession().catch(e => { console.error("[supabase] auth", e); return { data: {} }; }),
    sb.from("tournaments").select("*"),
    sb.from("matches").select("*").order("at"),
    sb.from("stage_records").select("*").order("ord"),
    sb.from("players").select("*"),
    sb.from("posts").select("*").order("created_at", { ascending: false }),
    sb.from("comments").select("*").order("created_at"),
    // 예측·평점·투표·반응·댓글추천은 원본 대신 **집계 + 내 표**만 받는다 (왕복 1회)
    sb.rpc("get_fan_stats", { p_voter: anonId() }),
    sb.from("match_details").select("*").order("set_index"),
    // 로고(logo_*)는 무거워서 제외 — loadLogosLater()가 따로 받는다
    // 로고(무거움)와 수집 캐시(lp_cache_*, 아주 큼)는 방문자에게 내려보내지 않는다
    sb.from("site_settings").select("key,value").not("key", "like", "logo_%").not("key", "like", "lp_cache_%"),
    sb.from("polls").select("*").order("created_at"),
    sb.from("founding_fans").select("*").order("no"),
    sb.from("profiles").select("id,nick,fav_team"),
    sb.from("pom_awards").select("*"),
    sb.from("awards").select("*").order("ord"),
  ]);
  // 응답 전부에 대해 오류를 남긴다 (예전에는 앞 9개만 봐서 조용히 빈 배열이 되는 표가 있었다)
  [t, m, r, pl, po, co, de, st, pq, ff, pf, pm, aw].forEach((res, i) => sbErr(res.error, "load#" + i));

  Auth.session = (auth.data && auth.data.session) || null;
  if (Auth.session) {
    // is_admin은 공개 목록(profiles select)에 넣지 않는다 — 내 것만 따로 확인
    const { data: prof } = await sb.from("profiles").select("*").eq("id", Auth.session.user.id).maybeSingle();
    Auth.profile = prof || null;
  } else {
    Auth.profile = null;
  }

  const prevLogos = {};
  Object.entries(Cache.settings || {}).forEach(([k, v]) => { if (k.startsWith("logo_")) prevLogos[k] = v; });
  Cache.settings = { ...prevLogos, ...Object.fromEntries((st.data || []).map(x => [x.key, x.value])) };

  Cache.pom = pm.data || [];
  Cache.awards = aw.data || [];
  Cache.polls = pq.data || [];
  Cache.founding = ff.data || [];
  Cache.profiles = pf.data || [];

  Cache.tournaments = (t.data || []).map(x => ({ id: x.id, name: x.name, type: x.type, stages: x.stages || [], note: x.note || "" }));
  Cache.matches = (m.data || []).map(x => ({
    id: x.id, tid: x.tid, stage: x.stage, at: x.at, a: x.a, b: x.b, label: x.label || "",
    oddsA: Number(x.odds_a), oddsB: Number(x.odds_b), status: x.status, scoreA: x.score_a, scoreB: x.score_b,
    counted: x.counted,
  }));
  Cache.records = (r.data || []).map(x => ({ id: x.id, name: x.name, ord: x.ord, records: x.records || [], in_total: x.in_total }));
  Cache.players = pl.data || [];

  const commentsByPost = {};
  (co.data || []).forEach(c => {
    (commentsByPost[c.post_id] = commentsByPost[c.post_id] || []).push({
      id: c.id, nick: c.nick, body: c.body, author_team: c.author_team || null, ts: Date.parse(c.created_at),
    });
  });
  Cache.posts = (po.data || []).map(x => ({
    id: x.id, team: x.team, cat: x.cat, title: x.title, body: x.body, nick: x.nick,
    author_team: x.author_team || null, match_id: x.match_id || null,
    up: x.up, views: x.views, ts: Date.parse(x.created_at), comments: commentsByPost[x.id] || [],
  }));

  Cache.details = {};
  (de.data || []).forEach(row => {
    const d = Cache.details[row.match_id] = Cache.details[row.match_id] || { sets: [] };
    d.sets.push({ _idx: row.set_index, win: row.win, players: row.players || [] });
  });

  // 집계는 matches·players·profiles가 채워진 뒤에 (예전 방식 폴백이 그것들을 쓴다)
  await applyFanStats(fs);
}

// ── 집계·내 표 반영 ───────────────────────────────────────
// 서버에 get_fan_stats가 아직 없으면(= schema12를 실행하기 전) 예전처럼 원본을 읽어
// **같은 모양**으로 만들어 둔다. 화면 코드는 어느 쪽인지 알 필요가 없다.
async function applyFanStats(res) {
  if (res && !res.error && res.data) {
    const d = res.data;
    Cache.stats = {
      pred: d.pred || [], rating: d.rating || [], ratingVoters: d.ratingVoters || [],
      pollChoice: d.pollChoice || [], pollVoters: d.pollVoters || [],
      reaction: d.reaction || [], commentLike: d.commentLike || [], fandom: d.fandom || [],
    };
    const mine = d.mine || {};
    Cache.mine = keepMyPending({
      predictions: mine.predictions || [], ratings: mine.ratings || [],
      pollVotes: mine.pollVotes || [], reactions: mine.reactions || [],
      commentLikes: mine.commentLikes || [],
    });
    Cache.myVoter = d.voter || null;
    Cache.statsOk = true;
    indexStats();
    return;
  }
  if (res && res.error && !isMissingFunction(res.error)) {
    sbErr(res.error, "get_fan_stats");
    statsFailed();
    return;
  }
  await legacyFanStats();     // schema12 실행 전 — 예전 경로
}

// 방금 누른 내 표가 서버 응답보다 늦게 도착할 수 있다(요청이 클릭보다 먼저 나감).
// **아직 서버 확인을 못 받은 표(_p)만** 살려 둔다. 확정된 옛 표까지 되살리면
// 서버에서 지워진 표나 로그아웃 전 표가 영영 내 표로 남는다.
function keepMyPending(fresh) {
  const keep = (f, m, key) => {
    const has = new Set((f || []).map(key));
    return (f || []).concat((m || []).filter(x => x._p && !has.has(key(x))));
  };
  const old = Cache.mine || {};
  return {
    predictions: keep(fresh.predictions, old.predictions, x => x.match_id),
    ratings: keep(fresh.ratings, old.ratings, x => x.match_id + "|" + x.player_id),
    pollVotes: keep(fresh.pollVotes, old.pollVotes, x => x.poll_id),
    reactions: keep(fresh.reactions, old.reactions, x => x.post_id + "|" + x.kind),
    commentLikes: keep(fresh.commentLikes, old.commentLikes, x => String(x.comment_id)),
  };
}

// schema12 실행 전에도 사이트가 그대로 돌아가도록 하는 예전 경로.
// SQL을 실행하고 나면 원본 권한이 없어 여기로 오지 않는다.
async function legacyFanStats() {
  const me = voterId();
  const [pr, ra, pv, rx, cl] = await Promise.all([
    sb.from("predictions").select("*"), sb.from("ratings").select("*"),
    sb.from("poll_votes").select("*"), sb.from("reactions").select("*"),
    sb.from("comment_likes").select("*"),
  ]);
  if (pr.error) { sbErr(pr.error, "legacy stats"); statsFailed(); return; }
  const favOf = {};
  Cache.profiles.forEach(p => { favOf[p.id] = p.fav_team || null; });
  const M = {}; Cache.matches.forEach(m => { M[m.id] = m; });
  const P = {}; Cache.players.forEach(p => { P[p.id] = p; });

  const pred = [], rating = [], ratingVoters = [], pollChoice = [], pollVoters = [],
        reaction = [], commentLike = [], fandom = [];
  (pr.data || []).forEach(p => {
    statRow(pred, x => x.match_id === p.match_id, () => ({ match_id: p.match_id, a: 0, b: 0 }))[p.side]++;
  });
  const votersByMatch = {};
  (ra.data || []).forEach(r => {
    const pl = P[r.player_id], m = M[r.match_id];
    if (!pl || !m) return;
    const fav = favOf[r.voter] || null;
    const opp = pl.team === m.a ? m.b : pl.team === m.b ? m.a : null;
    const bucket = fav == null ? "neu" : fav === pl.team ? "own" : (opp && fav === opp) ? "opp" : "neu";
    [bucket, "all"].forEach(b => {
      const row = statRow(rating, x => x.match_id === r.match_id && x.player_id === r.player_id && x.bucket === b,
        () => ({ match_id: r.match_id, player_id: r.player_id, bucket: b, n: 0, total: 0 }));
      row.n++; row.total += r.score;
    });
    (votersByMatch[r.match_id] = votersByMatch[r.match_id] || new Set()).add(r.voter);
  });
  Object.keys(votersByMatch).forEach(mid => ratingVoters.push({ match_id: mid, n_voters: votersByMatch[mid].size }));
  (pv.data || []).forEach(v => {
    const ft = v.fav_team || favOf[v.voter] || "";
    statRow(pollVoters, x => x.poll_id === v.poll_id && x.fan_team === ft,
      () => ({ poll_id: v.poll_id, fan_team: ft, n: 0 })).n++;
    (Array.isArray(v.choices) ? v.choices : []).forEach(c => {
      if (typeof c !== "number") return;
      statRow(pollChoice, x => x.poll_id === v.poll_id && x.fan_team === ft && x.choice_idx === c,
        () => ({ poll_id: v.poll_id, fan_team: ft, choice_idx: c, n: 0 })).n++;
    });
  });
  (rx.data || []).forEach(r =>
    statRow(reaction, x => x.post_id === r.post_id && x.kind === r.kind,
      () => ({ post_id: r.post_id, kind: r.kind, n: 0 })).n++);
  (cl.data || []).forEach(l =>
    statRow(commentLike, x => String(x.comment_id) === String(l.comment_id),
      () => ({ comment_id: l.comment_id, n: 0 })).n++);
  (pr.data || []).forEach(p => {
    const team = favOf[p.voter]; if (!team) return;
    const w = matchWinner(M[p.match_id]); if (!w) return;
    const t = statRow(fandom, x => x.team === team, () => ({ team, n: 0, hits: 0 }));
    t.n++; if (p.side === w) t.hits++;
  });

  Cache.stats = { pred, rating, ratingVoters, pollChoice, pollVoters, reaction, commentLike, fandom };
  Cache.mine = keepMyPending({
    predictions: (pr.data || []).filter(x => x.voter === me).map(x => ({ match_id: x.match_id, side: x.side })),
    ratings: (ra.data || []).filter(x => x.voter === me).map(x => ({ match_id: x.match_id, player_id: x.player_id, score: x.score })),
    pollVotes: (pv.data || []).filter(x => x.voter === me).map(x => ({ poll_id: x.poll_id, choices: x.choices })),
    reactions: (rx.data || []).filter(x => x.voter === me).map(x => ({ post_id: x.post_id, kind: x.kind })),
    commentLikes: (cl.data || []).filter(x => x.voter === me).map(x => ({ comment_id: x.comment_id })),
  });
  Cache.myVoter = me;
  Cache.statsOk = true;
  indexStats();
}

// "새로고침하면 볼 게 있는가"를 판단하는 요약값.
// 조회수·득표수처럼 수시로 바뀌는 값은 일부러 제외한다 (그러지 않으면 들어올 때마다 알림이 뜬다)
function cacheFingerprint() {
  try {
    return [
      Cache.matches.map(m => `${m.id}${m.status}${m.scoreA}${m.scoreB}${m.at}`).join(","),
      Cache.posts.length, Cache.posts[0] ? Cache.posts[0].id : "-",
      Cache.posts.reduce((n, p) => n + p.comments.length, 0),
      Object.keys(Cache.details).length,
      Cache.players.length, Cache.polls.length, Cache.awards.length,
      Cache.pom.length, Cache.records.length,
      // 설정값(중계 링크 등)도 바뀌면 알림 — 로고는 용량만 크고 내용이 자주 바뀌지 않아 제외
      Object.entries(Cache.settings || {}).filter(([k]) => !k.startsWith("logo_"))
        .map(([k, v]) => k + "=" + String(v).length).sort().join(","),
      Auth.session ? "in" : "out",
    ].join("|");
  } catch { return ""; }
}

// 새 데이터가 있다는 안내 (화면을 마음대로 새로 그리면 쓰던 내용이 날아가므로 알림만)
function showRefreshToast() {
  if (document.getElementById("nx-refresh")) return;
  const el = document.createElement("div");
  el.id = "nx-refresh";
  el.className = "nx-toast";
  el.innerHTML = `<span>새로운 소식이 있어요</span><button type="button">새로고침</button>`;
  el.querySelector("button").addEventListener("click", () => location.reload());
  document.body.appendChild(el);
}

// ── 대회 ──
function getTournaments() { return Cache.tournaments; }
function addTournament(t) {
  Cache.tournaments.push(t);
  sb.from("tournaments").insert({ id: t.id, name: t.name, type: t.type, stages: t.stages, note: t.note }).then(r => sbErr(r.error, "addTournament"));
}
function deleteTournament(id) {
  Cache.tournaments = Cache.tournaments.filter(t => t.id !== id);
  Cache.matches = Cache.matches.filter(m => m.tid !== id);
  sb.from("tournaments").delete().eq("id", id).then(r => sbErr(r.error, "deleteTournament"));
}

// ── 경기 ──
function getMatches() { return Cache.matches; }
function matchToDb(m) {
  const out = {};
  const map = { id: "id", tid: "tid", stage: "stage", at: "at", a: "a", b: "b", label: "label",
    oddsA: "odds_a", oddsB: "odds_b", status: "status", scoreA: "score_a", scoreB: "score_b" };
  Object.keys(m).forEach(k => { if (map[k] !== undefined) out[map[k]] = m[k]; });
  return out;
}
function addMatch(m) {
  Cache.matches.push(m);
  Cache.matches.sort((x, y) => new Date(x.at) - new Date(y.at));
  sb.from("matches").insert(matchToDb(m)).then(r => sbErr(r.error, "addMatch"));
}
function updateMatch(id, patch) {
  Cache.matches = Cache.matches.map(m => m.id === id ? { ...m, ...patch } : m);
  sb.from("matches").update(matchToDb(patch)).eq("id", id).then(r => sbErr(r.error, "updateMatch"));
}
function deleteMatch(id) {
  Cache.matches = Cache.matches.filter(m => m.id !== id);
  sb.from("matches").delete().eq("id", id).then(r => sbErr(r.error, "deleteMatch"));
}
function sortedMatches() {
  return Cache.matches.slice().sort((x, y) => new Date(x.at) - new Date(y.at));
}
function liveMatch() { return sortedMatches().find(m => m.status === "live"); }
function nextMatch() {
  const now = Date.now();
  return sortedMatches().find(m => m.status === "upcoming" && new Date(m.at) > now)
    || sortedMatches().find(m => m.status === "upcoming");
}

// ── 시즌 스테이지 전적 · 순위 ──
function getStageRecords() { return Cache.records; }
function saveStageRecords(list) {
  Cache.records = list;
  const rows = list.map(s => {
    const row = { id: s.id, name: s.name, ord: s.ord ?? 0, records: s.records };
    if (s.in_total !== undefined) row.in_total = s.in_total; // 컬럼 추가 SQL 실행 전 호환
    return row;
  });
  sb.from("stage_records").upsert(rows).then(r => sbErr(r.error, "saveStageRecords"));
}
// 이 스테이지가 종합(누적) 순위에 합산되는가 (기본: Road To MSI만 제외)
function stageInTotal(s) { return s.in_total ?? (s.id !== "rtm"); }

// 종료된 경기 결과를 순위 전적에 반영 (경기당 1회 — counted 플래그로 이중 반영 방지)
function applyMatchToRecords(matchId) {
  const m = Cache.matches.find(x => x.id === matchId);
  if (!m) return { ok: false, reason: "경기를 찾을 수 없음" };
  if (m.counted) return { ok: false, reason: "이미 순위에 반영된 경기" };
  if (m.status !== "done" || m.scoreA == null || m.scoreB == null)
    return { ok: false, reason: "종료 상태 + 스코어 입력 후 반영할 수 있음" };
  if (!TEAM_MAP[m.a] || !TEAM_MAP[m.b]) return { ok: false, reason: "미정 팀은 반영 불가" };
  const stage = Cache.records.find(s => s.name === m.stage);
  if (!stage) return { ok: false, reason: `순위 전적 관리에 "${m.stage}" 스테이지가 없음 (스테이지 추가 후 반영)` };

  const rec = t => {
    let r = stage.records.find(x => x.team === t);
    if (!r) { r = { team: t, w: 0, l: 0, sw: 0, sl: 0 }; stage.records.push(r); }
    return r;
  };
  const A = rec(m.a), B = rec(m.b);
  const aWin = m.scoreA > m.scoreB;
  (aWin ? A : B).w++; (aWin ? B : A).l++;
  A.sw += m.scoreA; A.sl += m.scoreB;
  B.sw += m.scoreB; B.sl += m.scoreA;
  m.counted = true;
  saveStageRecords(Cache.records);
  sb.from("matches").update({ counted: true }).eq("id", m.id).then(r => sbErr(r.error, "markCounted"));
  return { ok: true };
}
function stageStandings(stageId) {
  const s = Cache.records.find(x => x.id === stageId);
  if (!s) return [];
  return s.records.slice().map(r => ({ ...r, pt: r.sw - r.sl })).sort((a, b) => b.w - a.w || b.pt - a.pt);
}
function cumulativeStandings() {
  const acc = {};
  Cache.records.filter(stageInTotal).forEach(s => s.records.forEach(r => {
    const t = acc[r.team] = acc[r.team] || { team: r.team, w: 0, l: 0, sw: 0, sl: 0 };
    t.w += r.w; t.l += r.l; t.sw += r.sw; t.sl += r.sl;
  }));
  return Object.values(acc).map(r => ({ ...r, pt: r.sw - r.sl })).sort((a, b) => b.w - a.w || b.pt - a.pt);
}
function cumulativeRankOf(teamId) {
  const rows = cumulativeStandings();
  const i = rows.findIndex(r => r.team === teamId);
  return i < 0 ? null : { rank: i + 1, ...rows[i] };
}

// ── 선수 ──
function getPlayers() { return Cache.players; }
function getPlayer(id) { return Cache.players.find(p => p.id === id); }
function teamPlayers(teamId) {
  const order = { "탑": 0, "정글": 1, "미드": 2, "원딜": 3, "서폿": 4 };
  return Cache.players.filter(p => p.team === teamId)
    .sort((a, b) => (order[a.pos] ?? 9) - (order[b.pos] ?? 9));
}
function addPlayer(p) {
  Cache.players.push(p);
  sb.from("players").insert(p).then(r => sbErr(r.error, "addPlayer"));
}
function deletePlayer(id) {
  Cache.players = Cache.players.filter(p => p.id !== id);
  sb.from("players").delete().eq("id", id).then(r => sbErr(r.error, "deletePlayer"));
}

// ── 게시글 ──
function getPosts() { return Cache.posts; }
function getPost(id) { return Cache.posts.find(p => p.id === id); }
// 글쓰기 — 서버 함수(create_post)로 보낸다. 비회원은 pw(4자 이상)가 필수이며
// 비밀번호는 아무도 못 읽는 별도 표에 해시로만 저장된다 (수정·삭제할 때 확인용).
function addPost(p, pw) {
  // 닉네임은 서버가 정한다 — 여기 값은 저장될 때까지 잠깐 보여 줄 임시 표시
  p.nick = Auth.profile ? Auth.profile.nick : "익명";
  p.author_team = Auth.profile?.fav_team || null;
  p.id = "p" + Date.now();
  p.ts = Date.now(); p.views = 0; p.up = 0; p.comments = [];
  Cache.posts.unshift(p);
  // 저장 완료를 기다려야 하는 호출자를 위해 프로미스를 노출
  addPost.lastSave = sb.rpc("create_post", {
    p_id: p.id, p_team: p.team || null, p_cat: p.cat, p_title: p.title, p_body: p.body,
    p_nick: p.nick, p_match_id: p.match_id || null, p_pw: pw || null,
  }).then(r => {
    // 비회원 닉네임은 서버가 정한다 (유동닉) — 받아서 화면에 반영
    if (!r.error && r.data && r.data.nick) p.nick = r.data.nick;
    // 서버에 함수가 아직 없으면(SQL 미적용) 예전 방식으로 저장해 글쓰기가 막히지 않게 한다
    if (r.error && isMissingFunction(r.error)) {
      console.warn("[store] create_post 함수 없음 — 예전 방식으로 저장 (schema11_post_edit.sql 실행 필요)");
      return sb.from("posts").insert({
        id: p.id, team: p.team, cat: p.cat, title: p.title, body: p.body, nick: p.nick,
        author_team: p.author_team, match_id: p.match_id || null,
      });
    }
    sbErr(r.error, "addPost");
    return r;
  });
  return p.id;
}

// 글 수정 (비회원은 비밀번호, 회원은 본인 글, 관리자는 전부)
function editPost(id, pw, title, body) {
  return sb.rpc("update_post", { p_id: id, p_pw: pw || null, p_title: title, p_body: body })
    .then(r => {
      sbErr(r.error, "editPost");
      if (!r.error) {
        const p = Cache.posts.find(x => x.id === id);
        if (p) { p.title = title; p.body = body; }
      }
      return r;
    });
}

// 글 삭제 (같은 규칙)
function removePost(id, pw) {
  return sb.rpc("delete_post", { p_id: id, p_pw: pw || null }).then(r => {
    sbErr(r.error, "removePost");
    if (!r.error) Cache.posts = Cache.posts.filter(x => x.id !== id);
    return r;
  });
}
function postsForMatch(matchId) {
  return Cache.posts.filter(p => p.match_id === matchId);
}
function updatePost(id, patch) {
  // 조회수·추천은 서버 함수로만 증가 (임의 조작 방지)
  Cache.posts = Cache.posts.map(p => p.id === id ? { ...p, ...patch } : p);
  if (patch.views != null) sb.rpc("inc_views", { pid: id }).then(r => sbErr(r.error, "inc_views"));
  if (patch.up != null) sb.rpc("upvote_post", { pid: id }).then(r => sbErr(r.error, "upvote_post"));
}
function deletePost(id) {
  Cache.posts = Cache.posts.filter(p => p.id !== id);
  sb.from("posts").delete().eq("id", id).then(r => sbErr(r.error, "deletePost"));
}
function addComment(postId, nick, body, pw) {
  nick = Auth.profile ? Auth.profile.nick : "익명"; // 서버가 정한 닉네임으로 곧 교체됨
  const author_team = Auth.profile?.fav_team || null;
  const p = Cache.posts.find(x => x.id === postId);
  const optimistic = { nick, body, author_team, ts: Date.now() };
  if (p) p.comments.push(optimistic);
  // 저장 결과를 호출자가 확인할 수 있게 프로미스를 돌려준다
  return sb.rpc("create_comment", { p_post_id: postId, p_nick: nick, p_body: body, p_pw: pw || null })
    .then(r => {
      if (r.error && isMissingFunction(r.error)) { // SQL 미적용 시 예전 방식
        console.warn("[store] create_comment 함수 없음 — 예전 방식으로 저장");
        return sb.from("comments").insert({ post_id: postId, nick, body, author_team })
          .select().single().then(r2 => ({ error: r2.error, data: r2.data && r2.data.id }));
      }
      return r;
    })
    .then(r => {
      sbErr(r.error, "addComment");
      if (r.error) {
        // 서버가 거부하면 화면에서도 되돌린다 (저장된 것처럼 남지 않게)
        if (p) p.comments = p.comments.filter(c => c !== optimistic);
        return { error: r.error };
      }
      if (r.data) { // 서버가 매긴 댓글 id + 비회원 유동닉
        if (optimistic.id == null) optimistic.id = r.data.id ?? r.data;
        if (r.data.nick) optimistic.nick = r.data.nick;
      }
      return { data: r.data };
    });
}

// 댓글 삭제 (비회원은 비밀번호, 회원은 본인 댓글, 관리자는 전부)
function removeComment(commentId, pw) {
  return sb.rpc("delete_comment", { p_id: commentId, p_pw: pw || null }).then(r => {
    sbErr(r.error, "removeComment");
    if (!r.error) {
      Cache.posts.forEach(p => { p.comments = p.comments.filter(c => c.id !== commentId); });
    }
    return r;
  });
}

// ── 승부예측 ──
function getVotes() {
  const out = {};
  Cache.mine.predictions.forEach(p => { out[p.match_id] = p.side; });
  return out;
}
function setVote(matchId, side) {
  const prev = Cache.mine.predictions.find(p => p.match_id === matchId);
  const before = prev ? prev.side : null;            // 되돌릴 때 쓸 예전 선택
  if (before === side) return;
  // 집계에도 바로 반영 (예전 선택에서 1 빼고 새 선택에 1 더한다)
  const row = statRow(Cache.stats.pred, x => x.match_id === matchId,
    () => ({ match_id: matchId, a: 0, b: 0 }));
  if (before) row[before] = Math.max(0, row[before] - 1);
  row[side]++;
  if (prev) { prev.side = side; prev._p = 1; }
  else Cache.mine.predictions.push({ match_id: matchId, side, _p: 1 });
  indexStats();
  sb.rpc("vote_match", { p_match_id: matchId, p_voter: anonId(), p_side: side }).then(r => {
    if (isMissingFunction(r.error))
      return sb.from("predictions").upsert({ match_id: matchId, voter: voterId(), side })
        .then(x => { sbErr(x.error, "setVote(legacy)"); if (!x.error) clearPending(Cache.mine.predictions, p => p.match_id === matchId); });
    if (sbWriteFail(r.error, "setVote")) {           // 거부되면 화면도 원래대로 되돌린다
      row[side] = Math.max(0, row[side] - 1);
      if (before) { row[before]++; if (prev) { prev.side = before; delete prev._p; } }
      else Cache.mine.predictions = Cache.mine.predictions.filter(p => p.match_id !== matchId);
      indexStats();
    } else {
      const cur = Cache.mine.predictions.find(p => p.match_id === matchId);
      if (cur) delete cur._p;                        // 서버가 받았다 — 확정
      if (r.data) Cache.myVoter = r.data;
    }
  });
}
// 아직 예측할 수 있는 경기인가 — 서버(vote_match)와 **같은 규칙**이어야 한다.
// 승부예측 화면이 "마감: 경기 시작 5분 전"이라고 안내하므로 그대로 지킨다.
function predictOpen(m) {
  if (!m || m.status === "done") return false;
  if (!m.at) return true;
  return Date.now() < new Date(m.at).getTime() - 5 * 60 * 1000;
}

// 실제 참여자 비율 (없으면 배당 기반 추정으로 폴백)
function communityPct(m) {
  const rows = (Cache.idx && Cache.idx.pred[m.id]) || [];
  const a = rows.reduce((s, r) => s + r.a, 0), b = rows.reduce((s, r) => s + r.b, 0);
  const total = a + b;
  if (total) {
    const pa = Math.round((a / total) * 1000) / 10;
    return { a: pa, b: Math.round((100 - pa) * 10) / 10, n: total };
  }
  const ia = 1 / (m.oddsA || 2), ib = 1 / (m.oddsB || 2);
  const pa = Math.round((ia / (ia + ib)) * 1000) / 10;
  return { a: pa, b: Math.round((100 - pa) * 10) / 10, n: 0 };
}
function myPredictionStats() {
  const votes = getVotes();
  let total = 0, hit = 0;
  Cache.matches.forEach(m => {
    const winner = matchWinner(m);
    if (winner && votes[m.id]) {
      total++;
      if (votes[m.id] === winner) hit++;
    }
  });
  const pending = Object.keys(votes).length - total;
  return { total, hit, pending, points: hit * 10 };
}

// ── 선수 평점 ──
function getRatings() {
  const out = {};
  Cache.mine.ratings.forEach(r => (out[r.match_id] = out[r.match_id] || {})[r.player_id] = r.score);
  return out;
}
// 내가 이 평점에서 어느 팬덤 칸에 들어가는가 (서버 규칙과 같아야 한다)
function myRatingBucket(matchId, playerId) {
  const fav = myFanTeam();
  if (!fav) return "neu";
  const pl = getPlayer(playerId), m = Cache.matches.find(x => x.id === matchId);
  if (!pl || !m) return "neu";
  if (fav === pl.team) return "own";
  const opp = pl.team === m.a ? m.b : pl.team === m.b ? m.a : null;
  return opp && fav === opp ? "opp" : "neu";
}
function setRating(matchId, playerId, score) {
  const prev = Cache.mine.ratings.find(r => r.match_id === matchId && r.player_id === playerId);
  const before = prev ? prev.score : null;
  if (before === score) return;
  // 처음 매길 때 쓴 칸을 기억해 둔다. 도중에 응원팀을 바꿔도 같은 칸에서 고쳐야
  // 한 사람이 두 칸에 세어지지 않는다.
  const bucket = (prev && prev.b) || myRatingBucket(matchId, playerId);
  const rows = [bucket, "all"].map(b => statRow(Cache.stats.rating,
    x => x.match_id === matchId && x.player_id === playerId && x.bucket === b,
    () => ({ match_id: matchId, player_id: playerId, bucket: b, n: 0, total: 0 })));
  rows.forEach(r => { if (before == null) r.n++; r.total += score - (before || 0); });
  if (before == null) {
    const v = statRow(Cache.stats.ratingVoters, x => x.match_id === matchId,
      () => ({ match_id: matchId, n_voters: 0 }));
    // 이 경기에 내가 처음 평점을 매길 때만 인원이 는다
    if (!Cache.mine.ratings.some(r => r.match_id === matchId)) v.n_voters++;
  }
  if (prev) { prev.score = score; prev._p = 1; }
  else Cache.mine.ratings.push({ match_id: matchId, player_id: playerId, score, b: bucket, _p: 1 });
  indexStats();
  sb.rpc("rate_player", { p_match_id: matchId, p_player_id: playerId, p_voter: anonId(), p_score: score })
    .then(r => {
      if (isMissingFunction(r.error))
        return sb.from("ratings").upsert({ match_id: matchId, player_id: playerId, voter: voterId(), score })
          .then(x => { sbErr(x.error, "setRating(legacy)"); if (!x.error) clearPending(Cache.mine.ratings, y => y.match_id === matchId && y.player_id === playerId); });
      if (sbWriteFail(r.error, "setRating")) {
        rows.forEach(x => { if (before == null) x.n = Math.max(0, x.n - 1); x.total -= score - (before || 0); });
        if (before == null) Cache.mine.ratings = Cache.mine.ratings.filter(x => !(x.match_id === matchId && x.player_id === playerId));
        else if (prev) { prev.score = before; delete prev._p; }
        // 이 경기 첫 평점이었다면 늘려 둔 참여 인원도 되돌린다
        if (before == null && !Cache.mine.ratings.some(x => x.match_id === matchId)) {
          const v = Cache.stats.ratingVoters.find(x => x.match_id === matchId);
          if (v) v.n_voters = Math.max(0, v.n_voters - 1);
        }
        indexStats();
      } else {
        const cur = Cache.mine.ratings.find(x => x.match_id === matchId && x.player_id === playerId);
        if (cur) delete cur._p;
        if (r.data) Cache.myVoter = r.data;
      }
    });
}
function myRatingsForPlayer(playerId) {
  return Cache.mine.ratings.filter(r => r.player_id === playerId)
    .map(r => ({ matchId: r.match_id, score: r.score }));
}
// 팬심 평점: 한 경기·한 선수의 평점을 아군 팬·상대 팬·중립으로 나눠 평균
// (팬덤 판별은 서버가 profiles.fav_team으로 한다. 비회원은 중립)
function fanSplitForPlayer(playerId, matchId) {
  const g = (Cache.idx && Cache.idx.rating[matchId + "|" + playerId]) || {};
  const stat = k => g[k] && g[k].n ? { avg: Math.round(g[k].total / g[k].n * 10) / 10, n: g[k].n } : null;
  return { all: stat("all"), home: stat("own"), opp: stat("opp"), neu: stat("neu") };
}
// 이 경기에 평점을 매긴 인원 (중복 제외). 선수별 인원을 더하면 한 사람이 10명을
// 평가했을 때 10명으로 세어지므로, 서버가 따로 세어 준 값을 쓴다.
function matchRatingVoters(matchId) {
  return (Cache.idx && Cache.idx.ratingVoters[matchId]) || 0;
}

// 경기에 실제 출전한 선수 id 집합 (경기 상세 기록 기준 · 기록 없으면 빈 집합)
// 챔피언 칸이 비어 있는 행은 "명단에만 있고 출전 안 함"으로 보고 제외한다.
function playedPidsForMatch(matchId) {
  const det = Cache.details[matchId];
  const played = new Set();
  ((det && det.sets) || []).forEach(s => (s.players || []).forEach(p => {
    if (p.pid && (p.champ || "").trim()) played.add(p.pid);
  }));
  return played;
}
// 팬심 평점 표: 포지션별로 양 팀 선수를 짝지어 행 구성 (좌우 미러 배치용)
function fanRatingRows(match) {
  const posOrder = ["탑", "정글", "미드", "원딜", "서폿"];
  const played = playedPidsForMatch(match.id);
  const side = teamId => {
    let ps = teamPlayers(teamId);
    if (played.size) ps = ps.filter(p => played.has(p.id));
    return ps.map(p => ({ p, s: fanSplitForPlayer(p.id, match.id) }));
  };
  const A = side(match.a), B = side(match.b);
  const rows = [], used = new Set();
  posOrder.forEach(pos => {
    const as = A.filter(x => x.p.pos === pos), bs = B.filter(x => x.p.pos === pos);
    for (let i = 0; i < Math.max(as.length, bs.length); i++) {
      rows.push({ pos, a: as[i] || null, b: bs[i] || null });
      if (as[i]) used.add(as[i].p.id);
      if (bs[i]) used.add(bs[i].p.id);
    }
  });
  // 표준 포지션 표기가 아닌 선수 안전망
  A.filter(x => !used.has(x.p.id)).forEach(x => rows.push({ pos: x.p.pos, a: x, b: null }));
  B.filter(x => !used.has(x.p.id)).forEach(x => rows.push({ pos: x.p.pos, a: null, b: x }));
  return rows;
}

// 경기 POG: 전체 평균 1위 선수 (동률이면 참여자 많은 쪽 · 출전 기록이 있으면 출전 선수만)
// 완전 동률일 때는 선수 id 순으로 확정한다 — 그러지 않으면 DB가 행을 돌려주는 순서에 따라
// 새로고침할 때마다 MVP가 바뀐다 (실제로 10.0점 6명 동률인 경기가 있었다).
function pogForMatch(matchId) {
  const played = playedPidsForMatch(matchId);
  let best = null;
  (Cache.stats.rating || []).forEach(r => {
    if (r.match_id !== matchId || r.bucket !== "all" || !r.n) return;
    if (played.size && !played.has(r.player_id)) return;
    const avg = r.total / r.n;
    const tie = best && Math.abs(avg - best.exact) < 1e-9;
    if (!best || avg > best.exact + 1e-9 || (tie && r.n > best.n) ||
        (tie && r.n === best.n && r.player_id < best.pid))
      best = { pid: r.player_id, avg: Math.round(avg * 10) / 10, n: r.n, exact: avg };
  });
  return best;
}

// ── POM (Player of the Match) 포인트 ──
// LCK 공식 제도: 경기마다 MVP 1명에게 100pt. 우리 사이트의 "팬 선정 POG"와 별개.
function pomForMatch(matchId) {
  return Cache.pom.find(x => x.match_id === matchId) || null;
}
function pomPointsFor(playerId) {
  return Cache.pom.filter(x => x.player_id === playerId).reduce((s, x) => s + (x.pts || 0), 0);
}
// 누적 순위 (동점은 공동 순위)
function pomRanking() {
  const by = {};
  Cache.pom.forEach(x => { by[x.player_id] = (by[x.player_id] || 0) + (x.pts || 0); });
  const list = Object.keys(by)
    .map(pid => ({ pid, player: getPlayer(pid), pts: by[pid] }))
    .filter(x => x.player)
    .sort((a, b) => b.pts - a.pts || a.player.nick.localeCompare(b.player.nick));
  let rank = 0, prev = null;
  list.forEach((x, i) => { if (x.pts !== prev) { rank = i + 1; prev = x.pts; } x.rank = rank; });
  return list;
}
function setPOM(matchId, playerId) {
  const cur = pomForMatch(matchId);
  if (cur) {
    if (!playerId) {                       // 지정 해제
      Cache.pom = Cache.pom.filter(x => x !== cur);
      sb.from("pom_awards").delete().eq("match_id", matchId).then(r => sbErr(r.error, "setPOM.del"));
      return;
    }
    cur.player_id = playerId;
    sb.from("pom_awards").update({ player_id: playerId }).eq("match_id", matchId)
      .then(r => sbErr(r.error, "setPOM.upd"));
    return;
  }
  if (!playerId) return;
  Cache.pom.push({ match_id: matchId, player_id: playerId, pts: 100, label: "" });
  sb.from("pom_awards").insert({ match_id: matchId, player_id: playerId, pts: 100 })
    .then(r => sbErr(r.error, "setPOM.ins"));
}

// ── 시즌 수상 (정규시즌 MVP · ALL-LCK · 감독상 · 신인상 · 세레모니 · 펜타킬) ──
function awardsByCat(cat) {
  return Cache.awards.filter(a => a.cat === cat).sort((a, b) => a.ord - b.ord);
}
function addAward(a) {
  Cache.awards.push(a);
  // 저장 결과(서버가 매긴 id 포함)를 호출자가 기다릴 수 있게 프로미스를 돌려준다
  return sb.from("awards").insert(a).select().then(r => {
    sbErr(r.error, "addAward");
    if (r.error) {
      Cache.awards = Cache.awards.filter(x => x !== a); // 거부되면 화면에서도 되돌린다
      return { error: r.error };
    }
    if (r.data && r.data[0]) Object.assign(a, r.data[0]);
    return { data: a };
  });
}
function deleteAward(id) {
  Cache.awards = Cache.awards.filter(a => a.id !== id);
  sb.from("awards").delete().eq("id", id).then(r => sbErr(r.error, "deleteAward"));
}

// ── 응원팀 (팬 개인화의 축) ───────────────────────────────
// 회원은 프로필의 응원팀, 비회원은 이 브라우저에 저장한 선택을 쓴다.
//   반환: 팀 id("dk") | ""(중립을 명시적으로 선택) | null(아직 안 물어봄)
function getFavTeam() {
  if (Auth.profile && Auth.profile.fav_team) return Auth.profile.fav_team;
  const v = localStorage.getItem("nexus_fav_team");
  if (v === null) return null;
  return v; // "" = 중립
}
function setFavTeamLocal(teamId) {
  localStorage.setItem("nexus_fav_team", teamId || "");
}
// 회원은 프로필에도 저장해야 실제로 바뀐다 (getFavTeam이 프로필을 우선하므로)
function setFavTeam(teamId) {
  setFavTeamLocal(teamId);
  if (Auth.profile) {
    Auth.profile.fav_team = teamId || null;
    sb.from("profiles").update({ fav_team: teamId || null })
      .eq("id", Auth.profile.id).then(r => sbErr(r.error, "setFavTeam"));
  }
}

// ── 팬 여권: 내 시즌 기록 집계 ─────────────────────────────
// 예측·평점·투표를 한 사람(voterId) 기준으로 모은다. 회원은 계정 기준이라
// 기기가 바뀌어도 이어지고, 비회원은 이 브라우저에서의 기록이다.
// 승자 판정을 한 곳으로 — 스코어가 덜 채워졌거나 동점이면 "채점 불가"(null)
// (관리자가 status=done으로 두고 한쪽 스코어만 넣거나 1:1을 남겨둘 수 있다)
function matchWinner(m) {
  if (!m || m.status !== "done") return null;
  if (m.scoreA == null || m.scoreB == null) return null;
  if (m.scoreA === m.scoreB) return null;        // 동점 = LCK엔 없지만 입력 실수로 가능
  return m.scoreA > m.scoreB ? "a" : "b";
}

// 내가 참여한 경기 id 집합 (예측·평점·투표 어느 것이든)
function myParticipation() {
  const ids = new Set();
  Cache.mine.predictions.forEach(p => ids.add(p.match_id));
  Cache.mine.ratings.forEach(r => ids.add(r.match_id));
  Cache.mine.pollVotes.forEach(v => {
    const poll = Cache.polls.find(p => p.id === v.poll_id);
    if (poll && poll.match_id) ids.add(poll.match_id);
  });
  return ids;
}

function myFanRecord() {
  const me = voterId();
  const doneMatches = sortedMatches().filter(m => m.status === "done" && knownTeams(m));
  const participated = myParticipation();

  // 승부예측 성적 (끝난 경기만 채점)
  const myPreds = Cache.mine.predictions;
  let predDone = 0, predHits = 0;
  const history = [];
  doneMatches.forEach(m => {
    const p = myPreds.find(x => x.match_id === m.id);
    const winner = matchWinner(m);
    if (!p || !winner) return;
    const hit = p.side === winner;
    predDone++; if (hit) predHits++;
    history.push({ match: m, side: p.side, hit });
  });

  // 스코어 적중 (경기 전 "결과는?" 투표 — 보기 형식: "DK 2:0 승")
  let scoreTried = 0, scoreHits = 0;
  Cache.polls.filter(p => p.phase === "pre" && p.match_id).forEach(poll => {
    const v = Cache.mine.pollVotes.find(x => x.poll_id === poll.id);
    const m = Cache.matches.find(x => x.id === poll.match_id);
    if (!v || !matchWinner(m)) return;             // 채점 가능한 경기만
    const idx = (v.choices || [])[0];
    const picked = (poll.options || [])[idx];
    if (picked == null) return;
    scoreTried++;
    const A = TEAM_MAP[m.a], B = TEAM_MAP[m.b];
    const winAbbr = matchWinner(m) === "a" ? (A && A.abbr) : (B && B.abbr);
    const hi = Math.max(m.scoreA, m.scoreB), lo = Math.min(m.scoreA, m.scoreB);
    if (String(picked).trim() === `${winAbbr} ${hi}:${lo} 승`) scoreHits++;
  });

  // 팬 선정 POG(MVP) 투표 횟수
  const pogVotes = Cache.mine.pollVotes.filter(v => {
    const poll = Cache.polls.find(p => p.id === v.poll_id);
    return poll && poll.phase === "post_pom";
  }).length;

  // 연속 참여: 최근 끝난 경기부터 거꾸로, 참여가 끊길 때까지
  let streak = 0;
  for (let i = doneMatches.length - 1; i >= 0; i--) {
    if (participated.has(doneMatches[i].id)) streak++;
    else break;
  }

  // 평점 매긴 선수 수
  const ratedPlayers = new Set(Cache.mine.ratings.map(r => r.player_id)).size;

  // 팬 성향 (응원팀 경기 예측에서 자기 팀을 얼마나 골랐나 — 표본 3경기 이상일 때만)
  const fav = getFavTeam();
  let bias = null;
  if (fav) {
    const favPreds = myPreds.map(p => ({ p, m: Cache.matches.find(x => x.id === p.match_id) }))
      .filter(x => x.m && (x.m.a === fav || x.m.b === fav));
    if (favPreds.length >= 3) {
      const forUs = favPreds.filter(x => (x.m.a === fav ? "a" : "b") === x.p.side).length;
      const r = forUs / favPreds.length;
      bias = r >= 0.7 ? "낙관형" : r <= 0.4 ? "신중형" : "균형형";
    }
  }

  const rec = {
    voter: me, fav,
    matches: participated.size,
    // 개근 판정은 "종료된 경기를 실제로 참여했는가"로 (예정 경기 예측이 섞이면 안 된다)
    doneParticipated: doneMatches.filter(m => participated.has(m.id)).length,
    doneTotal: doneMatches.length,
    predDone, predHits,
    accuracy: predDone ? Math.round((predHits / predDone) * 100) : null,
    scoreTried, scoreHits, pogVotes, streak, ratedPlayers, bias,
    history: history.reverse(), // 최신이 위로
  };
  rec.badges = fanBadges(rec);
  return rec;
}

// 배지: 서버에 저장하지 않고 기록에서 그때그때 계산한다 (기준이 늘 최신)
function fanBadges(rec) {
  const out = [];
  if (rec.matches >= 1) out.push({ icon: "🐣", name: "첫 발자국", desc: "경기 참여 시작" });
  if (rec.streak >= 3) out.push({ icon: "🔥", name: `${rec.streak}경기 연속 참여`, desc: "빠짐없이 함께한 경기" });
  if (rec.predDone >= 5 && rec.accuracy >= 60) out.push({ icon: "🎯", name: "예측가", desc: `적중률 ${rec.accuracy}% (${rec.predDone}경기)` });
  if (rec.scoreHits >= 2) out.push({ icon: "🔮", name: "스코어 스나이퍼", desc: `세트 스코어 ${rec.scoreHits}회 적중` });
  if (rec.pogVotes >= 5) out.push({ icon: "👑", name: "POG 개표인", desc: `MVP 투표 ${rec.pogVotes}회` });
  if (rec.ratedPlayers >= 10) out.push({ icon: "💯", name: "평점 마스터", desc: `선수 ${rec.ratedPlayers}명 평가` });
  if (rec.doneTotal >= 5 && rec.doneParticipated >= rec.doneTotal) out.push({ icon: "🏟️", name: "개근 팬", desc: "이번 시즌 전 경기 참여" });
  return out;
}

// ── 팬덤별 예측 적중률 (회원 응원팀 기준 — 익명 표는 팀을 알 수 없어 제외) ──
function fandomAccuracy() {
  return (Cache.stats.fandom || [])
    .filter(t => t.n > 0)
    .map(t => ({ team: t.team, n: t.n, hits: t.hits, pct: Math.round((t.hits / t.n) * 100) }))
    .sort((a, b) => b.pct - a.pct || b.n - a.n);
}

// ── 선수 지표 집계 (육각형 차트용) ─────────────────────────
// 경기 상세(세트별 KDA·CS·골드) + 팬 평점 + POM을 한 선수 기준으로 모은다.
// tid를 주면 그 대회 경기만, 없으면 전체.
function playerAggregate(pid, tid) {
  const player = getPlayer(pid);
  if (!player) return null;
  let sets = 0, wins = 0, k = 0, d = 0, a = 0, cs = 0, gold = 0, kpSum = 0, kpSets = 0;
  const champs = {};

  getMatches().forEach(m => {
    if (tid && m.tid !== tid) return;
    const det = getDetails(m.id);
    if (!det) return;
    det.sets.forEach(s => {
      const row = (s.players || []).find(p => p.pid === pid && (p.champ || "").trim());
      if (!row) return;
      sets++;
      const rk = +row.k || 0, rd = +row.d || 0, ra = +row.a || 0;
      k += rk; d += rd; a += ra; cs += +row.cs || 0; gold += +row.gold || 0;

      // 킬 관여율 = (킬+어시) ÷ 우리 팀 총 킬
      const teamKills = (s.players || [])
        .filter(p => (getPlayer(p.pid) || {}).team === player.team)
        .reduce((n, p) => n + (+p.k || 0), 0);
      if (teamKills > 0) { kpSum += (rk + ra) / teamKills; kpSets++; }

      const won = (s.win === "a" ? m.a : m.b) === player.team;
      if (won) wins++;

      const c = (champs[row.champ] = champs[row.champ] || { champ: row.champ, sets: 0, wins: 0, k: 0, d: 0, a: 0, last: null });
      c.sets++; if (won) c.wins++;
      c.k += rk; c.d += rd; c.a += ra;
      if (!c.last || new Date(m.at) > new Date(c.last)) c.last = m.at;
    });
  });

  // 팬 평점 (해당 대회 경기만)
  const hist = matchRatingsForPlayer(pid).filter(h => {
    if (!tid) return true;
    const m = getMatches().find(x => x.id === h.matchId);
    return m && m.tid === tid;
  });
  const fanAvg = hist.length ? hist.reduce((s, h) => s + Number(h.avg), 0) / hist.length : null;

  // POM (해당 대회 경기만)
  const pomPts = Cache.pom
    .filter(x => x.player_id === pid)
    .filter(x => {
      if (!tid) return true;
      if (!x.match_id) return false;              // 과거 이월분은 대회 구분이 없음
      const m = getMatches().find(y => y.id === x.match_id);
      return m && m.tid === tid;
    })
    .reduce((s, x) => s + (x.pts || 0), 0);

  return {
    pid, pos: player.pos, team: player.team, sets, wins, losses: sets - wins,
    k, d, a,
    kda: d > 0 ? (k + a) / d : (k + a),
    kp: kpSets ? kpSum / kpSets : 0,
    csAvg: sets ? cs / sets : 0,
    goldAvg: sets ? gold / sets : 0,
    fan: fanAvg, fanCount: hist.length,
    pom: pomPts,
    champs: Object.values(champs).sort((x, y) => y.sets - x.sets),
  };
}

// 육각형에 쓰는 축 정의 (raw 값을 뽑는 방법 + 표시 형식)
const RADAR_AXES = [
  { key: "kda", label: "KDA", get: s => s.kda, fmt: v => v.toFixed(2) },
  { key: "kp", label: "킬관여", get: s => s.kp * 100, fmt: v => v.toFixed(0) + "%" },
  { key: "cs", label: "CS", get: s => s.csAvg, fmt: v => v.toFixed(0) },
  { key: "gold", label: "골드", get: s => s.goldAvg, fmt: v => v.toFixed(1) + "k" },
  { key: "fan", label: "팬평점", get: s => (s.fan == null ? null : s.fan), fmt: v => v.toFixed(1) },
  { key: "pom", label: "POM", get: s => s.pom, fmt: v => v.toFixed(0) + "pt" },
];

// 같은 포지션 선수들 사이에서 몇 등쯤인지를 0~100으로 (50 = 딱 중간)
function radarData(pid, tid) {
  const me = playerAggregate(pid, tid);
  if (!me) return null;
  const peers = getPlayers()
    .filter(p => p.pos === me.pos && p.id !== pid)
    .map(p => playerAggregate(p.id, tid))
    .filter(s => s && s.sets > 0);

  const axes = RADAR_AXES.map(ax => {
    const mine = ax.get(me);
    const vals = peers.map(s => ax.get(s)).filter(v => v != null && !isNaN(v));
    const all = (mine == null ? vals : vals.concat(mine)).slice().sort((x, y) => x - y);
    const pct = v => {
      if (v == null || !all.length) return 50;
      if (all.length === 1) return 50;
      const below = all.filter(x => x < v).length;
      const same = all.filter(x => x === v).length;
      return Math.round(((below + same / 2) / all.length) * 100);
    };
    const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    return {
      key: ax.key, label: ax.label,
      raw: mine, score: mine == null ? 0 : pct(mine),
      avgRaw: avg, avgScore: avg == null ? 50 : pct(avg),
      text: mine == null ? "-" : ax.fmt(mine),
      avgText: avg == null ? "-" : ax.fmt(avg),
    };
  });
  return { stats: me, axes };
}

// 선수의 경기별 평점 목록 (최신 경기 순)
function matchRatingsForPlayer(playerId) {
  const rows = (Cache.idx && Cache.idx.ratingByPlayer[playerId]) || [];
  return rows.filter(r => r.n).map(r => {
    const m = Cache.matches.find(x => x.id === r.match_id);
    const mine = Cache.mine.ratings.find(x => x.match_id === r.match_id && x.player_id === playerId);
    return { matchId: r.match_id, match: m, at: m ? m.at : 0,
      avg: Math.round(r.total / r.n * 10) / 10, n: r.n, mine: mine ? mine.score : null };
  }).sort((a, b) => new Date(b.at) - new Date(a.at));
}
// 가장 최근 경기의 평점 (선수 카드용)
function latestMatchRating(playerId) {
  return matchRatingsForPlayer(playerId)[0] || null;
}

// 이 팀 게시판에 글을 쓸 수 있는가 (응원팀 회원 또는 관리자)
function canPostToTeam(teamId) {
  if (!teamId) return true; // 전체 게시판은 누구나
  if (Auth.profile?.is_admin) return true;
  return Auth.profile?.fav_team === teamId;
}

// ── 경기 상세 ──
function getAllDetails() { return Cache.details; }
function getDetails(matchId) { return Cache.details[matchId] || null; }
function saveDetailSet(matchId, pos, setData) {
  const d = Cache.details[matchId] = Cache.details[matchId] || { sets: [] };
  let dbIdx;
  if (d.sets[pos]) {
    dbIdx = d.sets[pos]._idx;
    d.sets[pos] = { _idx: dbIdx, ...setData };
  } else {
    dbIdx = d.sets.length ? Math.max(...d.sets.map(s => s._idx)) + 1 : 0;
    d.sets.push({ _idx: dbIdx, ...setData });
  }
  sb.from("match_details").upsert({ match_id: matchId, set_index: dbIdx, win: setData.win, players: setData.players })
    .then(r => sbErr(r.error, "saveDetailSet"));
}
function deleteDetailSet(matchId, pos) {
  const d = Cache.details[matchId];
  if (!d || !d.sets[pos]) return;
  const dbIdx = d.sets[pos]._idx;
  d.sets.splice(pos, 1);
  if (!d.sets.length) delete Cache.details[matchId];
  sb.from("match_details").delete().eq("match_id", matchId).eq("set_index", dbIdx)
    .then(r => sbErr(r.error, "deleteDetailSet"));
}

// ── 팬심지수: 투표 ──
function getPolls() { return Cache.polls; }
function pollsForMatch(matchId) { return Cache.polls.filter(p => p.match_id === matchId); }
function getPollByPost(postId) { return Cache.polls.find(p => p.post_id === postId); }
function pollOpen(poll) { return !poll.closes_at || new Date(poll.closes_at) > new Date(); }

function createPoll(p) {
  p.id = p.id || "poll" + Date.now() + Math.random().toString(36).slice(2, 6);
  Cache.polls.push(p);
  createPoll.lastSave = sb.from("polls").insert({
    id: p.id, match_id: p.match_id || null, phase: p.phase || null, post_id: p.post_id || null,
    question: p.question, options: p.options, multi: !!p.multi, closes_at: p.closes_at || null,
  }).then(r => { sbErr(r.error, "createPoll"); return r; });
  return p.id;
}

function myPollVote(pollId) {
  return Cache.mine.pollVotes.find(v => v.poll_id === pollId) || null;
}
function votePoll(pollId, choices) {
  const prev = myPollVote(pollId);
  const before = prev ? (prev.choices || []).slice() : null;
  const ft = (prev && prev.ft != null) ? prev.ft : myFanTeam();   // 처음 쓴 칸에서 고친다
  const bump = (list, d) => (list || []).forEach(c => {
    if (typeof c !== "number") return;
    const row = statRow(Cache.stats.pollChoice,
      x => x.poll_id === pollId && x.fan_team === ft && x.choice_idx === c,
      () => ({ poll_id: pollId, fan_team: ft, choice_idx: c, n: 0 }));
    row.n = Math.max(0, row.n + d);
  });
  bump(before, -1); bump(choices, +1);
  if (!prev) statRow(Cache.stats.pollVoters, x => x.poll_id === pollId && x.fan_team === ft,
    () => ({ poll_id: pollId, fan_team: ft, n: 0 })).n++;
  if (prev) { prev.choices = choices; prev._p = 1; }
  else Cache.mine.pollVotes.push({ poll_id: pollId, choices, ft, _p: 1 });
  indexStats();
  sb.rpc("vote_poll", { p_poll_id: pollId, p_voter: anonId(), p_choices: choices }).then(r => {
    if (isMissingFunction(r.error))
      return sb.from("poll_votes").upsert({ poll_id: pollId, voter: voterId(), choices,
        fav_team: Auth.profile?.fav_team || null, is_member: !!Auth.session })
        .then(x => { sbErr(x.error, "votePoll(legacy)"); if (!x.error) clearPending(Cache.mine.pollVotes, y => y.poll_id === pollId); });
    if (sbWriteFail(r.error, "votePoll")) {
      bump(choices, -1); bump(before, +1);
      if (!prev) {
        const v = Cache.stats.pollVoters.find(x => x.poll_id === pollId && x.fan_team === ft);
        if (v) v.n = Math.max(0, v.n - 1);
        Cache.mine.pollVotes = Cache.mine.pollVotes.filter(x => x.poll_id !== pollId);
      } else { prev.choices = before; delete prev._p; }
      indexStats();
    } else {
      const cur = Cache.mine.pollVotes.find(x => x.poll_id === pollId);
      if (cur) delete cur._p;
      if (r.data) Cache.myVoter = r.data;
    }
  });
}
// 집계: 전체 + 팬덤별 (teamA/teamB 팬 · 중립=그 외 전부)
function pollResults(poll, teamA, teamB) {
  const n = poll.options.length;
  const bucket = () => ({ counts: Array(n).fill(0), total: 0 });
  const overall = bucket(), a = bucket(), b = bucket(), neutral = bucket();
  const pick = ft => (teamA && ft === teamA) ? a : (teamB && ft === teamB) ? b : neutral;
  ((Cache.idx && Cache.idx.pollChoice[poll.id]) || []).forEach(r => {
    if (r.choice_idx < 0 || r.choice_idx >= n) return;
    overall.counts[r.choice_idx] += r.n;
    pick(r.fan_team).counts[r.choice_idx] += r.n;
  });
  let voters = 0;
  ((Cache.idx && Cache.idx.pollVoters[poll.id]) || []).forEach(r => {
    overall.total += r.n; pick(r.fan_team).total += r.n; voters += r.n;
  });
  return { overall, teamA: a, teamB: b, neutral, voters };
}

// ── 빠른 반응 (글) ──
const REACTION_KINDS = [
  { kind: "agree", label: "동의해요", emoji: "👍" },
  { kind: "insight", label: "분석 좋아요", emoji: "🧠" },
  { kind: "fun", label: "재미있어요", emoji: "😂" },
  { kind: "cheer", label: "응원해요", emoji: "🔥" },
];
function reactionCounts(postId) {
  const out = {};
  REACTION_KINDS.forEach(k => out[k.kind] = 0);
  Object.entries((Cache.idx && Cache.idx.reaction[postId]) || {}).forEach(([k, n]) => out[k] = n);
  return out;
}
function myReactions(postId) {
  return new Set(Cache.mine.reactions.filter(r => r.post_id === postId).map(r => r.kind));
}
function toggleReaction(postId, kind) {
  const on = !Cache.mine.reactions.some(r => r.post_id === postId && r.kind === kind);
  const row = statRow(Cache.stats.reaction, x => x.post_id === postId && x.kind === kind,
    () => ({ post_id: postId, kind, n: 0 }));
  row.n = Math.max(0, row.n + (on ? 1 : -1));
  if (on) Cache.mine.reactions.push({ post_id: postId, kind, _p: 1 });
  else Cache.mine.reactions = Cache.mine.reactions.filter(r => !(r.post_id === postId && r.kind === kind));
  indexStats();
  sb.rpc("toggle_reaction", { p_post_id: postId, p_voter: anonId(), p_kind: kind }).then(r => {
    if (isMissingFunction(r.error)) {
      const q = on ? sb.from("reactions").insert({ post_id: postId, voter: voterId(), kind })
                   : sb.from("reactions").delete().eq("post_id", postId).eq("voter", voterId()).eq("kind", kind);
      return q.then(x => { sbErr(x.error, "toggleReaction(legacy)"); if (!x.error) clearPending(Cache.mine.reactions, y => y.post_id === postId && y.kind === kind); });
    }
    if (sbWriteFail(r.error, "toggleReaction")) {
      row.n = Math.max(0, row.n + (on ? -1 : 1));
      if (on) Cache.mine.reactions = Cache.mine.reactions.filter(x => !(x.post_id === postId && x.kind === kind));
      else Cache.mine.reactions.push({ post_id: postId, kind });
      indexStats();
    } else {
      const cur = Cache.mine.reactions.find(x => x.post_id === postId && x.kind === kind);
      if (cur) delete cur._p;
    }
  });
}

// ── 댓글 추천 ──
function commentLikeCount(commentId) {
  return (Cache.idx && Cache.idx.commentLike[commentId]) || 0;
}
function myCommentLike(commentId) {
  return Cache.mine.commentLikes.some(l => String(l.comment_id) === String(commentId));
}
function likeComment(commentId) {
  if (myCommentLike(commentId)) return false;
  statRow(Cache.stats.commentLike, x => String(x.comment_id) === String(commentId),
    () => ({ comment_id: commentId, n: 0 })).n++;
  Cache.mine.commentLikes.push({ comment_id: commentId, _p: 1 });
  indexStats();
  sb.rpc("like_comment", { p_comment_id: commentId, p_voter: anonId() }).then(r => {
    if (isMissingFunction(r.error))
      return sb.from("comment_likes").insert({ comment_id: commentId, voter: voterId() })
        .then(x => { sbErr(x.error, "likeComment(legacy)"); if (!x.error) clearPending(Cache.mine.commentLikes, y => String(y.comment_id) === String(commentId)); });
    if (sbWriteFail(r.error, "likeComment")) {
      const row = Cache.stats.commentLike.find(x => String(x.comment_id) === String(commentId));
      if (row) row.n = Math.max(0, row.n - 1);
      Cache.mine.commentLikes = Cache.mine.commentLikes.filter(x => String(x.comment_id) !== String(commentId));
      indexStats();
    } else {
      const cur = Cache.mine.commentLikes.find(x => String(x.comment_id) === String(commentId));
      if (cur) delete cur._p;
    }
  });
  return true;
}

// ── 창립 팬 100인 ──
function foundingList(team) {
  return Cache.founding.filter(f => f.team === team)
    .map(f => ({ ...f, nick: Cache.profiles.find(p => p.id === f.user_id)?.nick || "?" }));
}
function myFoundingNo(team) {
  if (!Auth.session) return null;
  return Cache.founding.find(f => f.team === team && f.user_id === Auth.session.user.id)?.no ?? null;
}
function foundingNoOf(nick, team) {
  const prof = Cache.profiles.find(p => p.nick === nick && p.fav_team === team);
  if (!prof) return null;
  return Cache.founding.find(f => f.team === team && f.user_id === prof.id)?.no ?? null;
}
async function claimFounding(team) {
  const { data, error } = await sb.rpc("claim_founding", { t: team });
  if (error) return { error };
  Cache.founding.push({ team, user_id: Auth.session.user.id, no: data });
  return { no: data };
}

// ── 중계 링크 ────────────────────────────────────────────
// 치지직·SOOP은 채널 주소가 고정이라 한 번 등록하면 모든 경기에 자동으로 붙는다.
// 유튜브처럼 경기마다 주소가 다른 경우를 위해 경기별 덮어쓰기도 둔다.
// 저장 형태: { default: {chzzk, soop, youtube}, matches: { "m12": {youtube: "..."} } }
const STREAM_PLATFORMS = [
  { key: "chzzk", name: "치지직", note: "국내 중계" },
  { key: "soop", name: "SOOP", note: "국내 중계" },
  { key: "youtube", name: "유튜브", note: "해외 중계" },
];
function getStreamConfig() {
  try { return JSON.parse(getSetting("streams") || "{}") || {}; } catch { return {}; }
}
function saveStreamConfig(cfg) { setSetting("streams", JSON.stringify(cfg)); }
// 해당 경기에서 실제로 보여 줄 링크들 (경기별 설정이 기본 설정을 덮어씀)
function streamsForMatch(matchId) {
  const cfg = getStreamConfig();
  const merged = { ...(cfg.default || {}), ...(((cfg.matches || {})[matchId]) || {}) };
  return STREAM_PLATFORMS
    .map(p => ({ ...p, url: (merged[p.key] || "").trim() }))
    .filter(p => /^https?:\/\//i.test(p.url));
}

// ── 사이트 설정 · 로고 ──
function getSetting(key) { return Cache.settings[key] || ""; }
function setSetting(key, value) {
  Cache.settings[key] = value;
  sb.from("site_settings").upsert({ key, value }).then(r => sbErr(r.error, "setSetting"));
}
// slot: "desktop-light" | "desktop-dark" | "mobile"
// 업로드된 로고(데이터 URL)가 있으면 그것, 없으면 기본 파일
function brandLogoURL(slot, fallback) {
  const v = getSetting("logo_" + slot);
  return v && v.startsWith("data:") ? v : fallback;
}
// 이미지를 표시 크기에 맞게 자동 축소한 뒤 설정 테이블에 저장
async function uploadBrandLogo(slot, file) {
  try {
    const bmp = await createImageBitmap(file);
    const targetH = slot === "mobile" ? 192 : 120; // 표시 크기의 약 3배 (레티나 대응)
    const scale = Math.min(1, targetH / bmp.height);
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d").drawImage(bmp, 0, 0, w, h);
    const dataUrl = c.toDataURL("image/png");
    if (dataUrl.length > 600000)
      return { error: { message: "축소 후에도 이미지가 너무 큽니다. 가로로 긴 단순한 로고 이미지를 사용해 주세요." } };
    const { error } = await sb.from("site_settings").upsert({ key: "logo_" + slot, value: dataUrl });
    if (error) return { error };
    Cache.settings["logo_" + slot] = dataUrl;
    return { ok: true };
  } catch (e) {
    return { error: { message: "이미지를 읽을 수 없습니다 (" + e.message + ")" } };
  }
}
function resetBrandLogo(slot) { setSetting("logo_" + slot, ""); }

// ── 닉네임 ──
function getNick() {
  if (Auth.profile) return Auth.profile.nick;
  return localStorage.getItem("lckdb_nick") || "";
}
function setNick(n) { if (!Auth.profile) localStorage.setItem("lckdb_nick", n); }

// ── 인증 (회원 + 관리자 공용, 이메일/비밀번호) ──
async function sbGetSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}
// (보류) 익명 시절 기록을 계정으로 옮기는 기능은 아직 없다.
// 익명 id가 비밀이 아니라서 — 예전에 predictions가 공개 조회였으므로 이미 유출됐을 수 있다 —
// "id를 아는 사람이 주인"이라고 인정하면 가입 한 번으로 남의 기록을 가져갈 수 있다.
// 브라우저가 비밀 토큰을 갖는 구조로 바꾼 뒤에 만든다. (supabase/schema12_vote_privacy.sql 4번 항목)

async function sbSignIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  return { session: data.session, error };
}
async function sbSignUp(email, password, nick, favTeam) {
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) return { error };
  if (!data.session) return { needConfirm: true }; // 이메일 확인이 켜져 있는 경우
  const { error: pErr } = await sb.from("profiles").insert({ id: data.session.user.id, nick, fav_team: favTeam || null });
  if (pErr) {
    if (pErr.message.includes("duplicate") || pErr.code === "23505")
      return { error: { message: "이미 사용 중인 닉네임입니다." } };
    return { error: pErr };
  }
  return { session: data.session };
}
async function sbSignOut() {
  await sb.auth.signOut();
  // 스냅샷에 로그인 상태가 남으면 다음 방문에서 이전 회원의 팀·기록이 보인다
  Auth.session = null;
  Auth.profile = null;
  Cache.myVoter = null;
  Cache.mine = { predictions: [], ratings: [], pollVotes: [], reactions: [], commentLikes: [] };
  try { localStorage.removeItem(SNAP_KEY); } catch {}
  snapshotSave();
}
// 로그인은 됐지만 프로필이 없는 회원용 (이메일 확인을 거친 가입 등)
async function completeProfile(nick, favTeam) {
  if (!Auth.session) return { error: { message: "로그인이 필요합니다." } };
  const row = { id: Auth.session.user.id, nick, fav_team: favTeam || null };
  const { error } = await sb.from("profiles").insert(row);
  if (error) {
    if (error.message.includes("duplicate") || error.code === "23505")
      return { error: { message: "이미 사용 중인 닉네임입니다." } };
    return { error };
  }
  Auth.profile = { ...row, is_admin: false };
  return { ok: true };
}

// ── 부팅 ─────────────────────────────────────────────────
// storeReady : 화면을 그려도 되는 시점 (스냅샷이 있으면 즉시)
// storeFresh : 서버에서 받은 최신 데이터가 반영된 시점 (로그인 판정처럼 정확해야 할 때)
snapshotUsed = snapshotLoad();

const storeFresh = (async () => {
  const before = snapshotUsed ? cacheFingerprint() : null;
  await fetchAll();
  snapshotSave();
  loadLogosLater().catch(() => {});
  if (snapshotUsed && before !== cacheFingerprint()) showRefreshToast();
})();

const storeReady = snapshotUsed ? Promise.resolve() : storeFresh;

// 페이지를 떠날 때 (투표·평점 등 방금 바꾼 내용까지) 스냅샷 갱신
addEventListener("pagehide", snapshotSave);
