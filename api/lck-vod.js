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
    rows.push({ videoId, title: text, published: "" });
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

function pickKoreanVod(items, a, b, matchAt) {
  const at = Date.parse(matchAt || "");
  const replay = /(FULL\s*(VOD|MATCH)|VOD|다시보기|풀\s*영상|전체\s*경기)/i;
  const notReplay = /(하이라이트|HIGHLIGHT|인터뷰|비하인드|SHORTS?|쇼츠)/i;
  return (items || [])
    .filter(item => hasTeam(item.title, a) && hasTeam(item.title, b))
    .filter(item => {
      if (!Number.isFinite(at)) return true;
      const years = String(item.title || "").match(/20\d{2}/g) || [];
      return !years.length || years.includes(String(new Date(at).getUTCFullYear()));
    })
    // 공식 채널의 옛 풀영상은 제목에 VOD를 쓰지 않고 "A vs B | 라운드"로만 올리기도 한다.
    .filter(item => (replay.test(item.title) || /^\s*[A-Z0-9]+\s+vs\s+[A-Z0-9]+\s*\|/i.test(item.title))
      && !notReplay.test(item.title))
    .filter(item => {
      const published = Date.parse(item.published || "");
      return !Number.isFinite(at) || !Number.isFinite(published) || published >= at - 3 * 60 * 60 * 1000;
    })
    .sort((x, y) => Date.parse(y.published || "") - Date.parse(x.published || ""))[0] || null;
}

async function handler(req, res) {
  const query = (req && req.query) || {};
  const a = String(query.a || "").trim();
  const b = String(query.b || "").trim();
  if (!a || !b) return fail(res, 400, "두 팀이 필요합니다");
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
      const term = `${a} vs ${b} 2026 LCK`;
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
module.exports._test = { parseFeed, parseSearchPage, hasTeam, pickKoreanVod };
