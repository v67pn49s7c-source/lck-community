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
  RECORDS: "lckdb_records",
  PLAYERS: "lckdb_players",
  RATINGS: "lckdb_ratings",
  DETAILS: "lckdb_details",
  SEED_VER: "lckdb_seed_ver",
};
const SEED_VERSION = "2";

function dbGet(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function dbSet(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
// 키가 없을 때만 시드 (기존 사용자 데이터 보존)
function dbSeed(key, val) { if (localStorage.getItem(key) == null) dbSet(key, val); }

// ── 시드 데이터 ──
function seedDefaults(force) {
  if (!force && localStorage.getItem(DB.SEED_VER) === SEED_VERSION) return;

  const put = force ? dbSet : dbSeed;

  put(DB.TOURNAMENTS, [{
    id: "split3-2026",
    name: "2026 LCK 스플릿 3",
    type: "리그",
    stages: ["라운드 3-4 레전드 그룹", "라운드 3-4 라이즈 그룹"],
    note: "7월~9월 · 지역 대회",
  }]);

  const T = "split3-2026", L = "라운드 3-4 레전드 그룹", R = "라운드 3-4 라이즈 그룹";
  put(DB.MATCHES, [
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
  put(DB.POSTS, [
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

  // ── 시즌 스테이지별 팀 전적 (op.gg 2026 기준 시드, 관리자에서 수정 가능) ──
  // rec: [팀, 승, 패, 세트승, 세트패]
  const REC = (rows) => rows.map(([team, w, l, sw, sl]) => ({ team, w, l, sw, sl }));
  put(DB.RECORDS, [
    {
      id: "r12", name: "Rounds 1-2",
      records: REC([["hle",15,3,32,11],["t1",14,4,30,10],["gen",14,4,30,11],["kt",13,5,26,15],["dk",11,7,24,18],
                    ["bro",6,12,16,24],["bfx",6,12,14,25],["krx",5,13,16,28],["ns",5,13,13,28],["dns",1,17,3,34]]),
    },
    {
      id: "rtm", name: "Road To MSI",
      records: REC([["t1",3,1,7,4],["gen",2,1,5,3],["hle",1,1,3,3],["kt",1,2,3,5],["dk",0,2,1,4]]),
    },
    {
      id: "r34L", name: "Round 3-4 Legend Group",
      records: REC([["dk",2,0,4,1],["kt",1,0,2,0],["t1",1,1,2,2],["hle",0,1,1,2],["gen",0,2,0,4]]),
    },
    {
      id: "r34R", name: "Round 3-4 Rise Group",
      records: REC([["ns",2,0,4,1],["bfx",1,1,3,2],["dns",1,1,3,2],["krx",1,1,2,2],["bro",0,2,1,4]]),
    },
  ]);

  // ── 선수 로스터 (2026 기준 추정 시드 — 관리자에서 수정하세요) ──
  const PL = (team, rows) => rows.map(([pos, nick, name]) => ({
    id: (team + "-" + nick).toLowerCase().replace(/[^a-z0-9-]/g, ""), team, pos, nick, name,
  }));
  put(DB.PLAYERS, [
    ...PL("t1",  [["탑","Doran","최현준"],["정글","Oner","문현준"],["미드","Faker","이상혁"],["원딜","Gumayusi","이민형"],["서폿","Keria","류민석"]]),
    ...PL("gen", [["탑","Kiin","김기인"],["정글","Canyon","김건부"],["미드","Chovy","정지훈"],["원딜","Ruler","박재혁"],["서폿","Duro","주민규"]]),
    ...PL("hle", [["탑","Zeus","최우제"],["정글","Peanut","한왕호"],["미드","Zeka","김건우"],["원딜","Viper","박도현"],["서폿","Delight","유환중"]]),
    ...PL("kt",  [["탑","PerfecT","이승민"],["정글","Fenrir","박강준"],["미드","Bdd","곽보성"],["원딜","Aiming","김하람"],["서폿","Peter","정윤수"]]),
    ...PL("dk",  [["탑","Siwoo","전시우"],["정글","Lucid","최용혁"],["미드","ShowMaker","허수"],["원딜","Smash","신금재"],["서폿","Moham","정재훈"]]),
    ...PL("krx", [["탑","Rich","이재원"],["정글","Juhan","이주한"],["미드","Ucal","손우현"],["원딜","Teddy","박진성"],["서폿","Pleata","손민우"]]),
    ...PL("dns", [["탑","Casting","신민제"],["정글","Pyosik","홍창현"],["미드","BuLLDoG","이태영"],["원딜","Taeyoon","김태윤"],["서폿","Andil","문관빈"]]),
    ...PL("ns",  [["탑","DuDu","이동주"],["정글","GIDEON","김민성"],["미드","Fisher","이정태"],["원딜","Jiwoo","정지우"],["서폿","Lehends","손시우"]]),
    ...PL("bfx", [["탑","Clear","송현민"],["정글","Raptor","전어진"],["미드","VicLa","이대광"],["원딜","Diable","김민수"],["서폿","Kellin","김형규"]]),
    ...PL("bro", [["탑","Morgan","박루한"],["정글","HamBak","안성민"],["미드","Karis","김홍조"],["원딜","Hype","변정현"],["서폿","Pollu","성수민"]]),
  ]);

  // ── 경기 상세 샘플 (m1: DNS 2:1 BRO) ──
  // row: [선수id, 챔피언, K, D, A, CS, 골드(k), 아이템(쉼표), 룬 주/부]
  const DROW = (r) => ({ pid: r[0], champ: r[1], k: r[2], d: r[3], a: r[4], cs: r[5], gold: r[6], items: r[7], runes: r[8] });
  put(DB.DETAILS, {
    m1: { sets: [
      { win: "a", players: [
        DROW(["dns-casting","크산테",2,1,5,231,11.2,"태양불꽃 방패, 판금장화, 가시 갑옷","착취의 손아귀 / 영감"]),
        DROW(["dns-pyosik","신 짜오",4,2,6,188,12.1,"월식, 판금장화, 요우무의 유령검","정복자 / 지배"]),
        DROW(["dns-bulldog","아지르",5,1,7,265,13.4,"루덴의 동반자, 마법사의 신발, 라바돈의 죽음모자","정복자 / 결의"]),
        DROW(["dns-taeyoon","이즈리얼",6,0,4,278,14.0,"무라마나, 삼위일체, 명석함의 아이오니아 장화","집중 공격 / 영감"]),
        DROW(["dns-andil","알리스타",1,3,11,42,7.8,"불타는 향로, 기동력의 장화, 구원","여진 / 영감"]),
        DROW(["bro-morgan","레넥톤",1,3,2,214,10.1,"선혈포식자, 판금장화, 스테락의 도전","정복자 / 결의"]),
        DROW(["bro-hambak","바이",2,4,3,175,10.5,"선체파괴자, 판금장화, 스테락의 도전","돌파 / 정밀"]),
        DROW(["bro-karis","오리아나",3,3,2,241,11.8,"루덴의 동반자, 마법사의 신발, 존야의 모래시계","감전 / 영감"]),
        DROW(["bro-hype","진",3,2,1,255,12.6,"고속 연사포, 무한의 대검, 유령 무희","치명적 속도 / 영감"]),
        DROW(["bro-pollu","노틸러스",0,5,4,38,6.9,"기사의 맹세, 기동력의 장화, 지크의 융합","여진 / 지배"]),
      ]},
      { win: "b", players: [
        DROW(["dns-casting","오른",1,4,3,198,9.8,"태양불꽃 방패, 판금장화, 얼어붙은 심장","착취의 손아귀 / 영감"]),
        DROW(["dns-pyosik","리 신",3,5,2,162,10.2,"월식, 판금장화, 흑색 절단기","정복자 / 지배"]),
        DROW(["dns-bulldog","라이즈",2,3,4,244,11.5,"대천사의 지팡이, 마법사의 신발, 세라프의 포옹","시대의 흐름 / 결의"]),
        DROW(["dns-taeyoon","카이사",4,2,2,251,12.3,"크라켄 학살자, 광전사의 군화, 밤의 끝자락","정복자 / 지배"]),
        DROW(["dns-andil","레나타 글라스크",0,4,7,35,6.5,"불타는 향로, 기동력의 장화, 미카엘의 축복","소환: 아에리 / 결의"]),
        DROW(["bro-morgan","크산테",3,1,6,225,11.9,"태양불꽃 방패, 판금장화, 정령의 형상","착취의 손아귀 / 결의"]),
        DROW(["bro-hambak","자르반 4세",5,2,8,171,12.4,"월식, 판금장화, 죽음의 무도","정복자 / 영감"]),
        DROW(["bro-karis","아리",6,1,5,238,13.1,"루덴의 동반자, 마법사의 신발, 그림자불꽃","감전 / 정밀"]),
        DROW(["bro-hype","제리",7,1,4,266,13.8,"무한의 대검, 광전사의 군화, 피바라기","치명적 속도 / 결의"]),
        DROW(["bro-pollu","라칸",1,2,13,29,7.2,"슈렐리아의 군가, 기동력의 장화, 구원","콩콩이 소환 / 영감"]),
      ]},
      { win: "a", players: [
        DROW(["dns-casting","잭스",4,2,5,238,12.8,"삼위일체, 판금장화, 스테락의 도전","착취의 손아귀 / 정밀"]),
        DROW(["dns-pyosik","바이",5,1,9,180,12.9,"선체파괴자, 판금장화, 가고일 돌갑옷","돌파 / 정밀"]),
        DROW(["dns-bulldog","아리",6,2,6,248,13.6,"루덴의 동반자, 마법사의 신발, 존야의 모래시계","감전 / 정밀"]),
        DROW(["dns-taeyoon","진",7,0,8,272,14.5,"고속 연사포, 무한의 대검, 나보리 신속검","치명적 속도 / 영감"]),
        DROW(["dns-andil","쓰레쉬",0,3,15,40,7.5,"기사의 맹세, 기동력의 장화, 지크의 융합","여진 / 영감"]),
        DROW(["bro-morgan","오른",2,4,4,210,10.4,"태양불꽃 방패, 판금장화, 가시 갑옷","착취의 손아귀 / 영감"]),
        DROW(["bro-hambak","세주아니",1,5,6,158,9.8,"태양불꽃 방패, 판금장화, 얼어붙은 심장","여진 / 영감"]),
        DROW(["bro-karis","빅토르",4,4,3,252,12.2,"루덴의 동반자, 마법사의 신발, 라바돈의 죽음모자","감전 / 영감"]),
        DROW(["bro-hype","이즈리얼",3,3,3,247,11.9,"무라마나, 삼위일체, 명석함의 아이오니아 장화","집중 공격 / 영감"]),
        DROW(["bro-pollu","브라움",0,6,7,33,6.4,"기사의 맹세, 기동력의 장화, 구원","수호자 / 영감"]),
      ]},
    ]},
  });

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

// ── 시즌 스테이지 전적 · 순위 ──
function getStageRecords() { return dbGet(DB.RECORDS, []); }
function saveStageRecords(list) { dbSet(DB.RECORDS, list); }
function stageStandings(stageId) {
  const s = getStageRecords().find(x => x.id === stageId);
  if (!s) return [];
  return s.records.slice()
    .map(r => ({ ...r, pt: r.sw - r.sl }))
    .sort((a, b) => b.w - a.w || b.pt - a.pt);
}
// 시즌 누적 순위 (모든 스테이지 합산, 포인트 = 세트 득실차)
function cumulativeStandings() {
  const acc = {};
  getStageRecords().forEach(s => s.records.forEach(r => {
    const t = acc[r.team] = acc[r.team] || { team: r.team, w: 0, l: 0, sw: 0, sl: 0 };
    t.w += r.w; t.l += r.l; t.sw += r.sw; t.sl += r.sl;
  }));
  return Object.values(acc)
    .map(r => ({ ...r, pt: r.sw - r.sl }))
    .sort((a, b) => b.w - a.w || b.pt - a.pt);
}
function cumulativeRankOf(teamId) {
  const rows = cumulativeStandings();
  const i = rows.findIndex(r => r.team === teamId);
  return i < 0 ? null : { rank: i + 1, ...rows[i] };
}

// ── 선수 ──
function getPlayers() { return dbGet(DB.PLAYERS, []); }
function savePlayers(list) { dbSet(DB.PLAYERS, list); }
function getPlayer(id) { return getPlayers().find(p => p.id === id); }
function teamPlayers(teamId) {
  const order = { "탑": 0, "정글": 1, "미드": 2, "원딜": 3, "서폿": 4 };
  return getPlayers().filter(p => p.team === teamId)
    .sort((a, b) => (order[a.pos] ?? 9) - (order[b.pos] ?? 9));
}

// ── 선수 평점 (내 평점, 브라우저 저장) ──
function getRatings() { return dbGet(DB.RATINGS, {}); }
function setRating(matchId, playerId, score) {
  const r = getRatings();
  (r[matchId] = r[matchId] || {})[playerId] = score;
  dbSet(DB.RATINGS, r);
}
function myRatingsForPlayer(playerId) {
  const r = getRatings();
  const out = [];
  Object.keys(r).forEach(mid => {
    if (r[mid][playerId] != null) out.push({ matchId: mid, score: r[mid][playerId] });
  });
  return out;
}
function myAvgForPlayer(playerId) {
  const list = myRatingsForPlayer(playerId);
  if (!list.length) return null;
  return Math.round(list.reduce((s, x) => s + x.score, 0) / list.length * 10) / 10;
}

// ── 경기 상세 (세트별 KDA·아이템·룬) ──
function getAllDetails() { return dbGet(DB.DETAILS, {}); }
function getDetails(matchId) { return getAllDetails()[matchId] || null; }
function saveDetailSet(matchId, setIndex, setData) {
  const all = getAllDetails();
  const d = all[matchId] = all[matchId] || { sets: [] };
  d.sets[setIndex] = setData;
  dbSet(DB.DETAILS, all);
}
function deleteDetailSet(matchId, setIndex) {
  const all = getAllDetails();
  if (!all[matchId]) return;
  all[matchId].sets.splice(setIndex, 1);
  if (!all[matchId].sets.length) delete all[matchId];
  dbSet(DB.DETAILS, all);
}

// ── 전체 초기화 ──
function resetAllData() {
  Object.keys(localStorage).filter(k => k.startsWith("lckdb_")).forEach(k => localStorage.removeItem(k));
  seedDefaults(true);
}

seedDefaults();
