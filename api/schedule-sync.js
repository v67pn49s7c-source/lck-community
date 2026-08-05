// ── LCK 경기 일정 자동 갱신 ────────────────────────────────
// Leaguepedia 의 경기 일정표(MatchSchedule)를 받아 우리 matches 표를 맞춘다.
// 결과(선수 KDA·챔피언)를 받아 오는 것은 api/leaguepedia.js 가 하고,
// 이 파일은 **앞으로 있을 경기와 시각·스코어**만 담당한다.
//
// 세 가지 방법으로 돌아간다
//   ① 매일 자동 (vercel.json 의 crons)
//   ② 방문자가 들어올 때 — 마지막 갱신이 오래됐으면 한 번만 (아래 MIN_GAP_MIN)
//   ③ 관리자 화면에서 손으로
//
// ②가 있어서 크론을 못 쓰는 요금제에서도 일정이 알아서 따라옵니다.
// 아무나 부를 수 있지만 서버가 간격을 강제하므로 반복 호출은 그냥 무시됩니다.
//
// 데이터 출처: Leaguepedia (CC-BY-SA 3.0)

const { ok, fail, sb, requireAdmin } = require("./_lib");

const API = "https://lol.fandom.com/api.php";
const UA = "TheNexus-LCK-FanSite/1.0 (https://lck-community.vercel.app)";
const MIN_GAP_MIN = 30;          // 방문자가 부를 때 최소 간격
const ADOPT_HOURS = 30;          // 손으로 만든 경기를 같은 경기로 볼 시간 차이

const val = (row, key) => row[key] ?? row[key.replace(/_/g, " ")] ?? "";
const wait = ms => new Promise(r => setTimeout(r, ms));

async function cargo(params, tries) {
  const q = new URLSearchParams({ action: "cargoquery", format: "json", limit: "500", ...params });
  const r = await fetch(`${API}?${q}`, { headers: { "user-agent": UA } });
  const j = await r.json();
  if (j.error) {
    const n = tries || 0;
    if (j.error.code === "ratelimited" && n < 2) { await wait(4000 * Math.pow(2, n)); return cargo(params, n + 1); }
    const e = new Error(j.error.code === "ratelimited"
      ? "Leaguepedia 가 잠시 호출을 막고 있습니다. 잠시 뒤 다시 시도합니다."
      : `Leaguepedia: ${j.error.info || j.error.code}`);
    e.rate = j.error.code === "ratelimited";
    throw e;
  }
  return (j.cargoquery || []).map(x => x.title);
}

async function loadSetting(key) {
  const rows = await sb(`site_settings?key=eq.${encodeURIComponent(key)}&select=value`);
  return (rows[0] || {}).value || "";
}
async function saveSetting(key, value) {
  await sb("site_settings?on_conflict=key", {
    method: "POST", headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{ key, value }]),
  });
}

// 우리 경기 id 는 결과 수집기(api/leaguepedia.js)와 **같은 규칙**이어야 한다.
// 그래야 일정으로 먼저 만들어 둔 경기에 나중에 결과가 그대로 채워진다.
const idOf = lpMatchId => "lp" + String(lpMatchId).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);

// 관리자가 손으로 만든 경기를 같은 경기로 알아본다 (팀이 같고 시각이 가까우면).
// used 로 이미 짝지은 경기를 제외한다 — 같은 대진이 하루 사이에 두 번 있으면
// 두 일정이 같은 경기를 물어 upsert 가 통째로 실패한다.
function adopt(existing, used, teamA, teamB, atISO) {
  const t = Date.parse(atISO);
  return existing.find(m =>
    !m.lp_id && !used.has(m.id) && m.a === teamA && m.b === teamB && m.at &&
    Math.abs(Date.parse(m.at) - t) < ADOPT_HOURS * 3600e3);
}

async function runSync({ pages, force }) {
  const aliases = JSON.parse((await loadSetting("lp_aliases")) || "{}");
  const teamMap = aliases.teams || {};
  const state = JSON.parse((await loadSetting("schedule_sync")) || "{}");

  if (!force && state.at && Date.now() - state.at < MIN_GAP_MIN * 60000) {
    return { skipped: true, 마지막갱신: new Date(state.at).toISOString(), 다음갱신까지분:
      Math.ceil((MIN_GAP_MIN * 60000 - (Date.now() - state.at)) / 60000) };
  }

  const list = (pages && pages.length ? pages : (state.pages || [])).filter(Boolean);
  if (!list.length) {
    return { skipped: true, 이유: "갱신할 대회 페이지가 지정되지 않았습니다 (관리자 → 데이터 수집에서 한 번 저장하면 등록됩니다)" };
  }

  // 우리 DB 의 경기 (짝짓기용)
  const existing = await sb("matches?select=id,a,b,at,status,score_a,score_b,lp_id,tid,stage,counted");
  const byLp = {};
  existing.forEach(m => { if (m.lp_id) byLp[m.lp_id] = m; });

  // 새로 만들 경기의 대회: 지정값 → 지금 경기들이 가장 많이 쓰는 대회 순.
  // (대회가 비면 경기 목록의 대회 필터에서 통째로 안 보인다)
  const tidCount = {};
  existing.forEach(m => { if (m.tid) tidCount[m.tid] = (tidCount[m.tid] || 0) + 1; });
  const defaultTid = state.tid
    || Object.keys(tidCount).sort((x, y) => tidCount[y] - tidCount[x])[0]
    || null;

  // 순위 반영이 가능하려면 stage 가 '순위 전적'의 스테이지 이름과 같아야 한다.
  // 새 경기는 Leaguepedia 의 주차(Week 11) 뿐이라 대개 맞지 않는다 — 몇 건인지 알려 준다.
  let stageNames = [];
  try {
    stageNames = (await sb("stage_records?select=name")).map(x => x.name);
  } catch { /* 없어도 갱신 자체는 진행 */ }

  const unknownTeams = new Set();
  const upserts = [];
  const used = new Set(existing.filter(m => m.lp_id).map(m => m.id));
  let seen = 0;

  for (const page of list) {
    const rows = await cargo({
      tables: "MatchSchedule=MS",
      fields: "MS.DateTime_UTC,MS.Team1,MS.Team2,MS.BestOf,MS.Tab,MS.Winner,MS.Team1Score,MS.Team2Score,MS.MatchId",
      where: `MS.OverviewPage='${page.replace(/'/g, "''")}'`,
      order_by: "MS.DateTime_UTC ASC",
    });
    seen += rows.length;

    for (const r of rows) {
      const lpId = val(r, "MatchId");
      const t1 = val(r, "Team1"), t2 = val(r, "Team2");
      if (!lpId || !t1 || !t2) continue;
      if (!teamMap[t1]) unknownTeams.add(t1);
      if (!teamMap[t2]) unknownTeams.add(t2);
      const a = teamMap[t1], b = teamMap[t2];
      if (!a || !b) continue;                       // 연결 안 된 팀은 건너뛴다

      const raw = val(r, "DateTime UTC");
      if (!raw) continue;
      const at = raw.replace(" ", "T") + "Z";

      const s1 = val(r, "Team1Score"), s2 = val(r, "Team2Score");
      const hasScore = s1 !== "" && s2 !== "" && (Number(s1) + Number(s2) > 0);
      const finished = hasScore && String(val(r, "Winner") || "") !== "";

      const prev = byLp[lpId] || adopt(existing, used, a, b, at);
      if (prev) used.add(prev.id);
      const row = {
        id: prev ? prev.id : idOf(lpId),
        lp_id: lpId,
        a, b, at,
        tid: prev ? prev.tid : defaultTid,
        stage: prev ? prev.stage : (state.stage || val(r, "Tab") || ""),
        label: "",
        odds_a: 2, odds_b: 2,
        // 관리자가 '진행 중'으로 바꿔 둔 경기를 되돌리지 않는다
        status: finished ? "done" : (prev && prev.status === "live" ? "live" : "upcoming"),
        score_a: finished ? Number(s1) : (prev ? prev.score_a : null),
        score_b: finished ? Number(s2) : (prev ? prev.score_b : null),
      };
      // 이미 순위에 반영한 경기는 스코어·상태를 건드리지 않는다 (전적이 어긋난다)
      if (prev && prev.counted) {
        row.status = prev.status; row.score_a = prev.score_a; row.score_b = prev.score_b;
      }
      // ⚠ 여기서 키를 지우면 안 된다. 한 번에 보내는 행들의 키가 서로 다르면
      //    PostgREST 가 "All object keys must match" 로 통째로 거부한다.
      //    (기존 경기는 대회가 있고 새 경기는 없어서 실제로 이 오류가 났다)
      upserts.push(row);
    }
    if (list.length > 1) await wait(1500);
  }

  // 같은 id 가 두 번 들어가면 upsert 전체가 실패한다 — 마지막 것만 남긴다 (안전망)
  const byId = new Map();
  upserts.forEach(u => byId.set(u.id, u));
  const rows = [...byId.values()];

  let saved = 0;
  if (rows.length) {
    await sb("matches?on_conflict=id", {
      method: "POST", headers: { prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(rows),
    });
    saved = rows.length;
  }

  await saveSetting("schedule_sync", JSON.stringify({
    ...state, at: Date.now(), pages: list, tid: defaultTid || state.tid, saved, seen,
  }));

  const fresh = rows.filter(u => !existing.some(m => m.id === u.id));
  return {
    갱신한경기: saved, 훑어본일정: seen, 대회: list,
    모르는팀: [...unknownTeams],
    새로만든경기: fresh.length,
    스테이지확인필요: stageNames.length
      ? fresh.filter(u => !stageNames.includes(u.stage)).length : 0,
  };
}

module.exports = async (req, res) => {
  // 강제 실행(간격 무시)이 허용되는 세 경우
  //   ① Vercel 크론 (Authorization: Bearer <CRON_SECRET>)
  //   ② 예약 작업 토큰
  //   ③ 관리자가 관리자 화면에서 '지금 갱신'을 누른 경우
  const auth = String(req.headers.authorization || "");
  const secret = process.env.CRON_SECRET || process.env.ADMIN_TASK_TOKEN || "";
  let privileged = !!secret && auth === `Bearer ${secret}`;
  if (!privileged && (auth || req.headers["x-task-token"] || (req.query && req.query.token))) {
    try { await requireAdmin(req); privileged = true; }
    catch { privileged = false; }               // 관리자가 아니면 그냥 일반 호출로 취급
  }

  // 대회 페이지는 **관리자 토큰이 있을 때만** 지정할 수 있다.
  // 아무나 지정하게 두면 엉뚱한 대회 경기를 우리 표에 밀어 넣을 수 있다.
  const pages = privileged
    ? String(req.query.page || "").split("|").map(s => s.trim()).filter(Boolean)
    : [];

  try {
    const out = await runSync({ pages, force: privileged });
    return ok(res, out);
  } catch (e) {
    if (e.rate) return ok(res, { skipped: true, 이유: e.message });   // 제한은 오류가 아니다
    return fail(res, 500, e.message || String(e));
  }
};
