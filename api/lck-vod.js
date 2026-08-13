// 종료 경기의 한국어 다시보기만 찾는다.
// Leaguepedia의 VOD는 먼저 올라온 LCK Global을 가리킬 수 있어 화면에서 직접 쓰지 않는다.
// LCK 한국 공식 채널 RSS를 읽고 양 팀이 모두 들어간 풀 VOD만 골라 10분 캐시한다.
const { ok, fail } = require("./_lib");

const LCK_KR_CHANNEL_ID = "UCw1DsweY9b2AKGjV4kGJP1A";
const LCK_KR_CHANNEL_URL = "https://www.youtube.com/channel/UCw1DsweY9b2AKGjV4kGJP1A";

const xmlText = value => String(value || "")
  .replace(/<!\[CDATA\[|\]\]>/g, "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();

function parseFeed(xml) {
  return String(xml || "").split("<entry>").slice(1).flatMap(entry => {
    const pick = tag => {
      const hit = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return hit ? xmlText(hit[1]) : "";
    };
    const videoId = pick("yt:videoId");
    if (!videoId) return [];
    return [{ videoId, title: pick("title"), published: pick("published") }];
  });
}

function jsonObjectAfter(source, marker) {
  const at = String(source || "").indexOf(marker);
  if (at < 0) return null;
  const start = source.indexOf("{", at + marker.length);
  if (start < 0) return null;
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === "{") depth++;
    if (ch === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  return null;
}

function parseSearchPage(html) {
  const raw = jsonObjectAfter(html, "var ytInitialData =") || jsonObjectAfter(html, "ytInitialData =");
  if (!raw) return [];
  let root;
  try { root = JSON.parse(raw); } catch { return []; }
  const rows = [], seen = new Set();
  const add = renderer => {
    const videoId = String((renderer && renderer.videoId) || "");
    if (!videoId || seen.has(videoId)) return;
    const title = renderer.title || {};
    const text = title.simpleText || (title.runs || []).map(run => run.text || "").join("");
    if (!text) return;
    seen.add(videoId);
    // 검색 결과에는 정확한 날짜가 없고 "2일 전" 같은 **상대 시간**만 있다.
    // 그거라도 읽어 두지 않으면 날짜 검사를 통째로 건너뛰게 되고,
    // 같은 대진의 **예전 경기 영상**이 오늘 경기 화면에 걸린다. (2026-08-13 실제 사고)
    const relText = (renderer.publishedTimeText || {}).simpleText
      || ((renderer.publishedTimeText || {}).runs || []).map(r => r.text || "").join("");
    rows.push({ videoId, title: text, published: "", publishedAgo: relText || "" });
  };
  const walk = value => {
    if (!value || typeof value !== "object") return;
    ["videoRenderer", "gridVideoRenderer", "childVideoRenderer"].forEach(key => add(value[key]));
    Object.values(value).forEach(walk);
  };
  walk(root);
  return rows;
}

const escapeRegExp = value => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasTeam = (title, team) => {
  const token = String(team || "").trim().toUpperCase();
  if (!token) return false;
  return new RegExp(`(^|[^A-Z0-9])${escapeRegExp(token)}(?=$|[^A-Z0-9])`, "i").test(String(title || ""));
};

// 공식 채널이 경기 뒤에 올리는 영상은 요즘 **"A vs B | 매치 N 하이라이트 | 2026 LCK"** 다.
// 예전에는 풀 VOD 를 찾으면서 하이라이트를 **일부러 걸러 냈는데**, 그 결과 아무것도
// 못 찾고 마지막 그물("A vs B |" 로 시작하면 통과)에 **티저**가 걸렸다.
// 티저는 경기 **전**에 올라오지만, 채널 검색 결과에는 날짜가 없어서 시간 필터도 못 걸렀다.
// (2026-08-12 실제로 'GEN vs KT | 매치 5 티저' 가 다시보기 자리에 떴다)
// 공식 채널에는 하이라이트가 두 종류다.
//   · "KT vs DK | 매치 112 하이라이트"          ← 경기 전체 (우리가 원하는 것)
//   · "명명백백 메타챔 클레드 | KT vs DK 게임 1 하이라이트"  ← 한 세트짜리 짧은 클립
// 둘을 안 가르면 먼저 올라온 세트 클립이 이긴다 (실제로 그랬다).
const VOD_HIGHLIGHT = /매치\s*\d*\s*하이라이트/;   // 한국 공식 채널 표기
const VOD_FULL = /(FULL\s*(VOD|MATCH)|VOD|다시보기|풀\s*영상|전체\s*경기)/i;
// 경기 기록이 아닌 것 — 제목으로 확실히 뺀다 (날짜가 없어도 걸러지도록)
const VOD_NOT_MATCH = /(티저|TEASER|예고|프리뷰|PREVIEW|인터뷰|INTERVIEW|비하인드|BEHIND|메이킹|SHORTS?|쇼츠|기자회견|미디어\s*데이|오프닝|OPENING|플레이\s*오브\s*더|게임\s*\d+\s*하이라이트|위클리|매드무비)/i;

// "2일 전" · "3시간 전" · "1주 전" → 대략 언제 올라왔는지 (밀리초)
// 정확할 필요는 없다. **어제 것과 나흘 전 것을 가르는** 정도면 충분하다.
const AGO_UNIT = { 초: 1e3, 분: 6e4, 시간: 36e5, 일: 864e5, 주: 6048e5, 개월: 2592e6, 년: 31536e6 };
function agoToMs(text) {
  const m = String(text || "").match(/(\d+)\s*(초|분|시간|일|주|개월|년)\s*전/);
  if (!m) return NaN;
  return Date.now() - (+m[1]) * AGO_UNIT[m[2]];
}

// 이 영상이 **그 경기 것**이라고 볼 수 있나.
//   · 경기 시작 3시간 전 ~ 열흘 뒤 사이에 올라왔어야 한다
//   · 날짜를 전혀 모르면 **거부한다** — 같은 대진이 시즌에 여러 번 있어서,
//     확인 못 하는 영상을 걸면 엉뚱한 날 경기가 걸린다 (실제로 그랬다)
// ⚠ 창을 넓게 잡으면 안 된다. 같은 대진이 **사흘 만에** 또 있다
//   (8/9 DK vs KT, 8/12 KT vs DK). 10일로 잡았더니 8/9 경기에 8/12 영상이 걸렸다.
//   하이라이트는 경기 다음 날 올라오므로 **경기 시작 ~ 이틀 뒤**면 충분하다.
const VOD_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
function vodWhen(item) {
  const exact = Date.parse(item.published || "");
  return Number.isFinite(exact) ? exact : agoToMs(item.publishedAgo);
}
function vodDateOK(item, at) {
  if (!Number.isFinite(at)) return true;              // 경기 시각을 모르면 판단 보류
  const when = vodWhen(item);
  if (!Number.isFinite(when)) return false;           // 날짜를 모르는 영상은 쓰지 않는다
  return when >= at - 3 * 60 * 60 * 1000 && when <= at + VOD_WINDOW_MS;
}

function pickKoreanVod(items, a, b, matchAt) {
  const at = Date.parse(matchAt || "");
  // 0 = 매치 하이라이트(우선), 1 = 풀 VOD, 2 = 옛 "A vs B | 라운드" 형식
  const rankOf = t => VOD_HIGHLIGHT.test(t) ? 0 : VOD_FULL.test(t) ? 1 : 2;
  return (items || [])
    .filter(item => hasTeam(item.title, a) && hasTeam(item.title, b))
    .filter(item => !VOD_NOT_MATCH.test(item.title))
    .filter(item => {
      if (!Number.isFinite(at)) return true;
      const years = String(item.title || "").match(/20\d{2}/g) || [];
      return !years.length || years.includes(String(new Date(at).getUTCFullYear()));
    })
    .filter(item => rankOf(item.title) < 2
      || /^\s*[A-Z0-9]+\s+vs\s+[A-Z0-9]+\s*\|/i.test(item.title))
    .filter(item => vodDateOK(item, at))
    // 같은 등급이면 **경기 시각에 가장 가까운** 것. 최신순으로 뽑으면 같은 대진의
    // 나중 경기 영상이 이깁니다 — 실제로 그렇게 잘못 걸렸다.
    .sort((x, y) => rankOf(x.title) - rankOf(y.title)
      || Math.abs(vodWhen(x) - at) - Math.abs(vodWhen(y) - at))[0] || null;
}

// LCK 한국 공식 유튜브의 매치 하이라이트는 **경기 다음 날** 올라온다.
// 그 전에는 찾을 것이 없는데도 뒤지다 보면, 같은 대진의 예전 경기 영상을 물어 온다.
// 그래서 24시간이 지나기 전에는 **아예 찾지 않는다.** (사장님 확인, 2026-08-13)
const VOD_WAIT_MS = 24 * 60 * 60 * 1000;
const tooEarly = at => {
  const m = Date.parse(at || "");
  return Number.isFinite(m) && Date.now() < m + VOD_WAIT_MS;
};

async function handler(req, res) {
  const query = (req && req.query) || {};
  const a = String(query.a || "").trim();
  const b = String(query.b || "").trim();
  if (!a || !b) return fail(res, 400, "두 팀이 필요합니다");

  if (tooEarly(query.at)) {
    return ok(res, {
      status: "pending", reason: "too-early",
      source: "LCK 한국 공식 YouTube", channelUrl: LCK_KR_CHANNEL_URL,
    });
  }
  try {
    const response = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${LCK_KR_CHANNEL_ID}`, {
      headers: { "user-agent": "TheNexus-LCK-FanSite/2.0" },
    });
    if (!response.ok) throw new Error(`YouTube ${response.status}`);
    const rssItems = parseFeed(await response.text());
    let vod = pickKoreanVod(rssItems, a, b, query.at);
    if (!vod) {
      // RSS는 최신 15개뿐이라 클립이 많은 날 풀 VOD가 하루 만에 밀린다.
      // 같은 공식 채널의 내부 검색 결과를 읽어 양 팀의 비하이라이트 영상만 다시 찾는다.
      const term = `${a} vs ${b} 하이라이트 2026 LCK`;
      const search = await fetch(`https://www.youtube.com/@LCK/search?query=${encodeURIComponent(term)}`, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; TheNexus-LCK-FanSite/2.0)", "accept-language": "ko-KR,ko;q=0.9" },
      });
      if (search.ok) vod = pickKoreanVod(parseSearchPage(await search.text()), a, b, query.at);
    }
    return ok(res, vod ? {
      status: "ready", source: "LCK 한국 공식 YouTube", channelUrl: LCK_KR_CHANNEL_URL,
      videoId: vod.videoId, title: vod.title, published: vod.published,
      url: `https://www.youtube.com/watch?v=${vod.videoId}`,
    } : {
      status: "pending", source: "LCK 한국 공식 YouTube", channelUrl: LCK_KR_CHANNEL_URL,
    }, 600);
  } catch (error) {
    return ok(res, { status: "pending", source: "LCK 한국 공식 YouTube", channelUrl: LCK_KR_CHANNEL_URL,
      unavailable: error.message || String(error) }, 300);
  }
}

module.exports = handler;
module.exports._test = { parseFeed, parseSearchPage, hasTeam, pickKoreanVod, agoToMs, vodDateOK };
