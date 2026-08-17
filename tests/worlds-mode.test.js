// LCK 결승 뒤 월즈 홈 자동 전환 회귀 테스트 (2026-08-17)
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");
const read = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

const store = read("assets/store.js");
const app = read("assets/app.js");
const admin = read("admin.html");
const html = read("worlds.html");
const worlds = read("assets/worlds.js");
const index = read("index.html");
const lck = read("assets/home-lck.js");
const worldsCss = read("assets/worlds.css");

const start = store.indexOf('const SITE_EVENT_MODE_KEY = "site_event_mode"');
const end = store.indexOf("// ── 오늘의 서사", start);
assert(start > 0 && end > start, "시즌 전환 함수 블록을 찾을 수 있어야 함");
const context = {
  Cache: { tournaments: [], matches: [], settings: {} },
  TEAMS: [{ id: "t1" }, { id: "gen" }],
  TEAM_MAP: { t1: { id: "t1" }, gen: { id: "gen" }, g2: { id: "g2" } },
};
context.getSetting = key => context.Cache.settings[key] || "";
vm.createContext(context);
vm.runInContext(store.slice(start, end), context);
const mode = () => vm.runInContext("siteEventMode()", context);
const seeds = () => Array.from(vm.runInContext("worldsLckSeeds()", context));

// 라벨에 결승이 들어가기만 해서는 전환하지 않는다. GF에 정확히 연결해야 한다.
context.Cache.matches = [{ id: "m-final", tid: "lck2026-playoffs", status: "done", label: "결승" }];
context.Cache.tournaments = [{ id: "lck2026-playoffs", bracket: { links: {} } }];
assert.equal(mode(), "lck", "GF 연결이 없는 결승은 자동 전환 근거가 아님");

context.Cache.tournaments[0].bracket.links.GF = "m-final";
assert.equal(mode(), "worlds", "GF 연결 경기가 종료되면 월즈로 전환");
context.Cache.matches[0].status = "live";
assert.equal(mode(), "lck", "결승 진행 중에는 LCK 홈 유지");
context.Cache.settings.site_event_mode = "worlds";
assert.equal(mode(), "worlds", "관리자 수동 월즈 전환");
context.Cache.settings.site_event_mode = "lck";
context.Cache.matches[0].status = "done";
assert.equal(mode(), "lck", "문제 발생 시 관리자 LCK 강제 복귀가 자동 판정보다 우선");

context.Cache.settings.site_event_mode = "auto";
context.Cache.settings.worlds2026_lck_seeds = "t1,g2,t1,gen";
assert.deepEqual(seeds(), ["t1", "gen"], "LCK 10팀 밖의 팀과 중복 시드는 제거");
context.Cache.settings.worlds2026_lck_seeds = "";
context.Cache.matches = [{ id: "w1", tid: "worlds2026", a: "t1", b: "g2" }];
assert.deepEqual(seeds(), ["t1"], "공식 월즈 경기에 등장한 LCK팀만 보조 추출");

assert(/reloadSetting\(SITE_EVENT_MODE_KEY\)/.test(app), "스냅샷 대신 최신 시즌 스위치를 먼저 확인");
assert(!/location\.replace\("worlds\.html"\)/.test(app), "월즈를 별도 페이지로 보내면 안 됨");
assert(/HOME_MODULES\[mode\]/.test(app) && /next !== activeMode[\s\S]{0,80}mount\(next\)/.test(app),
  "같은 index 안에서 시즌 홈 모듈을 교체해야 함");
assert(/id="home-module-root"/.test(index) && /id="worlds-theme"[^>]+disabled/.test(index),
  "공통 홈 슬롯과 필요할 때만 켜는 월즈 스킨");
assert(/HOME_MODULES\.lck/.test(lck) && /HOME_MODULES\.worlds/.test(worlds),
  "LCK와 월즈가 독립 홈 모듈이어야 함");
assert(/data-tab="season-mode"/.test(admin) && /value="auto"/.test(admin)
  && /value="lck"/.test(admin) && /value="worlds"/.test(admin), "관리자 전환·복귀 스위치");
assert(/index\.html\?home=worlds-preview/.test(admin), "미리보기도 실제 index의 월즈 모듈을 열어야 함");

assert(!/assets\/logos\/(hle|gen|t1|dk)\.svg/.test(html), "월즈 홈에 가짜 진출팀을 하드코딩하면 안 됨");
assert(/worldsLckSeeds\(\)/.test(worlds), "공식 설정/경기 데이터로 LCK 대표팀 표시");
assert(/m\.tid === "worlds2026"/.test(worlds), "월즈 경기만 홈에 표시");
assert(/schedule\.html\?t=worlds2026/.test(html) && /bracket\.html\?t=worlds2026/.test(html),
  "월즈 일정·대진표 링크가 해당 대회를 직접 선택해야 함");
assert(/공식 대진과 경기 시간이 등록되면 자동 반영/.test(worlds), "일정 미확정 상태를 정직하게 표시");
assert(!/64%|1,284|2승 0패/.test(html + worlds), "가짜 승률·참여수·스위스 전적을 배포하지 않음");
assert(!/\.brand img \{[^}]*display:block/.test(worldsCss)
  && /\.brand \.brand-full \{ width:146px/.test(worldsCss),
  "월즈 스킨이 공통 헤더의 모바일 아이콘 표시 여부를 덮어쓰면 안 됨");

console.log("worlds-mode.test: 22 통과");
