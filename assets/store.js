// ── 데이터 계층 (Supabase 연동) ──────────────────────────
// 모든 데이터는 Supabase(서울 리전)에 저장되어 모든 방문자가 공유한다.
// 페이지 로드 시 storeInit()이 전체 데이터를 한 번 받아 캐시에 두고,
// 화면 코드는 기존과 동일하게 동기 함수로 읽는다. 쓰기는 낙관적으로
// 캐시를 먼저 고치고 서버에 비동기 저장한다.

const SB_URL = "https://ckbxvhdvhczpxtgkpbsv.supabase.co";
const SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrYnh2aGR2aGN6cHh0Z2twYnN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2NzQ5NzUsImV4cCI6MjEwMTI1MDk3NX0.TbCe1ybebiLNsUegL4s1ZbGa-TZsyPPWj9xzxMAPssU";
const sb = window.supabase.createClient(SB_URL, SB_ANON);

// 로그인 상태 (storeInit에서 채움)
const Auth = { session: null, profile: null };

// 방문자 id (예측·평점 1인 1표 식별용) — 로그인 시 계정 id, 아니면 브라우저 익명 id
function voterId() {
  if (Auth.session) return Auth.session.user.id;
  let v = localStorage.getItem("lckdb_voter");
  if (!v) {
    v = "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    localStorage.setItem("lckdb_voter", v);
  }
  return v;
}

const Cache = {
  tournaments: [], matches: [], records: [], players: [],
  posts: [], predictions: [], ratings: [], details: {}, chat: {},
};

function sbErr(e, what) { if (e) console.error("[supabase]", what, e.message); }

// ── 초기 로드 ──
async function storeInit() {
  // 로그인 세션 + 프로필
  try {
    const { data: { session } } = await sb.auth.getSession();
    Auth.session = session;
    if (session) {
      const { data: prof } = await sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      Auth.profile = prof || null;
    }
  } catch (e) { console.error("[supabase] auth", e); }

  const [t, m, r, pl, po, co, pr, ra, de] = await Promise.all([
    sb.from("tournaments").select("*"),
    sb.from("matches").select("*").order("at"),
    sb.from("stage_records").select("*").order("ord"),
    sb.from("players").select("*"),
    sb.from("posts").select("*").order("created_at", { ascending: false }),
    sb.from("comments").select("*").order("created_at"),
    sb.from("predictions").select("*"),
    sb.from("ratings").select("*"),
    sb.from("match_details").select("*").order("set_index"),
  ]);
  [t, m, r, pl, po, co, pr, ra, de].forEach((res, i) => sbErr(res.error, "load#" + i));

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
    (commentsByPost[c.post_id] = commentsByPost[c.post_id] || []).push({ nick: c.nick, body: c.body, ts: Date.parse(c.created_at) });
  });
  Cache.posts = (po.data || []).map(x => ({
    id: x.id, team: x.team, cat: x.cat, title: x.title, body: x.body, nick: x.nick,
    up: x.up, views: x.views, ts: Date.parse(x.created_at), comments: commentsByPost[x.id] || [],
  }));

  Cache.predictions = pr.data || [];
  Cache.ratings = ra.data || [];

  Cache.details = {};
  (de.data || []).forEach(row => {
    const d = Cache.details[row.match_id] = Cache.details[row.match_id] || { sets: [] };
    d.sets.push({ _idx: row.set_index, win: row.win, players: row.players || [] });
  });
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
function addPost(p) {
  if (Auth.profile) p.nick = Auth.profile.nick; // 회원은 고정 닉네임 사용
  p.id = "p" + Date.now();
  p.ts = Date.now(); p.views = 0; p.up = 0; p.comments = [];
  Cache.posts.unshift(p);
  sb.from("posts").insert({ id: p.id, team: p.team, cat: p.cat, title: p.title, body: p.body, nick: p.nick })
    .then(r => sbErr(r.error, "addPost"));
  return p.id;
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
function addComment(postId, nick, body) {
  if (Auth.profile) nick = Auth.profile.nick;
  const p = Cache.posts.find(x => x.id === postId);
  if (p) p.comments.push({ nick, body, ts: Date.now() });
  sb.from("comments").insert({ post_id: postId, nick, body }).then(r => sbErr(r.error, "addComment"));
}

// ── 승부예측 ──
function getVotes() {
  const me = voterId();
  const out = {};
  Cache.predictions.forEach(p => { if (p.voter === me) out[p.match_id] = p.side; });
  return out;
}
function setVote(matchId, side) {
  const me = voterId();
  const existing = Cache.predictions.find(p => p.match_id === matchId && p.voter === me);
  if (existing) existing.side = side;
  else Cache.predictions.push({ match_id: matchId, voter: me, side });
  sb.from("predictions").upsert({ match_id: matchId, voter: me, side }).then(r => sbErr(r.error, "setVote"));
}
// 실제 참여자 비율 (없으면 배당 기반 추정으로 폴백)
function communityPct(m) {
  const votes = Cache.predictions.filter(p => p.match_id === m.id);
  if (votes.length) {
    const a = votes.filter(v => v.side === "a").length;
    const pa = Math.round((a / votes.length) * 1000) / 10;
    return { a: pa, b: Math.round((100 - pa) * 10) / 10, n: votes.length };
  }
  const ia = 1 / (m.oddsA || 2), ib = 1 / (m.oddsB || 2);
  const pa = Math.round((ia / (ia + ib)) * 1000) / 10;
  return { a: pa, b: Math.round((100 - pa) * 10) / 10, n: 0 };
}
function myPredictionStats() {
  const votes = getVotes();
  let total = 0, hit = 0;
  Cache.matches.forEach(m => {
    if (m.status === "done" && votes[m.id]) {
      total++;
      if (votes[m.id] === (m.scoreA > m.scoreB ? "a" : "b")) hit++;
    }
  });
  const pending = Object.keys(votes).length - total;
  return { total, hit, pending, points: hit * 10 };
}

// ── 선수 평점 ──
function getRatings() {
  const me = voterId();
  const out = {};
  Cache.ratings.forEach(r => {
    if (r.voter === me) (out[r.match_id] = out[r.match_id] || {})[r.player_id] = r.score;
  });
  return out;
}
function setRating(matchId, playerId, score) {
  const me = voterId();
  const existing = Cache.ratings.find(r => r.match_id === matchId && r.player_id === playerId && r.voter === me);
  if (existing) existing.score = score;
  else Cache.ratings.push({ match_id: matchId, player_id: playerId, voter: me, score });
  sb.from("ratings").upsert({ match_id: matchId, player_id: playerId, voter: me, score }).then(r => sbErr(r.error, "setRating"));
}
function myRatingsForPlayer(playerId) {
  const me = voterId();
  return Cache.ratings.filter(r => r.player_id === playerId && r.voter === me)
    .map(r => ({ matchId: r.match_id, score: r.score }));
}
function myAvgForPlayer(playerId) {
  const list = myRatingsForPlayer(playerId);
  if (!list.length) return null;
  return Math.round(list.reduce((s, x) => s + x.score, 0) / list.length * 10) / 10;
}
// 전체 팬 평균
function communityAvgForPlayer(playerId, matchId) {
  let list = Cache.ratings.filter(r => r.player_id === playerId);
  if (matchId) list = list.filter(r => r.match_id === matchId);
  if (!list.length) return null;
  const voters = new Set(list.map(r => r.voter)).size;
  return { avg: Math.round(list.reduce((s, x) => s + x.score, 0) / list.length * 10) / 10, n: voters };
}

// ── 응원 채팅 (실시간) ──
async function loadChat(room) {
  const { data, error } = await sb.from("chat_messages")
    .select("*").eq("room", room).order("created_at", { ascending: false }).limit(100);
  sbErr(error, "loadChat");
  Cache.chat[room] = (data || []).reverse().map(c => ({ nick: c.nick, body: c.body, ts: Date.parse(c.created_at) }));
}
function getChat(room) { return Cache.chat[room] || []; }
function addChat(room, nick, body) {
  if (Auth.profile) nick = Auth.profile.nick;
  (Cache.chat[room] = Cache.chat[room] || []).push({ nick, body, ts: Date.now(), mine: true });
  sb.from("chat_messages").insert({ room, nick, body }).then(r => sbErr(r.error, "addChat"));
}
function subscribeChat(room, onMessage) {
  sb.channel("chat-" + room)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: "room=eq." + room }, payload => {
      const c = payload.new;
      const list = Cache.chat[room] = Cache.chat[room] || [];
      // 내가 방금 보낸 메시지의 중복 수신 방지
      const dup = list.some(x => x.mine && x.nick === c.nick && x.body === c.body && Math.abs(x.ts - Date.parse(c.created_at)) < 15000);
      if (!dup) list.push({ nick: c.nick, body: c.body, ts: Date.parse(c.created_at) });
      onMessage();
    })
    .subscribe();
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
async function sbSignIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  return { session: data.session, error };
}
async function sbSignUp(email, password, nick) {
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) return { error };
  if (!data.session) return { needConfirm: true }; // 이메일 확인이 켜져 있는 경우
  const { error: pErr } = await sb.from("profiles").insert({ id: data.session.user.id, nick });
  if (pErr) {
    if (pErr.message.includes("duplicate") || pErr.code === "23505")
      return { error: { message: "이미 사용 중인 닉네임입니다." } };
    return { error: pErr };
  }
  return { session: data.session };
}
async function sbSignOut() { await sb.auth.signOut(); }

// 페이지들은 storeReady를 기다린 뒤 렌더링한다
const storeReady = storeInit();
