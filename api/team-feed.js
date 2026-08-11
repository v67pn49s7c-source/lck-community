// ── 팀 공식 SNS 최신 콘텐츠 수집 ────────────────────────────────
// YouTube는 공개 RSS(키 불필요), X와 Instagram은 공식 API만 사용한다.
// 브라우저가 각 플랫폼을 직접 부르지 않게 서버에서 공통 형태로 정리하고 10분 캐시한다.
//
//   /api/team-feed?team=t1 → 해당 팀의 YouTube · Instagram · X 최신 콘텐츠
//
// site_settings
//   team_youtube: { "t1": "UC..." }
//   team_social:  { "t1": { "instagram": "t1lol", "instagramUserId": "...", "x": "T1LoL" } }
//
// Vercel 환경변수
//   X_BEARER_TOKEN
//   INSTAGRAM_ACCESS_TOKEN 또는 팀별 INSTAGRAM_ACCESS_TOKEN_T1

const { ok, fail, sb } = require("./_lib");

const DEFAULT_CHANNELS = {
  t1: "UCJprx3bX49vNl6Bcw01Cwfg",
  gen: "UCDmmbxGg8g-EBkC_ku6vybg",
  hle: "UCrfB1-zWijAYkgfZW7Ehc8Q",
  dk: "UCepHesz_5Lwr7qRaqjB-p1A",
  kt: "UC8FErYSi74YwGUAoTpjvgzQ",
  bro: "UCYQO6n0KZmwfwzWtm4_nAPA",
  bfx: "UCxedTJNaGRHiq6YfNtQVCNA",
  krx: "UC5WN-znPsJK0BbA8aHxZHWQ",
  ns: "UC4PoHC-R9EeJYTuUv3ndmJw",
  dns: "UCGW76VChAJKee9kYzvyoycQ",
};

const xmlText = value => String(value || "")
  .replace(/<!\[CDATA\[|\]\]>/g, "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();

const normalizeHandle = value => String(value || "").trim()
  .replace(/^https?:\/\/(?:www\.)?(?:instagram\.com|x\.com|twitter\.com)\//i, "")
  .replace(/^@/, "").split(/[/?#]/)[0].trim();

async function fetchTimed(url, init = {}, ms = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

async function loadConfig() {
  const rows = await sb("site_settings?key=in.(team_youtube,team_social)&select=key,value");
  const values = Object.fromEntries((rows || []).map(row => [row.key, row.value]));
  let youtube = {}, social = {};
  try { youtube = JSON.parse(values.team_youtube || "{}"); } catch {}
  try { social = JSON.parse(values.team_social || "{}"); } catch {}
  const channels = { ...DEFAULT_CHANNELS };
  Object.entries(youtube || {}).forEach(([team, id]) => { if (id) channels[team] = String(id).trim(); });
  return { channels, social: social || {} };
}

function parseYouTubeFeed(xml, teamId) {
  return String(xml || "").split("<entry>").slice(1).flatMap(entry => {
    const pick = tag => {
      const match = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return match ? xmlText(match[1]) : "";
    };
    const id = pick("yt:videoId");
    if (!id) return [];
    return [{
      id: `youtube:${id}`, team: teamId, platform: "youtube",
      title: pick("title"), published: pick("published"),
      thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${id}`,
    }];
  });
}

async function collectYouTube(teamId, channelId) {
  if (!channelId) return [];
  const response = await fetchTimed(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`,
    { headers: { "user-agent": "TheNexus-LCK-FanSite/2.0" } });
  if (!response.ok) throw new Error(`YouTube ${response.status}`);
  return parseYouTubeFeed(await response.text(), teamId).slice(0, 8);
}

async function collectInstagram(teamId, social) {
  const userId = String(social.instagramUserId || "").trim();
  const handle = normalizeHandle(social.instagram);
  const token = process.env[`INSTAGRAM_ACCESS_TOKEN_${teamId.toUpperCase()}`]
    || process.env.INSTAGRAM_ACCESS_TOKEN || "";
  if (!userId || !token) return [];
  const params = new URLSearchParams({
    fields: "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp",
    limit: "8",
  });
  const response = await fetchTimed(`https://graph.instagram.com/${encodeURIComponent(userId)}/media?${params}`,
    { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Instagram ${response.status}`);
  const body = await response.json();
  return (body.data || []).map(post => ({
    id: `instagram:${post.id}`, team: teamId, platform: "instagram",
    title: String(post.caption || "Instagram 새 게시물").trim(),
    published: post.timestamp || "",
    thumb: post.thumbnail_url || post.media_url || "",
    url: post.permalink || (handle ? `https://www.instagram.com/${handle}/` : ""),
  })).filter(post => /^https?:\/\//.test(post.url));
}

async function collectX(teamId, social) {
  const handle = normalizeHandle(social.x);
  const token = process.env.X_BEARER_TOKEN || "";
  if (!handle || !token) return [];
  const headers = { authorization: `Bearer ${token}` };
  const userResponse = await fetchTimed(
    `https://api.x.com/2/users/by/username/${encodeURIComponent(handle)}?user.fields=id`, { headers });
  if (!userResponse.ok) throw new Error(`X user ${userResponse.status}`);
  const user = await userResponse.json();
  const userId = user && user.data && user.data.id;
  if (!userId) return [];

  const params = new URLSearchParams({
    max_results: "10", exclude: "retweets,replies",
    "tweet.fields": "created_at,attachments",
    expansions: "attachments.media_keys",
    "media.fields": "type,url,preview_image_url,width,height",
  });
  const response = await fetchTimed(`https://api.x.com/2/users/${encodeURIComponent(userId)}/tweets?${params}`, { headers });
  if (!response.ok) throw new Error(`X timeline ${response.status}`);
  const body = await response.json();
  const media = Object.fromEntries(((body.includes || {}).media || []).map(item => [item.media_key, item]));
  return (body.data || []).map(post => {
    const key = post.attachments && (post.attachments.media_keys || [])[0];
    const asset = key && media[key];
    return {
      id: `x:${post.id}`, team: teamId, platform: "x",
      title: String(post.text || "X 새 게시물").trim(), published: post.created_at || "",
      thumb: asset ? (asset.preview_image_url || asset.url || "") : "",
      url: `https://x.com/${handle}/status/${post.id}`,
    };
  });
}

const publishedAt = item => {
  const value = Date.parse((item && item.published) || "");
  return Number.isFinite(value) ? value : 0;
};
const newestFirst = items => items.flat().filter(item => item && item.url)
  .sort((a, b) => publishedAt(b) - publishedAt(a));

async function collectTeam(teamId, channelId, social = {}) {
  const errors = [];
  const sources = [
    ["youtube", () => collectYouTube(teamId, channelId)],
    ["instagram", () => collectInstagram(teamId, social)],
    ["x", () => collectX(teamId, social)],
  ];
  const results = await Promise.all(sources.map(async ([name, run]) => {
    try { return await run(); } catch { errors.push(name); return []; }
  }));
  return { items: newestFirst(results).slice(0, 24), errors };
}

async function handler(req, res) {
  try {
    const { channels, social } = await loadConfig();
    const want = String((req.query && req.query.team) || "").trim().toLowerCase();
    const teamIds = want ? (channels[want] ? [want] : []) : Object.keys(channels);
    if (!teamIds.length) return ok(res, { items: [], videos: [], count: 0 }, 300);

    const collected = await Promise.all(teamIds.map(team => collectTeam(team, channels[team], social[team] || {})));
    const items = newestFirst(collected.map(result => result.items)).slice(0, want ? 24 : 50);
    const errors = [...new Set(collected.flatMap(result => result.errors))];
    const videos = items.filter(item => item.platform === "youtube").map(item => ({
      team: item.team, videoId: item.id.replace(/^youtube:/, ""), title: item.title,
      published: item.published, thumb: item.thumb, url: item.url,
    }));
    return ok(res, { items, videos, count: items.length, unavailable: errors }, 600);
  } catch (error) {
    return fail(res, 500, error.message || String(error));
  }
}

module.exports = handler;
module.exports._test = { parseYouTubeFeed, normalizeHandle, newestFirst };
