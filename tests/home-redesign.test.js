const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8");
const app = fs.readFileSync("assets/app.js", "utf8");
const css = fs.readFileSync("assets/styles.css", "utf8");

assert(html.includes('id="home-match-bar"') === false,
  "경기 바는 실제 데이터를 읽은 뒤 JS가 팀 메뉴 위에 만들어야 함");
assert(html.includes("전체 게시판") && html.includes("최신 글 5개"),
  "홈 본문은 전체 게시판 최신 글 5개를 중심으로 구성해야 함");
assert(html.includes('id="standings-body"') && html.includes('id="home-schedule-body"'),
  "사이드바에 순위와 이후 경기 일정이 있어야 함");
assert(html.indexOf('id="standings-body"') < html.indexOf('id="home-schedule-body"'),
  "사이드바에서는 순위가 일정보다 먼저 나와야 함");
assert(!html.includes('id="predict-widget"') && !html.includes('id="founding-race"'),
  "기존 대형 예측·창립 팬 위젯을 홈에 중복 노출하면 안 됨");

assert(app.includes("function renderHomeMatchBar()") && app.includes("fmtDayKey(m.at) === day"),
  "가장 가까운 날짜의 경기를 묶는 홈 경기 바가 있어야 함");
assert(app.includes(".slice(0, 2)") && app.includes(".slice(0, 5)"),
  "경기 바는 하루 최대 2경기, 전체 게시판은 5개를 표시해야 함");
assert(app.includes('menu: "선수·팀", href: "players.html", label: "선수·팀"'),
  "모바일 하단 메뉴의 마지막 칸은 선수·팀이어야 함");
assert(css.includes(".home-match-bar") && css.includes(".home-schedule-row"),
  "홈 경기 바와 사이드 일정 스타일이 있어야 함");
assert(/@media \(max-width: 720px\)[\s\S]*?\.main-nav \{ display: none; \}/.test(css),
  "모바일에서는 중복되는 상단 주 메뉴를 숨겨야 함");

console.log("✓ 홈 정보 우선순위·일자별 경기 바·모바일 단일 메뉴 회귀 테스트 통과");
