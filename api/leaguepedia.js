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
const { val, wait, cargo, loadSetting, saveSetting, matchIdOf, stagePicker, autoLinkPlayers, resolveTid, buildNewPlayers, normNick } = require("./_lp");

const CACHE_MINUTES = 10;
const isWin = v => /^(1|yes|true)$/i.test(String(v || "").trim());

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

// ── 원본 받아오기 (캐시 우선) ──
const cacheKeyOf = page => "lp_cache_" + page.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 48);

// Leaguepedia 는 한 번에 500행까지만 준다. 한 스플릿은 선수 기록이 2,000행이 넘어서
// (경기 90 × 세트 3 × 선수 10) 나눠 받아야 한다. 받은 만큼 저장해 두고, 시간이 모자라면
// 다음에 **이어서** 받는다. 서버 함수는 60초 안에 끝나야 하므로 시간 예산을 둔다.
const PAGE_SIZE = 500;

async function fetchRaw(page, deadline) {
  const ck = cacheKeyOf(page);
  let acc = null;
  try { acc = JSON.parse(await loadSetting(ck) || "null"); } catch { acc = null; }
  if (acc && acc.done && Date.now() - acc.t < CACHE_MINUTES * 60000) {
    return { rows: acc.rows, games: acc.games, cached: true, done: true, fetched: 0 };
  }

  const where = `OverviewPage='${page.replace(/'/g, "''")}'`;
  // 이어받기: 이미 받아 둔 게 있으면 그 뒤부터
  let rows = (acc && !acc.done && Array.isArray(acc.rows)) ? acc.rows.slice() : [];
  let done = false, fetched = 0;

  // 페이지 나눠 받기가 어긋나지 않게 **고정된 순서**로 요청한다
  while (Date.now() < deadline) {
    const batch = await cargo({
      tables: "ScoreboardPlayers=SP",
      fields: "SP.GameId,SP.MatchId,SP.Link,SP.Champion,SP.Kills,SP.Deaths,SP.Assists,SP.CS,SP.Gold,SP.Team,SP.Role,SP.Side,SP.PlayerWin,SP.DateTime_UTC",
      where: "SP." + where,
      order_by: "SP.GameId ASC, SP.Link ASC",
      offset: String(rows.length),
      limit: String(PAGE_SIZE),
    });
    fetched += batch.length;
    rows = rows.concat(batch);
    if (batch.length < PAGE_SIZE) { done = true; break; }
    try { await saveSetting(ck, JSON.stringify({ t: Date.now(), rows, games: null, done: false })); } catch {}
  }

  // PlayerWin 칸이 없는 옛 대회면 경기표로 승패를 따로 받는다
  let games = null;
  if (done && rows.length && val(rows[0], "PlayerWin") === "") {
    games = await cargo({
      tables: "ScoreboardGames=SG",
      fields: "SG.MatchId,SG.GameId,SG.Team1,SG.Team2,SG.Winner,SG.DateTime_UTC,SG.N_GameInMatch",
      where: "SG." + where, order_by: "SG.GameId ASC",
    });
  }

  try { await saveSetting(ck, JSON.stringify({ t: Date.now(), rows, games, done })); } catch {}
  return { rows, games, cached: false, done, fetched };
}

// 세트 번호: GameId 끝의 숫자 (…_Week 10_9_3 → 3)
const setNoOf = gid => Number((String(gid).match(/_(\d+)$/) || [])[1]) || 0;

// 세트별 MVP (LCK 의 경기 MVP). 저장해 두고 재사용한다 — 호출 제한이 빡빡해서.
async function fetchMVP(page) {
  const ck = "lp_mvp_" + page.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 44);
  try {
    const c = JSON.parse((await loadSetting(ck)) || "null");
    if (c && c.rows && Date.now() - c.t < CACHE_MINUTES * 60000) return c.rows;
  } catch { /* 캐시가 깨졌으면 새로 받는다 */ }
  const rows = await cargo({
    tables: "MatchScheduleGame=MSG",
    fields: "MSG.MatchId,MSG.GameId,MSG.MVP,MSG.N_GameInMatch",
    where: `MSG.OverviewPage='${page.replace(/'/g, "''")}'`,
  });
  try { await saveSetting(ck, JSON.stringify({ t: Date.now(), rows })); } catch {}
  return rows;
}

module.exports = async (req, res) => {
  try { await requireAdmin(req); }
  catch (e) { return fail(res, e.status || 500, e.message); }

  // 대회 페이지는 | 로 여러 개 지정할 수 있다 (스플릿 1-2 · Road to MSI · 3-4 등)
  const pages = String(req.query.page || "").split("|").map(x => x.trim()).filter(Boolean);
  const tid = (req.query.tid || "").trim();
  const apply = req.query.apply === "1";
  const addPlayers = req.query.newplayers === "1";
  if (!pages.length) return fail(res, 400, "대회 페이지를 입력해 주세요 (예: LCK/2026 Season/Rounds 3-4)");

  try {
    const aliases = JSON.parse((await loadSetting("lp_aliases")) || "{}");
    const teamMap = aliases.teams || {};
    const playerMap = { ...(aliases.players || {}) };
    const champKo = await loadChampNames();
    const roster = await sb("players?select=id,nick,team");
    const existing = await sb("matches?select=id,lp_id,tid,stage,at,counted,status,score_a,score_b");
    const byLpMatch = {};
    existing.forEach(m => { if (m.lp_id) byLpMatch[m.lp_id] = m; });
    let stageRecords = [];
    try { stageRecords = await sb("stage_records?select=id,name,ord,records"); } catch {}

    // 서버 함수는 60초 안에 끝나야 한다. 받는 데 40초까지만 쓰고 나머지는 저장에 남긴다.
    const started = Date.now();
    const BUDGET_MS = 40000;
    let rows = [], games = null, cached = false;
    const pageOf = {};                    // 경기 → 어느 대회 페이지에서 왔는지
    const doneOf = {};                    // 대회 페이지별로 끝까지 받았는지
    const progress = [];
    for (let i = 0; i < pages.length; i++) {
      const pg = pages[i];
      // 남은 시간을 남은 대회 수로 나눠 준다 (한 대회가 시간을 다 쓰지 않게)
      const left = pages.length - i;
      const share = Math.max(3000, (started + BUDGET_MS - Date.now()) / left);
      const got = await fetchRaw(pg, Date.now() + share);
      (got.rows || []).forEach(r => { pageOf[val(r, "MatchId")] = pg; });
      rows = rows.concat(got.rows || []);
      if (got.games) games = (games || []).concat(got.games);
      cached = cached || got.cached;
      doneOf[pg] = got.done;
      progress.push(`${pg.split("/").pop()} ${got.rows.length}행${got.done ? "" : " (이어받는 중)"}`);
      if (pages.length > 1) await wait(1200);
    }
    const page = pages.join(" · ");
    const allDone = pages.every(pg => doneOf[pg]);

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
    const playerInfo = {};                 // Leaguepedia 이름 → { team, role }
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
            if (!playerMap[link]) {
              unknownPlayers.add(link);
              // 자동 등록에 쓸 소속·포지션을 함께 기억해 둔다
              if (!playerInfo[link]) playerInfo[link] = { team: teamMap[val(r, "Team")] || null, role: val(r, "Role") };
            }
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

    // 모르는 선수를 닉네임으로 자동 연결하고, 이어진 사람은 목록에서 뺀다
    const auto = autoLinkPlayers([...unknownPlayers], roster);
    Object.assign(playerMap, auto.linked);
    Object.keys(auto.linked).forEach(n => unknownPlayers.delete(n));
    if (Object.keys(auto.linked).length) {
      // 자동으로 이은 것도 다음에 또 쓰도록 저장해 둔다
      try {
        await saveSetting("lp_aliases", JSON.stringify({
          ...aliases, teams: teamMap, players: { ...(aliases.players || {}), ...auto.linked },
        }));
      } catch { /* 저장에 실패해도 이번 수집은 진행 */ }
    }

    // 그래도 못 찾은 선수는 우리 DB 에 만들어 준다 (저장할 때만).
    // 이게 없으면 지난 스플릿의 이적·은퇴 선수 기록이 통째로 버려진다.
    let madePlayers = 0;
    if (apply && addPlayers && unknownPlayers.size) {
      const made = buildNewPlayers(unknownPlayers, playerInfo, roster.map(p => p.id));
      if (made.rows.length) {
        await sb("players?on_conflict=id", {
          method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(made.rows),
        });
        Object.assign(playerMap, made.linked);
        Object.keys(made.linked).forEach(n => unknownPlayers.delete(n));
        madePlayers = made.rows.length;
        try {
          const cur = JSON.parse((await loadSetting("lp_aliases")) || "{}");
          await saveSetting("lp_aliases", JSON.stringify({
            ...cur, teams: teamMap, players: { ...(cur.players || {}), ...made.linked },
          }));
        } catch { /* 저장 실패해도 이번 수집은 진행 */ }
      }
    }

    const matches = Object.values(byMatch);
    matches.forEach(m => m.sets.sort((x, y) => x.n - y.n));
    // 자동 연결 결과를 세트 안의 선수에도 반영한다 (위에서 pid=null 로 채워졌으므로)
    matches.forEach(m => m.sets.forEach(st => st.players.forEach(p => {
      if (!p.pid && playerMap[p.lpName]) p.pid = playerMap[p.lpName];
    })));

    const summary = {
      page, 경기수: matches.length,
      세트수: matches.reduce((n, m) => n + m.sets.length, 0),
      모르는팀: [...unknownTeams], 모르는선수: [...unknownPlayers].slice(0, 60),
      자동연결: Object.keys(auto.linked).length, 이름겹침: auto.ambiguous.slice(0, 10),
      진행: progress, 끝까지받음: allDone, 선수등록: 0,
      저장된자료사용: !!cached, 저장함: false,
    };

    if (!apply) return ok(res, { ...summary, 미리보기: matches.slice(0, 2) });
    if (unknownTeams.size) return fail(res, 400, `팀 이름을 우리 팀과 연결해 주세요: ${[...unknownTeams].join(", ")}`);
    let pomSaved = 0, pomInfo = null;
    // 대회 페이지마다 우리 대회를 정한다 (없으면 만들어 준다 — 스플릿 1-2 가 스플릿 3 에 섞이지 않게)
    const tidOf = {};
    for (const pg of pages) tidOf[pg] = await resolveTid(pg, existing, tid);

    // ── 저장 (한 번에 묶어서) ──
    const matchRows = [], detailRows = [];
    const pickers = {};
    matches.forEach(m => {
      const prev = byLpMatch[m.lpMatchId];
      const id = prev ? prev.id : matchIdOf(m.lpMatchId);
      const done = m.scoreA + m.scoreB > 0;
      const pg = pageOf[m.lpMatchId] || pages[0];
      const fallbackTid = tidOf[pg] || null;
      // 일정 갱신이 이미 만들어 둔 경기는 손대지 않는다 — 일정·스코어·그룹의 주인은 그쪽이다.
      // 아직 없는 경기는, 그 대회를 **끝까지 받았을 때만** 만든다.
      // (덜 받은 상태로 만들면 세트를 덜 세어 스코어가 1:0 처럼 틀리게 들어간다)
      if (prev || !doneOf[pg]) {
        m.sets.forEach(s => {
          const players = s.players.filter(p => p.pid).map(p => ({
            pid: p.pid, champ: p.champ, spell: "", k: p.k, d: p.d, a: p.a,
            cs: p.cs, gold: p.gold, items: "", runes: "",
          }));
          if (players.length) detailRows.push({ match_id: id, set_index: s.n - 1, win: s.win, players });
        });
        return;
      }
      // 일정 갱신(schedule-sync)이 정해 둔 대회·그룹·시각을 덮어쓰지 않는다.
      // 새 경기일 때만 팀으로 그룹을 정한다 (api/_lp.js stagePicker — 두 수집기가 같은 규칙)
      const pick = (pickers[pg] = pickers[pg] || stagePicker(stageRecords, pg));
      matchRows.push({
        id, lp_id: m.lpMatchId,
        tid: fallbackTid || (prev ? prev.tid : null),
        stage: prev ? prev.stage : (pick(m.a, m.b) || pg.split("/").pop()),
        at: prev ? prev.at : ((m.at || "").replace(" ", "T") + (m.at ? "Z" : "")),
        a: m.a, b: m.b, label: "", odds_a: 2, odds_b: 2,
        // 이미 순위에 반영한 경기는 스코어·상태를 건드리지 않는다
        status: (prev && prev.counted) ? prev.status : (done ? "done" : "upcoming"),
        score_a: (prev && prev.counted) ? prev.score_a : (done ? m.scoreA : null),
        score_b: (prev && prev.counted) ? prev.score_b : (done ? m.scoreB : null),
      });
      m.sets.forEach(s => {
        const players = s.players.filter(p => p.pid).map(p => ({
          pid: p.pid, champ: p.champ, spell: "", k: p.k, d: p.d, a: p.a,
          cs: p.cs, gold: p.gold, items: "", runes: "",
        }));
        if (players.length) detailRows.push({ match_id: id, set_index: s.n - 1, win: s.win, players });
      });
    });

    // 같은 id 가 두 번 들어가면 upsert 전체가 실패한다
    const dedup = new Map();
    matchRows.forEach(r => dedup.set(r.id, r));
    const matchRowsU = [...dedup.values()];

    if (matchRowsU.length) {
      await sb("matches?on_conflict=id", {
        method: "POST", headers: { prefer: "resolution=merge-duplicates" },
        body: JSON.stringify(matchRowsU),
      });
    }
    if (detailRows.length) {
      await sb("match_details?on_conflict=match_id,set_index", {
        method: "POST", headers: { prefer: "resolution=merge-duplicates" },
        body: JSON.stringify(detailRows),
      });
    }

    // ── 경기 MVP(POM) ─────────────────────────────────────
    // LCK 공식 제도: 경기마다 MVP 1명에게 100pt. Leaguepedia 는 **세트마다** MVP 를 주므로
    // 한 경기에서 가장 많이 뽑힌 선수를 그 경기의 POM 으로 본다(동률이면 먼저 뽑힌 쪽).
    // MVP 칸이 없는 대회도 있어서, 실패해도 수집 전체를 멈추지 않는다.
    try {
      const mvpByMatch = {};
      for (const pg of pages) {
        if (Date.now() - started > 48000) break;      // 시간이 모자라면 MVP 는 다음에
        const mv = await fetchMVP(pg);
        mv.forEach(r => {
          const name = String(val(r, "MVP") || "").trim();
          if (!name) return;
          const mid = val(r, "MatchId");
          const c = (mvpByMatch[mid] = mvpByMatch[mid] || {});
          c[name] = (c[name] || 0) + 1;
        });
        if (pages.length > 1) await wait(1200);
      }
      // MVP 칸은 닉네임만 온다("Scout"). 선수 연결표는 Leaguepedia 링크 이름이 열쇠라
      // "Frog (Lee Min-hoi)" 처럼 괄호가 붙은 선수는 그대로는 못 찾는다 → 닉네임으로도 찾는다.
      const nickToId = {};
      (await sb("players?select=id,nick")).forEach(p => {
        const k = normNick(p.nick);
        if (k && !nickToId[k]) nickToId[k] = p.id;
      });
      const findPid = name => playerMap[name] || nickToId[normNick(name)] || null;

      const pomRows = [];
      let mvpUnknown = 0;
      Object.entries(mvpByMatch).forEach(([lpMid, counts]) => {
        const id = (byLpMatch[lpMid] || {}).id || (byMatch[lpMid] ? matchIdOf(lpMid) : null);
        if (!id) return;                       // 우리 경기표에 없는 경기는 건너뛴다
        const best = Object.entries(counts).sort((x, y) => y[1] - x[1])[0];
        const pid = best && findPid(best[0]);
        if (pid) pomRows.push({ match_id: id, player_id: pid, pts: 100, label: "경기 MVP" });
        else if (best) mvpUnknown++;
      });
      pomInfo = { 받은MVP: Object.keys(mvpByMatch).length, 못찾은선수: mvpUnknown };
      if (pomRows.length) {
        // pom_awards 의 유니크 인덱스가 부분 인덱스(match_id is not null)라
        // upsert 를 못 쓴다. 해당 경기 것만 지우고 다시 넣는다 (여러 번 눌러도 안전).
        const ids = pomRows.map(r => `"${r.match_id}"`).join(",");
        await sb(`pom_awards?match_id=in.(${encodeURIComponent(ids)})`, { method: "DELETE" });
        await sb("pom_awards", { method: "POST", body: JSON.stringify(pomRows) });
        pomSaved = pomRows.length;
      }
    } catch (e) { pomInfo = { 실패: (e.message || String(e)).slice(0, 80) }; }

    // 일정 자동 갱신이 어느 대회를 볼지 여기서 기억해 둔다 (api/schedule-sync.js 가 읽는다)
    try {
      const prev = JSON.parse((await loadSetting("schedule_sync")) || "{}");
      const pageList = [...new Set([...(prev.pages || []), ...pages])].slice(-6);
      await saveSetting("schedule_sync", JSON.stringify({
        ...prev, pages: pageList, tid: fallbackTid,
      }));
    } catch { /* 기억에 실패해도 수집 자체는 성공이다 */ }

    return ok(res, { ...summary, 저장함: true, 저장된경기: matchRowsU.length, 저장된세트: detailRows.length,
                     POM저장: pomSaved, POM상세: pomInfo, 선수등록: madePlayers,
                     대회: [...new Set(Object.values(tidOf).filter(Boolean))].join(", ") });
  } catch (e) {
    return fail(res, 500, e.message || String(e));
  }
};
