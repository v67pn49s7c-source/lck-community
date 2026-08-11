const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8");
const app = fs.readFileSync("assets/app.js", "utf8");
const css = fs.readFileSync("assets/styles.css", "utf8");

assert(html.includes('id="home-match-bar"') === false,
  "경기 바는 실제 데이터를 읽은 뒤 JS가 팀 메뉴 위에 만들어야 함");
assert(html.includes("전체 게시판") && html.includes("최신 글 5개"),
  "홈 본문은 전체 게시판 최신 글 5개를 중심으로 구성해야 함");
assert(html.includes('id="home-feature-card"') &&
  html.indexOf('id="home-feature-card"') < html.indexOf('class="home-intro"'),
  "자동 핵심 경기 카드는 게시판 제목과 분리해 그 위에 둬야 함");
assert(html.includes('id="standings-body"') && html.includes('id="home-schedule-body"'),
  "사이드바에 순위와 이후 경기 일정이 있어야 함");
assert(html.indexOf('id="standings-body"') < html.indexOf('id="home-schedule-body"'),
  "사이드바에서는 순위가 일정보다 먼저 나와야 함");
assert(!html.includes('id="predict-widget"') && !html.includes('id="founding-race"'),
  "기존 대형 예측·창립 팬 위젯을 홈에 중복 노출하면 안 됨");

assert(app.includes("function renderHomeMatchBar()") && app.includes("fmtDayKey(m.at) === day"),
  "가장 가까운 날짜의 경기를 묶는 홈 경기 바가 있어야 함");
assert(app.includes("function renderHomeFeature()") && app.includes("function homePreviousMeeting(match)"),
  "핵심 경기 문구는 최근 맞대결 데이터로 자동 교체해야 함");
assert(app.includes('getSetting("home_feature_copy")') && app.includes("custom.match_id === match.id"),
  "관리자 문구는 저장 당시 핵심 경기에만 덮어써야 함");
assert(html.includes('id="home-feature-story"') && fs.readFileSync("admin.html", "utf8").includes('id="home-copy-admin"'),
  "관리자 화면에서 홈 핵심 경기 문구를 편집할 수 있어야 함");
assert(app.includes("const shown = pct.n >= 10") && app.includes("home-match-rate-pending"),
  "표본 10명 전에는 예측 비율을 숨겨야 함");
assert(app.includes('home-match-cta-long">예측하기') && app.includes('home-match-cta-short">예측'),
  "상단 경기 바는 넓은 폭과 중간 폭에 맞는 예측 버튼 문구를 가져야 함");
assert(!app.includes("...candidates.filter(p => !preferred.includes(p))"),
  "반응 없는 자동 경기방으로 홈 게시판 다섯 칸을 채우면 안 됨");
assert(app.includes(".slice(0, 2)") && app.includes(".slice(0, 5)"),
  "경기 바는 하루 최대 2경기, 전체 게시판은 5개를 표시해야 함");
assert(app.includes('menu: "선수·팀", href: "players.html", label: "선수·팀"'),
  "모바일 하단 메뉴의 마지막 칸은 선수·팀이어야 함");
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

console.log("✓ 홈 정보 우선순위·일자별 경기 바·모바일 단일 메뉴 회귀 테스트 통과");
