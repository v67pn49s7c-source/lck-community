// ── LCK 뉴스 ────────────────────────────────────────────────────
// 구글 뉴스 공개 RSS 를 받아 정리해서 돌려준다. **키가 필요 없고 무료다.**
//
// 왜 이 방식인가 (2026-08-15):
//   인스타그램 공개 API 는 2024-12 폐지됐고, 지금은 사업자 계정 심사를 통과해도
//   **내 계정 게시물만** 받을 수 있다. X 는 읽기가 월 $200 부터다.
//   반면 뉴스 RSS 는 공짜에 제한도 없어서, 무료로 홈을 채울 수 있는 가장 큰 재료다.
//
//   /api/news            → 최신 LCK 뉴스 20건
//   /api/news?limit=8    → 8건
//
// ⚠ 브라우저가 구글을 직접 부르면 CORS 로 막힌다. 그래서 서버가 대신 받는다.
// ⚠ 링크는 구글의 중계 주소다 (news.google.com/rss/articles/...). 원문으로 정상
//    이동하지만 주소만 봐서는 출처를 알 수 없어, 매체 이름을 따로 담아 보여 준다.

const { ok, fail } = require("./_lib");

// 검색어를 넓게 잡으면 해외 리그·게임 일반 기사가 섞이고, 좁게 잡으면 기사가 마른다.
// "LCK" 하나로는 동음이의(물류·기업명)가 섞여서 리그 이름을 함께 건다.
const FEED = "https://news.google.com/rss/search"
  + "?q=" + encodeURIComponent("LCK 리그오브레전드")
  + "&hl=ko&gl=KR&ceid=KR:ko";

const CACHE_SEC = 600;          // 10분. 뉴스는 그보다 자주 바뀌지 않는다.
const UA = "Mozilla/5.0 (compatible; TheNexus/1.0; +https://lck-community.vercel.app)";

const xmlText = v => String(v || "")
  .replace(/<!\[CDATA\[|\]\]>/g, "")
  .replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/\s+/g, " ").trim();

const pick = (block, tag) => {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? xmlText(m[1]) : "";
};

/** 구글은 제목 끝에 " - 매체명" 을 붙인다. 매체는 따로 보여 주므로 제목에선 뗀다. */
function cleanTitle(title, source) {
  const t = String(title || "").trim();
  if (!source) return t;
  const tail = ` - ${source}`;
  return t.endsWith(tail) ? t.slice(0, -tail.length).trim() : t;
}

function parseFeed(xml, limit) {
  return String(xml || "").split("<item>").slice(1).flatMap(block => {
    const source = pick(block, "source");
    const title = cleanTitle(pick(block, "title"), source);
    const link = pick(block, "link");
    if (!title || !link) return [];
    const at = Date.parse(pick(block, "pubDate"));
    return [{
      title, url: link, source: source || "",
      at: Number.isFinite(at) ? new Date(at).toISOString() : null,
    }];
  })
    // 같은 사건을 여러 매체가 쓰면 제목이 거의 같다. 완전히 같은 제목만 걸러낸다
    // (비슷한 것까지 묶으려다 서로 다른 경기 기사를 지우는 게 더 나쁘다).
    .filter((x, i, arr) => arr.findIndex(y => y.title === x.title) === i)
    .sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0))
    .slice(0, limit);
}

// ── 썸네일 ──────────────────────────────────────────────────────
// 구글 뉴스 RSS 자체에는 이미지가 **없다** (media:content·enclosure 전부 없음).
// 그런데 링크가 가리키는 구글 중계 페이지에는 og:image 가 들어 있고, 그게 바로
// 구글 뉴스에서 보이는 그 기사 썸네일이다. 그것만 꺼내 쓴다.
//   장점: 매체마다 다른 페이지를 긁지 않아도 되고, 이미지가 구글 CDN 에 있어 빠르다.
//   ⚠ 한 건에 1.5~2초 걸린다. 서버 함수 시간이 정해져 있으므로 **앞의 몇 건만**
//     동시에 받고, 예산을 넘기면 나머지는 썸네일 없이 보낸다. 이미지가 없다고
//     기사까지 빠지면 안 된다 — 뉴스가 본체고 썸네일은 곁들이다.
const thumbCache = new Map();                 // url → { at, src }
const THUMB_TTL_MS = 60 * 60 * 1000;          // 기사 썸네일은 바뀌지 않는다
// 예산을 늘렸다. 6초로는 포모스처럼 무거운 기사 페이지(74KB·리다이렉트 1회)가
// 못 들어와서, 사진이 있는데도 6건 중 4건이 빈손으로 돌아왔다 (2026-08-17).
// 서버 함수 한도(10초)를 넘기면 뉴스 자체가 안 뜨므로 그보다는 확실히 낮게 둔다.
const THUMB_BUDGET_MS = 8000;                 // 전체 예산
const THUMB_MAX = 12;                         // 이 개수까지만 시도

/** 구글 썸네일 주소는 끝에 크기가 붙는다 (=s0-w300-rw). 화면에 맞는 크기로 바꿔 받는다. */
const sizeThumb = (src, w) => String(src || "").replace(/=s0-w\d+(-rw)?$/, `=s0-w${w}-rw`);

// ⚠ 구글은 **봇 UA 에게 다른 페이지를 준다.** 우리 기본 UA(TheNexus/1.0)로 부르면
//   기사 썸네일 대신 구글 뉴스 **앱 아이콘**이 og:image 로 들어온다 (2026-08-16 실제로
//   기사 6개가 전부 구글 로고로 나왔다). 썸네일을 받을 때만 브라우저 UA 를 쓴다.
const THUMB_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
  + "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";


async function thumbOf(url, deadline) {
  const hit = thumbCache.get(url);
  if (hit && Date.now() - hit.at < THUMB_TTL_MS) return hit.src;
  const left = deadline - Date.now();
  if (left < 800) return null;                // 남은 시간이 없으면 시도조차 하지 않는다
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(left, 6000));
  try {
    const r = await fetch(url, { headers: { "user-agent": THUMB_UA, "accept-language": "ko-KR,ko;q=0.9" },
      redirect: "follow", signal: controller.signal });
    if (!r.ok) return null;
    // og:image 는 <head> 에 있다. 본문까지 다 읽으면 무거운 기사에서 시간을 버린다.
    const html = (await r.text()).slice(0, 120000);
    // 매체마다 속성 순서가 다르다. og:image 를 두 순서로 보고, 없으면 twitter:image.
    const pats = [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)/i,
    ];
    let found = null;
    for (const p of pats) { const m = html.match(p); if (m && /^https?:\/\//.test(m[1])) { found = m[1]; break; } }
    const src = found ? sizeThumb(found, 400) : null;
    thumbCache.set(url, { at: Date.now(), src });
    return src;
  } catch { return null; }                    // 느리거나 막히면 그냥 썸네일 없이 간다
  finally { clearTimeout(timer); }
}

/** 앞의 몇 건에 썸네일을 붙인다. 실패해도 기사 목록은 그대로 돌려준다. */
// 서버에서 기사 페이지를 못 여는 매체가 있다 — 포모스는 Cloudflare 가 우리 서버를
// 막는다(403 "Just a moment"). 내 컴퓨터에서는 되고 서버에서만 안 되므로 눈치채기 어렵다.
// 이런 매체는 **사진을 못 구할 뿐 기사는 멀쩡하다.** 그래서 버리지 않고, 대신
// 사진이 필요한 자리(머리기사)에는 다른 매체가 오도록 화면 쪽에서 고른다.
async function withThumbs(items) {
  const deadline = Date.now() + THUMB_BUDGET_MS;
  const head = items.slice(0, THUMB_MAX);
  const got = await Promise.all(head.map(n => thumbOf(n.url, deadline).catch(() => null)));
  // 여러 기사가 **같은 사진**이면 그건 기사 사진이 아니라 공용 이미지다 (로고·기본 이미지).
  // 하나뿐인 사진만 남긴다 — 같은 그림이 줄줄이 걸리는 것보다 없는 편이 낫다.
  const seen = {};
  got.forEach(src => { if (src) seen[src] = (seen[src] || 0) + 1; });
  head.forEach((n, i) => { if (got[i] && seen[got[i]] === 1) n.image = got[i]; });
  return items;
}

// ── 네이버 뉴스 검색 (NAVER API HUB) ────────────────────────────
// 구글 뉴스보다 나은 점이 딱 하나 있는데 그게 결정적이다: **기사 원문 주소**를 준다.
// 구글은 원문 주소를 암호로 감춰서(복호화 불가) 사진을 구할 길이 아예 없었다.
// 네이버는 originallink 를 그대로 주므로, 그 페이지의 og:image = **진짜 기사 사진**이다.
// ⚠ 네이버 응답 자체에는 이미지 칸이 없다 (title·originallink·link·description·pubDate 뿐).
const NAVER_NEWS = "https://naverapihub.apigw.ntruss.com/search/v1/news";
// 웹문서 검색 — 인벤·포모스처럼 **언론사로 등록 안 된 곳의 기사**가 여기 걸린다.
// 뉴스 검색은 네이버가 제휴한 매체만 나와서 정작 e스포츠 전문지가 빠지는 일이 있다.
const NAVER_WEB = "https://naverapihub.apigw.ntruss.com/search/v1/webkr";

const stripTags = v => String(v || "")
  .replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim();

/** 매체 이름은 응답에 없다. 원문 주소의 도메인에서 만든다 (www. 와 꼬리는 뗀다). */
function sourceOf(link) {
  try {
    const h = new URL(link).hostname.replace(/^www\./, "");
    return NEWS_SOURCE_KO[h] || h;
  } catch { return ""; }
}
// 자주 나오는 매체만 한글로. 없으면 도메인을 그대로 쓴다 — 지어내지 않는다.
const NEWS_SOURCE_KO = {
  "inven.co.kr": "인벤", "fomos.com": "포모스", "fomos.kr": "포모스",
  "dailyesports.com": "데일리e스포츠", "gameview.co.kr": "게임뷰",
  "thisisgame.com": "디스이즈게임", "gamemeca.com": "게임메카",
  "ruliweb.com": "루리웹", "gamefocus.co.kr": "게임포커스",
  "sports.khan.co.kr": "스포츠경향", "sportsseoul.com": "스포츠서울",
  "stnsports.co.kr": "STN스포츠", "xportsnews.com": "엑스포츠뉴스",
  "osen.mt.co.kr": "OSEN", "interview365.com": "인터뷰365",
};

// e스포츠 전문 매체 — 같은 날 기사라도 이쪽을 먼저 올린다 (사장님 2026-08-17).
// 종합지는 LCK 를 가끔 다루지만 전문 매체는 매일 다룬다.
// ⚠ 여기 없는 매체를 **버리지는 않는다.** 우선순위만 준다 — 좋은 기사가 사라지면 안 된다.
const ESPORTS_MEDIA = new Set([
  "inven.co.kr", "fomos.com", "fomos.kr", "dailyesports.com", "gameview.co.kr",
  "thisisgame.com", "gamemeca.com", "gamefocus.co.kr", "ruliweb.com",
  "stnsports.co.kr", "interview365.com",
]);
const hostOf = link => { try { return new URL(link).hostname.replace(/^www\./, ""); } catch { return ""; } };

// 검색어에 안 걸러지는 딴 이야기 — LCK 는 물류·기업 이름으로도 쓰인다.
const OFF_TOPIC = /물류|택배|화물|주가|증권|부동산|아파트|채용 공고/;

/** LCK 이야기가 맞는가. 제목이나 요약에 리그·팀·대회 이름이 하나라도 있어야 한다. */
const LCK_HINT = new RegExp([
  "LCK", "리그 ?오브 ?레전드", "롤드컵", "MSI", "월즈", "롤 ?챔스",
  "T1", "젠지", "한화생명", "디플러스", "kt ?롤스터", "브리온", "농심", "피어엑스", "DRX", "수퍼스",
].join("|"), "i");

async function fetchNaver(limit) {
  const id = process.env.NAVER_API_KEY_ID, key = process.env.NAVER_API_KEY;
  if (!id || !key) return null;                 // 키가 없으면 구글로 넘어간다
  const H = { "X-NCP-APIGW-API-KEY-ID": id, "X-NCP-APIGW-API-KEY": key };
  const grab = async (base, q, sort) => {
    const u = `${base}?query=${encodeURIComponent(q)}&display=50${sort ? `&sort=${sort}` : ""}`;
    const r = await fetch(u, { headers: H });
    if (!r.ok) return [];                       // 한쪽이 죽어도 나머지로 채운다
    return ((await r.json()).items) || [];
  };
  // 뉴스 + 웹문서를 함께 긁는다. 웹문서에는 언론사 등록이 안 된 전문지 기사가 걸린다.
  const raw = (await Promise.all([
    grab(NAVER_NEWS, "LCK 리그오브레전드", "date"),
    grab(NAVER_NEWS, "LCK 경기 젠지 T1 한화생명", "date"),
    grab(NAVER_WEB, "LCK 리그오브레전드 인벤 포모스", null),
  ])).flat();
  const ranked = raw.flatMap(it => {
    const title = stripTags(it.title);
    const desc = stripTags(it.description);
    const url = it.originallink || it.link;
    if (!title || !url) return [];
    // LCK 이야기가 아닌 것은 버린다. "LCK" 는 물류·기업 이름으로도 쓰여서 섞여 든다.
    if (!LCK_HINT.test(title + " " + desc)) return [];
    if (OFF_TOPIC.test(title)) return [];
    const at = Date.parse(it.pubDate || "");
    return [{ title, url, source: sourceOf(url), host: hostOf(url),
      at: Number.isFinite(at) ? new Date(at).toISOString() : null }];
  })
    .filter((x, i, arr) => arr.findIndex(y => y.title === x.title) === i)
    // e스포츠 전문 매체를 먼저. 같은 급이면 최신순.
    .sort((a, b) => (ESPORTS_MEDIA.has(b.host) ? 1 : 0) - (ESPORTS_MEDIA.has(a.host) ? 1 : 0)
      || (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));

  // ⚠ 한 매체가 목록을 독점하면 안 된다. 포모스가 하루에 열 건을 쓰면 목록이 전부
  //   포모스가 되는데, 하필 포모스는 서버에서 사진을 못 가져오는 매체라 사진이
  //   통째로 사라진다. 매체당 2건까지만 — 다양성이 곧 사진 확률이다.
  const perHost = {}, picked = [];
  for (const it of ranked) {
    perHost[it.host] = (perHost[it.host] || 0) + 1;
    if (perHost[it.host] <= 2) picked.push(it);
    if (picked.length >= limit) break;
  }
  // 그래도 모자라면 남은 것으로 채운다 (뉴스가 비는 것이 가장 나쁘다)
  if (picked.length < limit) {
    for (const it of ranked) {
      if (picked.includes(it)) continue;
      picked.push(it);
      if (picked.length >= limit) break;
    }
  }
  return picked.map(({ host, ...rest }) => rest);
}

/** 구글 뉴스 RSS. 원문 주소를 안 줘서 사진은 못 붙지만, 네이버가 놓친 매체를 메운다. */
async function fetchGoogle(limit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const r = await fetch(FEED, { headers: { "user-agent": UA }, signal: controller.signal });
    if (!r.ok) return [];
    return parseFeed(await r.text(), limit)
      .filter(x => LCK_HINT.test(x.title) && !OFF_TOPIC.test(x.title));
  } finally { clearTimeout(timer); }
}

/** 두 검색 결과를 합친다.
 *  ⚠ 같은 사건을 두 곳이 다 물어 오므로 **제목이 거의 같으면 하나로 본다.**
 *    구두점·공백만 다른 경우가 많아서, 비교 전에 글자만 남긴다.
 *  ⚠ 남길 때는 **원문 주소가 있는 쪽(네이버)** 을 고른다 — 그래야 사진을 붙일 수 있다.
 *    구글 링크는 중계 주소라 사진을 못 구한다. */
function mergeNews(all, limit) {
  const key = t => String(t || "").replace(/[^가-힣a-zA-Z0-9]/g, "").slice(0, 28);
  const best = new Map();
  all.forEach(it => {
    const k = key(it.title);
    if (!k) return;
    const cur = best.get(k);
    const isNaver = !/news\.google\.com/.test(it.url);
    if (!cur || (isNaver && /news\.google\.com/.test(cur.url))) best.set(k, it);
  });
  const list = [...best.values()];
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
  // 전문 매체 먼저 · 같은 급이면 최신순 · 한 매체가 목록을 독점하지 못하게 2건까지
  list.sort((a, b) => (ESPORTS_MEDIA.has(host(b.url)) ? 1 : 0) - (ESPORTS_MEDIA.has(host(a.url)) ? 1 : 0)
    || (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
  const per = {}, out = [];
  for (const it of list) {
    const h = host(it.url);
    per[h] = (per[h] || 0) + 1;
    if (per[h] <= 2) out.push(it);
    if (out.length >= limit) break;
  }
  for (const it of list) {
    if (out.length >= limit) break;
    if (!out.includes(it)) out.push(it);
  }
  return out;
}

module.exports = async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query?.limit, 10) || 20, 1), 40);
  try {
    // ── 네이버 + 구글을 **함께** 긁는다 (사장님 2026-08-17) ───────────
    // 한쪽만 쓰면 그 검색이 놓친 매체가 통째로 안 보인다. 둘을 합치고 겹치는 것만 뺀다.
    // 한쪽이 죽어도 나머지로 채워진다 — 뉴스가 아예 안 뜨는 것이 가장 나쁘다.
    const [nv, gg] = await Promise.all([
      fetchNaver(limit * 3).catch(e => { console.warn("[뉴스] 네이버 실패:", e && e.message); return []; }),
      fetchGoogle(limit * 3).catch(e => { console.warn("[뉴스] 구글 실패:", e && e.message); return []; }),
    ]);
    const merged = mergeNews([...(nv || []), ...(gg || [])], limit);
    if (merged.length) {
      const withPics = await withThumbs(merged);
      return ok(res, { items: withPics, source: "네이버 · 구글" }, CACHE_SEC);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    let xml;
    try {
      const r = await fetch(FEED, { headers: { "user-agent": UA }, signal: controller.signal });
      if (!r.ok) return fail(res, 502, `뉴스를 받지 못했습니다 (HTTP ${r.status})`);
      xml = await r.text();
    } finally { clearTimeout(timer); }

    const items = await withThumbs(parseFeed(xml, limit));
    // 파싱이 0건이면 캐시에 담지 않는다 — 형식이 바뀐 순간을 10분씩 굳히면 안 된다
    return ok(res, { items, source: "Google News" }, items.length ? CACHE_SEC : 0);
  } catch (e) {
    return fail(res, 502, "뉴스를 받지 못했습니다: " + (e && e.message || e));
  }
};

module.exports.parseFeed = parseFeed;
module.exports.cleanTitle = cleanTitle;
module.exports._test = { sizeThumb, withThumbs, thumbOf, sourceOf, stripTags, fetchNaver };
