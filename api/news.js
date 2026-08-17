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
const THUMB_BUDGET_MS = 6000;                 // 전체 예산
const THUMB_MAX = 12;                         // 이 개수까지만 시도

/** 구글 썸네일 주소는 끝에 크기가 붙는다 (=s0-w300-rw). 화면에 맞는 크기로 바꿔 받는다. */
const sizeThumb = (src, w) => String(src || "").replace(/=s0-w\d+(-rw)?$/, `=s0-w${w}-rw`);

// ⚠ 구글은 **봇 UA 에게 다른 페이지를 준다.** 우리 기본 UA(TheNexus/1.0)로 부르면
//   기사 썸네일 대신 구글 뉴스 **앱 아이콘**이 og:image 로 들어온다 (2026-08-16 실제로
//   기사 6개가 전부 구글 로고로 나왔다). 썸네일을 받을 때만 브라우저 UA 를 쓴다.
const THUMB_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
  + "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** 기사 사진이 맞는가. 구글 자체 브랜딩 이미지는 기사와 무관하므로 버린다.
 *  진짜 기사 썸네일은 lh3.googleusercontent.com 에 크기 접미사(=s0-w300-rw)가 붙어 온다. */
const isArticleThumb = src => /^https:\/\/lh3\.googleusercontent\.com\//.test(src || "")
  && /=s\d+(-w\d+)?(-rw)?$/.test(src || "");

async function thumbOf(url, deadline) {
  const hit = thumbCache.get(url);
  if (hit && Date.now() - hit.at < THUMB_TTL_MS) return hit.src;
  const left = deadline - Date.now();
  if (left < 800) return null;                // 남은 시간이 없으면 시도조차 하지 않는다
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(left, 3500));
  try {
    const r = await fetch(url, { headers: { "user-agent": THUMB_UA, "accept-language": "ko-KR,ko;q=0.9" },
      redirect: "follow", signal: controller.signal });
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)
           || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
    const src = m && isArticleThumb(m[1]) ? sizeThumb(m[1], 400) : null;
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

module.exports = async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query?.limit, 10) || 20, 1), 40);
  try {
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
module.exports._test = { sizeThumb, withThumbs, thumbOf };
