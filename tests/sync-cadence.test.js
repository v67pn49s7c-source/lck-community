// 경기 결과가 빨리 들어오는가 — 갱신 간격 · 변경 감지 · 화면 다시 그리기
//
// 이 테스트가 지키려는 사고(2026-08-14):
//  · 저녁 경기가 끝나도 다음 날 새벽까지 결과가 안 들어왔다 (크론이 하루 한 번).
//  · 방문자가 들어와 갱신이 돌아도 **콘솔에 로그만 찍고** 화면은 그대로였다.
//    그래서 첫 방문자는 늘 옛 화면을 보고, 두 번째 방문자부터 결과를 봤다.
//  · "갱신한경기"는 upsert 한 행 수(=늘 전체 일정 수)라 판단 근거가 될 수 없었다.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const read = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

const sync = read("api/schedule-sync.js");
const store = read("assets/store.js");
const app = read("assets/app.js");
const wf = read(".github/workflows/lck-sync.yml");
const { scheduleProgress } = require("../api/schedule-sync")._test;

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

// ── 간격 규칙 (실제 코드를 그대로 실행한다) ──────────────
const consts = sync.slice(sync.indexOf("const WAIT_GAP_MIN"), sync.indexOf("/** 지금 얼마나"));
const fnSrc = sync.slice(sync.indexOf("function gapMinutes"), sync.indexOf("\nasync function fetchSchedule"));
// 실제 파일의 코드를 그대로 실행한다 — 규칙이 바뀌면 이 테스트가 같이 움직인다
const gapMinutes = eval(`(() => { ${consts}\n${fnSrc}\nreturn gapMinutes; })()`);

const now = Date.parse("2026-08-14T11:00:00Z");   // 20:00 KST
const H = 3600e3;
const at = h => new Date(now + h * H).toISOString();
[
  ["앞으로 있을 경기만 → 뜸하게", [{ status: "upcoming", at: at(2) }], 180],
  ["시작했는데 아직 안 끝남 → 촘촘히", [{ status: "upcoming", at: at(-3) }], 10],
  ["진행 중(live) → 촘촘히", [{ status: "live", at: at(-1) }], 10],
  ["이미 끝난 경기만 → 뜸하게", [{ status: "done", at: at(-3) }], 180],
  ["시작한 지 12시간 → 뜸하게 (버려진 경기에 매달리지 않는다)", [{ status: "upcoming", at: at(-12) }], 180],
  ["빈 목록 → 뜸하게", [], 180],
  ["시각이 없는 경기 → 뜸하게", [{ status: "upcoming", at: null }], 180],
  ["목록이 null → 터지지 않아야 함", null, 180],
].forEach(([name, ms, want]) => ok(gapMinutes(ms, now) === want, `간격: ${name}`));

// ── 서버 ────────────────────────────────────────────────
ok(/const existing = await sb\("matches\?select=[^"]*"\);\s*\n\s*const gap = gapMinutes\(existing, Date\.now\(\)\)/.test(sync),
  "간격을 정하려면 우리 경기 표를 **먼저** 읽어야 함");
ok(/Date\.now\(\) - state\.at < gap \* 60000/.test(sync), "고정 30분이 아니라 상황별 간격을 써야 함");
ok(!/MIN_GAP_MIN/.test(sync), "옛 고정 간격 상수가 남아 있으면 안 됨");
ok(/const changed = \[\]/.test(sync) && /changed\.push\(row\.id\)/.test(sync), "실제로 달라진 경기를 세야 함");
ok(/num\(prev\.score_a\) !== num\(row\.score_a\)/.test(sync),
  "스코어 비교는 숫자로 (DB가 문자열로 줄 수 있다)");
ok(/결과변경: changed\.length/.test(sync), "브라우저가 쓸 신호를 돌려줘야 함");
ok(/간격분: gap/.test(sync), "지금 간격이 얼마인지도 알려 주면 진단이 쉽다");
assert.deepStrictEqual(scheduleProgress({ status: "done", score_a: 2, score_b: 0 }, false, 0, 0),
  { status: "done", score_a: 2, score_b: 0 }); n++;
assert.deepStrictEqual(scheduleProgress({ status: "live", score_a: 1, score_b: 0 }, false, 0, 0),
  { status: "live", score_a: 1, score_b: 0 }); n++;
assert.deepStrictEqual(scheduleProgress({ status: "upcoming", score_a: 2, score_b: 0 }, false, 0, 0),
  { status: "upcoming", score_a: null, score_b: null }); n++;
assert.deepStrictEqual(scheduleProgress(null, true, "2", "1"),
  { status: "done", score_a: 2, score_b: 1 }); n++;
ok(/ok_at: Date\.now\(\)/.test(sync), "잠금 시각과 마지막 성공 시각을 구분해야 함");
ok(/failed_at: Date\.now\(\)/.test(sync), "실패 시각을 남겨 갱신 성공처럼 보이지 않게 해야 함");

// 잠금은 여전히 Leaguepedia 를 부르기 **전에** 찍혀야 한다 (2026-08-07 사고)
// ⚠ 함수 **정의**(async function fetchSchedule)가 아니라 **호출부**와 비교해야 한다
ok(sync.indexOf('saveSetting("schedule_sync"') < sync.indexOf("await fetchSchedule(page"),
  "잠금을 먼저 찍어야 동시 호출이 Leaguepedia 를 겹쳐 두드리지 않는다");

// ── 브라우저: 이번 방문자에게 바로 보여 준다 ────────────
const ping = store.slice(store.indexOf("async function pingScheduleSync"), store.indexOf("storeFresh.then(pingScheduleSync)"));
ok(/Number\(body\.결과변경\)/.test(ping), "결과변경 값으로 판단해야 함");
// ⚠ 서버의 ok() 는 본문을 감싸지 않는다. j.data 로만 읽어서 이 기능이 배포 후
//   내내 안 돌았다 (2026-08-15). 감싼 모양·안 감싼 모양을 함께 받는다.
ok(/const body = \(j && j\.data\) \|\| j \|\| \{\};/.test(ping),
  "감싸지 않은 응답도 읽어야 함");
ok(!/갱신한경기/.test(ping), "갱신한경기(=늘 전체 일정 수)로 판단하면 안 됨");
ok(/await fetchAll\(\)/.test(ping), "새 결과가 오면 데이터를 다시 받아야 함");
ok(/if \(storeRedraw\) \{ try \{ storeRedraw\(\); return; \}/.test(ping), "화면을 다시 그려야 함");
ok(/showRefreshToast\(\);/.test(ping), "다시 그리는 법을 모르는 화면은 새로고침을 권한다");
ok(/function onStoreRefresh\(fn\)/.test(store), "페이지가 다시 그리는 법을 등록하는 창구");

// 결과가 보이는 화면들은 전부 등록돼 있어야 한다
ok(/onStoreRefresh\(draw\)/.test(app), "홈");
["matches.html", "schedule.html", "standings.html", "live.html"].forEach(f =>
  ok(/onStoreRefresh\(/.test(read(f)), `${f} 도 다시 그려야 함`));

// ── GitHub Actions ──────────────────────────────────────
ok(/cron: "\*\/10 8-17 \* \* \*"/.test(wf), "경기 시간대(17~03시 KST)에만 10분마다");
ok(/workflow_dispatch/.test(wf), "손으로도 돌릴 수 있어야 함");
ok(/api\/schedule-sync/.test(wf), "스코어 동기화를 불러야 함");
ok(/if \[ -z "\$\{TOKEN:-\}" \]/.test(wf),
  "토큰 검사는 셸에서 — secrets 는 step 의 if: 에서 못 읽는다");
ok(/10#\$\(date -u \+%M\)/.test(wf), "08 을 8진수로 읽지 않게 10# 를 붙여야 함");
ok(/concurrency:/.test(wf), "실행이 겹치면 Leaguepedia 를 두 번 두드린다");
ok(/60일/.test(wf), "60일 무활동이면 GitHub 이 예약 실행을 끈다 — 파일에 적어 둬야 함");

console.log(`\nsync-cadence.test: ${n} 통과, 0 실패`);
