// 데이터가 모순되거나 경기-스테이지 연결이 끊기면 "확정"을 만들지 않는다.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const {
  scheduleMatchViolations, dataTrustSummary,
} = require("../assets/invariants");

let n = 0;
const ok = (value, message) => { assert.ok(value, message); n++; };

ok(scheduleMatchViolations({ status: "upcoming", scoreA: 2, scoreB: 0 })[0]
  .includes("예정 경기"), "예정 2:0 유령 행을 잡아야 함");
ok(scheduleMatchViolations({ status: "done", scoreA: 1, scoreB: 1 })[0]
  .includes("동점"), "종료 동점을 잡아야 함");
ok(dataTrustSummary([{ id: "ghost", status: "upcoming", scoreA: 2, scoreB: 0 }],
  { ok_at: Date.now() }).level === "blocked", "경기 모순이면 공개 판정을 막아야 함");
ok(dataTrustSummary([], { ok_at: 1000, failed_at: 2000 }, 3000).level === "warn",
  "마지막 수집이 실패했으면 정상으로 표시하면 안 됨");

const raceSrc = fs.readFileSync(path.join(__dirname, "../assets/race.js"), "utf8");
const teams = ["a", "b", "c", "d", "e"];
const records = teams.map(team => ({ team, w: 0, l: 0, sw: 0, sl: 0 }));
const Cache = {
  records: [{ id: "r34L", name: "레전드 그룹", in_total: true, records }],
  matches: [
    { id: "m1", tid: "split", stage: "레전드 그룹", a: "a", b: "b", status: "upcoming", scoreA: null, scoreB: null },
    { id: "m2", tid: "split", stage: "레전드 그룹", a: "c", b: "d", status: "done", scoreA: 2, scoreB: 0 },
  ],
};
const winRate = r => (r.w + r.l) ? r.w / (r.w + r.l) : 0;
const ctx = {
  console, Cache, TEAM_MAP: Object.fromEntries(teams.map(t => [t, { abbr: t.toUpperCase() }])),
  stageInTotal: s => s.in_total !== false,
  matchWinner: m => m.status === "done" && m.scoreA != null && m.scoreB != null && m.scoreA !== m.scoreB
    ? (m.scoreA > m.scoreB ? "a" : "b") : null,
  scheduleMatchViolations,
  cumulativeStandings: () => records.map(r => ({ ...r, pt: 0 })),
  standingsSort: (a, b) => winRate(b) - winRate(a) || b.pt - a.pt,
};
vm.createContext(ctx);
vm.runInContext(raceSrc, ctx, { filename: "assets/race.js" });

ok(ctx.raceDataHealth("r34L").ok, "정상 그룹 경기는 계산 가능해야 함");
Cache.records[0].name = "관리자가 바꾼 이름";
ok(ctx.raceDataHealth("r34L").code === "stage_unlinked",
  "스테이지 이름 변경으로 경기 연결이 끊기면 계산을 중단해야 함");
Cache.records[0].name = "레전드 그룹";
Cache.matches.push({ id: "m3", tid: "split", stage: "옛 레전드 이름", a: "a", b: "c",
  status: "upcoming", scoreA: null, scoreB: null });
ok(ctx.raceDataHealth("r34L").code === "stage_split",
  "같은 대회·그룹 경기가 두 이름으로 갈리면 계산을 중단해야 함");
Cache.matches.pop();
Cache.matches[0].scoreA = 1;
ok(ctx.raceDataHealth("r34L").code === "invalid_match",
  "예정 경기의 남은 스코어가 있으면 확정 판정을 중단해야 함");
Cache.matches[0] = { ...Cache.matches[0], status: "done", scoreA: 2, scoreB: 1 };
ok(!ctx.raceWhyEmpty("r34L").includes("순위가 모두 확정"),
  "모든 경기가 끝났다는 이유만으로 순위 확정이라고 말하면 안 됨");

const home = read("index.html");
const app = read("assets/app.js");
const admin = read("admin.html");
ok(/id="home-data-trust"[^>]*role="status"[^>]*aria-live="polite"/.test(home),
  "홈 데이터 상태는 보조기기에도 갱신을 알려야 함");
ok(home.indexOf("assets/invariants.js") < home.indexOf("assets/store.js"),
  "홈은 신뢰 판정을 화면 렌더보다 먼저 읽어야 함");
ok(/renderHomeDataTrust\(\)/.test(app) && /dataTrustSummary\(getMatches\(\)/.test(app),
  "홈 렌더마다 실제 경기 자료의 신뢰 상태를 갱신해야 함");
ok(/data-tab="trust">운영 현황/.test(admin) && /id="trust-dashboard"/.test(admin),
  "관리자 첫 화면에 운영 현황이 있어야 함");
ok(/nexus_admin_tab_v2[^\n]+\|\| "trust"/.test(admin),
  "기존 저장 탭에 가려지지 않고 새 운영 현황을 첫 화면으로 보여야 함");

console.log(`\ndata-trust.test: ${n} 통과, 0 실패`);
