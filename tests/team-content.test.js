const assert = require("assert");
const fs = require("fs");
const { _test } = require("../api/team-feed");

const xml = `<?xml version="1.0"?>
<feed>
  <entry>
    <yt:videoId>new123</yt:videoId>
    <title>새 영상 &amp; 인터뷰</title>
    <published>2026-08-11T12:00:00Z</published>
  </entry>
</feed>`;

const parsed = _test.parseYouTubeFeed(xml, "t1");
assert.strictEqual(parsed.length, 1);
assert.deepStrictEqual(parsed[0], {
  id: "youtube:new123", team: "t1", platform: "youtube",
  title: "새 영상 & 인터뷰", published: "2026-08-11T12:00:00Z",
  thumb: "https://i.ytimg.com/vi/new123/mqdefault.jpg",
  url: "https://www.youtube.com/watch?v=new123",
});

assert.strictEqual(_test.normalizeHandle("https://x.com/T1LoL/status/1"), "T1LoL");
assert.strictEqual(_test.normalizeHandle("@t1lol"), "t1lol");

const sorted = _test.newestFirst([[
  { id: "old", url: "https://example.com/old", published: "2026-08-10T00:00:00Z" },
  { id: "new", url: "https://example.com/new", published: "2026-08-11T00:00:00Z" },
]]);
assert.deepStrictEqual(sorted.map(item => item.id), ["new", "old"], "플랫폼을 섞어 최신순으로 정렬해야 함");

const teamHtml = fs.readFileSync("team.html", "utf8");
const app = fs.readFileSync("assets/app.js", "utf8");
const css = fs.readFileSync("assets/styles.css", "utf8");
const api = fs.readFileSync("api/team-feed.js", "utf8");

assert(teamHtml.includes("최신 콘텐츠"), "팀 카드 제목은 최신 콘텐츠여야 함");
assert(teamHtml.includes('id="content-prev"') && teamHtml.includes('id="content-next"'),
  "헤더에 이전·다음 버튼이 있어야 함");
assert(app.includes("renderTeamContent") && app.includes("CONTENT_PLATFORM_NAME"),
  "통합 콘텐츠 캐러셀 렌더러가 있어야 함");
assert(css.includes(".content-nav") && css.includes(".content-slide"),
  "캐러셀과 이동 버튼 스타일이 있어야 함");
assert(api.includes("youtube.com/feeds/videos.xml") && api.includes("graph.instagram.com") && api.includes("api.x.com"),
  "YouTube·Instagram·X 공식 수집 경로를 모두 지원해야 함");
assert(!/rsshub|nitter|bibliogram/i.test(api), "비공식 스크래핑 프록시에 의존하면 안 됨");
assert(api.includes("INSTAGRAM_ACCESS_TOKEN") && api.includes("X_BEARER_TOKEN"),
  "SNS 토큰은 서버 환경변수에서만 읽어야 함");

console.log("✓ 팀 최신 콘텐츠 통합 수집·캐러셀 회귀 테스트 통과");
