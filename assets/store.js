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
  posts: [], predictions: [], ratings: [], details: {}, chat: {}, settings: {},
  polls: [], pollVotes: [], reactions: [], commentLikes: [], founding: [], profiles: [],
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

  const [t, m, r, pl, po, co, pr, ra, de, st] = await Promise.all([
    sb.from("tournaments").select("*"),
    sb.from("matches").select("*").order("at"),
    sb.from("stage_records").select("*").order("ord"),
    sb.from("players").select("*"),
    sb.from("posts").select("*").order("created_at", { ascending: false }),
    sb.from("comments").select("*").order("created_at"),
    sb.from("predictions").select("*"),
    sb.from("ratings").select("*"),
    sb.from("match_details").select("*").order("set_index"),
    sb.from("site_settings").select("*"),
  ]);
  [t, m, r, pl, po, co, pr, ra, de].forEach((res, i) => sbErr(res.error, "load#" + i));
  Cache.settings = Object.fromEntries((st.data || []).map(x => [x.key, x.value]));

  // 팬심지수 관련 (테이블이 아직 없으면 조용히 빈 값)
  const [pq, pv, rx, cl, ff, pf] = await Promise.all([
    sb.from("polls").select("*").order("created_at"),
    sb.from("poll_votes").select("*"),
    sb.from("reactions").select("*"),
    sb.from("comment_likes").select("*"),
    sb.from("founding_fans").select("*").order("no"),
    sb.from("profiles").select("id,nick,fav_team"),
  ]);
  Cache.polls = pq.data || [];
  Cache.pollVotes = pv.data || [];
  Cache.reactions = rx.data || [];
  Cache.commentLikes = cl.data || [];
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
  p.author_team = Auth.profile?.fav_team || null;
  p.id = "p" + Date.now();
  p.ts = Date.now(); p.views = 0; p.up = 0; p.comments = [];
  Cache.posts.unshift(p);
  // 저장 완료를 기다려야 하는 호출자를 위해 프로미스를 노출
  addPost.lastSave = sb.from("posts").insert({
    id: p.id, team: p.team, cat: p.cat, title: p.title, body: p.body, nick: p.nick,
    author_team: p.author_team, match_id: p.match_id || null,
  }).then(r => { sbErr(r.error, "addPost"); return r; });
  return p.id;
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
function addComment(postId, nick, body) {
  if (Auth.profile) nick = Auth.profile.nick;
  const author_team = Auth.profile?.fav_team || null;
  const p = Cache.posts.find(x => x.id === postId);
  if (p) p.comments.push({ nick, body, author_team, ts: Date.now() });
  sb.from("comments").insert({ post_id: postId, nick, body, author_team })
    .select().single().then(r => {
      sbErr(r.error, "addComment");
      if (r.data && p) { // 서버 id 반영 (댓글 추천용)
        const c = p.comments[p.comments.length - 1];
        if (c && c.id == null) c.id = r.data.id;
      }
    });
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
// 전체 팬 평균 (matchId를 주면 해당 경기 한정)
function communityAvgForPlayer(playerId, matchId) {
  let list = Cache.ratings.filter(r => r.player_id === playerId);
  if (matchId) list = list.filter(r => r.match_id === matchId);
  if (!list.length) return null;
  const voters = new Set(list.map(r => r.voter)).size;
  return { avg: Math.round(list.reduce((s, x) => s + x.score, 0) / list.length * 10) / 10, n: voters };
}
// 팬심 평점: 한 경기·한 선수의 평점을 아군 팬·상대 팬·중립으로 나눠 평균
// (평가자가 로그인 회원이면 profiles.fav_team으로 소속 팬덤을 판별, 비회원은 중립)
function fanSplitForPlayer(playerId, matchId, ownTeam, oppTeam) {
  const favOf = {};
  Cache.profiles.forEach(p => { favOf[p.id] = p.fav_team || null; });
  const g = { all: [], home: [], opp: [], neu: [] };
  Cache.ratings.filter(r => r.match_id === matchId && r.player_id === playerId).forEach(r => {
    g.all.push(r.score);
    const fav = favOf[r.voter] || null;
    if (fav === ownTeam) g.home.push(r.score);
    else if (fav === oppTeam) g.opp.push(r.score);
    else g.neu.push(r.score);
  });
  const stat = list => list.length
    ? { avg: Math.round(list.reduce((s, x) => s + x, 0) / list.length * 10) / 10, n: list.length }
    : null;
  return { all: stat(g.all), home: stat(g.home), opp: stat(g.opp), neu: stat(g.neu) };
}
// 경기에 실제 출전한 선수 id 집합 (경기 상세 기록 기준 · 기록 없으면 빈 집합)
function playedPidsForMatch(matchId) {
  const det = Cache.details[matchId];
  const played = new Set();
  ((det && det.sets) || []).forEach(s => (s.players || []).forEach(p => { if (p.pid) played.add(p.pid); }));
  return played;
}
// 경기 POG: 전체 평균 1위 선수 (동률이면 참여자 많은 쪽 · 출전 기록이 있으면 출전 선수만)
function pogForMatch(matchId) {
  const played = playedPidsForMatch(matchId);
  const by = {};
  Cache.ratings.filter(r => r.match_id === matchId).forEach(r => {
    if (played.size && !played.has(r.player_id)) return;
    const s = by[r.player_id] = by[r.player_id] || { sum: 0, n: 0 };
    s.sum += r.score; s.n++;
  });
  let best = null;
  Object.keys(by).forEach(pid => {
    const avg = by[pid].sum / by[pid].n;
    if (!best || avg > best.avg + 1e-9 || (Math.abs(avg - best.avg) < 1e-9 && by[pid].n > best.n))
      best = { pid, avg: Math.round(avg * 10) / 10, n: by[pid].n };
  });
  return best;
}

// 선수의 경기별 평점 목록 (최신 경기 순)
function matchRatingsForPlayer(playerId) {
  const me = voterId();
  const byMatch = {};
  Cache.ratings.filter(r => r.player_id === playerId).forEach(r => {
    const g = byMatch[r.match_id] = byMatch[r.match_id] || { sum: 0, n: 0, mine: null };
    g.sum += r.score; g.n++;
    if (r.voter === me) g.mine = r.score;
  });
  return Object.keys(byMatch).map(mid => {
    const m = Cache.matches.find(x => x.id === mid);
    const g = byMatch[mid];
    return { matchId: mid, match: m, at: m ? m.at : 0,
      avg: Math.round(g.sum / g.n * 10) / 10, n: g.n, mine: g.mine };
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

// ── 응원 한마디 (선수 페이지 · 실시간) ──
async function loadChat(room) {
  const { data, error } = await sb.from("chat_messages")
    .select("*").eq("room", room).order("created_at", { ascending: false }).limit(100);
  sbErr(error, "loadChat");
  Cache.chat[room] = (data || []).reverse().map(c => ({ nick: c.nick, body: c.body, author_team: c.author_team || null, ts: Date.parse(c.created_at) }));
}
function getChat(room) { return Cache.chat[room] || []; }
function addChat(room, nick, body) {
  if (Auth.profile) nick = Auth.profile.nick;
  const author_team = Auth.profile?.fav_team || null;
  (Cache.chat[room] = Cache.chat[room] || []).push({ nick, body, author_team, ts: Date.now(), mine: true });
  sb.from("chat_messages").insert({ room, nick, body, author_team }).then(r => sbErr(r.error, "addChat"));
}
function subscribeChat(room, onMessage) {
  sb.channel("chat-" + room)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: "room=eq." + room }, payload => {
      const c = payload.new;
      const list = Cache.chat[room] = Cache.chat[room] || [];
      // 내가 방금 보낸 메시지의 중복 수신 방지
      const dup = list.some(x => x.mine && x.nick === c.nick && x.body === c.body && Math.abs(x.ts - Date.parse(c.created_at)) < 15000);
      if (!dup) list.push({ nick: c.nick, body: c.body, author_team: c.author_team || null, ts: Date.parse(c.created_at) });
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
  const me = voterId();
  return Cache.pollVotes.find(v => v.poll_id === pollId && v.voter === me) || null;
}
function votePoll(pollId, choices) {
  const me = voterId();
  const row = {
    poll_id: pollId, voter: me, choices,
    fav_team: Auth.profile?.fav_team || null,
    is_member: !!Auth.session,
  };
  const existing = Cache.pollVotes.find(v => v.poll_id === pollId && v.voter === me);
  if (existing) Object.assign(existing, row);
  else Cache.pollVotes.push(row);
  sb.from("poll_votes").upsert(row).then(r => sbErr(r.error, "votePoll"));
}
// 집계: 전체 + 팬덤별 (teamA/teamB 팬 · 중립=그 외 전부)
function pollResults(poll, teamA, teamB) {
  const votes = Cache.pollVotes.filter(v => v.poll_id === poll.id);
  const n = poll.options.length;
  const bucket = () => ({ counts: Array(n).fill(0), total: 0 });
  const overall = bucket(), a = bucket(), b = bucket(), neutral = bucket();
  votes.forEach(v => {
    const targets = [overall];
    if (teamA && v.fav_team === teamA) targets.push(a);
    else if (teamB && v.fav_team === teamB) targets.push(b);
    else targets.push(neutral);
    (v.choices || []).forEach(c => {
      if (c >= 0 && c < n) targets.forEach(t => t.counts[c]++);
    });
    targets.forEach(t => t.total++);
  });
  return { overall, teamA: a, teamB: b, neutral, voters: votes.length };
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
  Cache.reactions.filter(r => r.post_id === postId).forEach(r => out[r.kind] = (out[r.kind] || 0) + 1);
  return out;
}
function myReactions(postId) {
  const me = voterId();
  return new Set(Cache.reactions.filter(r => r.post_id === postId && r.voter === me).map(r => r.kind));
}
function toggleReaction(postId, kind) {
  const me = voterId();
  const i = Cache.reactions.findIndex(r => r.post_id === postId && r.voter === me && r.kind === kind);
  if (i >= 0) {
    Cache.reactions.splice(i, 1);
    sb.from("reactions").delete().eq("post_id", postId).eq("voter", me).eq("kind", kind)
      .then(r => sbErr(r.error, "delReaction"));
  } else {
    Cache.reactions.push({ post_id: postId, voter: me, kind });
    sb.from("reactions").insert({ post_id: postId, voter: me, kind }).then(r => sbErr(r.error, "addReaction"));
  }
}

// ── 댓글 추천 ──
function commentLikeCount(commentId) {
  return Cache.commentLikes.filter(l => l.comment_id === commentId).length;
}
function myCommentLike(commentId) {
  const me = voterId();
  return Cache.commentLikes.some(l => l.comment_id === commentId && l.voter === me);
}
function likeComment(commentId) {
  const me = voterId();
  if (myCommentLike(commentId)) return false;
  Cache.commentLikes.push({ comment_id: commentId, voter: me });
  sb.from("comment_likes").insert({ comment_id: commentId, voter: me }).then(r => sbErr(r.error, "likeComment"));
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
async function sbSignOut() { await sb.auth.signOut(); }
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

// 페이지들은 storeReady를 기다린 뒤 렌더링한다
const storeReady = storeInit();
