// ── Leaguepedia 경기·선수 기록 자동 수집 ───────────────────
// 브라우저가 아니라 서버에서 실행된다. Leaguepedia는 호출 제한이 매우 빡빡해서
// (익명 요청은 몇 초에 한 번) 방문자마다 부르면 바로 차단된다. 그래서 서버가
// 가끔 한 번 받아 우리 DB에 저장하고, 방문자는 우리 DB만 본다.
//
//   /api/leaguepedia?page=LCK/2026 Season/Rounds 3-4            → 미리보기(저장 안 함)
//   /api/leaguepedia?page=...&apply=1&tid=<우리 대회 id>         → 실제 저장
//
// 호출 제한 대응 3단계
//   ① 선수 기록 한 번만 받아 승패까지 계산 (요청 2회 → 1회)
//   ② 받아온 결과를 10분간 저장해 두고 재사용 (이름 연결하고 다시 눌러도 공짜)
//   ③ 그래도 막히면 시간을 늘려 가며 두 번 더 시도
//
// 데이터 출처: Leaguepedia (CC-BY-SA 3.0) — 푸터에 출처를 표기하고 있다.

const { ok, fail, sb, requireAdmin } = require("./_lib");

const API = "https://lol.fandom.com/api.php";
const UA = "TheNexus-LCK-FanSite/1.0 (https://lck-community.vercel.app)";
const CACHE_MINUTES = 10;

const wait = ms => new Promise(r => setTimeout(r, ms));
const val = (row, key) => row[key] ?? row[key.replace(/_/g, " ")] ?? "";
const isWin = v => /^(1|yes|true)$/i.test(String(v || "").trim());

async function cargo(params, tries) {
  const q = new URLSearchParams({ action: "cargoquery", format: "json", limit: "500", ...params });
  const r = await fetch(`${API}?${q}`, { headers: { "user-agent": UA } });
  const j = await r.json();
  if (j.error) {
    const code = j.error.code || "";
    const n = tries || 0;
    if (code === "ratelimited" && n < 2) {          // 4초 → 8초로 늘려 가며 재시도
      await wait(4000 * Math.pow(2, n));
      return cargo(params, n + 1);
    }
    if (code === "ratelimited") {
      const e = new Error("Leaguepedia가 잠시 호출을 막고 있습니다. 2~3분 뒤에 다시 눌러 주세요. (한 번 받아오면 10분 동안은 다시 부르지 않습니다)");
      e.rate = true; throw e;
    }
    throw new Error(`Leaguepedia: ${j.error.info || code}`);
  }
  return (j.cargoquery || []).map(x => x.title);
}

// 챔피언 이름 영어 → 한글 (우리 DB·아이콘은 한글 기준)
const CHAMP_ALIAS = { nunuwillump: "nunu", wukong: "monkeyking" };
const normChamp = s => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
async function loadChampNames() {
  try {
    const vers = await (await fetch("https://ddragon.leagueoflegends.com/api/versions.json")).json();
    const data = await (await fetch(`https://ddragon.leagueoflegends.com/cdn/${vers[0]}/data/ko_KR/champion.json`)).json();
    const byId = {};
    Object.values(data.data).forEach(ch => { byId[normChamp(ch.id)] = ch.name; });
    return name => { const k = normChamp(name); return byId[CHAMP_ALIAS[k] || k] || name; };
  } catch { return name => name; }
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

// ── 원본 받아오기 (캐시 우선) ──
const cacheKeyOf = page => "lp_cache_" + page.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 48);

async function fetchRaw(page) {
  const ck = cacheKeyOf(page);
  try {
    const cached = JSON.parse(await loadSetting(ck) || "null");
    if (cached && Date.now() - cached.t < CACHE_MINUTES * 60000) {
      return { rows: cached.rows, games: cached.games, cached: true };
    }
  } catch { /* 캐시가 깨져 있으면 새로 받는다 */ }

  const where = `OverviewPage='${page.replace(/'/g, "''")}'`;

  // ① 선수 기록 한 번으로 끝내기 (승패는 PlayerWin으로 판단)
  let rows = null, games = null;
  try {
    rows = await cargo({
      tables: "ScoreboardPlayers=SP",
      fields: "SP.GameId,SP.MatchId,SP.Link,SP.Champion,SP.Kills,SP.Deaths,SP.Assists,SP.CS,SP.Gold,SP.Team,SP.Role,SP.Side,SP.PlayerWin,SP.DateTime_UTC",
      where: "SP." + where,
      order_by: "SP.DateTime_UTC ASC",
    });
    if (!rows.length || val(rows[0], "PlayerWin") === "") rows = null;  // 그 칸이 없으면 옛 방식으로
  } catch (e) {
    if (e.rate) throw e;                       // 호출 제한이면 더 부르지 않는다
    rows = null;
  }

  // ② 옛 방식 (경기표 + 선수표) — PlayerWin을 못 쓰는 경우만
  if (!rows) {
    games = await cargo({
      tables: "ScoreboardGames=SG",
      fields: "SG.MatchId,SG.GameId,SG.Team1,SG.Team2,SG.Winner,SG.DateTime_UTC,SG.N_GameInMatch",
      where: "SG." + where, order_by: "SG.DateTime_UTC ASC",
    });
    await wait(1500);
    rows = await cargo({
      tables: "ScoreboardPlayers=SP",
      fields: "SP.GameId,SP.MatchId,SP.Link,SP.Champion,SP.Kills,SP.Deaths,SP.Assists,SP.CS,SP.Gold,SP.Team,SP.Role,SP.Side",
      where: "SP." + where, order_by: "SP.GameId ASC",
    });
  }

  try { await saveSetting(ck, JSON.stringify({ t: Date.now(), rows, games })); } catch {}
  return { rows, games, cached: false };
}

// 세트 번호: GameId 끝의 숫자 (…_Week 10_9_3 → 3)
const setNoOf = gid => Number((String(gid).match(/_(\d+)$/) || [])[1]) || 0;

module.exports = async (req, res) => {
  try { await requireAdmin(req); }
  catch (e) { return fail(res, e.status || 500, e.message); }

  const page = (req.query.page || "").trim();
  const tid = (req.query.tid || "").trim();
  const apply = req.query.apply === "1";
  if (!page) return fail(res, 400, "대회 페이지를 입력해 주세요 (예: LCK/2026 Season/Rounds 3-4)");
  if (apply && !tid) return fail(res, 400, "저장하려면 우리 대회를 골라 주세요");

  try {
    const aliases = JSON.parse((await loadSetting("lp_aliases")) || "{}");
    const teamMap = aliases.teams || {};
    const playerMap = aliases.players || {};
    const champKo = await loadChampNames();

    const { rows, games, cached } = await fetchRaw(page);

    // ── 세트 단위로 묶기 ──
    const byGame = {};
    rows.forEach(r => {
      const gid = val(r, "GameId");
      const g = (byGame[gid] = byGame[gid] || {
        gid, mid: val(r, "MatchId"), at: val(r, "DateTime UTC"), players: [], teams: {},
      });
      const team = val(r, "Team");
      const side = String(val(r, "Side"));
      g.teams[team] = g.teams[team] || { side, win: false };
      if (isWin(val(r, "PlayerWin"))) g.teams[team].win = true;
      g.players.push(r);
    });

    // 옛 방식이면 경기표에서 승패를 채운다
    if (games) {
      games.forEach(x => {
        const g = byGame[val(x, "GameId")];
        if (!g) return;
        const t1 = val(x, "Team1"), t2 = val(x, "Team2");
        const winner = String(val(x, "Winner")) === "1" ? t1 : t2;
        g.teams[t1] = g.teams[t1] || { side: "1", win: false };
        g.teams[t2] = g.teams[t2] || { side: "2", win: false };
        g.teams[winner].win = true;
        g.at = g.at || val(x, "DateTime UTC");
      });
    }

    // ── 경기 단위로 묶기 ──
    const unknownTeams = new Set(), unknownPlayers = new Set();
    const byMatch = {};
    Object.values(byGame)
      .sort((x, y) => (setNoOf(x.gid) - setNoOf(y.gid)))
      .sort((x, y) => (x.at > y.at ? 1 : x.at < y.at ? -1 : 0))
      .forEach(g => {
        const names = Object.keys(g.teams);
        if (names.length < 2) return;
        const blue = names.find(n => g.teams[n].side === "1") || names[0];
        const red = names.find(n => n !== blue) || names[1];
        names.forEach(n => { if (!teamMap[n]) unknownTeams.add(n); });

        const m = (byMatch[g.mid] = byMatch[g.mid] || {
          lpMatchId: g.mid, aName: blue, bName: red,
          a: teamMap[blue] || null, b: teamMap[red] || null,
          at: g.at, sets: [], scoreA: 0, scoreB: 0,
        });
        // ⚠ 세트마다 블루/레드가 바뀐다. 이긴 팀 '이름'을 경기 기준 A팀과 대조해야 한다.
        const winnerName = names.find(n => g.teams[n].win) || null;
        const winIsA = winnerName === m.aName;
        if (winnerName) { if (winIsA) m.scoreA++; else m.scoreB++; }

        m.sets.push({
          n: setNoOf(g.gid) || m.sets.length + 1,
          win: winIsA ? "a" : "b",
          players: g.players.map(r => {
            const link = val(r, "Link");
            if (!playerMap[link]) unknownPlayers.add(link);
            return {
              pid: playerMap[link] || null, lpName: link,
              champ: champKo(val(r, "Champion")),
              k: Number(val(r, "Kills")) || 0, d: Number(val(r, "Deaths")) || 0, a: Number(val(r, "Assists")) || 0,
              cs: Number(val(r, "CS")) || 0,
              gold: Math.round((Number(val(r, "Gold")) || 0) / 100) / 10,
            };
          }),
        });
      });

    const matches = Object.values(byMatch);
    matches.forEach(m => m.sets.sort((x, y) => x.n - y.n));

    const summary = {
      page, 경기수: matches.length,
      세트수: matches.reduce((n, m) => n + m.sets.length, 0),
      모르는팀: [...unknownTeams], 모르는선수: [...unknownPlayers].slice(0, 60),
      저장된자료사용: !!cached, 저장함: false,
    };

    if (!apply) return ok(res, { ...summary, 미리보기: matches.slice(0, 2) });
    if (unknownTeams.size) return fail(res, 400, `팀 이름을 우리 팀과 연결해 주세요: ${[...unknownTeams].join(", ")}`);

    // ── 저장 (한 번에 묶어서) ──
    const matchRows = [], detailRows = [];
    matches.forEach(m => {
      const id = "lp" + String(m.lpMatchId).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);
      const done = m.scoreA + m.scoreB > 0;
      matchRows.push({
        id, lp_id: m.lpMatchId, tid, stage: page.split("/").pop(),
        at: (m.at || "").replace(" ", "T") + (m.at ? "Z" : ""),
        a: m.a, b: m.b, label: "", odds_a: 2, odds_b: 2,
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
        method: "POST", headers: { prefer: "resolution=merge-duplicates" },
        body: JSON.stringify(matchRows),
      });
    }
    if (detailRows.length) {
      await sb("match_details?on_conflict=match_id,set_index", {
        method: "POST", headers: { prefer: "resolution=merge-duplicates" },
        body: JSON.stringify(detailRows),
      });
    }

    // 일정 자동 갱신이 어느 대회를 볼지 여기서 기억해 둔다 (api/schedule-sync.js 가 읽는다)
    try {
      const prev = JSON.parse((await loadSetting("schedule_sync")) || "{}");
      const pages = [...new Set([...(prev.pages || []), page])].slice(-3);
      await saveSetting("schedule_sync", JSON.stringify({
        ...prev, pages, tid, stage: page.split("/").pop(),
      }));
    } catch { /* 기억에 실패해도 수집 자체는 성공이다 */ }

    return ok(res, { ...summary, 저장함: true, 저장된경기: matchRows.length, 저장된세트: detailRows.length });
  } catch (e) {
    return fail(res, 500, e.message || String(e));
  }
};
