// ── Leaguepedia 경기·선수 기록 자동 수집 ───────────────────
// 브라우저가 아니라 서버에서 실행된다. Leaguepedia는 호출 제한이 매우 빡빡해서
// (익명 요청은 몇 초에 한 번) 방문자마다 부르면 바로 차단된다. 그래서 서버가
// 가끔 한 번 받아 우리 DB에 저장하고, 방문자는 우리 DB만 본다.
//
// 사용법 (관리자 화면의 "Leaguepedia 불러오기"가 이 주소를 부른다)
//   /api/leaguepedia?token=...&page=LCK/2026 Season/Rounds 3-4          → 미리보기(저장 안 함)
//   /api/leaguepedia?token=...&page=...&apply=1&tid=t2026s3             → 실제 저장
//
// 데이터 출처: Leaguepedia (CC-BY-SA 3.0) — 푸터에 출처를 표기하고 있다.

const { ok, fail, sb, requireAdmin } = require("./_lib");

const API = "https://lol.fandom.com/api.php";
const UA = "TheNexus-LCK-FanSite/1.0 (https://lck-community.vercel.app)";

// 호출 제한이 있어 요청 사이에 간격을 둔다
const wait = ms => new Promise(r => setTimeout(r, ms));

// 호출 제한에 걸리면 잠깐 쉬었다 두 번까지 다시 시도한다
async function cargo(params, tries) {
  const q = new URLSearchParams({ action: "cargoquery", format: "json", limit: "500", ...params });
  const r = await fetch(`${API}?${q}`, { headers: { "user-agent": UA } });
  const j = await r.json();
  if (j.error) {
    const code = j.error.code || "";
    if (code === "ratelimited" && (tries || 0) < 2) {
      await wait(3000);
      return cargo(params, (tries || 0) + 1);
    }
    if (code === "ratelimited") {
      throw new Error("Leaguepedia 호출 제한에 걸렸습니다. 1~2분 뒤에 다시 눌러 주세요.");
    }
    throw new Error(`Leaguepedia: ${j.error.info || code}`);
  }
  return (j.cargoquery || []).map(x => x.title);
}

// 공백이 섞인 필드 이름(DateTime UTC)을 쓰기 쉽게 정리
const val = (row, key) => row[key] ?? row[key.replace(/_/g, " ")] ?? "";

// 팀·선수 이름을 우리 id로 바꾸는 표 (site_settings의 lp_aliases에 저장)
async function loadAliases() {
  const rows = await sb("site_settings?key=eq.lp_aliases&select=value");
  try { return JSON.parse((rows[0] || {}).value || "{}"); } catch { return {}; }
}

module.exports = async (req, res) => {
  try {
    await requireAdmin(req);
  } catch (e) { return fail(res, e.status || 500, e.message); }

  const page = (req.query.page || "").trim();
  const tid = (req.query.tid || "").trim();
  const apply = req.query.apply === "1";
  if (!page) return fail(res, 400, "page 값이 필요합니다 (예: LCK/2026 Season/Rounds 3-4)");
  if (apply && !tid) return fail(res, 400, "저장하려면 tid(우리 대회 id)가 필요합니다");

  try {
    const aliases = await loadAliases();
    const teamMap = aliases.teams || {};
    const playerMap = aliases.players || {};

    // 1) 세트 단위 경기 결과
    const games = await cargo({
      tables: "ScoreboardGames=SG",
      fields: "SG.MatchId,SG.GameId,SG.Team1,SG.Team2,SG.Winner,SG.Gamelength,SG.DateTime_UTC,SG.N_GameInMatch",
      where: `SG.OverviewPage='${page.replace(/'/g, "''")}'`,
      order_by: "SG.DateTime_UTC ASC",
    });
    await wait(1200); // 호출 제한 배려

    // 2) 세트별 선수 기록
    const rows = await cargo({
      tables: "ScoreboardPlayers=SP",
      fields: "SP.GameId,SP.MatchId,SP.Link,SP.Champion,SP.Kills,SP.Deaths,SP.Assists,SP.CS,SP.Gold,SP.Team,SP.Role,SP.Side",
      where: `SP.OverviewPage='${page.replace(/'/g, "''")}'`,
      order_by: "SP.GameId ASC",
    });

    // 3) 우리 형식으로 변환
    const unknownTeams = new Set(), unknownPlayers = new Set();
    const byMatch = {};
    games.forEach(g => {
      const mid = val(g, "MatchId"), gid = val(g, "GameId");
      const t1 = val(g, "Team1"), t2 = val(g, "Team2");
      [t1, t2].forEach(t => { if (t && !teamMap[t]) unknownTeams.add(t); });
      const m = (byMatch[mid] = byMatch[mid] || {
        lpMatchId: mid, a: teamMap[t1] || null, b: teamMap[t2] || null,
        aName: t1, bName: t2, at: val(g, "DateTime UTC"), sets: [], scoreA: 0, scoreB: 0,
      });
      const winnerIsA = String(val(g, "Winner")) === "1";
      if (winnerIsA) m.scoreA++; else m.scoreB++;
      m.sets.push({ gid, win: winnerIsA ? "a" : "b", n: Number(val(g, "N GameInMatch")) || m.sets.length + 1, players: [] });
    });

    rows.forEach(r => {
      const gid = val(r, "GameId"), mid = val(r, "MatchId");
      const m = byMatch[mid]; if (!m) return;
      const set = m.sets.find(s => s.gid === gid); if (!set) return;
      const link = val(r, "Link");
      const pid = playerMap[link];
      if (!pid) unknownPlayers.add(link);
      set.players.push({
        pid: pid || null, lpName: link,
        champ: val(r, "Champion"),
        k: Number(val(r, "Kills")) || 0, d: Number(val(r, "Deaths")) || 0, a: Number(val(r, "Assists")) || 0,
        cs: Number(val(r, "CS")) || 0,
        gold: Math.round((Number(val(r, "Gold")) || 0) / 100) / 10, // 12345 → 12.3k
        role: val(r, "Role"), team: val(r, "Team"),
      });
    });

    const matches = Object.values(byMatch).sort((x, y) => (x.at > y.at ? 1 : -1));
    matches.forEach(m => m.sets.sort((x, y) => x.n - y.n));

    const summary = {
      page, 경기수: matches.length,
      세트수: matches.reduce((n, m) => n + m.sets.length, 0),
      모르는팀: [...unknownTeams], 모르는선수: [...unknownPlayers].slice(0, 60),
      저장함: false,
    };

    if (!apply) {
      return ok(res, { ...summary, 미리보기: matches.slice(0, 3) });
    }
    if (unknownTeams.size) {
      return fail(res, 400, `팀 이름을 우리 팀 id와 연결해 주세요: ${[...unknownTeams].join(", ")}`);
    }

    // 4) 저장 — 한 줄씩 보내면 경기 수만큼 서버 왕복이 생겨 실행 시간을 넘긴다.
    //    경기 전체 / 세트 전체를 각각 한 번에 보낸다 (중복은 id 기준 덮어쓰기).
    const matchRows = [], detailRows = [];
    matches.forEach(m => {
      const id = "lp" + m.lpMatchId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);
      const done = m.scoreA + m.scoreB > 0;
      matchRows.push({
        id, tid, stage: page.split("/").pop(), at: (m.at || "").replace(" ", "T") + "Z",
        a: m.a, b: m.b, label: "",
        odds_a: 2, odds_b: 2,
        status: done ? "done" : "upcoming",
        score_a: done ? m.scoreA : null, score_b: done ? m.scoreB : null,
      });
      m.sets.forEach(s => {
        const players = s.players.filter(p => p.pid).map(p => ({
          pid: p.pid, champ: p.champ, spell: "", k: p.k, d: p.d, a: p.a,
          cs: p.cs, gold: p.gold, items: "", runes: "",
        }));
        if (players.length) detailRows.push({ match_id: id, set_index: s.n - 1, win: s.win, players });
      });
    });

    if (matchRows.length) {
      await sb("matches?on_conflict=id", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates" },
        body: JSON.stringify(matchRows),
      });
    }
    if (detailRows.length) {
      await sb("match_details?on_conflict=match_id,set_index", {
        method: "POST",
        headers: { prefer: "resolution=merge-duplicates" },
        body: JSON.stringify(detailRows),
      });
    }

    return ok(res, { ...summary, 저장함: true, 저장된경기: matchRows.length, 저장된세트: detailRows.length });
  } catch (e) {
    return fail(res, 500, e.message || String(e));
  }
};
