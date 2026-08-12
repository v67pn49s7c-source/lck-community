// 풀 영상(전체 경기) 다시보기 — 치지직 · SOOP
//
// 유튜브 공식 채널에는 **매치 하이라이트**만 올라오고, 전체 경기 영상은
// 치지직과 SOOP 에 올라온다. 두 곳 모두 공개 API 로 공식 계정의 영상 목록을
// 받을 수 있어서, 경기별 주소를 **자동으로** 집어낸다.
// (예전에는 검색어만 채운 링크를 걸었는데, 검색창에 글자만 들어가고 영상이
//  안 나와서 아무 쓸모가 없었다 — 2026-08-13)
//
//   치지직: 공식 채널 'LCK'(인증됨)의 영상 목록에서 두 팀이 모두 든 VOD
//           제목 예) "KT vs DK 게임 2 VOD | 08.12 | 2026 LCK"
//   SOOP  : 공식 계정 'aflol'(LCK_KR)의 VOD 검색
//           제목 예) "[KT vs DK] 전체보기 / 2026 LCK 정규 시즌"
const { ok, fail } = require("./_lib");

const CHZZK_CHANNEL_ID = "9381e7d6816e6d915a44a13c0195b202";      // 치지직 LCK 공식(인증)
const CHZZK_CHANNEL_URL = `https://chzzk.naver.com/${CHZZK_CHANNEL_ID}/videos`;
const SOOP_USER_ID = "aflol";                                     // SOOP LCK_KR 공식
const SOOP_STATION_URL = `https://ch.sooplive.co.kr/${SOOP_USER_ID}/vods`;

const UA = "Mozilla/5.0 (compatible; TheNexus-LCK-FanSite/2.0)";
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();                    // key → { at, value }

// 팀 약어는 독립 토큰으로만 찾는다 (NS 가 DNS 안에서 잡히면 엉뚱한 경기가 걸린다)
const escapeRegExp = v => String(v || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function hasTeam(title, team) {
  const token = String(team || "").trim().toUpperCase();
  if (!token) return false;
  return new RegExp(`(^|[^A-Z0-9])${escapeRegExp(token)}(?=$|[^A-Z0-9])`, "i").test(String(title || ""));
}

// 경기 기록이 아닌 것 — 하이라이트·인터뷰·클립은 '풀 영상'이 아니다
const NOT_FULL = /(하이라이트|HIGHLIGHT|인터뷰|INTERVIEW|클립|CLIP|매드무비|비하인드|티저|TEASER|프리뷰|쇼츠|SHORTS?)/i;

// 경기 시작 3시간 전보다 이르면 그 경기 영상이 아니다 (전 시즌 동명 경기 방지)
const nearMatch = (published, at) => {
  const p = Date.parse(published || ""), m = Date.parse(at || "");
  if (!Number.isFinite(p) || !Number.isFinite(m)) return true;
  return p >= m - 3 * 60 * 60 * 1000 && p <= m + 7 * 24 * 60 * 60 * 1000;
};

async function getJSON(url, headers) {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json", ...(headers || {}) } });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

// ── 치지직 ────────────────────────────────────────────────
function pickChzzk(rows, a, b, at) {
  return (rows || [])
    .map(v => ({
      title: String(v.videoTitle || "").replace(/\s+/g, " ").trim(),
      no: v.videoNo, published: v.publishDate || v.publishDateAt || "",
    }))
    .filter(v => v.no && hasTeam(v.title, a) && hasTeam(v.title, b))
    .filter(v => !NOT_FULL.test(v.title))
    .filter(v => nearMatch(v.published, at))
    // "게임 N VOD" 가 세트별 풀 영상이다. 1세트부터 보게 오름차순.
    .sort((x, y) => {
      const n = t => (String(t).match(/게임\s*(\d+)/) || [])[1] || 99;
      return n(x.title) - n(y.title) || Date.parse(x.published || 0) - Date.parse(y.published || 0);
    });
}
async function fromChzzk(a, b, at) {
  const url = `https://api.chzzk.naver.com/service/v1/channels/${CHZZK_CHANNEL_ID}/videos?size=40&sortType=LATEST`;
  const j = await getJSON(url);
  const rows = ((j || {}).content || {}).data || [];
  return pickChzzk(rows, a, b, at).map(v => ({
    title: v.title, url: `https://chzzk.naver.com/video/${v.no}`, published: v.published,
  }));
}

// ── SOOP ─────────────────────────────────────────────────
function pickSoop(rows, a, b, at) {
  return (rows || [])
    .map(v => ({
      title: String(v.title_name || "").replace(/\s+/g, " ").trim(),
      no: v.title_no, user: v.user_id, published: v.reg_date || v.broad_date || "",
    }))
    .filter(v => v.no && v.user === SOOP_USER_ID)          // 공식 계정 것만 (팬 클립 제외)
    .filter(v => hasTeam(v.title, a) && hasTeam(v.title, b))
    .filter(v => !NOT_FULL.test(v.title))
    .filter(v => nearMatch(v.published, at))
    .sort((x, y) => Date.parse(y.published || 0) - Date.parse(x.published || 0));
}
async function fromSoop(a, b, at) {
  const kw = encodeURIComponent(`[${a} vs ${b}] 전체보기`);
  const url = `https://sch.sooplive.co.kr/api.php?m=vodSearch&v=4.0&szType=json`
    + `&szKeyword=${kw}&nPageNo=1&nListCnt=30&szOrder=reg_date`;
  const j = await getJSON(url, { referer: "https://www.sooplive.co.kr/" });
  return pickSoop(j.DATA || [], a, b, at).map(v => ({
    title: v.title, url: `https://vod.sooplive.co.kr/player/${v.no}`, published: v.published,
  }));
}

async function handler(req, res) {
  const query = (req && req.query) || {};
  const a = String(query.a || "").trim();
  const b = String(query.b || "").trim();
  const at = String(query.at || "").trim();
  if (!a || !b) return fail(res, 400, "두 팀이 필요합니다");

  const key = `${a}|${b}|${at}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return ok(res, hit.value);

  // 한쪽이 죽어도 다른 쪽은 보여 준다
  const [chzzk, soop] = await Promise.all([
    fromChzzk(a, b, at).catch(() => []),
    // SOOP 은 제목이 "[A vs B]" 순서라 반대로도 한 번 더 찾는다
    Promise.all([fromSoop(a, b, at).catch(() => []), fromSoop(b, a, at).catch(() => [])])
      .then(([x, y]) => (x.length ? x : y)),
  ]);

  const value = {
    chzzk: { items: chzzk.slice(0, 5), channelUrl: CHZZK_CHANNEL_URL },
    soop: { items: soop.slice(0, 5), channelUrl: SOOP_STATION_URL },
  };
  cache.set(key, { at: Date.now(), value });
  return ok(res, value);
}

module.exports = handler;
module.exports._test = { hasTeam, pickChzzk, pickSoop, nearMatch };
