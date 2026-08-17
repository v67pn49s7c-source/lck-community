const assert = require("assert");
const fs = require("fs");
const { _test } = require("../api/calendar");

const matches = [
  { id: "t1 / gen", at: "2026-08-22T08:00:00Z", a: "t1", b: "gen", status: "upcoming", label: "정규 시즌", stage: "Week 13" },
  { id: "dk-hle", at: "2026-08-22T10:00:00Z", a: "dk", b: "hle", status: "done", score_a: 2, score_b: 1, label: "정규 시즌" },
];

const all = _test.buildCalendar(matches);
assert(all.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0"), "표준 iCalendar 문서여야 함");
assert(all.includes("REFRESH-INTERVAL;VALUE=DURATION:PT30M"), "구독 캘린더 갱신 주기를 안내해야 함");
assert(all.includes("DTSTART:20260822T080000Z") && all.includes("DTEND:20260822T110000Z"),
  "경기 시작과 기본 3시간 종료 시각을 UTC로 제공해야 함");
assert(all.includes("SUMMARY:LCK | DK vs HLE 2:1"), "종료 경기는 캘린더 제목에 결과가 반영돼야 함");
assert(all.includes("URL:https://lck-community.vercel.app/match/t1%20%2F%20gen"),
  "캘린더 이벤트는 영구 경기 주소로 연결돼야 함");
assert(all.split("\r\n").every(line => Buffer.byteLength(line, "utf8") <= 75),
  "RFC 5545에 맞게 모든 물리 줄은 75바이트 이하여야 함");

const t1 = _test.buildCalendar(matches, "t1");
assert(t1.includes("T1 경기 — The Nexus"), "팀 전용 캘린더 이름을 표시해야 함");
assert(t1.includes("t1 / gen") && !t1.includes("dk-hle"), "팀 캘린더에는 해당 팀 경기만 들어가야 함");
assert.strictEqual(_test.icsText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
assert(_test.foldLine("한글".repeat(40)).split("\r\n").every(line => Buffer.byteLength(line, "utf8") <= 75),
  "한글을 접어도 UTF-8 문자가 깨지면 안 됨");

const app = fs.readFileSync("assets/app.js", "utf8");
const schedule = fs.readFileSync("schedule.html", "utf8");
const matchesHtml = fs.readFileSync("matches.html", "utf8");
const team = fs.readFileSync("team.html", "utf8");
const board = fs.readFileSync("assets/board.js", "utf8");
const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));

assert(vercel.rewrites.some(r => r.source === "/calendar/lck.ics" && r.destination === "/api/calendar"),
  "전체 캘린더의 영구 구독 주소가 있어야 함");
assert(vercel.rewrites.some(r => r.source === "/calendar/:team.ics" && r.destination.includes("team=:team")),
  "팀별 캘린더의 영구 구독 주소가 있어야 함");
assert(schedule.includes('id="team-filter"') && schedule.includes('id="schedule-calendar"'),
  "전체 일정에서 팀 필터와 캘린더 구독을 함께 제공해야 함");
assert(schedule.includes("m.a === state.team || m.b === state.team"), "팀 필터는 양쪽 진영을 모두 찾아야 함");
assert(matchesHtml.includes('id="matches-calendar"'), "경기 홈에도 구독 진입점이 있어야 함");
assert(team.includes('id="team-calendar"') && board.includes("calendarSubscribeHTML(team.id, true)"),
  "각 팀 게시판은 해당 팀 전용 캘린더를 연결해야 함");
assert(app.includes("calendar.google.com/calendar/u/0/r/settings/addbyurl") && app.includes('replace(/^https?:/i, "webcal:")'),
  "Google 공식 URL 추가 화면과 Apple 기본 앱 구독 방식을 모두 제공해야 함");
assert(app.includes("copyCalendarFeed") && app.includes("data-calendar-feed"),
  "Google·Outlook에 붙여넣을 구독 주소를 복사할 수 있어야 함");
assert(app.includes("다음 일정 대기") && app.includes("최근 경기 돌아보기") && app.includes("최근 경기 결과"),
  "예정 경기가 없는 기간에도 홈 핵심 영역이 비어서는 안 됨");

console.log("✓ 4차 성장 캘린더·팀 필터·오프시즌 홈 회귀 테스트 통과");
