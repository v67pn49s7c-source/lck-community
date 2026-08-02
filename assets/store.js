// ── 데이터 저장 계층 (localStorage 기반 프로토타입 DB) ──
// 대회·경기·게시글·댓글·예측·채팅을 브라우저에 저장한다.
// 관리자 페이지에서 수정하면 모든 페이지에 반영된다.
// (주의: 정적 사이트라 데이터는 "방문자 본인 브라우저"에만 저장됨.
//  실서비스 전환 시 이 파일만 서버 API 호출로 교체하면 된다.)

const DB = {
  TOURNAMENTS: "lckdb_tournaments",
  MATCHES: "lckdb_matches",
  POSTS: "lckdb_posts",
  VOTES: "lckdb_votes",
  CHAT: "lckdb_chat",
  NICK: "lckdb_nick",
  SEED_VER: "lckdb_seed_ver",
};
const SEED_VERSION = "1";

function dbGet(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function dbSet(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

// ── 시드 데이터 ──
function seedDefaults(force) {
  if (!force && localStorage.getItem(DB.SEED_VER) === SEED_VERSION) return;

  dbSet(DB.TOURNAMENTS, [{
    id: "split3-2026",
    name: "2026 LCK 스플릿 3",
    type: "리그",
    stages: ["라운드 3-4 레전드 그룹", "라운드 3-4 라이즈 그룹"],
    note: "7월~9월 · 지역 대회",
  }]);

  const T = "split3-2026", L = "라운드 3-4 레전드 그룹", R = "라운드 3-4 라이즈 그룹";
  dbSet(DB.MATCHES, [
    { id: "m1", tid: T, stage: R, at: "2026-08-02T10:00:00+09:00", a: "dns", b: "bro", oddsA: 1.55, oddsB: 2.40, status: "done", scoreA: 2, scoreB: 1 },
    { id: "m2", tid: T, stage: L, at: "2026-08-02T13:15:00+09:00", a: "kt",  b: "hle", oddsA: 3.50, oddsB: 1.30, status: "upcoming", scoreA: null, scoreB: null },
    { id: "m3", tid: T, stage: R, at: "2026-08-05T10:00:00+09:00", a: "bro", b: "ns",  oddsA: 2.60, oddsB: 1.50, status: "upcoming", scoreA: null, scoreB: null },
    { id: "m4", tid: T, stage: L, at: "2026-08-05T12:00:00+09:00", a: "hle", b: "gen", oddsA: 1.65, oddsB: 2.25, status: "upcoming", scoreA: null, scoreB: null },
    { id: "m5", tid: T, stage: R, at: "2026-08-06T10:00:00+09:00", a: "krx", b: "dns", oddsA: 1.42, oddsB: 2.90, status: "upcoming", scoreA: null, scoreB: null },
    { id: "m6", tid: T, stage: L, at: "2026-08-06T12:00:00+09:00", a: "dk",  b: "t1",  oddsA: 2.05, oddsB: 1.78, status: "upcoming", scoreA: null, scoreB: null },
    { id: "m7", tid: T, stage: L, at: "2026-08-07T10:00:00+09:00", a: "kt",  b: "gen", oddsA: 2.35, oddsB: 1.60, status: "upcoming", scoreA: null, scoreB: null },
    { id: "m8", tid: T, stage: R, at: "2026-08-07T12:00:00+09:00", a: "bfx", b: "bro", oddsA: 1.50, oddsB: 2.60, status: "upcoming", scoreA: null, scoreB: null },
  ]);

  const now = Date.now(), H = 3600e3, D = 86400e3;
  let pid = 1;
  const P = (team, cat, title, body, nick, up, ts, views, comments) => ({
    id: "p" + (pid++), team, cat, title, body, nick, up,
    ts, views, comments: comments || [],
  });
  dbSet(DB.POSTS, [
    P("kt", "경기 분석", "펜리르 2경기 연속 선발, 오늘 HLE전 미드-정글 동선 예상",
      "kt 롤스터 펜리르가 2경기 연속 선발로 나선다. 한화생명전 핵심은 초반 3레벨 갱 각과 바텀 주도권.\n\n개인적으로는 자르반-신짜오 정글 밴픽 싸움이 승부처라고 본다.", "협곡의봄", 214, now - 1 * H, 1520, [
        { nick: "케티팬", body: "오늘 무조건 이긴다", ts: now - 50 * 60e3 },
        { nick: "티원십년팬", body: "HLE 바텀이 요즘 폼 좋아서 쉽지 않을듯", ts: now - 40 * 60e3 },
      ]),
    P("t1", "자유", "어제 KT전 0:2… 탑정글 합 이대로 괜찮은가",
      "다이브 타이밍이 계속 어긋난다. 오브젝트 교전 설계도 아쉽고. DK전 전까지 합 맞출 시간이 얼마 없다.", "티원십년팬", 189, now - 3 * H, 2103, [
        { nick: "한타의신", body: "2군에서 좀 다듬고 와야 한다고 봄", ts: now - 2 * H },
      ]),
    P("dns", "경기 분석", "DN수퍼스 1세트 한진 브리온 상대 초반 설계 복기",
      "1세트 5분 지표가 압도적이었다. 미드 라인전 이후 합류 속도 차이가 컸음.", "바텀차이", 121, now - 2 * H, 890, []),
    P("gen", "선수·팀", "쵸비 이주의 선수 선정 — 0승 2패인데 폼은 리그 최상위",
      "팀 성적과 별개로 개인 지표는 리그 1위권. 팀 합류만 풀리면 반등 가능하다.", "미드갱승", 98, now - 5 * H, 1204, []),
    P("hle", "밴픽·메타", "오늘 KT전 HLE 밴픽 예상 — 자르반·신짜오 1티어 정글 싸움",
      "최근 5경기 기준 자르반 픽밴률 83%. 오늘도 정글 싸움이 밴픽의 중심이 될 것.", "한타의신", 76, now - 4 * H, 675, []),
    P("bro", "자유", "브리온 아쉽지만 1세트는 진짜 잘했다",
      "결과는 1:2 패배지만 1세트 운영은 이번 시즌 최고였다. 다음 경기 기대.", "브리온화이팅", 54, now - 2 * H, 430, []),
    P("dk", "자유", "레전드 그룹 2승 0패 단독 1위! 이 기세 그대로",
      "T1전까지 잡으면 사실상 결승 직행 각. 이번 주가 고비다.", "디플황제", 66, now - 1 * D, 780, []),
    P(null, "공지", "LCK 라운지 이용 안내 — 비방·혐오 없이 응원해 주세요",
      "팀과 선수에 대한 비판은 자유지만 모욕·혐오·신상 공개는 제재됩니다.\n불법 베팅 홍보, 불법 중계 링크는 즉시 삭제 및 영구 정지 대상입니다.", "운영자", 42, now - 5 * D, 3200, []),
    P("ns", "자유", "라이즈 그룹 2연승, 승격 가자",
      "레전드 그룹 승격까지 한 걸음. 다음 브리온전이 중요하다.", "레드포스", 31, now - 1 * D, 350, []),
    P("krx", "자유", "8/6 DNS전 배당 1.42 — 이건 이겨야 한다",
      "상대 전적도 앞서고 최근 폼도 나쁘지 않다. 무조건 잡아야 하는 경기.", "드락스", 25, now - 6 * H, 289, []),
    P("bfx", "자유", "8/7 브리온전 승리로 5할 복귀하자",
      "1승 1패 상황. 이번 주 일정이 수월한 편이라 연승 각이다.", "피어엑스", 22, now - 1 * D, 240, []),
    P(null, "질문", "예측 포인트는 어디서 확인하나요?",
      "승부예측 메뉴에서 내 적중 기록이 보이는데 포인트 계산 방식이 궁금합니다.", "궁금이", 8, now - 7 * H, 150, [
        { nick: "운영자", body: "적중 1건당 10포인트입니다. 랭킹 페이지에서 확인하세요!", ts: now - 6 * H },
      ]),
  ]);

  localStorage.setItem(DB.SEED_VER, SEED_VERSION);
}

// ── 대회 ──
function getTournaments() { return dbGet(DB.TOURNAMENTS, []); }
function saveTournaments(list) { dbSet(DB.TOURNAMENTS, list); }
function addTournament(t) { const l = getTournaments(); l.push(t); saveTournaments(l); }
function deleteTournament(id) {
  saveTournaments(getTournaments().filter(t => t.id !== id));
  dbSet(DB.MATCHES, getMatches().filter(m => m.tid !== id));
}

// ── 경기 ──
function getMatches() { return dbGet(DB.MATCHES, []); }
function saveMatches(list) { dbSet(DB.MATCHES, list); }
function addMatch(m) { const l = getMatches(); l.push(m); saveMatches(l); }
function updateMatch(id, patch) {
  saveMatches(getMatches().map(m => m.id === id ? { ...m, ...patch } : m));
}
function deleteMatch(id) { saveMatches(getMatches().filter(m => m.id !== id)); }
function sortedMatches() {
  return getMatches().slice().sort((x, y) => new Date(x.at) - new Date(y.at));
}
function liveMatch() { return sortedMatches().find(m => m.status === "live"); }
function nextMatch() {
  const now = Date.now();
  return sortedMatches().find(m => m.status === "upcoming" && new Date(m.at) > now)
    || sortedMatches().find(m => m.status === "upcoming");
}

// ── 게시글 ──
function getPosts() { return dbGet(DB.POSTS, []); }
function savePosts(list) { dbSet(DB.POSTS, list); }
function getPost(id) { return getPosts().find(p => p.id === id); }
function addPost(p) {
  const l = getPosts();
  p.id = "p" + Date.now();
  p.ts = Date.now(); p.views = 0; p.up = 0; p.comments = [];
  l.unshift(p); savePosts(l);
  return p.id;
}
function updatePost(id, patch) {
  savePosts(getPosts().map(p => p.id === id ? { ...p, ...patch } : p));
}
function deletePost(id) { savePosts(getPosts().filter(p => p.id !== id)); }
function addComment(postId, nick, body) {
  const l = getPosts();
  const p = l.find(x => x.id === postId);
  if (!p) return;
  p.comments.push({ nick, body, ts: Date.now() });
  savePosts(l);
}

// ── 예측 (내 투표) ──
function getVotes() { return dbGet(DB.VOTES, {}); }
function setVote(matchId, side) {
  const v = getVotes(); v[matchId] = side; dbSet(DB.VOTES, v);
}
function myPredictionStats() {
  const votes = getVotes();
  let total = 0, hit = 0;
  getMatches().forEach(m => {
    if (m.status === "done" && votes[m.id]) {
      total++;
      const winner = m.scoreA > m.scoreB ? "a" : "b";
      if (votes[m.id] === winner) hit++;
    }
  });
  const pending = Object.keys(votes).length - total;
  return { total, hit, pending, points: hit * 10 };
}

// ── 응원 채팅 ──
function getChat(matchId) { return dbGet(DB.CHAT + "_" + matchId, []); }
function addChat(matchId, nick, body) {
  const l = getChat(matchId);
  l.push({ nick, body, ts: Date.now() });
  if (l.length > 200) l.shift();
  dbSet(DB.CHAT + "_" + matchId, l);
}

// ── 닉네임 ──
function getNick() { return localStorage.getItem(DB.NICK) || ""; }
function setNick(n) { localStorage.setItem(DB.NICK, n); }

// ── 전체 초기화 ──
function resetAllData() {
  Object.keys(localStorage).filter(k => k.startsWith("lckdb_")).forEach(k => localStorage.removeItem(k));
  seedDefaults(true);
}

seedDefaults();
