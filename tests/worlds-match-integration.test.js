// 월즈 참가팀 등록 → 기존 경기 시스템 → 월즈 홈 연결 회귀 테스트 (2026-08-17)
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

const store = read("assets/store.js");
const admin = read("admin.html");
const worlds = read("assets/worlds.js");
const worldsHtml = read("worlds.html");

const start = store.indexOf('const INTL_TEAM_CATALOG_KEY = "intl_teams_v1"');
const end = store.indexOf("// ── 시즌 홈 전환", start);
assert(start > 0 && end > start, "국제대회 팀 카탈로그 블록을 찾을 수 있어야 함");

const context = {
  Cache: {
    settings: {
      intl_teams_v1: JSON.stringify([
        { id: "fly", abbr: "FLY", name: "FlyQuest", logo: "https://example.com/fly.png" },
        { id: "bad", abbr: "BAD", name: "Bad URL", logo: "http://example.com/bad.png" },
      ]),
    },
    tournaments: [
      { id: "lck2026-r34", name: "2026 LCK" },
      { id: "worlds2026", name: "2026 월드 챔피언십" },
    ],
  },
  TEAMS: [{ id: "t1", abbr: "T1", name: "T1" }],
  INTL_TEAMS: [{ id: "g2", abbr: "G2", name: "G2", logo: "https://example.com/g2.png" }],
  TEAM_MAP: { t1: { id: "t1" }, g2: { id: "g2" } },
  sb: { from: () => ({ upsert: () => Promise.resolve({ error: null }) }) },
};
context.getSetting = key => context.Cache.settings[key] || "";
vm.createContext(context);
vm.runInContext(store.slice(start, end), context);

vm.runInContext("hydrateIntlTeamMap()", context);
assert(context.TEAM_MAP.fly, "관리자가 추가한 해외팀은 TEAM_MAP에 들어가야 경기 화면에서 보임");
assert(!context.TEAM_MAP.bad, "HTTPS가 아닌 로고의 팀은 공개 화면에 넣지 않음");
assert.deepEqual(Array.from(vm.runInContext('matchTeamsForTournament("lck2026-r34").map(t => t.id)', context)), ["t1"],
  "LCK 경기 등록은 기존 10팀 범위를 유지");
assert.deepEqual(Array.from(vm.runInContext('matchTeamsForTournament("worlds2026").map(t => t.id)', context)), ["t1", "g2", "fly"],
  "월즈 경기 등록에서만 LCK+해외팀을 함께 선택");

assert(/matchTeamsForTournament\(tid\)/.test(admin), "월즈 대진표 시드도 국제대회 팀 카탈로그 사용");
assert(/teamOptionsForTournament\(tidSel\.value/.test(admin), "새 월즈 경기 팀 선택에 국제대회 팀 카탈로그 사용");
assert(/slotSel\("ta", m\.a, m\.tid\)/.test(admin), "기존 월즈 경기 수정에도 해외팀 선택 유지");
assert(/getMatches\(\)\.some\(m => m\.a === id \|\| m\.b === id\)/.test(admin),
  "경기에서 사용 중인 해외팀은 삭제할 수 없어야 함");

assert(/const worldsMatches = \(\) => Cache\.matches\.filter\(m => m\.tid === "worlds2026"\)/.test(worlds),
  "월즈 홈은 기존 matches의 worlds2026 경기만 읽음");
assert(/function renderSchedule\(matches\)/.test(worlds) && /renderSchedule\(matches\)/.test(worlds),
  "등록 경기는 월즈 홈 일정 모듈에도 표시");
assert(/id="worlds-schedule-list"/.test(worldsHtml), "월즈 홈에 실경기 일정 슬롯이 있어야 함");
assert(/matchHref\(m\)/.test(worlds), "홈 경기 카드는 기존 경기 상세 주소를 그대로 사용");

console.log("worlds-match-integration.test: 12 통과");
