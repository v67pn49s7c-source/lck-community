// ── Leaguepedia 수집 공통 ─────────────────────────────────
// 일정 갱신(schedule-sync)과 결과 수집(leaguepedia)이 **같은 규칙**을 써야
// 서로 만든 경기가 겹치거나 스테이지를 덮어쓰지 않는다. 그 공통 규칙을 여기 모은다.

const { sb } = require("./_lib");

const API = "https://lol.fandom.com/api.php";
const UA = "TheNexus-LCK-FanSite/1.0 (https://lck-community.vercel.app)";
const wait = ms => new Promise(r => setTimeout(r, ms));

// Cargo 응답의 필드 이름은 밑줄이 공백으로 바뀌어 온다 (DateTime_UTC → "DateTime UTC")
const val = (row, key) => row[key] ?? row[key.replace(/_/g, " ")] ?? "";

// 익명 호출 제한이 아주 빡빡하다. 5 → 12 → 25초로 늘려 가며 다시 시도한다.
const BACKOFF = [5000, 12000, 25000];
async function cargo(params, tries) {
  const q = new URLSearchParams({ action: "cargoquery", format: "json", limit: "500", ...params });
  const r = await fetch(`${API}?${q}`, { headers: { "user-agent": UA } });
  const j = await r.json();
  if (j.error) {
    const n = tries || 0;
    if (j.error.code === "ratelimited" && n < BACKOFF.length) {
      await wait(BACKOFF[n]);
      return cargo(params, n + 1);
    }
    const e = new Error(j.error.code === "ratelimited"
      ? "Leaguepedia 가 계속 호출을 막고 있습니다. 몇 분 뒤에 다시 눌러 주세요."
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

// 우리 경기 id — 두 수집기가 같은 규칙을 써야 같은 경기로 이어진다
const matchIdOf = lpMatchId => "lp" + String(lpMatchId).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);

// ── 대회 페이지 ↔ 우리 스테이지 ──────────────────────────
// 페이지 이름에서 구분 표식을 뽑는다: "Rounds 3-4" → "3-4", "Road to MSI" → "msi"
function pageTag(page) {
  const tail = String(page || "").split("/").pop().toLowerCase();
  const range = tail.match(/(\d+\s*-\s*\d+)/);
  if (range) return range[1].replace(/\s+/g, "");
  if (tail.includes("msi")) return "msi";
  if (tail.includes("cup")) return "cup";
  if (tail.includes("play-in") || tail.includes("playin")) return "play-in";
  if (tail.includes("playoff")) return "playoff";
  return "";
}
function stageTag(name) {
  const s = String(name || "").toLowerCase();
  const range = s.match(/(\d+\s*-\s*\d+)/);
  if (range) return range[1].replace(/\s+/g, "");
  if (s.includes("msi")) return "msi";
  if (s.includes("cup") || s.includes("컵")) return "cup";
  if (s.includes("플레이인") || s.includes("play-in")) return "play-in";
  if (s.includes("플레이오프") || s.includes("playoff")) return "playoff";
  return "";
}

// 새 경기가 어느 스테이지인지 **팀으로** 정한다.
// '순위 전적'에 그룹별 팀 명단이 이미 있으므로, 두 팀이 모두 든 그룹을 찾으면 된다.
//   kt vs dk → 라운드 3-4 레전드 그룹 / ns vs bro → 라운드 3-4 라이즈 그룹
// 같은 조건이면 **팀 수가 적은 쪽**(더 구체적인 그룹)을, 그다음 최신 순으로 고른다.
function stagePicker(stageRecords, page) {
  const tag = pageTag(page);
  const all = (stageRecords || [])
    .map(s => ({ name: s.name, ord: s.ord ?? 0, tag: stageTag(s.name),
                 teams: new Set((s.records || []).map(r => r.team)) }))
    .filter(s => s.teams.size);
  // 이 대회 페이지에 해당하는 스테이지만 후보로 (없으면 전부)
  const scoped = tag ? all.filter(s => s.tag === tag) : all;
  const cand = (scoped.length ? scoped : all)
    .sort((x, y) => (x.teams.size - y.teams.size) || (y.ord - x.ord));
  return (a, b) => {
    const hit = cand.find(s => s.teams.has(a) && s.teams.has(b));
    return hit ? hit.name : null;
  };
}

// ── 선수 이름 자동 연결 ───────────────────────────────────
// Leaguepedia 링크는 "Chovy" 또는 "Frog (Lee Min-hoi)" 형태.
// 괄호를 떼고 우리 닉네임과 맞춰 본다. 딱 한 명일 때만 잇는다.
const normNick = s => String(s || "").replace(/\s*\(.*$/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
function autoLinkPlayers(lpNames, players) {
  const byNick = {};
  (players || []).forEach(p => {
    const k = normNick(p.nick);
    if (k) (byNick[k] = byNick[k] || []).push(p);
  });
  const linked = {}, ambiguous = [], missing = [];
  [...lpNames].forEach(name => {
    const hit = byNick[normNick(name)];
    if (!hit) missing.push(name);
    else if (hit.length > 1) ambiguous.push(name);
    else linked[name] = hit[0].id;
  });
  return { linked, ambiguous, missing };
}

// ── 대회 정하기 ───────────────────────────────────────────
// 스플릿 1-2 경기를 '스플릿 3' 대회에 넣으면 경기 목록의 대회 필터가 엉킨다.
// 같은 시기의 경기가 이미 쓰는 대회가 있으면 그것을, 없으면 하나 만들어 준다.
function koTournamentName(page) {
  const tail = String(page || "").split("/").pop();
  const range = tail.match(/(\d+)\s*-\s*(\d+)/);
  if (range) return `2026 LCK 라운드 ${range[1]}-${range[2]}`;
  if (/msi/i.test(tail)) return "2026 LCK Road to MSI";
  if (/cup/i.test(tail)) return "2026 LCK 컵";
  if (/play-?in/i.test(tail)) return "2026 LCK 플레이-인";
  if (/playoff/i.test(tail)) return "2026 LCK 플레이오프";
  return "2026 LCK " + tail;
}

async function resolveTid(page, existing, explicitTid) {
  if (explicitTid) return explicitTid;
  const tag = pageTag(page);
  // 같은 표식의 스테이지를 쓰는 경기가 이미 있으면 그 대회에 붙인다
  const hit = (existing || []).find(m => m.tid && m.stage && stageTag(m.stage) === tag);
  if (hit) return hit.tid;
  if (!tag) return null;

  const id = ("lck2026-" + tag).replace(/[^a-z0-9-]/g, "").slice(0, 32);
  try {
    await sb("tournaments?on_conflict=id", {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ id, name: koTournamentName(page), type: "리그", stages: [], note: "" }]),
    });
    return id;
  } catch { return null; }        // 대회를 못 만들어도 수집 자체는 진행
}

module.exports = {
  API, UA, wait, val, cargo, loadSetting, saveSetting,
  matchIdOf, pageTag, stageTag, stagePicker, autoLinkPlayers, normNick,
  koTournamentName, resolveTid,
};
