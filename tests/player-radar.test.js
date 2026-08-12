const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const store = fs.readFileSync("assets/store.js", "utf8");
const app = fs.readFileSync("assets/app.js", "utf8");
const playerPage = fs.readFileSync("player.html", "utf8");
const playersPage = fs.readFileSync("players.html", "utf8");
const styles = fs.readFileSync("assets/styles.css", "utf8");

const start = store.indexOf("function radarRole");
const end = store.indexOf("// 선수의 경기별 평점 목록", start);
assert(start >= 0 && end > start, "육각형 계산 코드 범위를 찾을 수 있어야 함");

const players = [
  { id: "adc-a", pos: "원딜" },
  { id: "adc-b", pos: "ADC" },
  { id: "sup-a", pos: "서폿" },
  { id: "sup-b", pos: "Support" },
];

const base = {
  sets: 10, pos: "원딜", kda: 4, kp: .65, dpm: 700, dmgShare: .28,
  gpm: 430, csm: 9.5, goldShare: .24, kaPm: .25, assistPm: .16,
  deathPm: .06, deathShare: .18, killShare: .25, laneGoldDiffPm: 8,
  laneCsDiffPm: .15, laneKillDiffPm: .01, dmgEfficiency: 1.17,
  objControl: .52, objPerSet: 3, visShare: .1, vspm: .7,
  csShare: .24, towerControl: .54, duoGoldDiffPm: 12, duoCsDiffPm: .2,
};

const aggregates = {
  "adc-a": { ...base, pid: "adc-a", deathPm: .035, kda: 5.2, dmgEfficiency: 1.35 },
  "adc-b": { ...base, pid: "adc-b", deathPm: .09, kda: 2.4, dmgEfficiency: .82, dpm: 560, dmgShare: .22 },
  "sup-a": { ...base, pid: "sup-a", pos: "서폿", vspm: 2.1, visShare: .34, assistPm: .3 },
  "sup-b": { ...base, pid: "sup-b", pos: "Support", vspm: 1.1, visShare: .19, assistPm: .2 },
};

const context = {
  console,
  getPlayer: id => players.find(p => p.id === id),
  getPlayers: () => players,
  getMatches: () => [],
  matchRatingsForPlayer: () => [],
  Cache: { pom: [] },
};
const testContext = { ...context, aggregates };
testContext.globalThis = testContext;
vm.createContext(testContext);
vm.runInContext(store.slice(start, end) + `
  playerAggregate = pid => aggregates[pid] || null;
  globalThis.__radar = { radarRole, radarData, ROLE_RADAR_AXES };
`, testContext);

const { radarRole, radarData, ROLE_RADAR_AXES } = testContext.__radar;
assert.strictEqual(radarRole("탑"), "TOP");
assert.strictEqual(radarRole("Jungle"), "JGL");
assert.strictEqual(radarRole("원딜"), "ADC");
assert.strictEqual(radarRole("Support"), "SUP");

assert.deepStrictEqual(Array.from(ROLE_RADAR_AXES.TOP, x => x.label),
  ["라인전", "성장", "딜링", "교전", "생존", "사이드"]);
assert.deepStrictEqual(Array.from(ROLE_RADAR_AXES.JGL, x => x.label),
  ["초반개입", "오브젝트", "성장", "교전", "생존", "팀기여"]);
assert.deepStrictEqual(Array.from(ROLE_RADAR_AXES.MID, x => x.label),
  ["라인전", "성장", "딜링", "교전", "생존", "로밍"]);
assert.deepStrictEqual(Array.from(ROLE_RADAR_AXES.ADC, x => x.label),
  ["라인전", "성장", "딜링", "교전", "생존", "캐리력"]);
assert.deepStrictEqual(Array.from(ROLE_RADAR_AXES.SUP, x => x.label),
  ["라인전", "시야", "교전", "생존", "로밍", "팀기여"]);

const adcA = radarData("adc-a", null);
const adcB = radarData("adc-b", null);
assert(adcA.axes.find(x => x.key === "survival").score > adcB.axes.find(x => x.key === "survival").score,
  "데스가 적고 KDA가 높은 원딜의 생존 점수가 높아야 함");
assert(adcA.axes.find(x => x.key === "carry").score > adcB.axes.find(x => x.key === "carry").score,
  "자원 대비 딜 효율이 높은 원딜의 캐리력 점수가 높아야 함");

const supA = radarData("sup-a", null);
const supB = radarData("sup-b", null);
assert(supA.axes.find(x => x.key === "vision").score > supB.axes.find(x => x.key === "vision").score,
  "분당 시야와 팀 시야 비중이 높은 서포터의 시야 점수가 높아야 함");

assert(!/label:\s*["']팬평점["']|label:\s*["']POM["']/.test(store),
  "팬 평점과 POM은 경기력 육각형 축에 포함하면 안 됨");
assert(store.includes('grubs: 1 / 3') && store.includes('barons: 1.5'),
  "유충 개수가 오브젝트 축을 과도하게 지배하지 않도록 가중해야 함");
assert(app.includes("포지션 백분위"), "막대 설명이 포지션 백분위임을 밝혀야 함");
assert(playerPage.includes("@15·로밍 동선·솔로킬처럼 원본에 없는 값"),
  "제공되지 않는 원본 지표의 대체 계산을 투명하게 설명해야 함");
assert(app.includes("function radarCompareSVG"), "동일 포지션 선수 육각형 비교 렌더러가 있어야 함");
assert(playersPage.includes('id="player-search"') && playersPage.includes('id="player-team-filter"'),
  "선수 검색과 팀 필터가 있어야 함");
assert(playersPage.includes('id="player-team-buttons"') && playersPage.includes("drawTeamButtons()"),
  "팀 로고를 고르면 해당 팀 로스터로 즉시 전환되어야 함");
assert(playersPage.includes('id="player-position-buttons"') && playersPage.includes('data-role="SUP"'),
  "모든 포지션을 고르는 필터가 있어야 함");
assert(playersPage.includes("이번 주 평점 상승") && playersPage.includes("matchRatingsForPlayer"),
  "최근 두 경기의 실제 팬 평점으로 상승 선수를 찾아야 함");
assert(playersPage.includes("팬 관심 선수") && playersPage.includes("평점 참여·POM 기준"),
  "전역 조회 로그 없이 임의의 많이 본 순위를 만들지 않고 관심도 기준을 밝혀야 함");
assert(playersPage.includes("다음 경기 주요 맞대결") && playersPage.includes("teamPlayers(upcoming.a)"),
  "다음 경기 로스터로 포지션 맞대결을 구성해야 함");
assert(playersPage.includes("radarRole(pa.pos) !== radarRole(pb.pos)"),
  "포지션이 다른 선수의 서로 다른 축을 직접 비교하면 안 됨");
assert(playersPage.includes('<aside class="player-insights"') &&
  playersPage.indexOf("이번 주 평점 상승") > playersPage.indexOf("player-main-column"),
  "평점 상승과 팬 관심 선수는 선수 명단 옆 보조 영역에 있어야 함");
assert(playersPage.includes('<details class="card compare-card" open>') &&
  playersPage.includes("compare-player-portrait") && playersPage.includes("playerAvatarHTML(p"),
  "육각형 비교는 접을 수 있되 **기본으로 펼쳐져** 있어야 함 (접힌 채 페이지 끝에 있어 아무도 못 봤다)");
// 두 열 바깥 맨 아래가 아니라 본문 열 안에 있어야 실제로 눈에 들어온다
assert(playersPage.indexOf('<details class="card compare-card"') > playersPage.indexOf('id="rosters"') &&
  playersPage.indexOf('<details class="card compare-card"') < playersPage.indexOf('<aside class="player-insights"'),
  "육각형 비교는 선수 명단 바로 아래, 본문 열(player-main-column) 안에 있어야 함");

// 선수 목록 카드는 얼굴이 보여야 한다 — 예전엔 72px 아바타라 누구인지 알 수 없었다
assert(playersPage.includes('class="team-card roster-card"') &&
  playersPage.includes('playerAvatarHTML(p, t.color, "xl")'),
  "선수 목록 카드는 큰 사진(xl)을 써야 함");
assert(/\.team-card\.roster-card \.player-avatar \{[^}]*width: 100%/.test(styles),
  "선수 목록 카드 사진은 카드 폭을 채워야 함");
assert(/\.roster-grid \{[^}]*auto-fill/.test(styles),
  "선수 목록 그리드는 카드가 커진 만큼 폭에 맞춰 접혀야 함 (teams.html 팀 카드는 건드리지 않는다)");

console.log("✓ 포지션별 선수 육각형 지표 회귀 테스트 통과");
