const assert = require("assert");
const fs = require("fs");

const index = fs.readFileSync("index.html", "utf8");
const html = fs.readFileSync("assets/home-lck.js", "utf8");
const app = fs.readFileSync("assets/app.js", "utf8");
const css = fs.readFileSync("assets/styles.css", "utf8");

assert(html.includes('id="home-match-bar"') === false,
  "경기 바는 실제 데이터를 읽은 뒤 JS가 팀 메뉴 위에 만들어야 함");
assert(html.includes("전체 게시판") && html.includes("최신 글 5개"),
  "홈 본문은 전체 게시판 최신 글 5개를 중심으로 구성해야 함");
// 히어로는 사이드바로 옮겼다 — 본문은 게시판으로 시작한다 (2026-08-15).
// 좁은 화면에서는 사이드바 상자를 없애고 순서로 예전 자리(맨 위)를 지킨다.
assert(html.indexOf('id="home-hero"') > html.indexOf('class="home-sidebar"'),
  "히어로는 사이드바 안에 있어야 함");
assert(html.indexOf('id="home-hero"') < html.indexOf('id="standings-body"'),
  "사이드바에서는 히어로가 순위보다 먼저");
assert(/\.home-sidebar \{ display: contents; \}/.test(css) && /#home-hero \{ order: 1; \}/.test(css),
  "좁은 화면에서는 순서로 예전 자리를 지켜야 함");
assert(html.includes('id="standings-body"') && html.includes('id="home-schedule-body"'),
  "사이드바에 순위와 이후 경기 일정이 있어야 함");
assert(html.indexOf('id="standings-body"') < html.indexOf('id="home-schedule-body"'),
  "사이드바에서는 순위가 일정보다 먼저 나와야 함");
assert(!html.includes('id="predict-widget"') && !html.includes('id="founding-race"'),
  "기존 대형 예측·창립 팬 위젯을 홈에 중복 노출하면 안 됨");

assert(app.includes("function renderHomeMatchBar()") && app.includes("fmtDayKey(m.at) === day"),
  "가장 가까운 날짜의 경기를 묶는 홈 경기 바가 있어야 함");
assert(app.includes("function renderHomeFeature()") && app.includes("storyFor(match)"),
  "히어로 카피는 오늘의 서사(story.js)에서 와야 함");
assert(fs.readFileSync("assets/story.js", "utf8").includes("function storyAuto(match)"),
  "서사가 없는 경기는 기록에서 자동으로 만들어야 함");
assert(fs.readFileSync("admin.html", "utf8").includes('id="home-copy-admin"') &&
  fs.readFileSync("admin.html", "utf8").includes('id="hc-headline"'),
  "관리자 화면에서 경기별 서사를 편집할 수 있어야 함");
assert(app.includes("const shown = pct.n >= 10") && app.includes("home-match-rate-pending"),
  "표본 10명 전에는 예측 비율을 숨겨야 함");
assert(app.includes('home-match-cta-long">예측하기') && app.includes('home-match-cta-short">예측'),
  "상단 경기 바는 넓은 폭과 중간 폭에 맞는 예측 버튼 문구를 가져야 함");
assert(!app.includes("...candidates.filter(p => !preferred.includes(p))"),
  "반응 없는 자동 경기방으로 홈 게시판 다섯 칸을 채우면 안 됨");
assert(app.includes(".slice(0, 2)") && app.includes(".slice(0, 5)"),
  "경기 바는 하루 최대 2경기, 전체 게시판은 5개를 표시해야 함");
// 휴대폰에서는 상단 메뉴(.main-nav)와 '내 기록' 버튼(.my-link)이 둘 다 숨겨진다.
// 그래서 마이페이지로 갈 길이 하단 탭바 말고는 없다. (2026-08-14 사장님 제보)
assert(app.includes('menu: "MY", href: "my.html", label: "MY"'),
  "모바일 하단 메뉴의 마지막 칸은 MY 여야 함 — 휴대폰에서 마이페이지 진입로가 여기뿐이다");
assert(!/TAB_BAR[\s\S]*?menu: "선수·팀"[\s\S]*?\n\];/.test(app),
  "선수·팀은 탭바에서 빠졌다 (다섯 칸을 MY 에 내줬다)");
assert(app.includes('<a href="players.html">선수·팀</a>'),
  "대신 푸터에 선수·팀 링크가 있어야 함 — 없으면 휴대폰에서 들어갈 길이 아예 사라진다");
assert(/@media \(max-width: 760px\) \{ \.my-link \{ display: none; \} \}/.test(css),
  "상단 '내 기록' 버튼이 모바일에서 숨는다는 전제가 유지돼야 함 (이게 바뀌면 탭바 판단도 다시)");
assert(css.includes(".home-match-bar") && css.includes(".home-schedule-row"),
  "홈 경기 바와 사이드 일정 스타일이 있어야 함");
assert(css.includes(".home-match-cta") && !css.includes(".home-match-game time:first-letter"),
  "예측 버튼은 강조하고 경기 시간은 한 가지 중립색으로 보여야 함");
assert(css.includes("grid-template-columns: 126px minmax(0, 1fr)") &&
  css.includes("grid-template-columns: 38px auto minmax(90px, 1fr) auto auto") &&
  /@media \(max-width: 960px\)[\s\S]*?\.home-match-list \{ grid-template-columns: minmax\(0, 1fr\); \}/.test(css),
  "날짜 칸은 줄이고 예측 버튼 열은 내용 너비에 맞춰 경계를 침범하지 않아야 함");
assert(css.includes("background: transparent; border: 0; clip-path: none") &&
  !app.slice(app.indexOf("function teamLogoHTML"), app.indexOf("function placeholderLogoHTML")).includes("clip-path"),
  "실제 팀 로고에는 배경 타일·테두리·각진 잘라내기를 사용하지 않아야 함");
assert(/@media \(max-width: 720px\)[\s\S]*?\.main-nav \{ display: none; \}/.test(css),
  "모바일에서는 중복되는 상단 주 메뉴를 숨겨야 함");
assert(index.includes('id="home-module-root"') && index.includes("assets/home-lck.js"),
  "index는 시즌별 본문을 직접 품지 않고 홈 모듈을 꽂는 공통 껍데기여야 함");

// 폐기한 스킨의 잔재가 남아 홈이 "불러오는 중"에서 멈춘 적이 있다 (2026-08-18).
// 파일을 지울 때는 그 파일을 **쓰는 쪽**도 같이 봐야 한다.
assert(!/worlds-theme|worlds-production/.test(html),
  "지운 월즈 스킨을 참조하는 코드가 남아 있으면 안 됨");

console.log("✓ 홈 정보 우선순위·일자별 경기 바·모바일 단일 메뉴 회귀 테스트 통과");
