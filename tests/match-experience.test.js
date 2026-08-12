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

// 목표물 아이콘은 라이엇 공식 게임 자산을 쓴다 (직접 그린 것보다 훨씬 잘 읽힌다).
// 다만 외부 저장소라, 그림이 실패해도 **개수는 계속 보여야** 한다.
assert(app.includes("OBJ_ICON_ROOT") && app.includes("communitydragon.org"),
  "목표물 아이콘은 공식 게임 자산을 써야 함");
["baron.png", "riftherald.png", "grub.png", "tower.png", "inhibitor.png", "dragon_elder.png"].forEach(f =>
  assert(app.includes(f), `${f} 아이콘이 연결돼야 함`));
assert(/onerror="this\.style\.visibility='hidden'"/.test(app),
  "아이콘을 못 받아도 개수는 남아야 함 (그림만 감춘다)");
// 목표물은 가운데 이름을 두고 좌우 대칭 한 줄 — 팀별로 쌓으면 같은 항목이 세로로 안 맞는다
assert(app.includes("const objLine") && app.includes('class="sb-obj-line"') && app.includes(">목표물</div>"),
  "목표물은 가운데 선을 두고 좌우로 펼쳐야 함");
// 3열 격자에 자식을 늘어놓으면 라벨 뒤부터 자리가 밀려 좌우가 어긋난다 — 줄 단위로 감싼다
assert(/objLine\(objChips\("a", false\), objChips\("b", true\)/.test(app),
  "목표물 줄은 좌·가운데·우 세 칸을 한 덩어리로 감싸야 함");
// 드래곤도 같은 대립 구도 + 영혼은 얻은 팀 쪽에만
assert(/objLine\(drakeRow\("a", true\), drakeRow\("b", false\)/.test(app),
  "드래곤도 좌우 대립이어야 함");
// 영혼은 옆에 글자로 또 적지 않고 **4마리째 칸 자체**를 강조한다
assert(app.includes("const isSoul = i === soulIdx") && app.includes("got-soul"),
  "영혼은 4마리째 칸을 강조해서 표시해야 함");
// 자리 번호로 붙이면 "화학공학 칸 — 마공학 영혼" 처럼 앞뒤가 안 맞는다
assert(app.includes("taken.lastIndexOf(soulKindNow)"),
  "영혼 표시는 영혼 원소 칸에 붙어야 함");
assert(/\.obj-chip\.drake\.got-soul \{[^}]*box-shadow/.test(css),
  "영혼 칸에 강조 테두리가 있어야 함");
assert(!app.includes("soulBadge"), "영혼을 별도 글자 배지로 또 적으면 안 됨");
// 유튜브는 하이라이트, 풀 영상은 치지직·SOOP
assert(live.includes("/api/full-vod?a=") && live.includes('btn("chzzk"') && live.includes('btn("soop"'),
  "풀 영상은 검색어가 아니라 **실제 영상 주소**를 받아 걸어야 함");
assert(!live.includes("chzzk.naver.com/search?query="),
  "검색어만 채운 링크는 검색창에 글자만 들어가고 영상이 안 나온다 — 쓰면 안 됨");
const fullVod = require("../api/full-vod.js")._test;
// 치지직: 세트별 풀 VOD 만, 1세트부터. 하이라이트·인터뷰·다른 경기는 제외.
const czRows = [
  { videoTitle: "KT vs DK 게임 2 VOD | 08.12 | 2026 LCK", videoNo: 2, publishDate: "2026-08-12 22:24" },
  { videoTitle: "KT vs DK 게임 1 VOD | 08.12 | 2026 LCK", videoNo: 1, publishDate: "2026-08-12 21:14" },
  { videoTitle: "KT vs DK | 매치 112 하이라이트 | 2026 LCK", videoNo: 3, publishDate: "2026-08-12 22:14" },
  { videoTitle: "DK Siwoo 인터뷰 | KT vs DK | 2026 LCK", videoNo: 4, publishDate: "2026-08-12 23:37" },
  { videoTitle: "DNS vs NS 게임 3 VOD | 08.12 | 2026 LCK", videoNo: 5, publishDate: "2026-08-12 20:29" },
];
{
  const r = fullVod.pickChzzk(czRows, "KT", "DK", "2026-08-12T10:00:00Z");
  assert.deepStrictEqual(r.sets.map(v => v.no), [1, 2], "세트별 VOD 는 1세트부터 정렬돼야 함");
  assert.strictEqual(r.full, null, "하루 전체 방송이 없으면 full 은 비어야 함");
}
// 치지직에는 하루 전체 방송(5~7시간)이 따로 있다 — 그게 진짜 풀영상이다
{
  const withFull = czRows.concat([
    { videoTitle: "DNS vs NS - KT vs DK | 2026 LCK", videoNo: 100, publishDate: "2026-08-12 21:51", duration: 326 * 60 },
    { videoTitle: "KT vs DK 짧은 잡영상", videoNo: 101, publishDate: "2026-08-12 21:55", duration: 8 * 60 },
  ]);
  const r = fullVod.pickChzzk(withFull, "KT", "DK", "2026-08-12T10:00:00Z");
  assert.strictEqual(r.full.no, 100, "하루 전체 방송을 풀영상으로 골라야 함");
  assert.deepStrictEqual(r.sets.map(v => v.no), [1, 2], "세트별은 그대로 따로 있어야 함");
}
// SOOP: 공식 계정(aflol) 것만 — 팬이 올린 클립은 제외
const spRows = [
  { title: "[KT vs DK] 전체보기 / 2026 LCK 정규 시즌", title_no: "100", user_id: "aflol", reg_date: "2026-08-12 21:45" },
  { title: "[클립][KT vs DK] 전체보기", title_no: "200", user_id: "karin1213", reg_date: "2026-08-12 21:50" },
];
assert.deepStrictEqual(fullVod.pickSoop(spRows, "KT", "DK", "2026-08-12T10:00:00Z").map(v => v.no), ["100"],
  "SOOP 은 공식 계정 영상만 골라야 함");
assert.strictEqual(fullVod.hasTeam("DNS vs BRO 전체보기", "NS"), false, "NS 를 DNS 일부로 오인하면 안 됨");
assert.strictEqual(fullVod.nearMatch("2025-08-12 23:00", "2026-08-12T10:00:00Z"), false,
  "지난 시즌 동명 경기를 연결하면 안 됨");
// 같은 대진이 시즌에 여러 번 있다 — 8/9 경기 화면에 8/12 영상이 걸렸다
const sameFixture = [
  { videoTitle: "DK vs KT 게임 1 VOD | 08.09 | 2026 LCK", videoNo: 1, publishDate: "2026-08-09 20:00" },
  { videoTitle: "KT vs DK 게임 1 VOD | 08.12 | 2026 LCK", videoNo: 9, publishDate: "2026-08-12 21:14" },
];
assert.deepStrictEqual(fullVod.pickChzzk(sameFixture, "DK", "KT", "2026-08-09T08:00:00Z").sets.map(v => v.no), [1],
  "제목의 날짜로 같은 대진의 다른 날 경기를 걸러야 함");
assert.deepStrictEqual(fullVod.pickChzzk(sameFixture, "KT", "DK", "2026-08-12T10:00:00Z").sets.map(v => v.no), [9],
  "그날 경기 영상만 골라야 함");
// SOOP 제목 칸은 title 이다 — title_name 을 읽어 한동안 0건이었다
assert.deepStrictEqual(
  fullVod.pickSoop([{ title: "[KT vs DK] 전체보기 / 2026 LCK 정규 시즌", title_no: "100",
    user_id: "aflol", reg_date: "2026-08-12 21:45" }], "KT", "DK", "2026-08-12T10:00:00Z").map(v => v.no),
  ["100"], "SOOP 제목은 title 칸에서 읽어야 함");
assert(live.includes("매치 다시보기") && !live.includes("한국어 다시보기"),
  "카드 이름은 '매치 다시보기' 여야 함");
// 원소 드래곤 칸 수 — 장로를 빼야 한다.
// 리그피디아의 dragons 총계에 장로가 섞여 있어서, 장로를 먹은 팀만 칸이 5개가 됐다
// (사장님이 발견. HLE vs DK 2세트: dragons=5, 원소합=4, 장로=1. 전 세트 훑으니 16건).
const edSrc = app.slice(app.indexOf("function elementalDragons"), app.indexOf("function soulKind"));
const elementalDragons = new Function(edSrc + "; return elementalDragons;")();
assert.strictEqual(elementalDragons({ dragons: { a: 5 }, drakes: { a: { chemtech: 1, hextech: 2, mountain: 1, elder: 1 } } }, "a"), 4,
  "장로를 뺀 원소 드래곤만 세야 함 (실제 사고 데이터)");
assert.strictEqual(elementalDragons({ dragons: { a: 1 }, drakes: { a: { elder: 1 } } }, "a"), 0,
  "장로만 먹었으면 원소 드래곤 칸은 0이어야 함");
assert.strictEqual(elementalDragons({ dragons: { b: 4 }, drakes: { b: { ocean: 1, chemtech: 3 } } }, "b"), 4,
  "장로가 없으면 총계가 그대로 원소 드래곤 수여야 함");
assert.strictEqual(elementalDragons({}, "a"), 0, "기록이 없으면 0");

assert(app.includes("const drakeSlotN = Math.max(SOUL_AT"),
  "드래곤은 영혼까지 남은 칸이 보이게 최소 4칸을 깔아야 함");
// 거울상은 CSS 가 아니라 **순서를 뒤집어서** 만든다 — 같은 목표물이 마주 보게.
assert(/objChips\("b", true\)/.test(app) && /const list = flip \? \[\.\.\.objList\]\.reverse\(\)/.test(app),
  "오른쪽은 목표물 순서를 뒤집어 거울상이어야 함");
// 못 먹은 목표물은 회색, 먹은 것만 제 색
assert(/\.obj-chip\.zero \.obj-ic \{[^}]*grayscale/.test(css),
  "아직 못 먹은 목표물은 회색이어야 함");
// 드래곤은 먹은 마리마다 한 칸, 그 칸에 속성 아이콘
assert(app.includes("const drakeSlots") && /for \(let i = 0; i < \(\+d\[k\] \|\| 0\); i\+\+\) out\.push\(k\)/.test(app),
  "드래곤은 먹은 마리마다 한 칸씩 속성 아이콘을 넣어야 함");
// 장로는 원소 드래곤이 아니라 목표물 칸
assert(/\{ k: "elders",/.test(app) && app.includes('elders: "dragon_elder.png"'),
  "장로는 목표물 칸으로 따로 둬야 함");
// 골드는 늘 큰 두 숫자의 비교라 막대가 맞다 (목표물과 반대)
assert(app.includes('class="sb-gold-bar l"') && app.includes("gA.toLocaleString()"),
  "골드는 양쪽으로 뻗는 막대 + 전체 숫자여야 함");
// 영혼 원소 역산 — 3번째 드래곤의 원소가 그 판의 영혼이고, 4마리를 모은 팀이 얻는다.
// 우리는 순서를 못 받으므로 양 팀 개수를 합쳐 역산한다. 실제로 돌려서 확인한다.
const soulSrc = app.slice(app.indexOf("function soulKind"), app.indexOf("function setScoreboardHTML"));
assert(soulSrc.length > 0, "영혼 원소를 역산하는 규칙이 있어야 함");
const soulKind = new Function(soulSrc + "; return soulKind;")();
assert.strictEqual(soulKind({ drakes: { a: { cloud: 1 }, b: { ocean: 1, chemtech: 3 } } }), "chemtech",
  "3번째부터 같은 원소이므로 가장 많은 원소가 영혼이어야 함");
assert.strictEqual(soulKind({ drakes: { a: { cloud: 1 }, b: { ocean: 1 } } }), null,
  "합쳐서 3마리 미만이면 영혼 원소를 단정하지 않아야 함");
assert.strictEqual(soulKind({ drakes: { a: { infernal: 2 }, b: { ocean: 2 } } }), null,
  "동수라 어느 쪽인지 모르면 단정하지 않아야 함");
assert.strictEqual(soulKind({ drakes: { a: { elder: 2, ocean: 1 }, b: { ocean: 3 } } }), "ocean",
  "장로 드래곤은 영혼 계산에서 빼야 함");
assert(app.includes("got-soul") && app.includes("const soulNm"), "드래곤 4마리 획득 팀에는 영혼을 명시해야 함");
// 목표물은 막대그래프가 아니라 아이콘 + 개수로 — 0 만 늘어선 빈 막대는 읽히지 않았다
assert(!app.includes("SB_ROWS") && app.includes("SB_OBJ") && app.includes("function objIconHTML"),
  "목표물은 비교 막대가 아니라 아이콘으로 보여야 함");
assert(!css.includes(".sb-bars") && !css.includes(".sb-row {"),
  "쓰이지 않는 목표물 막대 스타일이 남아 있으면 안 됨");
assert(app.includes('class="sb-score"'), "킬 점수는 표 위에 크게 보여야 함");
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
// 공식 채널은 경기 뒤에 '매치 N 하이라이트' 를 올린다 — 그걸 가장 먼저 고른다
assert.strictEqual(vodApi.pickKoreanVod(searchRows, "DK", "KT", "2026-08-10T00:00:00Z").videoId, "clip0001",
  "매치 하이라이트가 있으면 그것을 우선 골라야 함");
assert.strictEqual(vodApi.pickKoreanVod([searchRows[0]], "DK", "KT", "2026-08-10T00:00:00Z").videoId, "official9",
  "하이라이트가 없으면 VOD 글자가 없는 공식 풀영상 제목도 허용해야 함");
// 티저는 경기 **전**에 올라오는데 검색 결과에는 날짜가 없어 시간으로 못 거른다.
// 제목으로 확실히 빼지 않으면 다시보기 자리에 티저가 뜬다 (2026-08-12 실제 사고).
[["GEN vs KT | 매치 5 티저 | 2026 LCK", "티저"],
 ["GEN vs KT | 매치 5 프리뷰 | 2026 LCK", "프리뷰"],
 ["GEN vs KT | 인터뷰 | 2026 LCK", "인터뷰"]].forEach(([title, kind]) =>
  assert.strictEqual(vodApi.pickKoreanVod([{ videoId: "teaser01", title, published: "" }],
    "GEN", "KT", "2026-08-10T00:00:00Z"), null, `${kind} 영상을 다시보기로 연결하면 안 됨`));
assert.strictEqual(vodApi.pickKoreanVod([{ videoId: "old2025", title: "DK vs KT | 2025 LCK", published: "" }],
  "DK", "KT", "2026-08-10T00:00:00Z"), null, "검색 결과의 과거 시즌 동명 경기를 연결하면 안 됨");

console.log("✓ 경기 홈·다중 선택·한국 VOD·오브젝트·팀 게시판 모바일 테스트 통과");

// 상수를 지우면서 쓰는 곳을 안 지워 화면이 통째로 안 그려진 적이 있다(2026-08-12).
// node --check 는 이런 걸 못 잡는다 — 쓰는 이름이 정의돼 있는지 직접 본다.
["DRAKE_COLOR", "DRAKE_KO", "SB_OBJ", "OBJ_ICON_FILE", "SOUL_AT"].forEach(name => {
  if (!new RegExp(`\\b${name}\\s*[\\[.(]`).test(app)) return;   // 안 쓰면 없어도 된다
  assert(new RegExp(`const ${name}\\s*=`).test(app), `${name} 을 쓰는데 정의가 없다`);
});
