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

    const items = parseFeed(xml, limit);
    // 파싱이 0건이면 캐시에 담지 않는다 — 형식이 바뀐 순간을 10분씩 굳히면 안 된다
    return ok(res, { items, source: "Google News" }, items.length ? CACHE_SEC : 0);
  } catch (e) {
    return fail(res, 502, "뉴스를 받지 못했습니다: " + (e && e.message || e));
  }
};

module.exports.parseFeed = parseFeed;
module.exports.cleanTitle = cleanTitle;
