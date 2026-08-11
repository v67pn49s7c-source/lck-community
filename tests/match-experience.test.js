const assert = require("assert");
const fs = require("fs");

const app = fs.readFileSync("assets/app.js", "utf8");
const live = fs.readFileSync("live.html", "utf8");
const matches = fs.readFileSync("matches.html", "utf8");
const schedule = fs.readFileSync("schedule.html", "utf8");
const css = fs.readFileSync("assets/styles.css", "utf8");
const sitemap = fs.readFileSync("api/sitemap.js", "utf8");
const vodApi = require("../api/lck-vod.js")._test;

assert(app.includes('["전체 경기 일정", "schedule.html"]'), "경기 하위 메뉴에 전체 일정 탭이 있어야 함");
assert(matches.includes('id="recent-matches"') && matches.includes('id="next-matches"'),
  "경기 홈은 최근 결과와 다음 경기를 분리해야 함");
assert(matches.includes('filter(m => m.status === "done").slice(-2)'), "최근 종료 경기는 정확히 2개만 골라야 함");
assert(schedule.includes('id="tournament-select"') && schedule.includes('id="stage-tabs"'),
  "전체 일정 페이지는 대회·라운드 필터를 유지해야 함");
assert(sitemap.includes('["/schedule.html", "0.8", "hourly"]'), "새 전체 일정 페이지를 사이트맵에 포함해야 함");

assert(live.includes('id="match-switcher"') && live.includes("sameDay.length < 2"),
  "같은 날 두 경기부터 경기 선택 화면을 표시해야 함");
assert(live.includes('class="stack live-side"') && live.indexOf('id="fanpulse-card"') > live.indexOf('<aside'),
  "팬심지수는 데스크톱 사이드 영역에 있어야 함");
assert(live.indexOf('id="rating-card"') > live.indexOf('<aside'), "팬심 평점은 사이드 영역에 있어야 함");
assert(live.includes("/api/lck-vod?") && live.includes("youtube-nocookie.com/embed/"),
  "종료 경기는 한국 공식 VOD API와 임베드 플레이어를 사용해야 함");
assert(!app.includes('g.vod ? `<a'), "Leaguepedia/Global VOD를 다시보기로 직접 노출하면 안 됨");

assert(app.includes("DRAKE_ICON_ROOT") && app.includes("dragon_elder.png"),
  "드래곤과 장로드래곤은 공식 게임 자산 아이콘을 사용해야 함");
assert(app.includes("✦</span> 영혼"), "드래곤 4마리 획득 팀에는 영혼을 명시해야 함");
assert(css.includes("#board-root table.board-table tr") && css.includes("grid-template-columns: 64px minmax(0, 1fr) 38px"),
  "모바일 팀 게시판 행은 화면 폭 안의 3열 카드로 바뀌어야 함");
assert(/@media \(max-width: 960px\)[\s\S]*?#board-root table\.board-table tr[\s\S]*?grid-template-columns: 72px minmax\(0, 1fr\) 52px/.test(css),
  "중간 폭 팀 게시판도 분류·제목·추천 3열로 전체 폭을 사용해야 함");

const xml = `
<feed>
  <entry><yt:videoId>global00</yt:videoId><title>DNS vs NS Highlights</title><published>2026-08-12T12:00:00Z</published></entry>
  <entry><yt:videoId>korean01</yt:videoId><title>DNS vs NS FULL VOD | 2026 LCK</title><published>2026-08-13T10:00:00Z</published></entry>
  <entry><yt:videoId>wrong002</yt:videoId><title>DK vs NS FULL VOD | 2026 LCK</title><published>2026-08-13T11:00:00Z</published></entry>
</feed>`;
const rows = vodApi.parseFeed(xml);
assert.strictEqual(rows.length, 3, "YouTube RSS 항목을 모두 읽어야 함");
assert.strictEqual(vodApi.pickKoreanVod(rows, "DNS", "NS", "2026-08-12T08:00:00Z").videoId, "korean01",
  "양 팀이 정확히 일치하는 풀 VOD만 선택해야 함");
assert.strictEqual(vodApi.pickKoreanVod(rows, "DNS", "DK", "2026-08-12T08:00:00Z"), null,
  "한 팀만 맞거나 하이라이트인 영상은 거부해야 함");
assert.strictEqual(vodApi.hasTeam("DNS vs NS FULL VOD", "NS"), true, "짧은 팀 약어도 독립 토큰으로 찾아야 함");
assert.strictEqual(vodApi.hasTeam("DNS vs BRO FULL VOD", "NS"), false, "NS를 DNS 일부로 오인하면 안 됨");

const initialData = { contents: [{ childVideoRenderer: {
  videoId: "official9", title: { simpleText: "DK vs KT | 2026 LCK 정규 시즌" },
} }, { videoRenderer: {
  videoId: "clip0001", title: { runs: [{ text: "DK vs KT | 매치 하이라이트 | 2026 LCK" }] },
} }] };
const searchRows = vodApi.parseSearchPage(`<script>var ytInitialData = ${JSON.stringify(initialData)};</script>`);
assert.strictEqual(searchRows.length, 2, "공식 채널 내부 검색 결과의 일반·재생목록 영상을 읽어야 함");
assert.strictEqual(vodApi.pickKoreanVod(searchRows, "DK", "KT", "2026-08-10T00:00:00Z").videoId, "official9",
  "VOD 글자가 없어도 정확한 A vs B 공식 풀영상 제목은 허용해야 함");
assert.strictEqual(vodApi.pickKoreanVod([{ videoId: "old2025", title: "DK vs KT | 2025 LCK", published: "" }],
  "DK", "KT", "2026-08-10T00:00:00Z"), null, "검색 결과의 과거 시즌 동명 경기를 연결하면 안 됨");

console.log("✓ 경기 홈·다중 선택·한국 VOD·오브젝트·팀 게시판 모바일 테스트 통과");
