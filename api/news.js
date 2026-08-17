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
const NAVER_URL = "https://naverapihub.apigw.ntruss.com/search/v1/news";

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
  const u = `${NAVER_URL}?query=${encodeURIComponent("LCK 리그오브레전드")}`
    + `&display=${Math.min(limit * 5, 100)}&sort=date`;
  const r = await fetch(u, { headers: {
    "X-NCP-APIGW-API-KEY-ID": id, "X-NCP-APIGW-API-KEY": key } });
  if (!r.ok) throw new Error(`네이버 ${r.status}`);
  const body = await r.json();
  return (body.items || []).flatMap(it => {
    const title = stripTags(it.title);
    const desc = stripTags(it.description);
    const url = it.originallink || it.link;
    if (!title || !url) return [];
    // LCK 이야기가 아닌 것은 버린다. "LCK" 는 물류·기업 이름으로도 쓰여서 섞여 든다.
    if (!LCK_HINT.test(title + " " + desc)) return [];
    if (OFF_TOPIC.test(title)) return [];
    const at = Date.parse(it.pubDate);
    return [{ title, url, source: sourceOf(url), host: hostOf(url),
      at: Number.isFinite(at) ? new Date(at).toISOString() : null }];
  })
    .filter((x, i, arr) => arr.findIndex(y => y.title === x.title) === i)
    // e스포츠 전문 매체를 먼저. 같은 급이면 최신순.
    .sort((a, b) => (ESPORTS_MEDIA.has(b.host) ? 1 : 0) - (ESPORTS_MEDIA.has(a.host) ? 1 : 0)
      || (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0))
    .map(({ host, ...rest }) => rest)
    .slice(0, limit);
}

module.exports = async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query?.limit, 10) || 20, 1), 40);
  try {
    // 네이버가 되면 네이버를 쓴다 — 국내 매체를 잘 잡고, 무엇보다 **원문 주소**를 준다.
    // 실패하면 조용히 구글로 내려간다 (뉴스가 아예 안 뜨는 것이 가장 나쁘다).
    try {
      const nv = await fetchNaver(limit);
      if (nv && nv.length) {
        const withPics = await withThumbs(nv);
        return ok(res, { items: withPics, source: "네이버 뉴스" }, CACHE_SEC);
      }
    } catch (e) { console.warn("[뉴스] 네이버 실패 → 구글로:", e && e.message); }

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
