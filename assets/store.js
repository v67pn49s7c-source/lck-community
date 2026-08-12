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
  stats: { pred: [], rating: [], ratingVoters: [], pollChoice: [], pollVoters: [], reaction: [], commentLike: [], fandom: [], ranking: [] },
  mine: { predictions: [], ratings: [], pollVotes: [], reactions: [], commentLikes: [], postUpvotes: [] },
  idx: null,       // stats를 빠르게 찾기 위한 색인 (indexStats가 채운다)
  myVoter: null,   // 서버가 확정한 내 신원
  statsOk: false,  // 집계를 실제로 받았는가 — 못 받은 것을 "0명 참여"로 위장하지 않기 위해
};

// ── 집계 색인 ──
// 서버가 준 집계 배열은 그대로 두고, 화면에서 자주 찾는 형태로 한 번만 색인한다.
function indexStats() {
  const s = Cache.stats;
  const ix = { pred: {}, rating: {}, ratingSet: {}, ratingByPlayer: {}, ratingVoters: {},
               pollChoice: {}, pollVoters: {}, reaction: {}, commentLike: {} };
  (s.pred || []).forEach(r => (ix.pred[r.match_id] = ix.pred[r.match_id] || []).push(r));
  // 평점은 세트 단위로 저장된다. 화면에 따라 두 가지로 쓴다.
  //   ratingSet  = 세트별 (1세트 평점표)
  //   rating     = 경기 전체 (세트들을 합친 값 — POG·선수 페이지·공유 카드)
  ix.ratingSet = {};
  (s.rating || []).forEach(r => {
    const sk = r.match_id + "|" + (r.set_index ?? -1) + "|" + r.player_id;
    (ix.ratingSet[sk] = ix.ratingSet[sk] || {})[r.bucket] = r;

    const k = r.match_id + "|" + r.player_id;
    const g = (ix.rating[k] = ix.rating[k] || {});
    const cur = g[r.bucket];
    if (cur) { cur.n += r.n; cur.total += r.total; }
    else g[r.bucket] = { match_id: r.match_id, player_id: r.player_id, bucket: r.bucket, n: r.n, total: r.total };
  });
  Object.values(ix.rating).forEach(g => {
    if (g.all) (ix.ratingByPlayer[g.all.player_id] = ix.ratingByPlayer[g.all.player_id] || []).push(g.all);
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
  Cache.stats.ranking = Cache.stats.ranking || [];
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
// v3 = 공식 경기방 판별값(is_official·match_id)을 확실히 다시 받는다.
// v1에는 **다른 사람들의 표가 통째로** 들어 있고, v2에는 공식 경기방 전환 전 값이
// 남을 수 있으므로 둘 다 지운다 (서버만 고쳐서는 이미 방문한 기기에 계속 남는다).
// v4 = 본문(body)을 목록에서 받지 않게 됐다(schema26). v3 스냅샷에는 팀 게시판 본문이
// 남아 있어, 응원팀을 바꾼 뒤에도 그 기기에서만 옛 본문이 보일 수 있으므로 버린다.
const SNAP_KEY = "nexus_snap_v4";
// 이름 뒤 번호를 올리면 모든 방문자가 로고를 한 번 다시 받는다 —
// 업로드본을 지우거나 로고를 바꿨는데 캐시(하루) 때문에 옛것이 남을 때 쓴다.
const LOGO_KEY = "nexus_logos_v2";
try { localStorage.removeItem("nexus_snap_v1"); } catch (e) {}
try { localStorage.removeItem("nexus_snap_v2"); } catch (e) {}
try { localStorage.removeItem("nexus_snap_v3"); } catch (e) {}
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

// 로고는 크기가 커서(업로드본이 60KB 안팎) 첫 화면을 막지 않도록 따로, 나중에 받는다.
// 게다가 로고는 거의 안 바뀌므로 하루에 한 번만 다시 받는다 —
// 그러지 않으면 페이지를 옮길 때마다 60KB를 새로 내려받는다 (2026-08-07).
const LOGO_TTL = 24 * 3600 * 1000;
async function loadLogosLater() {
  try {
    const at = Number(localStorage.getItem(LOGO_KEY + "_at") || 0);
    if (localStorage.getItem(LOGO_KEY) && Date.now() - at < LOGO_TTL) return; // 캐시가 아직 싱싱하다
  } catch {}
  const { data } = await sb.from("site_settings").select("key,value").like("key", "logo_%");
  if (!data) return;
  const logos = Object.fromEntries(data.map(x => [x.key, x.value]));
  // ★ 서버에서 지워진 업로드본은 화면에서도 지운다.
  //   Object.assign 만 하면 없어진 키가 그대로 남아, 업로드본을 삭제해도
  //   옛 로고가 계속 보인다 (2026-08-07 사고).
  Object.keys(Cache.settings).forEach(k => {
    if (k.startsWith("logo_") && !(k in logos)) delete Cache.settings[k];
  });
  Object.assign(Cache.settings, logos);
  try {
    localStorage.setItem(LOGO_KEY, JSON.stringify(logos));
    localStorage.setItem(LOGO_KEY + "_at", String(Date.now()));
  } catch {}
  // 이미 그려진 헤더·파비콘의 로고를 조용히 바꿔 끼운다
  document.querySelectorAll("img.brand-full.light").forEach(i => { i.src = brandLogoURL("desktop-light", "assets/brand/nexus-desktop.png?v=20260813d"); });
  document.querySelectorAll("img.brand-full.dark").forEach(i => { i.src = brandLogoURL("desktop-dark", "assets/brand/nexus-desktop-dark.png?v=20260813d"); });
  document.querySelectorAll("img.brand-icon").forEach(i => { i.src = brandLogoURL("mobile", "assets/brand/nexus-icon.png?v=20260813d"); });
}

// match_details 는 첫 화면에서 가장 큰·가장 느린 요청이다 (57KB · 1.5초).
// 경기방·선수·카드·관리자 화면에서만 쓰므로, 나머지 화면에서는 첫 그림을 막지 않도록
// 나중에 따로 받는다. (2026-08-07)
const NEEDS_DETAILS = typeof location === "undefined" ? true
  : /(live|player|cards|admin)\.html/.test(location.pathname) || location.pathname.indexOf("/match/") === 0;

function ingestDetails(rows) {
  Cache.details = {};
  (rows || []).forEach(row => {
    const d = Cache.details[row.match_id] = Cache.details[row.match_id] || { sets: [] };
    d.sets.push({ _idx: row.set_index, win: row.win, players: row.players || [], game: row.game || {} });
  });
  _playedTeam = null;   // 편 판정 캐시는 상세가 바뀌면 다시 계산해야 한다
}

// 상세가 필요 없다고 판단한 화면에서도, **첫 그림이 끝난 뒤** 조용히 받아 둔다.
// (POG 배지처럼 있으면 좋은 것들이 다음 그림에서 채워진다)
// storeDetails 를 await 하면 상세가 확실히 들어온 뒤를 보장한다.
let storeDetails = Promise.resolve();
function loadDetailsLater() {
  if (NEEDS_DETAILS) return storeDetails;
  storeDetails = (async () => {
    try {
      const r = await sb.from("match_details").select("*").order("set_index");
      if (!r.error) ingestDetails(r.data);
    } catch (e) { /* 없어도 화면은 동작한다 */ }
  })();
  return storeDetails;
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
    // ⚠ body(본문)는 **일부러 받지 않는다.** schema26 이 body 컬럼 읽기 권한을 회수했으므로
    // select("*") 를 쓰면 이 요청 전체가 권한 오류로 실패한다. 목록에 필요한 칸만 적는다.
    // 본문은 글을 열 때 loadPostBody() 가 서버 창구(get_post_body)로 따로 받는다.
    sb.from("posts")
      .select("id,team,cat,title,nick,author_team,author_id,match_id,is_official,up,views,created_at")
      .order("created_at", { ascending: false }),
    sb.from("comments").select("*").order("created_at"),
    // 예측·평점·투표·반응·댓글추천은 원본 대신 **집계 + 내 표**만 받는다 (왕복 1회)
    sb.rpc("get_fan_stats", { p_voter: anonId() }),
    NEEDS_DETAILS ? sb.from("match_details").select("*").order("set_index") : Promise.resolve({ data: [] }),
    // 로고(logo_*)는 무거워서 제외 — loadLogosLater()가 따로 받는다.
    // 수집 캐시(lp_*)도 제외 — 관리자 화면에서만 쓰는데 43KB 나 되어, 모든 방문자가
    // 모든 페이지에서 받고 있었다. (예전 필터가 lp_cache_% 라 실제 키 lp_aliases·
    // lp_mvp_*·lp_sched_* 를 하나도 못 걸렀다. 2026-08-07)
    // 관리자 화면은 reloadSetting("lp_aliases") 로 필요할 때 직접 받는다.
    sb.from("site_settings").select("key,value").not("key", "like", "logo_%").not("key", "like", "lp_%"),
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
    // is_admin은 공개 조회에서 아예 막혀 있다(schema14). 내 것만 서버 함수로 받는다.
    const r = await sb.rpc("my_profile");
    if (isMissingFunction(r.error)) {
      const { data: prof } = await sb.from("profiles").select("*").eq("id", Auth.session.user.id).maybeSingle();
      Auth.profile = prof || null;
    } else {
      sbErr(r.error, "my_profile");
      Auth.profile = r.data || null;
    }
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

  Cache.tournaments = (t.data || []).map(x => ({
    id: x.id, name: x.name, type: x.type, stages: x.stages || [], note: x.note || "",
    bracket: x.bracket || {},   // 대진 설정(시드 표·상자 연결). 칸이 없어도 {} 라 안전하다
  }));
  Cache.matches = (m.data || []).map(x => ({
    id: x.id, tid: x.tid, stage: x.stage, at: x.at, a: x.a, b: x.b, label: x.label || "",
    lp_id: x.lp_id || null,     // 리그피디아 원본 id (대진표 연결 화면에서 구분에 쓴다)
    oddsA: Number(x.odds_a), oddsB: Number(x.odds_b), status: x.status, scoreA: x.score_a, scoreB: x.score_b,
    counted: x.counted,
  }));
  Cache.records = (r.data || []).map(x => ({ id: x.id, name: x.name, ord: x.ord, records: x.records || [], in_total: x.in_total }));
  Cache.players = pl.data || [];

  const commentsByPost = {};
  (co.data || []).forEach(c => {
    (commentsByPost[c.post_id] = commentsByPost[c.post_id] || []).push({
      id: c.id, nick: c.nick, body: c.body, author_team: c.author_team || null, ts: Date.parse(c.created_at),
      // 마이페이지에서 '내가 쓴 댓글'을 찾는 열쇠. 비회원 댓글은 null 이다.
      author_id: c.author_id || null, post_id: c.post_id,
    });
  });
  // 이미 받아 둔 본문은 지키고 넘긴다. 안 그러면 글을 보는 중에 서버 데이터가 도착할 때마다
  // 본문이 빈칸으로 덮여 화면이 깜빡인다 (목록 응답에는 본문이 없기 때문이다).
  const keepBody = {};
  (Cache.posts || []).forEach(p => { if (p.bodyLoaded) keepBody[p.id] = p.body; });

  Cache.posts = (po.data || []).map(x => ({
    // body 는 목록에서 받지 않는다 (위 select 참고). 글을 열 때만 서버 창구로 받는다.
    id: x.id, team: x.team, cat: x.cat, title: x.title, nick: x.nick,
    body: keepBody[x.id] || "", bodyLoaded: Object.prototype.hasOwnProperty.call(keepBody, x.id),
    author_team: x.author_team || null, match_id: x.match_id || null,
    author_id: x.author_id || null,   // 마이페이지 '내가 쓴 글'. 비회원 글은 null.
    official: !!x.is_official,        // 공식 경기 토론방 (schema22 — 관리자만 켤 수 있다)
    up: x.up, views: x.views, ts: Date.parse(x.created_at), comments: commentsByPost[x.id] || [],
  }));

  if (NEEDS_DETAILS) ingestDetails(de.data);

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
      ranking: d.ranking || [],
    };
    const mine = d.mine || {};
    Cache.mine = keepMyPending({
      predictions: mine.predictions || [], ratings: mine.ratings || [],
      pollVotes: mine.pollVotes || [], reactions: mine.reactions || [],
      commentLikes: mine.commentLikes || [], postUpvotes: mine.postUpvotes || [],
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
    postUpvotes: keep(fresh.postUpvotes, old.postUpvotes, x => x.post_id),
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

  // 예측 랭킹은 남의 예측 원본이 필요해서 예전 경로에서는 만들 수 없다 (schema12 실행 전 한정)
  Cache.stats = { pred, rating, ratingVoters, pollChoice, pollVoters, reaction, commentLike, fandom, ranking: [] };
  Cache.mine = keepMyPending({
    predictions: (pr.data || []).filter(x => x.voter === me).map(x => ({ match_id: x.match_id, side: x.side })),
    ratings: (ra.data || []).filter(x => x.voter === me).map(x => ({ match_id: x.match_id, player_id: x.player_id, score: x.score })),
    pollVotes: (pv.data || []).filter(x => x.voter === me).map(x => ({ poll_id: x.poll_id, choices: x.choices })),
    reactions: (rx.data || []).filter(x => x.voter === me).map(x => ({ post_id: x.post_id, kind: x.kind })),
    commentLikes: (cl.data || []).filter(x => x.voter === me).map(x => ({ comment_id: x.comment_id })),
    postUpvotes: [],
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
      // 글 수·순서뿐 아니라 각 글의 공식 경기방 연결 상태도 본다. 기존 스냅샷의 글이
      // 서버에서 공식 경기방으로 승격돼도 이 값이 같으면 새로고침 안내가 뜨지 않았다.
      JSON.stringify(Cache.posts.map(p => [String(p.id), !!p.official,
        p.match_id == null ? null : String(p.match_id)])),
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
  sb.from("tournaments").insert({ id: t.id, name: t.name, type: t.type, stages: t.stages, note: t.note }).then(r => sbWriteFail(r.error, "addTournament"));
}
/** 대회의 일부 칸만 고친다 (대진 설정 저장에 쓴다).
 *  addTournament 는 건드리지 않는다 — bracket 키를 안 보내야 SQL 실행 전에도 대회 추가가 된다. */
function updateTournament(id, patch) {
  Cache.tournaments = Cache.tournaments.map(t => (t.id === id ? { ...t, ...patch } : t));
  const COLS = { name: "name", type: "type", stages: "stages", note: "note", bracket: "bracket" };
  const row = {};
  Object.keys(patch).forEach(k => { if (COLS[k]) row[COLS[k]] = patch[k]; });
  return sb.from("tournaments").update(row).eq("id", id)
    .then(r => { sbWriteFail(r.error, "updateTournament"); return r; });
}
function deleteTournament(id) {
  Cache.tournaments = Cache.tournaments.filter(t => t.id !== id);
  Cache.matches = Cache.matches.filter(m => m.tid !== id);
  sb.from("tournaments").delete().eq("id", id).then(r => sbWriteFail(r.error, "deleteTournament"));
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
  sb.from("matches").insert(matchToDb(m)).then(r => sbWriteFail(r.error, "addMatch"));
}
function updateMatch(id, patch) {
  // 화면은 즉시 갱신하되, 호출자는 반드시 서버 저장 결과를 기다릴 수 있어야 한다.
  // 특히 관리자의 '경기 저장 → 순위 반영'은 이 Promise가 성공한 뒤에만 이어져야 한다.
  const previous = Cache.matches.find(m => m.id === id);
  const optimistic = previous ? { ...previous, ...patch } : null;
  if (optimistic) Cache.matches = Cache.matches.map(m => m.id === id ? optimistic : m);

  const rollback = () => {
    // 저장을 기다리는 동안 더 최신 수정이 들어왔다면 그것까지 덮어쓰지 않는다.
    if (previous) Cache.matches = Cache.matches.map(m => m === optimistic ? previous : m);
  };

  // select + single까지 붙여 RLS에 막혀 '0행 수정'인데 error가 비어 있는 경우도 실패로 잡는다.
  return sb.from("matches").update(matchToDb(patch)).eq("id", id).select("id").single()
    .then(r => {
      if (sbWriteFail(r.error, "updateMatch")) rollback();
      return r;
    })
    .catch(error => {
      rollback();
      sbWriteFail(error, "updateMatch");
      throw error;
    });
}
function deleteMatch(id) {
  Cache.matches = Cache.matches.filter(m => m.id !== id);
  sb.from("matches").delete().eq("id", id).then(r => sbWriteFail(r.error, "deleteMatch"));
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
  // 결과를 돌려준다 — 순위 반영(applyMatchToRecords)이 실패 여부를 보고 되돌려야 한다
  return sb.from("stage_records").upsert(rows).then(r => { sbErr(r.error, "saveStageRecords"); return r; });
}
// 이 스테이지가 종합(누적) 순위에 합산되는가 (기본: Road To MSI만 제외)
function stageInTotal(s) { return s.in_total ?? (s.id !== "rtm"); }

// 종료된 경기 결과를 순위 전적에 반영 (경기당 1회 — counted 플래그로 이중 반영 방지)
// 순위 반영. 예전에는 '전적 저장'과 '반영됨 표시'가 서로 기다리지 않고 따로 날아가서,
// 한쪽만 성공하면 순위가 빠진 채 잠기거나 다음에 또 눌러 두 번 더해졌다.
// 이제 서버가 먼저 자리를 잡아 주고(claim), 전적 저장이 실패하면 자리를 되돌린다.
// 승패 판정도 matchWinner()와 같은 규칙을 서버가 강제한다(동점이면 거부).
async function applyMatchToRecords(matchId) {
  const m = Cache.matches.find(x => x.id === matchId);
  if (!m) return { ok: false, reason: "경기를 찾을 수 없음" };
  if (!TEAM_MAP[m.a] || !TEAM_MAP[m.b]) return { ok: false, reason: "미정 팀은 반영 불가" };
  // 대소문자·앞뒤 공백은 무시하고 찾는다. 다른 두 경로(순위 계산·경우의 수)는 이미 그렇게 하는데
  // 여기만 정확히 비교해서, 'Road to MSI'(소문자 t) 경기가 'Road To MSI' 스테이지를 못 찾아
  // 순위 반영 버튼이 늘 실패했다. (2026-08-07)
  const sk = x => String(x || "").trim().toLowerCase();
  const stage = Cache.records.find(s => sk(s.name) === sk(m.stage));
  if (!stage) return { ok: false, reason: `순위 전적 관리에 "${m.stage}" 스테이지가 없음 (스테이지 추가 후 반영)` };

  const claim = await sb.rpc("claim_match_for_records", { p_match_id: matchId });
  if (claim.error) {
    if (!isMissingFunction(claim.error))
      return { ok: false, reason: (claim.error.message || "").replace(/^.*?:\s*/, "") };
    // schema14 실행 전 — 예전 방식으로 (동점만 여기서 막는다)
    if (m.counted) return { ok: false, reason: "이미 순위에 반영된 경기" };
    if (!matchWinner(m)) return { ok: false, reason: "종료 상태 + 서로 다른 스코어를 입력해 주세요" };
  }
  const winner = claim.data ? claim.data.winner : matchWinner(m);

  const rec = t => {
    let r = stage.records.find(x => x.team === t);
    if (!r) { r = { team: t, w: 0, l: 0, sw: 0, sl: 0 }; stage.records.push(r); }
    return r;
  };
  const A = rec(m.a), B = rec(m.b);
  const aWin = winner === "a";
  (aWin ? A : B).w++; (aWin ? B : A).l++;
  A.sw += m.scoreA; A.sl += m.scoreB;
  B.sw += m.scoreB; B.sl += m.scoreA;
  m.counted = true;

  const saved = await saveStageRecords(Cache.records);
  if (saved && saved.error) {                      // 전적 저장 실패 → 자리를 되돌린다
    (aWin ? A : B).w--; (aWin ? B : A).l--;
    A.sw -= m.scoreA; A.sl -= m.scoreB;
    B.sw -= m.scoreB; B.sl -= m.scoreA;
    m.counted = false;
    await sb.rpc("release_match_records", { p_match_id: matchId });
    return { ok: false, reason: "전적을 저장하지 못했습니다: " + (saved.error.message || "") };
  }
  if (claim.error) {                               // 예전 방식일 때만 여기서 표시를 세운다
    const r = await sb.from("matches").update({ counted: true }).eq("id", m.id);
    if (r.error) return { ok: false, reason: "반영 표시를 저장하지 못했습니다: " + r.error.message };
  }
  return { ok: true };
}
// 스테이지 전적을 저장값이 아니라 **실제 경기 결과에서 계산**한다 (2026-08-06).
// 예전에는 관리자가 경기마다 '순위 반영'을 눌러야 stage_records 가 갱신됐는데,
// 하루만 늦어도 순위표가 틀린 채 노출됐다 (8/5 경기 2건 누락 사고).
// 이제 저장된 records 는 팀 명단(소속·표시 순서)으로만 쓰고, 승패·세트는 matches 에서 센다.
// 경기와 스테이지는 이름으로 잇는다 — "Road To MSI"/"Road to MSI" 같은 표기 차이를 흡수한다.
function computedStageRecords(s) {
  // 별도 대회(Road To MSI 같은 토너먼트)는 자동 계산하지 않는다.
  // 승률로 줄 세우면 1승 0패 팀이 우승팀 위로 올라간다(브래킷은 승수로 순위를 매기지 않는다).
  // 관리자가 넣어 둔 전적을 그대로 쓴다. (2026-08-07)
  if (!stageInTotal(s)) return s.records || [];
  const key = x => String(x || "").trim().toLowerCase();
  const played = Cache.matches.filter(m =>
    m.status === "done" && key(m.stage) === key(s.name) &&
    m.scoreA != null && m.scoreB != null && m.scoreA !== m.scoreB &&
    TEAM_MAP[m.a] && TEAM_MAP[m.b]);
  if (!played.length) return s.records || []; // 경기 기록이 없는 스테이지는 저장값 그대로
  const acc = {};
  const rec = t => acc[t] = acc[t] || { team: t, w: 0, l: 0, sw: 0, sl: 0 };
  (s.records || []).forEach(r => rec(r.team)); // 0승 팀도 명단에 남긴다
  played.forEach(m => {
    const A = rec(m.a), B = rec(m.b), aWin = m.scoreA > m.scoreB;
    (aWin ? A : B).w++; (aWin ? B : A).l++;
    A.sw += m.scoreA; A.sl += m.scoreB;
    B.sw += m.scoreB; B.sl += m.scoreA;
  });
  return Object.values(acc);
}
// 시즌 중간에는 팀마다 치른 경기 수가 달라서 승수만으로 줄 세우면 틀린다
// (15승 5패가 15승 6패 아래로 가는 사고). 승률 → 세트득실 순.
// 마지막 팀 id 는 화면이 매번 같은 순서로 나오게 하는 고정핀일 뿐,
// 승률·득실이 모두 같은 팀의 실제 순위는 규정(순위 결정전 등)에 달려 있어 여기서 단정하지 않는다.
const winRate = r => (r.w + r.l) ? r.w / (r.w + r.l) : -1;
const standingsSort = (a, b) => winRate(b) - winRate(a) || b.pt - a.pt || String(a.team).localeCompare(String(b.team));
function stageStandings(stageId) {
  const s = Cache.records.find(x => x.id === stageId);
  if (!s) return [];
  return computedStageRecords(s).map(r => ({ ...r, pt: r.sw - r.sl })).sort(standingsSort);
}
function cumulativeStandings() {
  const acc = {};
  Cache.records.filter(stageInTotal).forEach(s => computedStageRecords(s).forEach(r => {
    const t = acc[r.team] = acc[r.team] || { team: r.team, w: 0, l: 0, sw: 0, sl: 0 };
    t.w += r.w; t.l += r.l; t.sw += r.sw; t.sl += r.sl;
  }));
  return Object.values(acc).map(r => ({ ...r, pt: r.sw - r.sl })).sort(standingsSort);
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
  sb.from("players").insert(p).then(r => sbWriteFail(r.error, "addPlayer"));
}
function deletePlayer(id) {
  Cache.players = Cache.players.filter(p => p.id !== id);
  sb.from("players").delete().eq("id", id).then(r => sbWriteFail(r.error, "deletePlayer"));
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
  p.bodyLoaded = true;   // 방금 내가 쓴 본문이라 서버에 다시 물어볼 필요가 없다
  // 공식 경기방 표시를 서버(create_post)와 **같은 조건**으로 로컬에도 낙관적으로 건다.
  // 안 하면 관리자 sync 가드(official 기준)가 방금 만든 글을 못 보고 매번 다시 만든다.
  p.official = !!(Auth.profile?.is_admin && p.match_id && /^\[경기 토론\]/.test(p.title || ""));
  Cache.posts.unshift(p);
  // 저장 완료를 기다려야 하는 호출자를 위해 프로미스를 노출
  // ⚠ 인자를 늘리지 않는다. RPC 는 이름 인자가 하나라도 어긋나면 함수를 못 찾아서,
  //   마이그레이션 전·후 어느 한쪽에서 글쓰기가 통째로 죽는다. 공식 토론방 표시는
  //   서버(create_post)가 "관리자 + match_id + [경기 토론] 제목"으로 스스로 판정한다.
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

// ── 본문 받아오기 ────────────────────────────────────────
// 목록에는 본문이 없다(schema26). 글을 열 때 이 창구로만 받는다.
//   → { ok: true, body } | { ok: false }  (ok:false = 읽을 자격이 없거나 글이 없다)
// 서버가 자격을 판정하므로, 브라우저 코드를 건너뛰고 직접 요청해도 본문은 나오지 않는다.
async function loadPostBody(id) {
  const have = Cache.posts.find(x => x.id === id);
  if (have && have.bodyLoaded) return { ok: true, body: have.body };

  // ⚠ 캐시 항목은 **기다린 뒤에 다시 찾는다.** 기다리는 사이 fetchAll 이 끝나면
  //   Cache.posts 가 통째로 새 객체로 갈리는데, 기다리기 전에 잡아 둔 참조에 본문을
  //   쓰면 버려진 객체에 쓰는 꼴이 되어 화면에는 본문이 빈칸으로 남는다.
  //   (2026-08-12 실제로 이 순서 때문에 글 본문이 안 보였다)
  const keep = body => {
    const cur = Cache.posts.find(x => x.id === id);
    if (cur) { cur.body = body; cur.bodyLoaded = true; }
    return { ok: true, body };
  };

  const r = await sb.rpc("get_post_body", { p_id: id });
  // schema26 을 아직 적용하지 않은 DB — 예전처럼 직접 읽는다.
  // (코드가 SQL 보다 먼저 배포돼도 글이 빈칸으로 보이지 않게 하는 안전장치)
  if (isMissingFunction(r.error)) {
    const f = await sb.from("posts").select("body").eq("id", id).maybeSingle();
    if (f.error || !f.data) return { ok: false };
    return keep(f.data.body || "");
  }
  if (r.error) { sbErr(r.error, "loadPostBody"); return { ok: false }; }
  if (r.data == null) return { ok: false };   // 자격 없음 — 서버의 최종 판정
  return keep(r.data);
}

// 글 수정 (비회원은 비밀번호, 회원은 본인 글, 관리자는 전부)
function editPost(id, pw, title, body) {
  return sb.rpc("update_post", { p_id: id, p_pw: pw || null, p_title: title, p_body: body })
    .then(r => {
      sbErr(r.error, "editPost");
      if (!r.error) {
        const p = Cache.posts.find(x => x.id === id);
        if (p) { p.title = title; p.body = body; p.bodyLoaded = true; }
      }
      return r;
    });
}

// 글 삭제 (같은 규칙)
function removePost(id, pw) {
  // 글에 붙어 있던 투표도 함께 정리한다 (예전에는 DB에 그대로 남았다)
  const attached = Cache.polls.find(p => p.post_id === id);
  if (attached) {
    Cache.polls = Cache.polls.filter(p => p !== attached);
    sb.from("polls").delete().eq("post_id", id).then(r => sbErr(r.error, "removePost.poll"));
  }
  return sb.rpc("delete_post", { p_id: id, p_pw: pw || null }).then(r => {
    sbErr(r.error, "removePost");
    if (!r.error) Cache.posts = Cache.posts.filter(x => x.id !== id);
    return r;
  });
}
function postsForMatch(matchId) {
  return Cache.posts.filter(p => p.match_id === matchId);
}
// 조회수 — 서버가 1씩 올린다 (예전에는 브라우저가 절대값을 써서 아무 숫자나 넣을 수 있었다)
function bumpPostView(id) {
  const p = Cache.posts.find(x => x.id === id);
  if (p) p.views = (p.views || 0) + 1;
  sb.rpc("bump_post_view", { p_post_id: id }).then(r => {
    if (isMissingFunction(r.error)) return sb.rpc("inc_views", { pid: id });
    sbErr(r.error, "bumpPostView");
  });
}
// 내가 이 글을 추천했는가
function myPostUpvote(id) {
  return Cache.mine.postUpvotes.some(x => x.post_id === id);
}
// 글 추천 — 서버가 1인 1표를 보증한다 (예전에는 검사 없이 up = up + 1 이었다)
function upvotePost(id) {
  if (myPostUpvote(id)) return false;
  const p = Cache.posts.find(x => x.id === id);
  if (p) p.up = (p.up || 0) + 1;
  Cache.mine.postUpvotes.push({ post_id: id, _p: 1 });
  sb.rpc("upvote_post_v2", { p_post_id: id, p_voter: anonId() }).then(r => {
    if (isMissingFunction(r.error))
      return sb.rpc("upvote_post", { pid: id }).then(x => sbErr(x.error, "upvotePost(legacy)"));
    if (sbWriteFail(r.error, "upvotePost")) {
      if (p) p.up = Math.max(0, (p.up || 1) - 1);
      Cache.mine.postUpvotes = Cache.mine.postUpvotes.filter(x => x.post_id !== id);
    } else {
      const cur = Cache.mine.postUpvotes.find(x => x.post_id === id);
      if (cur) delete cur._p;
      if (typeof r.data === "number" && p) p.up = r.data;   // 서버가 센 실제 값으로 맞춘다
    }
  });
  return true;
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

// 실제 참여자 비율. 표가 0건이면 est(추정) 표시와 함께 배당 기반 값을 돌려준다.
// ⚠ 자동 생성 경기는 배당이 전부 2:2 라 폴백이 정확히 50.0:50.0 이 된다 —
//   아무도 투표 안 했는데 "팬심이 반반"이라는 거짓 화면이 되므로,
//   표시하는 쪽은 반드시 n(또는 est)을 보고 숫자를 감춰야 한다 (2026-08-06).
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
  return { a: pa, b: Math.round((100 - pa) * 10) / 10, n: 0, est: true };
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

// 예측 랭킹 (회원만 · 5경기 이상 채점된 사람만 — 표본이 적으면 순위가 그 사람의 예측을 드러낸다)
function predictRanking() {
  return (Cache.stats.ranking || [])
    .filter(r => r.total > 0)
    .map(r => ({ nick: r.nick, team: r.fav_team || null, hit: r.hits, total: r.total,
                 pct: Math.round((r.hits / r.total) * 100), points: r.hits * 10 }))
    .sort((a, b) => b.points - a.points || b.pct - a.pct || a.nick.localeCompare(b.nick));
}

// ── 선수 평점 ──
// 내 평점 — { 경기id: { 세트번호: { 선수id: 점수 } } }
function getRatings() {
  const out = {};
  Cache.mine.ratings.forEach(r => {
    const si = r.set_index ?? -1;
    const m = (out[r.match_id] = out[r.match_id] || {});
    (m[si] = m[si] || {})[r.player_id] = r.score;
  });
  return out;
}
// 그 경기에서 내가 매긴 평점 수 (세트 구분 없이)
function myRatingCount(matchId) {
  return Cache.mine.ratings.filter(r => r.match_id === matchId).length;
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
// 평점을 받는 기간 — 경기 시작 후 48시간까지 (서버 rate_player 와 같은 규칙, schema16).
// 마감이 없으면 결과 카드를 발행한 뒤에도 표가 들어와 카드와 사이트 숫자가 갈린다.
function ratingOpen(m) {
  if (!m || !m.at) return true;
  return Date.now() < new Date(m.at).getTime() + 48 * 3600 * 1000;
}
function setRating(matchId, setIndex, playerId, score) {
  const m0 = Cache.matches.find(x => x.id === matchId);
  if (m0 && !ratingOpen(m0)) { sbWriteFail({ message: "평점이 마감된 경기입니다 (경기 후 48시간)" }, "setRating(마감)"); return; }
  const si = setIndex ?? -1;
  const prev = Cache.mine.ratings.find(r =>
    r.match_id === matchId && (r.set_index ?? -1) === si && r.player_id === playerId);
  const before = prev ? prev.score : null;
  if (before === score) return;
  // 처음 매길 때 쓴 칸을 기억해 둔다. 도중에 응원팀을 바꿔도 같은 칸에서 고쳐야
  // 한 사람이 두 칸에 세어지지 않는다.
  const bucket = (prev && prev.b) || myRatingBucket(matchId, playerId);
  const rows = [bucket, "all"].map(b => statRow(Cache.stats.rating,
    x => x.match_id === matchId && (x.set_index ?? -1) === si && x.player_id === playerId && x.bucket === b,
    () => ({ match_id: matchId, set_index: si, player_id: playerId, bucket: b, n: 0, total: 0 })));
  rows.forEach(r => { if (before == null) r.n++; r.total += score - (before || 0); });
  if (before == null) {
    const v = statRow(Cache.stats.ratingVoters, x => x.match_id === matchId,
      () => ({ match_id: matchId, n_voters: 0 }));
    // 이 경기에 내가 처음 평점을 매길 때만 인원이 는다
    if (!Cache.mine.ratings.some(r => r.match_id === matchId)) v.n_voters++;
  }
  if (prev) { prev.score = score; prev._p = 1; }
  else Cache.mine.ratings.push({ match_id: matchId, set_index: si, player_id: playerId, score, b: bucket, _p: 1 });
  indexStats();
  sb.rpc("rate_player", { p_match_id: matchId, p_player_id: playerId, p_voter: anonId(), p_score: score, p_set_index: si })
    .then(r => {
      if (isMissingFunction(r.error))
        return sb.from("ratings").upsert({ match_id: matchId, player_id: playerId, voter: voterId(), score })
          .then(x => { sbErr(x.error, "setRating(legacy)"); if (!x.error) clearPending(Cache.mine.ratings, y => y.match_id === matchId && y.player_id === playerId); });
      if (sbWriteFail(r.error, "setRating")) {
        rows.forEach(x => { if (before == null) x.n = Math.max(0, x.n - 1); x.total -= score - (before || 0); });
        if (before == null) Cache.mine.ratings = Cache.mine.ratings.filter(x =>
          !(x.match_id === matchId && (x.set_index ?? -1) === si && x.player_id === playerId));
        else if (prev) { prev.score = before; delete prev._p; }
        // 이 경기 첫 평점이었다면 늘려 둔 참여 인원도 되돌린다
        if (before == null && !Cache.mine.ratings.some(x => x.match_id === matchId)) {
          const v = Cache.stats.ratingVoters.find(x => x.match_id === matchId);
          if (v) v.n_voters = Math.max(0, v.n_voters - 1);
        }
        indexStats();
      } else {
        const cur = Cache.mine.ratings.find(x => x.match_id === matchId && (x.set_index ?? -1) === si && x.player_id === playerId);
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
// setIndex 를 주면 그 세트만, 없으면 경기 전체(세트 합산)
function fanSplitForPlayer(playerId, matchId, setIndex) {
  const g = (Cache.idx && (setIndex == null
    ? Cache.idx.rating[matchId + "|" + playerId]
    : Cache.idx.ratingSet[matchId + "|" + setIndex + "|" + playerId])) || {};
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
/** 아직 세트 기록이 없을 때 쓰는 **주전 5명 추정**.
 *
 *  왜 필요한가 — 경기가 끝나면 그 자리에서 POM 투표를 만든다. 그런데 누가 뛰었는지는
 *  다음 새벽 수집 때나 들어온다. 그 사이를 "팀 명단 전체"로 때우면 후보가 6명이 되고
 *  벤치 선수까지 올라간다 (2026-08-08 HLE 전: 서폿이 Delight·Bluffing 둘 다 올라갔다).
 *
 *  그래서 **직전 경기들에 실제로 나온 사람**으로 포지션마다 한 명씩 고른다.
 *  beforeAt 이전 경기만 본다 — 나중 경기 기록으로 과거를 추정하면 안 된다.
 *  포지션 5칸을 못 채우면 빈 배열을 준다. 그때는 추측하지 말고 기다리는 게 맞다.
 */
function likelyStarters(teamId, beforeAt) {
  const lastSeen = {};                       // pid → 마지막 출전 경기 시각
  sortedMatches().forEach(m => {
    if (m.status !== "done" || (m.a !== teamId && m.b !== teamId)) return;
    if (beforeAt && !(m.at < beforeAt)) return;
    const det = Cache.details[m.id];
    ((det && det.sets) || []).forEach(s => (s.players || []).forEach(p => {
      if (!p.pid || !(p.champ || "").trim()) return;
      if (!lastSeen[p.pid] || m.at > lastSeen[p.pid]) lastSeen[p.pid] = m.at;
    }));
  });
  const byPos = {};
  teamPlayers(teamId).forEach(p => {
    const at = lastSeen[p.id];
    if (!at) return;
    if (!byPos[p.pos] || at > byPos[p.pos].at) byPos[p.pos] = { p, at };
  });
  const picked = Object.values(byPos).map(v => v.p);
  return picked.length === 5 ? picked : [];
}

// 이 세트에 실제로 나온 선수 (챔피언이 기록된 사람만)
// setIndex 는 **저장된 진짜 세트 번호**(match_details.set_index) 다.
// sets 배열은 DB 에 행이 있는 세트만 담은 압축 배열이라, 위치로 꺼내면
// 세트가 일부만 수집된 경기에서 다른 세트를 집는다. (2026-08-07)
function playedPidsForSet(matchId, setIndex) {
  const det = Cache.details[matchId];
  const s = ((det && det.sets) || []).find(x => (x._idx ?? -1) === setIndex);
  const out = new Set();
  ((s && s.players) || []).forEach(p => {
    if (p.pid && (p.champ || "").trim()) out.add(p.pid);
  });
  return out;
}

// 선수별로 몇 세트에 나왔는지 (교체 출전을 화면에서 구분하려고)
function setsPlayedForMatch(matchId) {
  const det = Cache.details[matchId];
  const n = {};
  ((det && det.sets) || []).forEach(s => (s.players || []).forEach(p => {
    if (p.pid && (p.champ || "").trim()) n[p.pid] = (n[p.pid] || 0) + 1;
  }));
  // total 은 '실제로 치러진 세트 수'여야 한다. 수집된 개수를 쓰면, 덜 수집된 경기에서
  // 모두가 전 세트를 뛴 것처럼 보여 교체 출전 배지가 사라지거나 주전에게 잘못 붙는다.
  const got = ((det && det.sets) || []).length;
  const m = Cache.matches.find(x => x.id === matchId);
  const real = (m && m.scoreA != null && m.scoreB != null) ? m.scoreA + m.scoreB : null;
  return { count: n, total: real == null ? got : real, complete: real != null && got === real };
}
// 팬심 평점 표: 포지션별로 양 팀 선수를 짝지어 행 구성 (좌우 미러 배치용)
// setIndex 를 주면 **그 세트에 나온 선수만** (교체 선수가 안 뛴 세트에 뜨지 않게).
// 없으면 경기 전체 기준(공유 카드·요약용).
function fanRatingRows(match, setIndex) {
  const posOrder = ["탑", "정글", "미드", "원딜", "서폿"];
  const played = setIndex == null ? playedPidsForMatch(match.id) : playedPidsForSet(match.id, setIndex);
  const { count: setsOf, total: totalSets, complete: setsComplete } = setsPlayedForMatch(match.id);
  // 편은 **그 경기 명단** 으로 가른다. 현재 소속(teamPlayers)으로 가르면
  // 이적한 선수가 어느 칸에도 안 잡혀 그 자리가 통째로 비어 버린다 (2026-08-07).
  const sideOfPid = {};
  ((Cache.details[match.id] || {}).sets || []).forEach(s => {
    const sd = setSides(match, s.players);
    (s.players || []).forEach(p => { if (p.pid && sd[p.pid]) sideOfPid[p.pid] = sd[p.pid]; });
  });
  const side = which => {
    let ps = played.size
      ? [...played].map(getPlayer).filter(Boolean).filter(p => (sideOfPid[p.id] || null) === which)
      : teamPlayers(which === "a" ? match.a : match.b);
    // 세트 기록이 아예 없는 경기는 현재 로스터로 대신한다
    if (!played.size) ps = ps.filter(Boolean);
    // 많이 나온 선수부터 — 교체로 한 세트만 뛴 선수가 주전 위에 오지 않게
    return ps.map(p => ({ p, s: fanSplitForPlayer(p.id, match.id, setIndex),
                          sets: setsOf[p.id] || 0, totalSets, setsComplete }))
             .sort((x, y) => y.sets - x.sets);
  };
  const A = side("a"), B = side("b");
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

// ── 세트 안에서 누가 어느 편이었나 ────────────────────────
// 왜 필요한가: players.team 은 **현재 소속**이라 이적한 선수의 과거 경기를 판정할 수 없다.
//   실제로 Aiming·Taeyoon·Diable·Sharvel 의 승/패·킬관여가 이 때문에 깨져
//   "킬관여 222%", "49세트 2승 47패" 같은 값이 선수 페이지에 나왔다 (2026-08-07).
// 어떻게 정하나:
//   1) 수집기가 넣어 준 side 가 있으면 그대로 쓴다 (가장 정확 — 그 경기 당시 소속)
//   2) 없으면 현재 소속이 그 경기 두 팀 중 하나인 선수부터 배정하고,
//      남은 선수(=이적자)는 아직 5자리가 안 찬 쪽에 넣는다
// 돌려주는 값: { 선수id: "a" | "b" }
function setSides(match, setPlayers) {
  const out = {};
  const list = (setPlayers || []).filter(p => p && p.pid);
  const count = { a: 0, b: 0 };
  const left = [];
  list.forEach(p => {
    if (p.side === "a" || p.side === "b") { out[p.pid] = p.side; count[p.side]++; return; }
    const t = playedForTeam(p.pid) || (getPlayer(p.pid) || {}).team;
    if (t === match.a) { out[p.pid] = "a"; count.a++; }
    else if (t === match.b) { out[p.pid] = "b"; count.b++; }
    else left.push(p.pid);
  });
  left.forEach(pid => {
    const side = count.a <= count.b ? "a" : "b";   // 덜 찬 쪽으로
    out[pid] = side; count[side]++;
  });
  return out;
}

// 이 선수가 이번 시즌 **실제로 뛴** 팀 (현재 소속과 다를 수 있다).
//
// 왜 필요한가: 이적 선수가 **옛 소속과 붙은 경기**에서는 현재 소속으로 가르면
//   한쪽이 6명이 된다. 예) Aiming 은 지금 KRX 인데 시즌 대부분을 KT 로 뛰었다
//   → KRX vs KT 경기에서 KRX 쪽에 원딜이 둘(Aiming·LazyFeel), KT 쪽엔 원딜이 없음.
//
// 어떻게 정하나 (2단계):
//   1차 — 현재 소속으로 가능한 만큼 배정하고, 남은 선수는 덜 찬 쪽에 넣는다.
//         이적 선수는 옛 소속 팀 경기(상대에 현 소속이 없는 경기)에서 자연히 옛 팀에 붙는다.
//   2차 — 그렇게 붙은 팀을 세어 다수결로 "이 선수가 뛴 팀"을 정한다.
//         이제 옛 소속과 붙은 경기에서도 올바른 편으로 간다.
// 결과는 한 번만 계산해 두고 재사용한다.
let _playedTeam = null;
function playedForTeam(pid) {
  if (!_playedTeam) {
    _playedTeam = {};
    const tally = {};
    // 1차 배정 — playedForTeam 을 쓰지 않는 기본 규칙 (여기서 부르면 무한 반복)
    const basic = (m, list) => {
      const res = {}, cnt = { a: 0, b: 0 }, rest = [];
      list.forEach(p => {
        if (p.side === "a" || p.side === "b") { res[p.pid] = p.side; cnt[p.side]++; return; }
        const t = (getPlayer(p.pid) || {}).team;
        if (t === m.a) { res[p.pid] = "a"; cnt.a++; }
        else if (t === m.b) { res[p.pid] = "b"; cnt.b++; }
        else rest.push(p.pid);
      });
      rest.forEach(id => { const s = cnt.a <= cnt.b ? "a" : "b"; res[id] = s; cnt[s]++; });
      return res;
    };
    Cache.matches.forEach(m => {
      const det = Cache.details[m.id];
      if (!det) return;
      det.sets.forEach(s => {
        const list = (s.players || []).filter(p => p && p.pid);
        const res = basic(m, list);
        list.forEach(p => {
          const team = res[p.pid] === "a" ? m.a : m.b;
          if (!team) return;
          (tally[p.pid] = tally[p.pid] || {})[team] = (tally[p.pid][team] || 0) + 1;
        });
      });
    });
    Object.keys(tally).forEach(id => {
      const e = Object.entries(tally[id]).sort((x, y) => y[1] - x[1]);
      if (e.length) _playedTeam[id] = e[0][0];
    });
  }
  return _playedTeam[pid] || null;
}

// 경기 POG: 전체 평균 1위 선수 (동률이면 참여자 많은 쪽 · 출전 기록이 있으면 출전 선수만)
// 완전 동률일 때는 선수 id 순으로 확정한다 — 그러지 않으면 DB가 행을 돌려주는 순서에 따라
// 새로고침할 때마다 MVP가 바뀐다 (실제로 10.0점 6명 동률인 경기가 있었다).
function pogForMatch(matchId) {
  const played = playedPidsForMatch(matchId);
  let best = null;
  // 경기 전체 기준 (세트 평점을 모두 합쳐서) — 색인이 이미 합쳐 둔 값을 쓴다
  const rolled = Object.values((Cache.idx && Cache.idx.rating) || {})
    .map(g => g.all).filter(Boolean);
  rolled.forEach(r => {
    if (r.match_id !== matchId || !r.n) return;
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
      sb.from("pom_awards").delete().eq("match_id", matchId).then(r => sbWriteFail(r.error, "setPOM.del"));
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
  sb.from("awards").delete().eq("id", id).then(r => sbWriteFail(r.error, "deleteAward"));
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
// 응원팀은 30일에 한 번만 바꿀 수 있다 (schema19). 팀 게시판이 그 팀 팬 전용이라,
// 아무 때나 바꿀 수 있으면 팀을 옮겨 다니며 아무 데나 글을 쓸 수 있기 때문이다.
// **판정은 서버가 한다.** 아래 값은 화면에 남은 날을 안내하기 위한 것일 뿐이다.
const FAV_COOLDOWN_DAYS = 30;

/** 지금 팀을 바꿀 수 있나 → { ok, days, at } (days = 남은 날) */
function favTeamLock() {
  if (!Auth.profile) return { ok: true, days: 0 };            // 비회원은 이 브라우저에만 남는다
  if (Auth.profile.is_admin) return { ok: true, days: 0 };
  if (!Auth.profile.fav_team) return { ok: true, days: 0 };   // 처음 정하는 건 자유
  const last = Auth.profile.fav_team_changed_at;
  if (!last) return { ok: true, days: 0 };
  const until = new Date(last).getTime() + FAV_COOLDOWN_DAYS * 86400e3;
  if (Date.now() >= until) return { ok: true, days: 0 };
  return { ok: false, days: Math.ceil((until - Date.now()) / 86400e3), at: new Date(until) };
}

/** 응원팀 저장. 서버가 거절하면 이유를 그대로 돌려준다 → { error } */
async function setFavTeam(teamId) {
  const before = getFavTeam();
  if ((before || "") === (teamId || "")) return {};           // 같은 값이면 아무 일도 없다
  setFavTeamLocal(teamId);
  if (!Auth.profile) return {};                               // 비회원은 로컬만
  Auth.profile.fav_team = teamId || null;
  const r = await sb.rpc("set_fav_team", { p_team: teamId || "" });
  if (isMissingFunction(r.error)) {
    await sb.from("profiles").update({ fav_team: teamId || null }).eq("id", Auth.profile.id);
    return {};
  }
  if (r.error) {
    // 서버가 막았다 → 화면을 되돌린다 (안 그러면 바뀐 것처럼 보인다)
    setFavTeamLocal(before);
    Auth.profile.fav_team = before || null;
    return { error: r.error.message || "응원팀을 바꾸지 못했습니다" };
  }
  Auth.profile.fav_team_changed_at = new Date().toISOString();
  return {};
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
// 경기 상세의 실제 기록만 한 선수 기준으로 모은다.
// 팬 평점/POM은 인기와 투표의 영향이 있어 경기력 육각형 계산에는 절대 섞지 않는다.
// tid를 주면 그 대회 경기만, 없으면 전체.
function radarRole(pos) {
  const p = String(pos || "").trim().toLowerCase();
  if (["탑", "top"].includes(p)) return "TOP";
  if (["정글", "jgl", "jungle"].includes(p)) return "JGL";
  if (["미드", "mid", "middle"].includes(p)) return "MID";
  if (["원딜", "adc", "bot", "bottom"].includes(p)) return "ADC";
  if (["서폿", "서포터", "sup", "support"].includes(p)) return "SUP";
  return "MID";
}

function setMinutes(set) {
  const raw = String((set && set.game && set.game.len) || "").trim();
  const mmss = raw.match(/^(\d+):(\d{1,2})$/);
  if (mmss) return Number(mmss[1]) + Number(mmss[2]) / 60;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function gameSideNumber(game, key, side) {
  const value = game && game[key] && game[key][side];
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function playerAggregate(pid, tid) {
  const player = getPlayer(pid);
  if (!player) return null;
  let sets = 0, wins = 0, k = 0, d = 0, a = 0, cs = 0, gold = 0, kpSum = 0, kpSets = 0;
  let dmg = 0, dmgSets = 0, vis = 0, visSets = 0, dmgShareSum = 0, dmgShareSets = 0, penta = 0;
  let minutes = 0, timedSets = 0, goldPmSum = 0, csPmSum = 0, kaPmSum = 0, assistPmSum = 0, deathPmSum = 0;
  let dpmSum = 0, dpmSets = 0, vspmSum = 0, vspmSets = 0;
  let goldShareSum = 0, goldShareSets = 0, csShareSum = 0, csShareSets = 0;
  let killShareSum = 0, killShareSets = 0, deathShareSum = 0, deathShareSets = 0;
  let visShareSum = 0, visShareSets = 0, laneGoldDiffPmSum = 0, laneGoldDiffSets = 0;
  let laneCsDiffPmSum = 0, laneCsDiffSets = 0, laneKillDiffPmSum = 0, laneKillDiffSets = 0;
  let duoGoldDiffPmSum = 0, duoGoldDiffSets = 0, duoCsDiffPmSum = 0, duoCsDiffSets = 0;
  let objControlSum = 0, objControlSets = 0, objPerSetSum = 0, objSets = 0;
  let towerControlSum = 0, towerControlSets = 0;
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
      // 딜량·시야는 최근에 수집한 경기에만 있다 (없는 세트는 평균에서 빼야 값이 왜곡되지 않는다)
      if (+row.dmg > 0) { dmg += +row.dmg; dmgSets++; }
      if (+row.vs > 0) { vis += +row.vs; visSets++; }
      penta += +row.penta || 0;

      // 편 가르기는 **그 세트 명단** 기준 (현재 소속으로 하면 이적 선수가 깨진다)
      const sides = setSides(m, s.players);
      const mySide = sides[pid];
      const mates = (s.players || []).filter(p => sides[p.pid] === mySide);
      const foes = (s.players || []).filter(p => sides[p.pid] && sides[p.pid] !== mySide);
      const role = radarRole(row.pos || player.pos);
      const sameRole = foes.find(p => radarRole(p.pos || (getPlayer(p.pid) || {}).pos) === role);
      const mins = setMinutes(s);

      // 킬 관여율 = (킬+어시) ÷ 우리 팀 총 킬
      const teamKills = mates.reduce((n, p) => n + (+p.k || 0), 0);
      if (teamKills > 0) { kpSum += (rk + ra) / teamKills; kpSets++; }

      // 딜 비중: 우리 팀 총 딜에서 내가 넣은 몫 (팀 색깔이 달라도 공평하게 비교된다)
      const teamDmg = mates.reduce((n, p) => n + (+p.dmg || 0), 0);
      if (teamDmg > 0 && +row.dmg > 0) { dmgShareSum += (+row.dmg) / teamDmg; dmgShareSets++; }

      const rowGold = (+row.gold || 0) * 1000;
      const teamGold = mates.reduce((n, p) => n + (+p.gold || 0) * 1000, 0);
      const teamCs = mates.reduce((n, p) => n + (+p.cs || 0), 0);
      const teamDeaths = mates.reduce((n, p) => n + (+p.d || 0), 0);
      const teamVision = mates.reduce((n, p) => n + (+p.vs || 0), 0);
      if (teamGold > 0 && rowGold > 0) { goldShareSum += rowGold / teamGold; goldShareSets++; }
      if (teamCs > 0 && +row.cs > 0) { csShareSum += (+row.cs) / teamCs; csShareSets++; }
      if (teamKills > 0) { killShareSum += rk / teamKills; killShareSets++; }
      if (teamDeaths > 0) { deathShareSum += rd / teamDeaths; deathShareSets++; }
      if (teamVision > 0 && +row.vs > 0) { visShareSum += (+row.vs) / teamVision; visShareSets++; }

      if (mins) {
        minutes += mins; timedSets++;
        goldPmSum += rowGold / mins;
        csPmSum += (+row.cs || 0) / mins;
        kaPmSum += (rk + ra) / mins;
        assistPmSum += ra / mins;
        deathPmSum += rd / mins;
        if (+row.dmg > 0) { dpmSum += (+row.dmg) / mins; dpmSets++; }
        if (+row.vs > 0) { vspmSum += (+row.vs) / mins; vspmSets++; }

        if (sameRole) {
          laneGoldDiffPmSum += (rowGold - (+sameRole.gold || 0) * 1000) / mins;
          laneGoldDiffSets++;
          laneCsDiffPmSum += ((+row.cs || 0) - (+sameRole.cs || 0)) / mins;
          laneCsDiffSets++;
          laneKillDiffPmSum += (rk - (+sameRole.k || 0)) / mins;
          laneKillDiffSets++;
        }

        // 서포터 라인전은 개인 CS가 아니라 양 팀 봇 듀오(원딜+서폿)의 합으로 본다.
        const botRoles = new Set(["ADC", "SUP"]);
        const ourBot = mates.filter(p => botRoles.has(radarRole(p.pos || (getPlayer(p.pid) || {}).pos)));
        const theirBot = foes.filter(p => botRoles.has(radarRole(p.pos || (getPlayer(p.pid) || {}).pos)));
        if (ourBot.length >= 2 && theirBot.length >= 2) {
          const ourGold = ourBot.reduce((n, p) => n + (+p.gold || 0) * 1000, 0);
          const theirGold = theirBot.reduce((n, p) => n + (+p.gold || 0) * 1000, 0);
          const ourCs = ourBot.reduce((n, p) => n + (+p.cs || 0), 0);
          const theirCs = theirBot.reduce((n, p) => n + (+p.cs || 0), 0);
          duoGoldDiffPmSum += (ourGold - theirGold) / mins; duoGoldDiffSets++;
          duoCsDiffPmSum += (ourCs - theirCs) / mins; duoCsDiffSets++;
        }
      }

      // 오브젝트는 개인 막타가 아니라 선수가 출전한 세트의 팀 확보 비율이다.
      // UI에도 팀 기록임을 명시해 개인 기여로 과장하지 않는다.
      const otherSide = mySide === "a" ? "b" : "a";
      // 유충 1마리를 바론 1회와 같게 세면 유충이 축을 압도한다. 전략 가치에 맞춰
      // 드래곤 1, 전령 1, 유충 1/3, 바론·아타칸 1.5의 고정 가중치를 쓴다.
      const objectWeights = { dragons: 1, barons: 1.5, heralds: 1, grubs: 1 / 3, atakhan: 1.5 };
      const ownObj = Object.entries(objectWeights).reduce((n, [key, weight]) =>
        n + gameSideNumber(s.game, key, mySide) * weight, 0);
      const oppObj = Object.entries(objectWeights).reduce((n, [key, weight]) =>
        n + gameSideNumber(s.game, key, otherSide) * weight, 0);
      if (ownObj + oppObj > 0) { objControlSum += ownObj / (ownObj + oppObj); objControlSets++; }
      if (s.game && Object.keys(s.game).length) { objPerSetSum += ownObj; objSets++; }
      const ownTowers = gameSideNumber(s.game, "towers", mySide);
      const oppTowers = gameSideNumber(s.game, "towers", otherSide);
      if (ownTowers + oppTowers > 0) {
        towerControlSum += ownTowers / (ownTowers + oppTowers); towerControlSets++;
      }

      const won = mySide === s.win;
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
    dmgAvg: dmgSets ? dmg / dmgSets : null,          // 세트당 챔피언 딜량
    dmgShare: dmgShareSets ? dmgShareSum / dmgShareSets : null,  // 팀 내 딜 비중
    visAvg: visSets ? vis / visSets : null,          // 세트당 시야 점수
    minutes, timedSets,
    gpm: timedSets ? goldPmSum / timedSets : null,
    csm: timedSets ? csPmSum / timedSets : null,
    dpm: dpmSets ? dpmSum / dpmSets : null,
    vspm: vspmSets ? vspmSum / vspmSets : null,
    kaPm: timedSets ? kaPmSum / timedSets : null,
    assistPm: timedSets ? assistPmSum / timedSets : null,
    deathPm: timedSets ? deathPmSum / timedSets : null,
    goldShare: goldShareSets ? goldShareSum / goldShareSets : null,
    csShare: csShareSets ? csShareSum / csShareSets : null,
    killShare: killShareSets ? killShareSum / killShareSets : null,
    deathShare: deathShareSets ? deathShareSum / deathShareSets : null,
    visShare: visShareSets ? visShareSum / visShareSets : null,
    laneGoldDiffPm: laneGoldDiffSets ? laneGoldDiffPmSum / laneGoldDiffSets : null,
    laneCsDiffPm: laneCsDiffSets ? laneCsDiffPmSum / laneCsDiffSets : null,
    laneKillDiffPm: laneKillDiffSets ? laneKillDiffPmSum / laneKillDiffSets : null,
    duoGoldDiffPm: duoGoldDiffSets ? duoGoldDiffPmSum / duoGoldDiffSets : null,
    duoCsDiffPm: duoCsDiffSets ? duoCsDiffPmSum / duoCsDiffSets : null,
    objControl: objControlSets ? objControlSum / objControlSets : null,
    objPerSet: objSets ? objPerSetSum / objSets : null,
    towerControl: towerControlSets ? towerControlSum / towerControlSets : null,
    dmgEfficiency: dmgShareSets && goldShareSets && goldShareSum > 0
      ? (dmgShareSum / dmgShareSets) / (goldShareSum / goldShareSets) : null,
    pentakills: penta,
    hasNewStats: dmgSets > 0,
    fan: fanAvg, fanCount: hist.length,
    pom: pomPts,
    champs: Object.values(champs).sort((x, y) => y.sets - x.sets),
  };
}

const metric = (key, weight, direction) => ({ key, weight: weight || 1, direction: direction || 1 });
const pctText = v => v == null ? "-" : `${Math.round(v * 100)}%`;
const numText = (v, digits) => v == null ? "-" : Number(v).toFixed(digits == null ? 1 : digits);
const signedText = (v, suffix) => v == null ? "-" : `${v >= 0 ? "+" : ""}${Math.round(v)}${suffix || ""}`;

// 모든 카드에서 12시부터 시계 방향으로: 초반 → 성장/운영 → 공격 → 교전 → 안정성 → 특화.
// 각 축은 한 숫자를 임의 가공하지 않고, 아래 실측 지표들의 동 포지션 백분위를 가중 평균한다.
const ROLE_RADAR_AXES = {
  TOP: [
    { key: "lane", label: "라인전", metrics: [metric("laneGoldDiffPm", .55), metric("laneCsDiffPm", .35), metric("laneKillDiffPm", .1)], evidence: s => `골드차/분 ${signedText(s.laneGoldDiffPm)} · CS차/분 ${numText(s.laneCsDiffPm, 2)}` },
    { key: "growth", label: "성장", metrics: [metric("gpm", .45), metric("csm", .35), metric("goldShare", .2)], evidence: s => `GPM ${numText(s.gpm, 0)} · CSM ${numText(s.csm)} · 골드 ${pctText(s.goldShare)}` },
    { key: "damage", label: "딜링", metrics: [metric("dpm", .55), metric("dmgShare", .45)], evidence: s => `DPM ${numText(s.dpm, 0)} · 딜 비중 ${pctText(s.dmgShare)}` },
    { key: "fight", label: "교전", metrics: [metric("kp", .45), metric("kaPm", .35), metric("killShare", .2)], evidence: s => `킬관여 ${pctText(s.kp)} · K+A/분 ${numText(s.kaPm, 2)}` },
    { key: "survival", label: "생존", metrics: [metric("deathPm", .55, -1), metric("kda", .3), metric("deathShare", .15, -1)], evidence: s => `데스/분 ${numText(s.deathPm, 2)} · KDA ${numText(s.kda, 2)}` },
    { key: "side", label: "사이드", metrics: [metric("csShare", .35), metric("laneCsDiffPm", .25), metric("towerControl", .2), metric("goldShare", .2)], evidence: s => `CS 비중 ${pctText(s.csShare)} · 팀 타워 ${pctText(s.towerControl)}` },
  ],
  JGL: [
    { key: "early", label: "초반개입", metrics: [metric("kaPm", .45), metric("kp", .35), metric("laneGoldDiffPm", .2)], evidence: s => `K+A/분 ${numText(s.kaPm, 2)} · 킬관여 ${pctText(s.kp)}` },
    { key: "objective", label: "오브젝트", metrics: [metric("objControl", .65), metric("objPerSet", .35)], evidence: s => `팀 확보율 ${pctText(s.objControl)} · 세트당 ${numText(s.objPerSet)}` },
    { key: "growth", label: "성장", metrics: [metric("gpm", .5), metric("csm", .3), metric("goldShare", .2)], evidence: s => `GPM ${numText(s.gpm, 0)} · CSM ${numText(s.csm)}` },
    { key: "fight", label: "교전", metrics: [metric("kp", .45), metric("kaPm", .35), metric("killShare", .2)], evidence: s => `킬관여 ${pctText(s.kp)} · K+A/분 ${numText(s.kaPm, 2)}` },
    { key: "survival", label: "생존", metrics: [metric("deathPm", .55, -1), metric("kda", .3), metric("deathShare", .15, -1)], evidence: s => `데스/분 ${numText(s.deathPm, 2)} · KDA ${numText(s.kda, 2)}` },
    { key: "team", label: "팀기여", metrics: [metric("kp", .35), metric("assistPm", .25), metric("visShare", .2), metric("objControl", .2)], evidence: s => `킬관여 ${pctText(s.kp)} · 시야 비중 ${pctText(s.visShare)}` },
  ],
  MID: [
    { key: "lane", label: "라인전", metrics: [metric("laneGoldDiffPm", .55), metric("laneCsDiffPm", .35), metric("laneKillDiffPm", .1)], evidence: s => `골드차/분 ${signedText(s.laneGoldDiffPm)} · CS차/분 ${numText(s.laneCsDiffPm, 2)}` },
    { key: "growth", label: "성장", metrics: [metric("gpm", .5), metric("csm", .35), metric("goldShare", .15)], evidence: s => `GPM ${numText(s.gpm, 0)} · CSM ${numText(s.csm)}` },
    { key: "damage", label: "딜링", metrics: [metric("dpm", .55), metric("dmgShare", .45)], evidence: s => `DPM ${numText(s.dpm, 0)} · 딜 비중 ${pctText(s.dmgShare)}` },
    { key: "fight", label: "교전", metrics: [metric("kp", .45), metric("kaPm", .35), metric("killShare", .2)], evidence: s => `킬관여 ${pctText(s.kp)} · K+A/분 ${numText(s.kaPm, 2)}` },
    { key: "survival", label: "생존", metrics: [metric("deathPm", .55, -1), metric("kda", .3), metric("deathShare", .15, -1)], evidence: s => `데스/분 ${numText(s.deathPm, 2)} · KDA ${numText(s.kda, 2)}` },
    { key: "roam", label: "로밍", metrics: [metric("assistPm", .4), metric("kp", .35), metric("vspm", .25)], evidence: s => `어시/분 ${numText(s.assistPm, 2)} · 킬관여 ${pctText(s.kp)}` },
  ],
  ADC: [
    { key: "lane", label: "라인전", metrics: [metric("laneGoldDiffPm", .55), metric("laneCsDiffPm", .35), metric("laneKillDiffPm", .1)], evidence: s => `골드차/분 ${signedText(s.laneGoldDiffPm)} · CS차/분 ${numText(s.laneCsDiffPm, 2)}` },
    { key: "growth", label: "성장", metrics: [metric("gpm", .5), metric("csm", .35), metric("goldShare", .15)], evidence: s => `GPM ${numText(s.gpm, 0)} · CSM ${numText(s.csm)}` },
    { key: "damage", label: "딜링", metrics: [metric("dpm", .55), metric("dmgShare", .45)], evidence: s => `DPM ${numText(s.dpm, 0)} · 딜 비중 ${pctText(s.dmgShare)}` },
    { key: "fight", label: "교전", metrics: [metric("kp", .35), metric("kaPm", .3), metric("killShare", .35)], evidence: s => `킬관여 ${pctText(s.kp)} · 킬 비중 ${pctText(s.killShare)}` },
    { key: "survival", label: "생존", metrics: [metric("deathPm", .55, -1), metric("kda", .3), metric("deathShare", .15, -1)], evidence: s => `데스/분 ${numText(s.deathPm, 2)} · KDA ${numText(s.kda, 2)}` },
    { key: "carry", label: "캐리력", metrics: [metric("dmgEfficiency", .45), metric("dmgShare", .35), metric("killShare", .2)], evidence: s => `자원 대비 딜 ${numText(s.dmgEfficiency, 2)} · 딜 비중 ${pctText(s.dmgShare)}` },
  ],
  SUP: [
    { key: "lane", label: "라인전", metrics: [metric("duoGoldDiffPm", .55), metric("duoCsDiffPm", .25), metric("kaPm", .2)], evidence: s => `봇듀오 골드차/분 ${signedText(s.duoGoldDiffPm)} · CS차/분 ${numText(s.duoCsDiffPm, 2)}` },
    { key: "vision", label: "시야", metrics: [metric("vspm", .55), metric("visShare", .45)], evidence: s => `시야점수/분 ${numText(s.vspm, 2)} · 팀 비중 ${pctText(s.visShare)}` },
    { key: "fight", label: "교전", metrics: [metric("kp", .45), metric("assistPm", .35), metric("kaPm", .2)], evidence: s => `킬관여 ${pctText(s.kp)} · 어시/분 ${numText(s.assistPm, 2)}` },
    { key: "survival", label: "생존", metrics: [metric("deathPm", .55, -1), metric("kda", .3), metric("deathShare", .15, -1)], evidence: s => `데스/분 ${numText(s.deathPm, 2)} · KDA ${numText(s.kda, 2)}` },
    { key: "roam", label: "로밍", metrics: [metric("assistPm", .4), metric("kp", .35), metric("vspm", .25)], evidence: s => `어시/분 ${numText(s.assistPm, 2)} · 시야점수/분 ${numText(s.vspm, 2)}` },
    { key: "team", label: "팀기여", metrics: [metric("kp", .3), metric("visShare", .3), metric("assistPm", .2), metric("objControl", .2)], evidence: s => `킬관여 ${pctText(s.kp)} · 시야 비중 ${pctText(s.visShare)}` },
  ],
};

// 같은 포지션 선수들 사이에서 몇 등쯤인지를 0~100으로 (50 = 딱 중간)
function radarData(pid, tid) {
  const me = playerAggregate(pid, tid);
  if (!me) return null;
  const role = radarRole(me.pos);
  const peers = getPlayers()
    .filter(p => radarRole(p.pos) === role && p.id !== pid)
    .map(p => playerAggregate(p.id, tid))
    .filter(s => s && s.sets > 0);

  const cohort = [me].concat(peers);
  const axes = (ROLE_RADAR_AXES[role] || ROLE_RADAR_AXES.MID).map(ax => {
    const componentScore = (subject, m) => {
      const raw = subject[m.key];
      if (raw == null || !Number.isFinite(Number(raw))) return null;
      const vals = cohort.map(s => s[m.key]).filter(v => v != null && Number.isFinite(Number(v)))
        .map(Number).map(v => v * m.direction).sort((x, y) => x - y);
      if (vals.length < 2) return null;
      const value = Number(raw) * m.direction;
      const below = vals.filter(x => x < value).length;
      const same = vals.filter(x => x === value).length;
      return ((below + same / 2) / vals.length) * 100;
    };
    const axisScore = subject => {
      const parts = ax.metrics.map(m => ({ score: componentScore(subject, m), weight: m.weight }))
        .filter(x => x.score != null);
      if (!parts.length) return null;
      return Math.round(parts.reduce((n, x) => n + x.score * x.weight, 0) /
        parts.reduce((n, x) => n + x.weight, 0));
    };
    const mine = axisScore(me);
    const peerScores = peers.map(axisScore).filter(v => v != null);
    const avg = peerScores.length ? Math.round(peerScores.reduce((n, v) => n + v, 0) / peerScores.length) : 50;
    return {
      key: ax.key, label: ax.label,
      score: mine == null ? 50 : mine,
      avgScore: avg,
      available: mine != null,
      text: mine == null ? "데이터 부족" : ax.evidence(me),
    };
  });
  return { stats: me, axes, role };
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
// setIndex 는 **저장될 진짜 세트 번호**다 (0 = 1세트). 배열 위치가 아니다.
// 예전에는 배열 위치를 받고 새 세트 번호를 max(_idx)+1 로 지어냈다. 그래서
// 2세트만 수집된 경기에서 "1세트 저장"이 2세트를 덮어쓰고, "2세트 저장"은
// 있지도 않은 3세트를 만들었다. 빠진 1세트는 손으로 넣을 방법조차 없었다.
function saveDetailSet(matchId, setIndex, setData) {
  const d = Cache.details[matchId] = Cache.details[matchId] || { sets: [] };
  const pos = d.sets.findIndex(s => (s._idx ?? -1) === setIndex);
  if (pos >= 0) d.sets[pos] = { _idx: setIndex, ...setData };
  else {
    d.sets.push({ _idx: setIndex, ...setData });
    d.sets.sort((x, y) => (x._idx ?? 0) - (y._idx ?? 0));   // 중간 세트를 채웠을 때 순서 유지
  }
  sb.from("match_details").upsert({ match_id: matchId, set_index: setIndex, win: setData.win, players: setData.players })
    .then(r => sbWriteFail(r.error, "saveDetailSet"));
}
function deleteDetailSet(matchId, setIndex) {
  const d = Cache.details[matchId];
  const pos = d ? d.sets.findIndex(s => (s._idx ?? -1) === setIndex) : -1;
  if (pos < 0) return;
  d.sets.splice(pos, 1);
  if (!d.sets.length) delete Cache.details[matchId];
  sb.from("match_details").delete().eq("match_id", matchId).eq("set_index", setIndex)
    .then(r => sbWriteFail(r.error, "deleteDetailSet"));
}

// ── 팬심지수: 투표 ──
function getPolls() { return Cache.polls; }
// 경기 화면의 공식 팬심지수. **phase 가 있는 투표만** 공식이다 (pre / post_pom / post_key —
// 전부 관리자 화면이 만든다). phase 없이 match_id 만 단 투표는 회원이 끼워 넣은 것일 수
// 있으므로 공식 화면에 올리지 않는다. (2026-08-09 P0-1)
function pollsForMatch(matchId) {
  return Cache.polls.filter(p => p.match_id === matchId && p.phase);
}
function getPollByPost(postId) { return Cache.polls.find(p => p.post_id === postId); }
function pollOpen(poll) { return !poll.closes_at || new Date(poll.closes_at) > new Date(); }

// 관리자 공식 투표 (팬심지수 pre/post_pom/post_key). RLS admin_all_polls 로만 통과한다.
function createPoll(p) {
  p.id = p.id || "poll" + Date.now() + Math.random().toString(36).slice(2, 6);
  Cache.polls.push(p);
  createPoll.lastSave = sb.from("polls").insert({
    id: p.id, match_id: p.match_id || null, phase: p.phase || null, post_id: p.post_id || null,
    question: p.question, options: p.options, multi: !!p.multi, closes_at: p.closes_at || null,
  }).then(r => { sbErr(r.error, "createPoll"); return r; });
  return p.id;
}

/** 회원이 자기 글에 붙이는 자유 투표 — RPC 로만 만든다 (schema22).
 *  match_id·phase 는 서버가 강제로 NULL 로 두므로 여기서 받지도 않는다.
 *  예전처럼 직접 INSERT 를 하면, 정책이 검사하지 않는 칸(match_id)에 값을 실어
 *  공식 경기 화면에 투표를 끼워 넣을 수 있었다 (P0-1). */
function createMemberPoll(p) {
  p.id = p.id || "poll" + Date.now() + Math.random().toString(36).slice(2, 6);
  p.match_id = null; p.phase = null;
  Cache.polls.push(p);
  createMemberPoll.lastSave = sb.rpc("create_member_poll", {
    p_id: p.id, p_post_id: p.post_id, p_question: p.question,
    p_options: p.options, p_multi: !!p.multi, p_closes_at: p.closes_at || null,
  }).then(r => {
    // ⚠ 예전에는 RPC 가 없을 때(schema22 미적용) 직접 INSERT 로 되돌아가는 폴백이 있었다.
    //   지금은 schema25(FINAL)까지 적용돼 **회원 직접 INSERT 정책 자체가 없어졌으므로**
    //   그 폴백은 어차피 막힌다. 남겨 두면 "아직 우회로가 있다"고 오해하게 만들어 지웠다.
    //   (2026-08-12 운영 확인: member_insert_polls 정책 없음, RPC 는 회원만 실행 가능)
    sbErr(r.error, "createMemberPoll");
    return r;
  });
  return p.id;
}
// 경기 토론 글 — 관리자가 경기마다 만드는 "공식 경기방" 글.
// 경기 페이지의 댓글이 이 글에 달린다. 글과 경기방은 같은 대화를 공유한다.
//
// ⚠ **오직 official(관리자만 켤 수 있는 표시)만 믿는다.** 제목("[경기 토론]…")은
//   누구나 흉내 낼 수 있어서, 예전처럼 제목으로 폴백하면 공격자가 관리자보다 먼저
//   흉내 글을 올려 경기방을 **가로챌 수 있었다** (적대적 검토 발견 1).
//   관리 토론방은 관리자가 sync 를 돌릴 때 **지연 생성**되므로 "관리자 글이 항상
//   먼저"라는 가정도 거짓이었다. official 이 없으면 '경기방 없음'으로 두는 편이
//   흉내 글을 노출하는 것보다 안전하다.
//   (schema22/23 배포 → 백필로 기존 관리 토론방이 official=true 가 된 뒤 코드가
//    배포되므로, 정상 경기방은 그대로 보인다. 배포 순서는 docs/P0_DEPLOY.md)
function matchTalkPost(matchId) {
  const officials = Cache.posts.filter(p => p.match_id === matchId && p.official);
  return officials.length ? officials.reduce((a, b) => (a.ts <= b.ts ? a : b)) : null;
}

// 투표 질문·마감 고치기 (관리자 전용 — RLS admin_all_polls).
// 일정 갱신이 경기 시각을 옮기면 투표 마감이 옛 시각에 박제되는 사고를 고치는 용도.
function updatePoll(pollId, fields) {
  const p = Cache.polls.find(x => x.id === pollId);
  if (p) Object.assign(p, fields);
  return sb.from("polls").update(fields).eq("id", pollId)
    .then(r => { sbErr(r.error, "updatePoll"); return r; });
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
  return sb.from("site_settings").upsert({ key, value }).then(r => {
    sbErr(r.error, "setSetting");
    return r;
  });
}
// 서버가 바꾼 설정을 다시 읽어 온다.
// 수집기(api/leaguepedia.js)가 lp_aliases 에 자동 연결을 덧붙이므로, 수집 직후에는
// 화면이 들고 있는 값이 옛것이다. 그대로 저장하면 방금 이어진 이름이 날아간다.
async function reloadSetting(key) {
  const r = await sb.from("site_settings").select("value").eq("key", key).maybeSingle();
  if (!r.error && r.data) Cache.settings[key] = r.data.value || "";
  return getSetting(key);
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
    // 로고 캐시(하루)를 무효화 — 바꾼 로고가 바로 보이게
    try { localStorage.removeItem(LOGO_KEY + "_at"); } catch {}
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
// 프로필 만들기 — 서버 함수로 (닉네임 중복·관리자 승격을 서버가 막고,
// 약관·개인정보 동의 없이는 가입 자체를 거부한다 — schema17)
async function saveProfile(nick, favTeam, agreed) {
  let r = await sb.rpc("create_profile", { p_nick: nick, p_fav_team: favTeam || "", p_terms: !!agreed });
  if (isMissingFunction(r.error))             // schema17 실행 전 — 동의 인자 없는 판으로
    r = await sb.rpc("create_profile", { p_nick: nick, p_fav_team: favTeam || "" });
  if (isMissingFunction(r.error)) {           // schema14 실행 전
    const { error } = await sb.from("profiles")
      .insert({ id: Auth.session.user.id, nick, fav_team: favTeam || null });
    if (!error) return null;
    return (error.code === "23505" || /duplicate/.test(error.message || ""))
      ? { message: "이미 사용 중인 닉네임입니다." } : error;
  }
  if (r.error) return { message: (r.error.message || "").replace(/^.*?:\s*/, "") };
  if (r.data) Auth.profile = r.data;
  return null;
}

async function sbSignUp(email, password, nick, favTeam, agreed) {
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) return { error };
  if (!data.session) return { needConfirm: true }; // 이메일 확인이 켜져 있는 경우
  const pErr = await saveProfile(nick, favTeam, agreed);
  if (pErr) return { error: pErr };
  return { session: data.session };
}
async function sbSignOut() {
  await sb.auth.signOut();
  // 스냅샷에 로그인 상태가 남으면 다음 방문에서 이전 회원의 팀·기록이 보인다
  Auth.session = null;
  Auth.profile = null;
  Cache.myVoter = null;
  // ⚠ 키를 하나라도 빠뜨리면 그걸 읽는 코드가 그 자리에서 터진다
  //   (postUpvotes 가 빠져 있어서 로그아웃 직후 글 추천을 누르면 오류가 났다 — 2026-08-07)
  Cache.mine = { predictions: [], ratings: [], pollVotes: [], reactions: [], commentLikes: [], postUpvotes: [] };
  try { localStorage.removeItem(SNAP_KEY); } catch {}
  snapshotSave();
}
// 로그인은 됐지만 프로필이 없는 회원용 (이메일 확인을 거친 가입 등)
async function completeProfile(nick, favTeam, agreed) {
  if (!Auth.session) return { error: { message: "로그인이 필요합니다." } };
  const err = await saveProfile(nick, favTeam, agreed);
  if (err) return { error: err };
  Auth.profile = { id: Auth.session.user.id, nick, fav_team: favTeam || null, is_admin: false };
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
  // 나중에 받은 상세도 스냅샷에 담아 둔다 (다음 방문에 즉시 보이도록)
  loadDetailsLater().then(() => snapshotSave()).catch(() => {});
  if (snapshotUsed && before !== cacheFingerprint()) showRefreshToast();
})();

const storeReady = snapshotUsed ? Promise.resolve() : storeFresh;

// ── LCK 경기 일정 자동 따라가기 ────────────────────────────
// 서버가 Leaguepedia 일정표를 보고 우리 경기 표를 맞춘다. 매일 자동으로도 돌지만,
// 요금제에 따라 하루 한 번뿐일 수 있어서 방문자가 들어올 때도 한 번 신호를 보낸다.
// 실제 갱신 간격은 **서버가** 정한다(기본 30분) — 여러 명이 동시에 들어와도 한 번만 돈다.
function pingScheduleSync() {
  try {
    if (sessionStorage.getItem("nexus_sched_ping")) return;
    sessionStorage.setItem("nexus_sched_ping", "1");
  } catch { /* 저장소를 못 쓰면 그냥 한 번 보낸다 */ }
  fetch("/api/schedule-sync", { method: "GET", keepalive: true })
    .then(r => r.ok ? r.json() : null)
    .then(j => { if (j && j.data && j.data.갱신한경기) console.log("[일정] 갱신", j.data); })
    .catch(() => { /* 로컬 개발 등 서버 함수가 없으면 조용히 넘어간다 */ });
}
storeFresh.then(pingScheduleSync).catch(() => {});

// 페이지를 떠날 때 (투표·평점 등 방금 바꾼 내용까지) 스냅샷 갱신
addEventListener("pagehide", snapshotSave);

// ── 마이페이지: 내가 한 일 모아 보기 ─────────────────────────────
//
// 재료는 전부 **이미 받아 둔 것**이다 (Cache.mine + Cache.posts + Cache.polls …).
// 서버에 새로 물어보지 않는다.
//
// ⚠ 정직성: 반응·추천·평점·투표에는 **누른 시각이 서버에 없다.**
//   그래서 "최근 활동순"이라고 쓰면 거짓말이 된다. 경기 날짜순·글 최신순으로 정렬하고
//   화면에도 그렇게 적는다. (내가 쓴 글·댓글만 진짜 작성 시각이 있다)

/** 내가 준 선수 평점 — [{ player, match, setIndex, score }] 최신 경기순 */
function myRatingList() {
  const out = [];
  (Cache.mine.ratings || []).forEach(r => {
    const p = getPlayer(r.player_id), m = Cache.matches.find(x => x.id === r.match_id);
    if (!p) return;
    out.push({ player: p, match: m || null, setIndex: r.set_index, score: r.score });
  });
  return out.sort((a, b) => (b.match ? +new Date(b.match.at) : 0) - (a.match ? +new Date(a.match.at) : 0));
}

/** 내가 한 투표 — [{ poll, match, picked: ["2:1 승", …] }] 최신 경기순 */
function myPollList() {
  const out = [];
  (Cache.mine.pollVotes || []).forEach(v => {
    const poll = (Cache.polls || []).find(p => p.id === v.poll_id);
    if (!poll) return;
    const opts = poll.options || [];
    const picked = (v.choices || []).map(i => opts[i]).filter(Boolean);
    if (!picked.length) return;
    out.push({ poll, match: Cache.matches.find(x => x.id === poll.match_id) || null, picked });
  });
  return out.sort((a, b) => (b.match ? +new Date(b.match.at) : 0) - (a.match ? +new Date(a.match.at) : 0));
}

/** 내가 추천하거나 반응한 글 — [{ post, up, kinds:[] }] 글 최신순.
 *  추천과 반응을 따로 두면 양쪽 다 거의 비어 보여서 한 목록으로 합친다. */
function myPostActivity() {
  const by = {};
  const touch = id => (by[id] = by[id] || { post: getPost(id), up: false, kinds: [] });
  (Cache.mine.postUpvotes || []).forEach(x => { touch(x.post_id).up = true; });
  (Cache.mine.reactions || []).forEach(x => { const t = touch(x.post_id); if (x.kind) t.kinds.push(x.kind); });
  return Object.values(by).filter(x => x.post).sort((a, b) => b.post.ts - a.post.ts);
}

/** 내가 추천한 댓글 — [{ post, comment }] 글 최신순 */
function myCommentLikeList() {
  const liked = new Set((Cache.mine.commentLikes || []).map(x => x.comment_id));
  const out = [];
  (Cache.posts || []).forEach(p => (p.comments || []).forEach(c => {
    if (c.id != null && liked.has(c.id)) out.push({ post: p, comment: c });
  }));
  return out.sort((a, b) => b.comment.ts - a.comment.ts);
}

/** 내가 쓴 글 / 댓글 — 회원만. 진짜 작성 시각이 있어 시간순으로 줄 세울 수 있다.
 *  비회원 글은 주인을 가리키는 칸이 없어(닉네임도 글마다 새로 뽑힌다) 되찾을 수 없다. */
function myWritten() {
  const uid = Auth.session && Auth.session.user && Auth.session.user.id;
  if (!uid) return { posts: [], comments: [] };
  const posts = (Cache.posts || []).filter(p => p.author_id === uid).sort((a, b) => b.ts - a.ts);
  const comments = [];
  (Cache.posts || []).forEach(p => (p.comments || []).forEach(c => {
    if (c.author_id === uid) comments.push({ post: p, comment: c });
  }));
  comments.sort((a, b) => b.comment.ts - a.comment.ts);
  return { posts, comments };
}

/** 창립 팬으로 받은 번호 — [{ team, no }] (여러 팀에 등록했을 수도 있다) */
function myFoundingNos() {
  const uid = Auth.session && Auth.session.user && Auth.session.user.id;
  if (!uid) return [];
  return (Cache.founding || []).filter(f => f.user_id === uid)
    .map(f => ({ team: f.team, no: f.no })).sort((a, b) => a.no - b.no);
}

/** 예측 랭킹에서 내 자리 — 회원 + 채점 5경기 이상일 때만 등재된다 */
function myRankingRow() {
  if (!Auth.profile) return null;
  const list = predictRanking ? predictRanking() : [];
  const i = list.findIndex(r => r.nick === Auth.profile.nick);
  return i < 0 ? null : { rank: i + 1, total: list.length, row: list[i] };
}
