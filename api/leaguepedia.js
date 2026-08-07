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
const { val, wait, cargo, loadSetting, saveSetting, matchIdOf, stagePicker, autoLinkPlayers, checkAliases, resolveTid, buildNewPlayers, normNick, loadNameMaps, splitList, canonStage, posOf } = require("./_lp");

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

// Leaguepedia 는 한 번에 500행까지만 준다. 한 라운드는 선수 기록이 2,000행이 넘어서
// (경기 90 × 세트 3 × 선수 10) 나눠 받아야 한다. 받은 만큼 저장해 두고, 시간이 모자라면
// 다음에 **이어서** 받는다. 서버 함수는 60초 안에 끝나야 하므로 시간 예산을 둔다.
const PAGE_SIZE = 500;
// 저장해 둔 원본의 형식 번호. 받아 오는 칸을 늘리면 이 숫자를 올린다.
//   1 = KDA·CS·골드까지 / 2 = 아이템·룬·스펠·딜량·시야 추가
// 번호가 다르면 저장분을 버리고 새로 받는다 — 안 그러면 이어받기에서
// 아이템이 있는 행과 없는 행이 섞인다.
const RAW_VERSION = 3;

async function fetchRaw(page, deadline) {
  const ck = cacheKeyOf(page);
  let acc = null;
  try { acc = JSON.parse(await loadSetting(ck) || "null"); } catch { acc = null; }
  if (acc && acc.v !== RAW_VERSION) acc = null;          // 옛 형식은 버린다
  if (acc && acc.done && Date.now() - acc.t < CACHE_MINUTES * 60000) {
    return { rows: acc.rows, games: acc.games, cached: true, done: true, fetched: 0 };
  }

  const where = `OverviewPage='${page.replace(/'/g, "''")}'`;
  // 이어받기: 이미 받아 둔 게 있으면 그 뒤부터
  let rows = (acc && !acc.done && Array.isArray(acc.rows)) ? acc.rows.slice() : [];
  let done = false, fetched = 0, sgWarn = null, cacheWarn = null;

  // 페이지 나눠 받기가 어긋나지 않게 **고정된 순서**로 요청한다
  while (Date.now() < deadline) {
    const batch = await cargo({
      tables: "ScoreboardPlayers=SP",
      fields: "SP.GameId,SP.MatchId,SP.Link,SP.Champion,SP.Kills,SP.Deaths,SP.Assists,SP.CS,SP.Gold,"
        + "SP.Team,SP.Role,SP.Side,SP.PlayerWin,SP.DateTime_UTC,"
        + "SP.Items,SP.Trinket,SP.SummonerSpells,SP.KeystoneRune,SP.PrimaryTree,SP.SecondaryTree,"
        + "SP.DamageToChampions,SP.VisionScore,SP.Pentakills",
      where: "SP." + where,
      order_by: "SP.GameId ASC, SP.Link ASC",
      offset: String(rows.length),
      limit: String(PAGE_SIZE),
    }, 0, deadline);
    fetched += batch.length;
    rows = rows.concat(batch);
    if (batch.length < PAGE_SIZE) done = true;
    // ⚠ 체크포인트는 **항상** 남긴다. 예전에는 마지막 배치(500행 미만)일 때 곧바로 break 해서
    //   여기를 안 탔고, 그 뒤 무거운 단계에서 함수가 죽으면 진행이 하나도 안 남았다.
    //   그래서 몇 번을 눌러도 늘 처음부터 다시 받았다.
    try { await saveSetting(ck, JSON.stringify({ v: RAW_VERSION, t: Date.now(), rows, games: null, done: false })); }
    catch (e) { cacheWarn = (e && e.message || String(e)).slice(0, 80); }
    if (done) break;
    await wait(1200);        // 제한에 안 걸리는 게 재시도보다 싸다
  }

  // 세트(게임) 단위 기록 — 밴/픽 순서·타워·억제기·드래곤·바론·전령·팀 골드·경기 시간.
  // 예전에는 PlayerWin 칸이 없는 옛 대회에서 승패를 채울 때만 받았는데,
  // 이제는 스코어보드를 그리는 재료라서 **항상** 받는다.
  // 세트 하나당 1행뿐이라(한 라운드 100행 남짓) 요청 한 번이면 충분하다.
  let games = (acc && acc.v === RAW_VERSION && acc.games) || null;   // 이미 받아 둔 게 있으면 다시 안 받는다
  if (done && rows.length && !games && Date.now() < deadline) {
    try {
      games = await cargo({
        tables: "ScoreboardGames=SG",
        fields: "SG.MatchId,SG.GameId,SG.Team1,SG.Team2,SG.Winner,SG.WinTeam,SG.DateTime_UTC,SG.N_GameInMatch,"
          + "SG.Gamelength,SG.Team1Kills,SG.Team2Kills,SG.Team1Gold,SG.Team2Gold,"
          + "SG.Team1Towers,SG.Team2Towers,SG.Team1Inhibitors,SG.Team2Inhibitors,"
          + "SG.Team1Dragons,SG.Team2Dragons,SG.Team1Barons,SG.Team2Barons,"
          + "SG.Team1RiftHeralds,SG.Team2RiftHeralds,SG.Team1Bans,SG.Team2Bans,SG.Team1Picks,SG.Team2Picks",
        where: "SG." + where, order_by: "SG.GameId ASC", limit: "500",
      }, 0, deadline);
    } catch (e) {
      // 이 표가 없어도 선수 기록 수집은 계속돼야 한다. 다만 **조용히 넘기지 않는다** —
      // 예전에는 실패를 삼키고 done:true 로 굳혀서, 10분 동안 다시 시도조차 못 했다.
      games = null;
      sgWarn = (e && e.message || String(e)).slice(0, 90);
    }
  }

  // 스코어보드를 아직 못 받았으면 '다 받았다'고 확정하지 않는다 (다음에 이어서 받는다)
  const allDone = done && !!games;
  try { await saveSetting(ck, JSON.stringify({ v: RAW_VERSION, t: Date.now(), rows, games, done: allDone })); }
  catch (e) { cacheWarn = (e && e.message || String(e)).slice(0, 80); }
  return { rows, games, cached: false, done, fetched, sgWarn, cacheWarn };
}

// 세트 하나의 '경기 전체 기록'을 우리 모양으로 정리한다 (스코어보드 재료).
//
// ⚠ 여기서는 a/b 로 확정하지 않고 **팀 이름 그대로** 담는다.
//   승패와 같은 이유다 — Leaguepedia 의 Team1 과 우리 matches.a 는 다를 수 있어서,
//   저장 직전에 실제 경기의 a 와 대조해야 한다. (세트 승패가 통째로 뒤집혔던 그 문제)
function sgStats(x, champKo) {
  if (!x) return null;
  const ko = typeof champKo === "function" ? champKo : (v => String(v || "").trim());
  const t1 = String(val(x, "Team1") || "").trim();
  const t2 = String(val(x, "Team2") || "").trim();
  if (!t1 || !t2) return null;
  const num = v => { const n = Number(v); return Number.isFinite(n) && String(v).trim() !== "" ? n : null; };
  const side = i => ({
    kills:   num(val(x, `Team${i}Kills`)),
    gold:    num(val(x, `Team${i}Gold`)),
    towers:  num(val(x, `Team${i}Towers`)),
    inhib:   num(val(x, `Team${i}Inhibitors`)),
    dragons: num(val(x, `Team${i}Dragons`)),
    barons:  num(val(x, `Team${i}Barons`)),
    heralds: num(val(x, `Team${i}RiftHeralds`)),
    bans:    splitList(val(x, `Team${i}Bans`)).map(ko),
    picks:   splitList(val(x, `Team${i}Picks`)).map(ko),
  });
  const len = String(val(x, "Gamelength") || "").trim();
  const out = { len: len || null, byTeam: {} };
  out.byTeam[t1] = side(1);
  out.byTeam[t2] = side(2);
  // 담긴 게 하나도 없으면(칸이 비어 있는 대회) 저장하지 않는다
  const any = Object.values(out.byTeam).some(v =>
    v.kills != null || v.gold != null || v.bans.length || v.picks.length);
  return any || out.len ? out : null;
}

// 팀 이름 기준 기록을 **그 경기의 a/b** 기준으로 뒤집어 담는다.
// blueName 은 그 세트에 블루 진영이었던 팀 이름 (진영 표시에 쓴다).
function gameForSave(stats, blueName, teamMap, baseA) {
  if (!stats || !baseA) return null;
  const names = Object.keys(stats.byTeam);
  const sideOf = {};                       // 팀 이름 → "a" | "b"
  names.forEach(n => { const id = teamMap[n]; if (id) sideOf[n] = id === baseA ? "a" : "b"; });
  if (Object.keys(sideOf).length < 2) return null;   // 한쪽이라도 못 알아보면 담지 않는다

  const pair = key => {
    const o = {};
    names.forEach(n => { const v = stats.byTeam[n][key]; if (sideOf[n] && v != null) o[sideOf[n]] = v; });
    return Object.keys(o).length ? o : null;
  };
  const out = {};
  if (stats.len) out.len = stats.len;
  ["kills", "gold", "towers", "inhib", "dragons", "barons", "heralds", "bans", "picks"].forEach(k => {
    const v = pair(k);
    if (v && !(Array.isArray(v.a) && !v.a.length && Array.isArray(v.b) && !v.b.length)) out[k] = v;
  });
  if (blueName && sideOf[blueName]) out.blue = sideOf[blueName];
  return Object.keys(out).length ? out : null;
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

  // 대회 페이지는 | 로 여러 개 지정할 수 있다 (라운드 1-2 · Road to MSI · 3-4 등)
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
    const ko = await loadNameMaps();          // 아이템·룬·스펠 영어 → 한글
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
    const sgWarnAll = [], cacheWarnAll = [];
    const pageOf = {};                    // 경기 → 어느 대회 페이지에서 왔는지
    const doneOf = {};                    // 대회 페이지별로 끝까지 받았는지
    const progress = [];
    for (let i = 0; i < pages.length; i++) {
      const pg = pages[i];
      // 남은 시간을 남은 대회 수로 나눠 준다 (한 대회가 시간을 다 쓰지 않게)
      const left = pages.length - i;
      const remain = started + BUDGET_MS - Date.now();
      // 남은 시간이 없으면 요청을 내지 않는다. 예전에는 하한 3초를 강제로 줘서
      // 예산을 다 쓴 뒤에도 대회마다 요청이 하나씩 더 나갔고, 거기서 제한에 걸리면 함수가 죽었다.
      if (remain < 6000) {
        doneOf[pg] = false;
        progress.push(`${pg.split("/").pop()} 다음에 이어받음`);
        continue;
      }
      const share = Math.max(6000, remain / left);
      const got = await fetchRaw(pg, Date.now() + share);
      (got.rows || []).forEach(r => { pageOf[val(r, "MatchId")] = pg; });
      rows = rows.concat(got.rows || []);
      if (got.games) games = (games || []).concat(got.games);
      cached = cached || got.cached;
      doneOf[pg] = got.done;
      if (got.sgWarn) sgWarnAll.push(got.sgWarn);
      if (got.cacheWarn) cacheWarnAll.push(got.cacheWarn);
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

    // 세트 단위 기록을 그 세트에 붙인다 (+ PlayerWin 칸이 없는 옛 대회는 승패도 여기서 채운다)
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
        g.sg = x;                       // 스코어보드 재료 (밴픽·오브젝트·골드·시간)
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
        // ⚠⚠ 그런데 여기서의 A(=1세트 블루팀)와 실제 저장될 matches.a 는 다를 수 있다.
        //     matches.a 는 일정표(schedule-sync)가 Team1 으로 정하기 때문이다.
        //     그래서 여기서는 a/b 로 확정하지 말고 **이긴 팀 id** 를 그대로 들고 가서,
        //     저장 직전에 실제 경기의 a 와 대조해 a/b 를 정한다.
        //     (이 구분을 안 해서 7경기 16세트의 승패가 통째로 뒤집혀 저장돼 있었다 — 2026-08-07)
        const winnerName = names.find(n => g.teams[n].win) || null;
        const winIsA = winnerName === m.aName;
        if (winnerName) { if (winIsA) m.scoreA++; else m.scoreB++; }

        m.sets.push({
          n: setNoOf(g.gid) || m.sets.length + 1,
          win: winIsA ? "a" : "b",
          winTeam: winnerName ? (teamMap[winnerName] || null) : null,
          // 스코어보드 재료 — 팀 이름 기준. 저장 직전에 a/b 로 바꾼다.
          stats: sgStats(g.sg, champKo),
          blueName: blue,
          players: g.players.map(r => {
            const link = val(r, "Link");
            if (!playerMap[link]) {
              unknownPlayers.add(link);
              // 자동 등록에 쓸 소속·포지션을 함께 기억해 둔다
              if (!playerInfo[link]) playerInfo[link] = { team: teamMap[val(r, "Team")] || null, role: val(r, "Role") };
            }
            // 아이템·장신구·스펠·룬은 Leaguepedia 가 영어로 주므로 한글로 바꿔 저장한다
            const items = splitList(val(r, "Items")).map(ko.item);
            const trinket = String(val(r, "Trinket") || "").trim();
            if (trinket) items.push(ko.item(trinket));
            const spells = splitList(val(r, "SummonerSpells")).map(ko.spell);
            const keystone = ko.rune(val(r, "KeystoneRune"));
            const second = ko.rune(val(r, "SecondaryTree"));
            return {
              pid: playerMap[link] || null, lpName: link,
              // 그 세트에 어느 팀 소속으로 뛰었는가 — players.team(현재 소속)으로는
              // 이적 선수의 과거 경기를 판정할 수 없어 승/패·팀합계가 틀어진다.
              team: teamMap[val(r, "Team")] || null,
              champ: champKo(val(r, "Champion")),
              k: Number(val(r, "Kills")) || 0, d: Number(val(r, "Deaths")) || 0, a: Number(val(r, "Assists")) || 0,
              cs: Number(val(r, "CS")) || 0,
              // 그 세트에 어느 라인으로 뛰었는가 — 화면이 탑→정글→미드→원딜→서폿 순으로
              // 줄 세우는 데 쓴다 (리그피디아는 이름 알파벳순으로 준다)
              pos: posOf(val(r, "Role")) || null,
              gold: Math.round((Number(val(r, "Gold")) || 0) / 100) / 10,
              items: items.join(", "),
              spell: spells.join(", "),
              runes: [keystone, second].filter(Boolean).join("/"),
              dmg: Number(val(r, "DamageToChampions")) || 0,
              vs: Number(val(r, "VisionScore")) || 0,
              penta: Number(val(r, "Pentakills")) || 0,
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
    // 이게 없으면 지난 라운드의 이적·은퇴 선수 기록이 통째로 버려진다.
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

    const tidFixRows = [];        // 대회가 틀린 기존 경기 (대회만 고친다)
    const matches = Object.values(byMatch);
    matches.forEach(m => m.sets.sort((x, y) => x.n - y.n));
    // 자동 연결 결과를 세트 안의 선수에도 반영한다 (위에서 pid=null 로 채워졌으므로)
    matches.forEach(m => m.sets.forEach(st => st.players.forEach(p => {
      if (!p.pid && playerMap[p.lpName]) p.pid = playerMap[p.lpName];
    })));

    // 이름 연결표가 망가져 있으면 알려 준다 (두 이름 → 한 선수 = 기록이 조용히 사라진다)
    const health = checkAliases(playerMap, roster);

    // 조용히 넘어가면 안 되는 것들 (관리자 화면이 그대로 보여 준다)
    const warnings = [];
    if (sgWarnAll.length) warnings.push("스코어보드(밴픽·오브젝트) 를 아직 못 받았습니다: " + sgWarnAll[0]);
    if (cacheWarnAll.length) warnings.push("진행 저장에 실패했습니다 — 다시 눌러도 처음부터 받을 수 있습니다: " + cacheWarnAll[0]);

    const summary = {
      page, 경기수: matches.length,
      세트수: matches.reduce((n, m) => n + m.sets.length, 0),
      모르는팀: [...unknownTeams], 모르는선수: [...unknownPlayers].slice(0, 60),
      자동연결: Object.keys(auto.linked).length, 이름겹침: auto.ambiguous.slice(0, 10),
      연결겹침: health.merged.slice(0, 10), 연결의심: health.suspect.slice(0, 10),
      진행: progress, 끝까지받음: allDone, 선수등록: 0,
      저장된자료사용: !!cached, 저장함: false, 경고: warnings,
    };

    if (!apply) return ok(res, { ...summary, 미리보기: matches.slice(0, 2) });
    if (unknownTeams.size) return fail(res, 400, `팀 이름을 우리 팀과 연결해 주세요: ${[...unknownTeams].join(", ")}`);
    let pomSaved = 0, pomInfo = null;
    // 대회 페이지마다 우리 대회를 정한다 (없으면 만들어 준다 — 라운드 1-2 가 라운드 3-4 에 섞이지 않게)
    const tidOf = {};
    // ⚠ 수동으로 고른 대회(tid)는 **대회 페이지를 하나만 받을 때만** 쓴다.
    //   예전에는 페이지를 여러 개 받을 때도 그 하나를 전부에 찍어서,
    //   "시즌 전체"를 한 번 누르면 Road to MSI 경기까지 정규 라운드 3-4 대회로 들어갔다.
    //   (그게 Road to MSI 5경기가 엉뚱한 대회에 있던 최초 원인 — 2026-08-07)
    const singlePage = pages.length === 1;
    for (const pg of pages) tidOf[pg] = await resolveTid(pg, existing, singlePage ? tid : "");
    if (!singlePage && tid) warnings.push("대회를 여러 개 받을 때는 '우리 대회' 선택을 무시하고 페이지별로 정합니다");

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
        // 기존 경기라도 **대회가 틀렸으면** 그것만 바로잡는다.
        //   예전에는 이미 있는 경기의 tid 를 아예 안 건드려서, 한 번 잘못 들어간 대회가
        //   재수집을 몇 번 해도 그대로 굳었다. (Road to MSI 5경기가 정규 라운드 3-4 에
        //   들어가 있어 경기 목록에서 찾을 수 없었다 — 2026-08-07)
        if (prev && fallbackTid && prev.tid !== fallbackTid) tidFixRows.push({ id, tid: fallbackTid });
        // ★ 승패·편 가르기의 기준은 **실제 저장된 경기의 a** 다.
        //   Leaguepedia 의 1세트 블루팀(m.a)과 다를 수 있고, 다르면 전부 뒤집힌다.
        const baseA = prev ? prev.a : m.a;
        m.sets.forEach(s => {
          const win = s.winTeam && baseA ? (s.winTeam === baseA ? "a" : "b") : s.win;
          const players = s.players.filter(p => p.pid).map(p => ({
            pid: p.pid, champ: p.champ, spell: p.spell, k: p.k, d: p.d, a: p.a,
            cs: p.cs, gold: p.gold, items: p.items, runes: p.runes, pos: p.pos,
            dmg: p.dmg, vs: p.vs, penta: p.penta,
            side: p.team && baseA ? (p.team === baseA ? "a" : "b") : null,
          }));
          // ⚠ 스코어보드 값이 없으면 game 칸을 **아예 보내지 않는다.**
          //   빈 객체를 보내면 이미 잘 들어가 있던 밴픽·오브젝트가 통째로 지워진다
          //   (덜 받은 상태로 저장할 때마다 그런 일이 났다 — 2026-08-07)
          const game = gameForSave(s.stats, s.blueName, teamMap, baseA);
          if (players.length) {
            const row = { match_id: id, set_index: s.n - 1, win, players };
            if (game) row.game = game;
            detailRows.push(row);
          }
        });
        return;
      }
      // 일정 갱신(schedule-sync)이 정해 둔 대회·그룹·시각을 덮어쓰지 않는다.
      // 새 경기일 때만 팀으로 그룹을 정한다 (api/_lp.js stagePicker — 두 수집기가 같은 규칙)
      const pick = (pickers[pg] = pickers[pg] || stagePicker(stageRecords, pg));
      matchRows.push({
        id, lp_id: m.lpMatchId,
        tid: fallbackTid || (prev ? prev.tid : null),
        // 스테이지 이름은 순위표의 **정본 이름**으로 맞춘다. 폴백(페이지 꼬리표)이
        // 'Road to MSI'(소문자 t)를 만들어 'Road To MSI' 와 두 개로 갈렸던 자리다.
        stage: prev ? prev.stage : canonStage(stageRecords, pick(m.a, m.b) || pg.split("/").pop()),
        at: prev ? prev.at : ((m.at || "").replace(" ", "T") + (m.at ? "Z" : "")),
        a: m.a, b: m.b, label: "", odds_a: 2, odds_b: 2,
        // 이미 순위에 반영한 경기는 스코어·상태를 건드리지 않는다
        status: (prev && prev.counted) ? prev.status : (done ? "done" : "upcoming"),
        score_a: (prev && prev.counted) ? prev.score_a : (done ? m.scoreA : null),
        score_b: (prev && prev.counted) ? prev.score_b : (done ? m.scoreB : null),
      });
      // 새로 만드는 경기도 같은 규칙 — 여기서는 저장할 a 가 m.a 다
      m.sets.forEach(s => {
        const win = s.winTeam && m.a ? (s.winTeam === m.a ? "a" : "b") : s.win;
        const players = s.players.filter(p => p.pid).map(p => ({
          pid: p.pid, champ: p.champ, spell: p.spell, k: p.k, d: p.d, a: p.a,
          cs: p.cs, gold: p.gold, items: p.items, runes: p.runes, pos: p.pos,
          dmg: p.dmg, vs: p.vs, penta: p.penta,
          side: p.team && m.a ? (p.team === m.a ? "a" : "b") : null,
        }));
        const game = gameForSave(s.stats, s.blueName, teamMap, m.a);
        if (players.length) {
          const row = { match_id: id, set_index: s.n - 1, win, players };
          if (game) row.game = game;      // 없으면 칸을 빼서 기존 값을 지키다
          detailRows.push(row);
        }
      });
    });

    // 같은 id 가 두 번 들어가면 upsert 전체가 실패한다
    const dedup = new Map();
    matchRows.forEach(r => dedup.set(r.id, r));
    const matchRowsU = [...dedup.values()];

    // return=minimal — 이게 없으면 저장한 만큼(수백 KB)을 응답으로 그대로 되받아 읽는다.
    const PREF = { prefer: "resolution=merge-duplicates,return=minimal" };
    if (matchRowsU.length) {
      await sb("matches?on_conflict=id", { method: "POST", headers: PREF, body: JSON.stringify(matchRowsU) });
    }
    // 세트 상세는 한 행이 크다(선수 10명 + 밴픽·오브젝트). 통째로 보내면 요청 하나가 1MB 를 넘는다.
    for (let i = 0; i < detailRows.length; i += 60) {
      await sb("match_details?on_conflict=match_id,set_index", {
        method: "POST", headers: PREF, body: JSON.stringify(detailRows.slice(i, i + 60)),
      });
    }
    // 기존 경기가 엉뚱한 대회에 들어가 있으면 **대회만** 바로잡는다.
    // (스코어·스테이지·시각은 건드리지 않는다 — 그건 일정 갱신의 몫이다)
    if (tidFixRows.length) {
      await sb("matches?on_conflict=id", { method: "POST", headers: PREF, body: JSON.stringify(tidFixRows) });
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
    //
    // ⚠ 예전에는 여기서 `tid: fallbackTid` 를 넣었는데, fallbackTid 는 위쪽 경기 반복문
    //   **안에서만** 사는 값이라 여기서는 없는 이름이었다. 매번 오류가 났고 아래 빈 catch 가
    //   그걸 통째로 삼켜서, **대회 페이지 목록이 한 번도 저장된 적이 없다.**
    //   그래서 자동 일정 갱신이 볼 페이지를 못 찾았고, Road to MSI 경기가 제 대회로
    //   옮겨질 기회조차 없었다. (2026-08-07)
    //   대회는 페이지마다 다르므로 애초에 여기에 하나로 적을 값이 아니다 — 칸을 뺀다.
    try {
      const prev = JSON.parse((await loadSetting("schedule_sync")) || "{}");
      const pageList = [...new Set([...(prev.pages || []), ...pages])].slice(-6);
      await saveSetting("schedule_sync", JSON.stringify({ ...prev, pages: pageList }));
    } catch (e) {
      warnings.push("자동 갱신 대상 페이지를 기억하지 못했습니다: " + (e && e.message || e));
    }

    return ok(res, { ...summary, 저장함: true, 저장된경기: matchRowsU.length, 저장된세트: detailRows.length,
                     POM저장: pomSaved, POM상세: pomInfo, 선수등록: madePlayers,
                     대회고침: tidFixRows.length, 경고: warnings,
                     대회: [...new Set(Object.values(tidOf).filter(Boolean))].join(", ") });
  } catch (e) {
    return fail(res, 500, e.message || String(e));
  }
};
