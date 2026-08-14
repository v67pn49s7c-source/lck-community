// 최애선수 별 · LCK 뉴스(RSS)
//
// 별의 함정: 선수 카드는 **카드 전체가 링크(a)** 다. 별을 그냥 올려 두면 누르는 순간
// 선수 상세로 넘어가 버리고 즐겨찾기는 안 된다. 그래서 클릭을 가로채는 게 핵심이다.
//
// 뉴스의 함정: 브라우저가 구글을 직접 부르면 CORS 로 막힌다. 서버가 대신 받아야 한다.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const read = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

const photos = read("assets/player-photos.js");
const app = read("assets/app.js");
const css = read("assets/styles.css");
const players = read("players.html");
const player = read("player.html");
const news = read("api/news.js");
const home = read("index.html");

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

// ── 별 ──────────────────────────────────────────────────
ok(/function favStarHTML\(p\)/.test(photos) && /function bindFavStars\(root, onDone\)/.test(photos),
  "별 마크업과 클릭 묶기 함수");
ok(/e\.preventDefault\(\);/.test(photos) && /e\.stopPropagation\(\);/.test(photos),
  "카드 링크로 넘어가지 않게 클릭을 가로채야 함 — 이게 없으면 별이 아무 소용 없다");
ok(/aria-pressed="\$\{on\}"/.test(photos), "켜짐·꺼짐을 보조기기에 알려야 함");
ok(/typeof isFavPlayer !== "function"/.test(photos),
  "store 가 없는 화면에서도 터지지 않아야 함");
ok(/renderHomeMyTeam === "function"/.test(photos),
  "별을 바꾸면 홈의 '오늘 출전' 도 따라 바뀌어야 함");
ok(/\$\{favStarHTML\(p\)\}/.test(players) && /bindFavStars\(document\.getElementById\("rosters"\), drawRosters\)/.test(players),
  "선수 목록 카드마다 별 + 클릭 묶기");
ok(/id="player-fav"/.test(player) && /function drawFavBtn\(\)/.test(player), "선수 상세에도 담기 버튼");
ok(/최애선수로 담기/.test(player), "상세에서는 글자까지 붙여 무슨 버튼인지 분명히");
ok(/\.roster-card \{ position: relative; \}/.test(css), "별을 얹으려면 카드가 기준점이어야 함");
ok(/\.fav-star \{[\s\S]{0,200}position: absolute/.test(css), "별은 카드 위에 얹힌다");
ok(/\.fav-star\.wide \{[\s\S]{0,120}position: static/.test(css), "상세용 넓은 버튼은 흐름대로");

// ── 뉴스 ────────────────────────────────────────────────
ok(/news\.google\.com\/rss\/search/.test(news), "구글 뉴스 공개 RSS (키 불필요·무료)");
ok(/encodeURIComponent\("LCK 리그오브레전드"\)/.test(news),
  "검색어에 리그 이름을 함께 걸어야 함 (LCK 만으로는 물류·기업 기사가 섞인다)");
ok(/function cleanTitle\(title, source\)/.test(news),
  "구글이 제목 끝에 붙이는 ' - 매체명' 을 떼야 함 (매체는 따로 보여 준다)");
ok(/arr\.findIndex\(y => y\.title === x\.title\) === i/.test(news), "같은 제목 중복 제거");
ok(/items\.length \? CACHE_SEC : 0/.test(news),
  "파싱 0건은 캐시하지 않는다 — RSS 형식이 바뀐 순간을 10분씩 굳히면 안 된다");
ok(/AbortController/.test(news), "느린 응답에 서버 함수가 물려 있으면 안 됨");
ok(/id="home-news-card"/.test(home) && /style="display:none"/.test(home.slice(home.indexOf("home-news-card") - 60)),
  "뉴스 카드는 기본이 숨김 (받아온 뒤에만 뜬다)");
const nf = app.slice(app.indexOf("async function renderHomeNews"), app.indexOf("function renderHomePulse"));
ok(/if \(!items\.length\) return;/.test(nf),
  "기사가 없으면 카드 자체를 감춘다 — 빈 상자가 홈에 남는 것보다 낫다");
ok(/catch \{ return; \}/.test(nf), "서버 함수가 없는 환경(로컬)에서도 조용히 넘어가야 함");
// ⚠ api/_lib.js 의 ok() 는 본문을 **그대로** 보낸다 (data 로 감싸지 않는다).
//   j.data.items 로만 읽어서 배포 후 뉴스가 0건으로 나온 적이 있다 (2026-08-15).
const lib = read("api/_lib.js");
ok(/res\.status\(200\)\.send\(JSON\.stringify\(body\)\)/.test(lib),
  "ok() 는 본문을 감싸지 않는다 — 이 전제가 바뀌면 아래 두 줄도 같이 고쳐야 함");
ok(/j\.items \|\| \(j\.data && j\.data\.items\)/.test(nf),
  "뉴스는 감싸지 않은 모양을 먼저 읽어야 함");
const store = read("assets/store.js");
ok(/const body = \(j && j\.data\) \|\| j \|\| \{\};/.test(store),
  "일정 동기화도 같은 실수를 했다 — 감싸지 않은 모양을 함께 읽어야 함");
ok(/let newsLoaded = false/.test(app), "홈을 여러 번 그려도 뉴스는 한 번만 받는다");
ok(/target="_blank" rel="noopener noreferrer"/.test(nf), "외부 링크는 새 창 + noopener");
ok(/-webkit-line-clamp: 2/.test(css), "긴 제목이 카드를 밀지 않게 두 줄로 자른다");

// 실제 RSS 를 파싱해 본다 (형식이 바뀌면 여기서 걸린다)
const { parseFeed, cleanTitle } = require("../api/news.js");
const sample = `<rss><channel>
  <item><title>T1 승리 - 인벤</title><link>https://n/1</link>
    <pubDate>Fri, 14 Aug 2026 08:39:00 GMT</pubDate><source url="x">인벤</source></item>
  <item><title>T1 승리 - 인벤</title><link>https://n/2</link>
    <pubDate>Fri, 14 Aug 2026 07:00:00 GMT</pubDate><source url="x">인벤</source></item>
  <item><title>농심 완파 - 게임플</title><link>https://n/3</link>
    <pubDate>Fri, 14 Aug 2026 12:16:00 GMT</pubDate><source url="x">게임플</source></item>
</channel></rss>`;
const parsed = parseFeed(sample, 10);
ok(parsed.length === 2, `중복 제거 후 2건이어야 함 (실제 ${parsed.length})`);
ok(parsed[0].title === "농심 완파", "최신순 정렬 + 매체 꼬리 제거");
ok(parsed[0].source === "게임플", "매체 이름은 따로 담는다");
ok(parsed[0].at === "2026-08-14T12:16:00.000Z", "발행 시각을 ISO 로");
ok(cleanTitle("제목 - 인벤", "인벤") === "제목" && cleanTitle("제목", "") === "제목",
  "매체가 없을 때도 안전");

console.log(`\nfav-and-news.test: ${n} 통과, 0 실패`);
