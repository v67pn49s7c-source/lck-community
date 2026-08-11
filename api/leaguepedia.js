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
const { finishedMatchViolations } = require("../assets/invariants");
const { val, wait, cargo, loadSetting, saveSetting, matchIdOf, stagePicker, autoLinkPlayers, checkAliases, resolveTid, buildNewPlayers, normNick, loadNameMaps, splitList, canonStage, posOf } = require("./_lp");

const CACHE_MINUTES = 10;
const isWin = v => /^(1|yes|true)$/i.test(String(v || "").trim());
const PERSIST_MATCH_RPC = "rpc/persist_leaguepedia_match";
// 기존 경기 상세를 저장할 때는 일정표가 정한 A/B 팀이 기준이다. 이 두 칸이 빠지면
// Leaguepedia 1세트 블루팀을 A로 오인해 세트 승패와 선수 편이 다시 뒤집힌다.
const EXISTING_MATCH_SELECT = "id,lp_id,tid,stage,at,a,b,counted,status,score_a,score_b";

// ScoreboardGames의 승자 두 칸을 서로 대조한다. Winner가 비어 있으면 WinTeam만
// 쓸 수 있지만, 값이 들어 있는데 1/2가 아니거나 두 칸이 충돌하면 추정하지 않는다.
function scoreboardWinner(x) {
  if (!x) return { team: null, invalid: false };
  const t1 = String(val(x, "Team1") || "").trim();
  const t2 = String(val(x, "Team2") || "").trim();
  const code = String(val(x, "Winner") || "").trim();
  const named = String(val(x, "WinTeam") || "").trim();
  const declared = [];

  if ((code || named) && (!t1 || !t2 || t1 === t2)) return { team: null, invalid: true };
  if (code) {
    if (code === "1") declared.push(t1);
    else if (code === "2") declared.push(t2);
    else return { team: null, invalid: true };
  }
  if (named) {
    if (named !== t1 && named !== t2) return { team: null, invalid: true };
    declared.push(named);
  }
  const unique = [...new Set(declared)];
  if (unique.length > 1) return { team: null, invalid: true };
  return { team: unique[0] || null, invalid: false };
}

// PlayerWin과 ScoreboardGames는 어느 하나를 무조건 우선하지 않는다. 각 출처에서
// 정확히 한 팀만 가리키고, 둘 다 있으면 같은 팀일 때만 승자로 확정한다.
function resolveGameWinner(teams, scoreboard) {
  const playerWinners = Object.keys(teams || {}).filter(name => teams[name] && teams[name].win);
  if (playerWinners.length > 1) return null;
  const sg = scoreboardWinner(scoreboard);
  if (sg.invalid) return null;
  const candidates = [...playerWinners, ...(sg.team ? [sg.team] : [])];
  const unique = [...new Set(candidates)];
  return unique.length === 1 ? unique[0] : null;
}

// 신규 fallback 경기에는 일정 수집기가 가진 BestOf/최종 결과만 종료 증거로 쓴다.
// 페이지의 원본을 끝까지 받았다는 사실은 '현재 등록된 세트'가 끝이라는 뜻이지,
// 아직 진행될 다음 세트가 없다는 뜻이 아니다.
function seriesCompletionProof(match, schedule) {
  const scoreA = Number(match && match.scoreA), scoreB = Number(match && match.scoreB);
  if (!Number.isInteger(scoreA) || scoreA < 0 || !Number.isInteger(scoreB) || scoreB < 0) {
    return { complete: false, reason: "수집 스코어가 올바르지 않음" };
  }

  const rawBestOf = String(val(schedule || {}, "BestOf") || "").trim();
  if (rawBestOf) {
    const bestOf = Number(rawBestOf);
    if (!Number.isInteger(bestOf) || bestOf < 1 || bestOf % 2 !== 1) {
      return { complete: false, reason: `BestOf 값을 확인할 수 없음 (${rawBestOf})` };
    }
    const scheduleA = String(val(schedule, "Team1") || "").trim();
    const scheduleB = String(val(schedule, "Team2") || "").trim();
    const samePair = scheduleA === match.aName && scheduleB === match.bName;
    const reversePair = scheduleA === match.bName && scheduleB === match.aName;
    if (!scheduleA || !scheduleB || scheduleA === scheduleB || (!samePair && !reversePair)) {
      return { complete: false, reason: "BestOf 일정의 두 팀이 수집 경기와 일치하지 않음" };
    }
    const requiredWins = Math.floor(bestOf / 2) + 1;
    const aClinched = scoreA === requiredWins && scoreB < requiredWins;
    const bClinched = scoreB === requiredWins && scoreA < requiredWins;
    return aClinched !== bClinched
      ? { complete: true, source: `BO${bestOf}`, requiredWins }
      : { complete: false, reason: `BO${bestOf} 종료 필요 승수 ${requiredWins}에 못 미침` };
  }

  // BestOf가 없는 옛 일정은 일정표의 팀·최종 스코어·승자가 모두 이번 수집 결과와
  // 정확히 일치할 때만 종료를 인정한다. Winner가 단지 비어 있지 않다는 이유로는 부족하다.
  if (!schedule) return { complete: false, reason: "BestOf 또는 일정 최종 결과가 없음" };
  const t1 = String(val(schedule, "Team1") || "").trim();
  const t2 = String(val(schedule, "Team2") || "").trim();
  const s1Raw = String(val(schedule, "Team1Score") || "").trim();
  const s2Raw = String(val(schedule, "Team2Score") || "").trim();
  const winnerRaw = String(val(schedule, "Winner") || "").trim();
  const s1 = Number(s1Raw), s2 = Number(s2Raw);
  if (!t1 || !t2 || !s1Raw || !s2Raw || !winnerRaw
      || !Number.isInteger(s1) || s1 < 0 || !Number.isInteger(s2) || s2 < 0 || s1 === s2) {
    return { complete: false, reason: "일정 최종 결과가 완전하지 않음" };
  }
  const winner = winnerRaw === "1" || winnerRaw === t1 ? t1
    : winnerRaw === "2" || winnerRaw === t2 ? t2 : null;
  const collectedWinner = scoreA > scoreB ? match.aName : scoreB > scoreA ? match.bName : null;
  const sameOrder = t1 === match.aName && t2 === match.bName && s1 === scoreA && s2 === scoreB;
  const reverseOrder = t1 === match.bName && t2 === match.aName && s1 === scoreB && s2 === scoreA;
  return winner && collectedWinner && winner === collectedWinner && (sameOrder || reverseOrder)
    ? { complete: true, source: "일정 최종 결과", requiredWins: null }
    : { complete: false, reason: "일정 최종 결과가 수집 결과와 일치하지 않음" };
}

// 실제 신규 fallback match 행 생성 경로가 이 결과만 사용한다. 테스트도 이 함수를
// 직접 고정해 1:0 BO3가 다시 done 행으로 변하는 회귀를 막는다.
function newFallbackCompletion(match, schedule) {
  const proof = seriesCompletionProof(match, schedule);
  return {
    ...proof,
    matchState: proof.complete
      ? { status: "done", score_a: Number(match.scoreA), score_b: Number(match.scoreB) }
      : null,
  };
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

// ── 원본 받아오기 (캐시 우선) ──
const cacheKeyOf = page => "lp_cache_" + page.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 48);
// schedule-sync.js가 이미 받은 MatchSchedule 원본. fallback 경기를 새로 만들 때
// BestOf를 다시 외부 호출하지 않고 이 캐시에서 종료 증거를 가져온다.
const scheduleCacheKeyOf = page => "lp_sched_" + page.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 48);

// Leaguepedia 는 한 번에 500행까지만 준다. 한 라운드는 선수 기록이 2,000행이 넘어서
// (경기 90 × 세트 3 × 선수 10) 나눠 받아야 한다. 받은 만큼 저장해 두고, 시간이 모자라면
// 다음에 **이어서** 받는다. 서버 함수는 60초 안에 끝나야 하므로 시간 예산을 둔다.
const PAGE_SIZE = 500;
// 저장해 둔 원본의 형식 번호. 받아 오는 칸을 늘리면 이 숫자를 올린다.
//   1 = KDA·CS·골드까지 / 2 = 아이템·룬·스펠·딜량·시야 추가
// 번호가 다르면 저장분을 버리고 새로 받는다 — 안 그러면 이어받기에서
// 아이템이 있는 행과 없는 행이 섞인다.
const RAW_VERSION = 3;

// 받아 둔 조각을 순서대로 이어 붙인다 (lp_cache_<페이지>_p0, _p1, …).
//
// ⚠ 예전에는 조각을 안 나누고 **한 칸에 통째로** 저장했다. 배치를 받을 때마다
//   지금까지 받은 전부를 다시 올려서, 500행→1,000행→1,500행… 갈수록 무거워졌다
//   (라운드 1-2 한 대회를 받는 동안 누적 3.7MB 업로드). 그 업로드가 40초 예산을
//   다 먹어 라운드 3-4 는 손도 못 대고 끝났다. (2026-08-07)
//   이제는 **새로 받은 조각만** 올린다.
async function loadChunks(ck) {
  const head = JSON.parse((await loadSetting(ck)) || "null");
  if (!head || head.v !== RAW_VERSION) return null;
  const rows = [];
  for (let i = 0; i < (head.parts || 0); i++) {
    const raw = await loadSetting(`${ck}_p${i}`);
    if (!raw) return null;                       // 조각이 하나라도 없으면 처음부터
    try { rows.push(...JSON.parse(raw)); } catch { return null; }
  }
  return { ...head, rows };
}

async function fetchRaw(page, deadline) {
  const ck = cacheKeyOf(page);
  let acc = null;
  try { acc = await loadChunks(ck); } catch { acc = null; }
  if (acc && acc.done && Date.now() - acc.t < CACHE_MINUTES * 60000) {
    return { rows: acc.rows, games: acc.games, cached: true, done: true, fetched: 0 };
  }

  const where = `OverviewPage='${page.replace(/'/g, "''")}'`;
  // 이어받기: 이미 받아 둔 게 있으면 그 뒤부터
  let rows = (acc && !acc.done && Array.isArray(acc.rows)) ? acc.rows.slice() : [];
  let parts = (acc && !acc.done && acc.parts) || 0;
  let done = false, fetched = 0, sgWarn = null, cacheWarn = null;

  // 페이지 나눠 받기가 어긋나지 않게 **고정된 순서**로 요청한다
  while (Date.now() < deadline) {
    const batch = await cargo({
      tables: "ScoreboardPlayers=SP",
      fields: "SP.GameId,SP.MatchId,SP.Link,SP.Champion,SP.Kills,SP.Deaths,SP.Assists,SP.CS,SP.Gold,"
        + "SP.Team,SP.Role,SP.Side,SP.PlayerWin,SP.DateTime_UTC,"
        + "SP.Items,SP.Trinket,SP.SummonerSpells,SP.KeystoneRune,SP.SecondaryTree,"
        + "SP.DamageToChampions,SP.VisionScore,SP.Pentakills",
      where: "SP." + where,
      order_by: "SP.GameId ASC, SP.Link ASC",
      offset: String(rows.length),
      limit: String(PAGE_SIZE),
    }, 0, deadline);
    fetched += batch.length;
    rows = rows.concat(batch);
    if (batch.length < PAGE_SIZE) done = true;
    // ⚠ 체크포인트는 **항상** 남긴다. 마지막 배치에서 곧바로 break 하면, 그 뒤 무거운
    //   단계에서 함수가 죽었을 때 진행이 하나도 안 남아 늘 처음부터 다시 받게 된다.
    //   **새로 받은 조각만** 올린다 (누적 전체를 다시 올리면 갈수록 느려진다).
    try {
      if (batch.length) await saveSetting(`${ck}_p${parts}`, JSON.stringify(batch));
      if (batch.length) parts++;
      await saveSetting(ck, JSON.stringify({ v: RAW_VERSION, t: Date.now(), parts, games: null, done: false }));
    } catch (e) { cacheWarn = (e && e.message || String(e)).slice(0, 80); }
    if (done) break;
    await wait(600);         // 제한에 안 걸리는 게 재시도보다 싸다 (너무 길면 예산을 먹는다)
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
          + "SG.Team1RiftHeralds,SG.Team2RiftHeralds,SG.Team1Bans,SG.Team2Bans,SG.Team1Picks,SG.Team2Picks,"
          // 드래곤 종류별 · 아타칸 · 공허충 — 표에 이 칸들이 다 있다(확인함)
          + "SG.Team1Infernals,SG.Team2Infernals,SG.Team1Mountains,SG.Team2Mountains,"
          + "SG.Team1Oceans,SG.Team2Oceans,SG.Team1Clouds,SG.Team2Clouds,"
          + "SG.Team1Hextechs,SG.Team2Hextechs,SG.Team1Chemtechs,SG.Team2Chemtechs,"
          + "SG.Team1Elders,SG.Team2Elders,SG.Team1Atakhans,SG.Team2Atakhans,"
          + "SG.Team1VoidGrubs,SG.Team2VoidGrubs,"
          // 다시보기·공식 전적·패치 (팬이 바로 눌러 볼 수 있게)
          + "SG.VOD,SG.MatchHistory,SG.Patch",
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
  try { await saveSetting(ck, JSON.stringify({ v: RAW_VERSION, t: Date.now(), parts, games, done: allDone })); }
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
  // 드래곤 종류 — 화면이 아이콘으로 그린다. 0 인 종류는 담지 않는다.
  const DRAKES = [["infernal","Infernals"],["mountain","Mountains"],["ocean","Oceans"],
                  ["cloud","Clouds"],["hextech","Hextechs"],["chemtech","Chemtechs"],["elder","Elders"]];
  const side = i => {
    const drakes = {};
    DRAKES.forEach(([k, f]) => { const n = num(val(x, `Team${i}${f}`)); if (n) drakes[k] = n; });
    return {
      kills:   num(val(x, `Team${i}Kills`)),
      gold:    num(val(x, `Team${i}Gold`)),
      towers:  num(val(x, `Team${i}Towers`)),
      inhib:   num(val(x, `Team${i}Inhibitors`)),
      dragons: num(val(x, `Team${i}Dragons`)),
      barons:  num(val(x, `Team${i}Barons`)),
      heralds: num(val(x, `Team${i}RiftHeralds`)),
      atakhan: num(val(x, `Team${i}Atakhans`)),
      grubs:   num(val(x, `Team${i}VoidGrubs`)),
      drakes:  Object.keys(drakes).length ? drakes : null,
      bans:    splitList(val(x, `Team${i}Bans`)).map(ko),
      picks:   splitList(val(x, `Team${i}Picks`)).map(ko),
    };
  };
  const len = String(val(x, "Gamelength") || "").trim();
  const vod = String(val(x, "VOD") || "").trim();
  const mh = String(val(x, "MatchHistory") || "").trim();
  const patch = String(val(x, "Patch") || "").trim();
  const out = { len: len || null, vod: vod || null, mh: mh || null, patch: patch || null, byTeam: {} };
  out.byTeam[t1] = side(1);
  out.byTeam[t2] = side(2);
  // 담긴 게 하나도 없으면(칸이 비어 있는 대회) 저장하지 않는다
  const any = Object.values(out.byTeam).some(v =>
    v.kills != null || v.gold != null || v.bans.length || v.picks.length);
  return any || out.len ? out : null;
}

// 팀 이름 기준 기록을 **그 경기의 a/b** 기준으로 뒤집어 담는다.
// blueName 은 그 세트에 블루 진영이었던 팀 이름 (진영 표시에 쓴다).
function gameForSave(stats, blueName, teamMap, baseA, baseB) {
  if (!stats || !baseA || !baseB) return null;
  const names = Object.keys(stats.byTeam);
  const sideOf = {};                       // 팀 이름 → "a" | "b"
  names.forEach(n => {
    const side = sideForTeam(teamMap[n], baseA, baseB);
    if (side) sideOf[n] = side;
  });
  if (Object.keys(sideOf).length < 2) return null;   // 한쪽이라도 못 알아보면 담지 않는다

  const pair = key => {
    const o = {};
    names.forEach(n => { const v = stats.byTeam[n][key]; if (sideOf[n] && v != null) o[sideOf[n]] = v; });
    return Object.keys(o).length ? o : null;
  };
  const out = {};
  if (stats.len) out.len = stats.len;
  if (stats.vod) out.vod = stats.vod;         // 경기 다시보기
  if (stats.mh) out.mh = stats.mh;            // 라이엇 공식 전적
  if (stats.patch) out.patch = stats.patch;
  ["kills", "gold", "towers", "inhib", "dragons", "barons", "heralds",
   "atakhan", "grubs", "drakes", "bans", "picks"].forEach(k => {
    const v = pair(k);
    if (v && !(Array.isArray(v.a) && !v.a.length && Array.isArray(v.b) && !v.b.length)) out[k] = v;
  });
  if (blueName && sideOf[blueName]) out.blue = sideOf[blueName];
  return Object.keys(out).length ? out : null;
}

// 팀 id를 실제 저장 경기의 A/B로 바꾼다. 모르는 팀을 무조건 B로 보내면 데이터가
// 그럴듯하게 오염되므로, 둘 중 어느 쪽인지 증명할 수 없을 때는 null로 실패시킨다.
function sideForTeam(teamId, baseA, baseB) {
  if (!teamId || !baseA || !baseB || baseA === baseB) return null;
  if (teamId === baseA) return "a";
  if (teamId === baseB) return "b";
  return null;
}

/** Leaguepedia 세트 하나를 DB 행으로 바꾼다.
 *  반환: { row, violations }. violations가 있으면 호출자는 그 세트를 저장하면 안 된다. */
function detailRowForSave(matchId, set, baseA, baseB, teamMap) {
  const violations = [];
  if (!matchId) violations.push("경기 id가 없음");
  if (!baseA || !baseB || baseA === baseB) violations.push("저장 경기의 A/B 팀을 확인할 수 없음");

  const setIndex = Number(set && set.n) - 1;
  if (!Number.isInteger(setIndex) || setIndex < 0) violations.push("세트 번호가 올바르지 않음");

  const win = sideForTeam(set && set.winTeam, baseA, baseB);
  if (!win) violations.push("승리팀을 저장 경기의 A/B와 연결할 수 없음");

  const sourcePlayers = (set && set.players) || [];
  const linkedPlayers = sourcePlayers.filter(p => p && p.pid);
  if (linkedPlayers.length !== sourcePlayers.length) {
    violations.push(`선수 연결 누락 ${sourcePlayers.length - linkedPlayers.length}명`);
  }

  const players = linkedPlayers.map(p => {
    const side = sideForTeam(p.team, baseA, baseB);
    if (!side) violations.push(`선수 ${p.pid}의 팀을 저장 경기 A/B와 연결할 수 없음`);
    return {
      pid: p.pid, champ: p.champ, spell: p.spell, k: p.k, d: p.d, a: p.a,
      cs: p.cs, gold: p.gold, items: p.items, trinket: p.trinket, runes: p.runes, pos: p.pos,
      dmg: p.dmg, vs: p.vs, penta: p.penta, side,
    };
  });

  const uniquePids = new Set(players.map(p => p.pid));
  if (uniquePids.size !== players.length) violations.push("같은 선수가 한 세트에 중복됨");
  const sideA = players.filter(p => p.side === "a").length;
  const sideB = players.filter(p => p.side === "b").length;
  // 페이지 경계에서 한 세트의 선수 행이 반쪽만 들어온 상태를 기존 상세 위에 덮어쓰지 않는다.
  if (sideA !== 5 || sideB !== 5) violations.push(`출전 명단이 5:5가 아님 (${sideA}:${sideB})`);

  if (violations.length) return { row: null, violations };
  const row = { match_id: matchId, set_index: setIndex, win, players };
  const game = gameForSave(set.stats, set.blueName, teamMap, baseA, baseB);
  if (game) row.game = game;
  return { row, violations: [] };
}

/** 종료 경기 스코어와 어긋난 경기의 상세 행은 전부 격리한다.
 *  한 경기에서 일부 세트만 차단하면 기존·신규 데이터가 섞여 더 알아보기 어려워진다. */
function filterSafeDetailRows(matchById, detailRows) {
  const setsByMatch = {};
  detailRows.forEach(r =>
    (setsByMatch[r.match_id] = setsByMatch[r.match_id] || []).push({ win: r.win, _idx: r.set_index }));

  const blocked = new Set(), violations = [];
  Object.keys(setsByMatch).forEach(mid => {
    const mr = matchById.get(mid);
    if (!mr) {
      blocked.add(mid);
      violations.push({ matchId: mid, messages: ["경기 스코어·상태를 확인할 수 없음"] });
      return;
    }
    const sets = setsByMatch[mid].slice().sort((x, y) => x._idx - y._idx);
    const bad = finishedMatchViolations(
      { status: mr.status, score_a: mr.score_a, score_b: mr.score_b },
      sets);
    // 공개 화면은 수집 중인 일부 세트를 보여 줄 수 있지만, DB 저장은 더 엄격해야 한다.
    // 종료 경기에서 이번 요청이 전 세트를 갖고 있지 않으면 기존 행과 섞여 어느 쪽이
    // 최신·정상인지 증명할 수 없으므로, 0..최종세트수-1 완전집합일 때만 덮어쓴다.
    if (mr.status === "done" && mr.score_a != null && mr.score_b != null) {
      const total = mr.score_a + mr.score_b;
      const seen = new Set(sets.map(s => s._idx));
      const complete = sets.length === total
        && Array.from({ length: total }, (_, i) => i).every(i => seen.has(i));
      if (!complete) bad.push(`종료 경기 상세가 전 세트 완전집합이 아님 (${sets.length}/${total})`);
    }
    if (bad.length) {
      blocked.add(mid);
      violations.push({ matchId: mid, messages: bad });
    }
  });
  return {
    rows: detailRows.filter(r => !blocked.has(r.match_id)),
    blocked: [...blocked],
    violations,
  };
}

/** 신규 종료 경기는 경기 행과 상세 행을 한 묶음으로 검증한다.
 *  세트 하나라도 변환·최종 검사에 실패했거나, 최종 스코어만큼의 상세가 0부터
 *  빠짐없이 모이지 않았으면 둘 다 저장하지 않는다. 기존 경기와 진행 중 경기는
 *  이 함수의 격리 대상이 아니다. */
function gateNewFinishedMatches(matchRows, detailRows, buildFailedMatchIds, detailFailedMatchIds) {
  const buildFailed = new Set(buildFailedMatchIds || []);
  const detailFailed = new Set(detailFailedMatchIds || []);
  const detailsByMatch = {};
  detailRows.forEach(r =>
    (detailsByMatch[r.match_id] = detailsByMatch[r.match_id] || []).push(r));

  const blocked = new Set(), violations = [];
  (matchRows || []).forEach(mr => {
    if (!mr || mr.status !== "done") return;
    const messages = [];
    if (buildFailed.has(mr.id)) messages.push("한 세트 이상 상세 변환에 실패함");
    if (detailFailed.has(mr.id)) messages.push("경기 상세 최종 정합성 검사에 실패함");

    const scoreA = Number(mr.score_a), scoreB = Number(mr.score_b);
    const validScore = Number.isInteger(scoreA) && scoreA >= 0
      && Number.isInteger(scoreB) && scoreB >= 0 && scoreA + scoreB > 0;
    if (!validScore) {
      messages.push("종료 경기 최종 스코어를 확인할 수 없음");
    } else {
      const total = scoreA + scoreB;
      const sets = detailsByMatch[mr.id] || [];
      const seen = new Set(sets.map(r => r.set_index));
      const complete = sets.length === total
        && Array.from({ length: total }, (_, i) => i).every(i => seen.has(i));
      if (!complete) messages.push(`신규 종료 경기 상세가 전 세트 완전집합이 아님 (${sets.length}/${total})`);
    }

    if (messages.length) {
      blocked.add(mr.id);
      violations.push({ matchId: mr.id, messages });
    }
  });

  return {
    matchRows: (matchRows || []).filter(r => !blocked.has(r.id)),
    detailRows: detailRows.filter(r => !blocked.has(r.match_id)),
    blocked: [...blocked],
    violations,
  };
}

// 경기/상세는 반드시 한 경기씩 같은 DB 트랜잭션으로 보낸다. 신규 경기 행이 상세보다
// 먼저 남거나, 상세 일부만 저장된 채 요청이 끊기는 상태를 REST 여러 번 호출로 만들지 않는다.
// 대회(tid)만 고치는 기존 경기 역시 같은 RPC에 넣어 상세와 함께 실패/성공하게 한다.
function buildPersistenceBundles(matchRows, detailRows, tidFixRows) {
  const matchById = new Map();
  (matchRows || []).forEach(row => {
    if (!row || !row.id || matchById.has(row.id)) throw new Error("저장할 경기 id가 없거나 중복됩니다");
    matchById.set(row.id, row);
  });

  const detailsById = new Map();
  (detailRows || []).forEach(row => {
    if (!row || !row.match_id) throw new Error("저장할 세트의 경기 id가 없습니다");
    const rows = detailsById.get(row.match_id) || [];
    rows.push(row);
    detailsById.set(row.match_id, rows);
  });

  const tidById = new Map();
  (tidFixRows || []).forEach(row => {
    if (!row || !row.id || !row.tid) throw new Error("대회 교정 대상 id/tid가 없습니다");
    if (tidById.has(row.id) && tidById.get(row.id) !== row.tid) {
      throw new Error(`한 경기의 대회 교정값이 충돌합니다: ${row.id}`);
    }
    tidById.set(row.id, row.tid);
  });

  // 세 가지 입력의 합집합을 써야 상세가 없는 tid 전용 교정도 누락되지 않는다.
  const ids = [...new Set([
    ...matchById.keys(), ...detailsById.keys(), ...tidById.keys(),
  ])];
  return ids.map(matchId => {
    const match = matchById.get(matchId) || null;
    const details = detailsById.get(matchId) || [];
    // 신규 fallback 경기만 단독으로 생기는 경로는 허용하지 않는다.
    if (match && !details.length) {
      throw new Error(`신규 경기 ${matchId}의 상세가 없어 원자 저장을 중단합니다`);
    }
    return {
      matchId,
      match,
      details,
      tid: tidById.get(matchId) || null,
    };
  });
}

async function persistMatchBundles(sbCall, matchRows, detailRows, tidFixRows) {
  const bundles = buildPersistenceBundles(matchRows, detailRows, tidFixRows);
  for (const bundle of bundles) {
    await sbCall(PERSIST_MATCH_RPC, {
      method: "POST",
      body: JSON.stringify({
        p_match_id: bundle.matchId,
        p_match: bundle.match,
        p_details: bundle.details,
        p_tid: bundle.tid,
      }),
    });
  }
  return bundles;
}

function shouldBlockIncompleteFallback(prev, pageDone) {
  return !prev && !pageDone;
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
  const reqStart = Date.now();          // 준비 작업까지 포함한 진짜 시작 시각

  // 실행할 수 있는 세 경우
  //   ① Vercel 크론 (Authorization: Bearer <CRON_SECRET>) — 매일 자동
  //   ② 예약 작업 토큰 (x-task-token / ?token=)
  //   ③ 관리자가 관리자 화면에서 누른 경우
  // 크론을 붙이기 전에는 ③ 뿐이라 사람이 매번 눌러야 했다. (2026-08-07)
  const auth = String(req.headers.authorization || "");
  const secret = process.env.CRON_SECRET || process.env.ADMIN_TASK_TOKEN || "";
  const byCron = !!secret && auth === `Bearer ${secret}`;
  if (!byCron) {
    try { await requireAdmin(req); }
    catch (e) { return fail(res, e.status || 500, e.message); }
  }

  // 대회 페이지는 | 로 여러 개 지정할 수 있다 (라운드 1-2 · Road to MSI · 3-4 등)
  let pages = String(req.query.page || "").split("|").map(x => x.trim()).filter(Boolean);
  // 크론은 주소에 아무것도 안 붙이므로, 관리자가 마지막에 받아 둔 대회 목록을 쓴다
  // (그 목록은 수집이 끝날 때 schedule_sync.pages 에 저장된다)
  if (!pages.length && byCron) {
    try {
      const st = JSON.parse((await loadSetting("schedule_sync")) || "{}");
      pages = (st.pages || []).filter(Boolean);
    } catch { pages = []; }
  }
  const tid = (req.query.tid || "").trim();
  const apply = req.query.apply === "1" || byCron;      // 크론은 늘 저장까지 한다
  const addPlayers = req.query.newplayers === "1" || byCron;
  if (!pages.length) return fail(res, 400, "대회 페이지를 입력해 주세요 (예: LCK/2026 Season/Rounds 3-4)");

  try {
    const aliases = JSON.parse((await loadSetting("lp_aliases")) || "{}");
    const teamMap = aliases.teams || {};
    const playerMap = { ...(aliases.players || {}) };
    const champKo = await loadChampNames();
    const ko = await loadNameMaps();          // 아이템·룬·스펠 영어 → 한글
    const roster = await sb("players?select=id,nick,team");
    const existing = await sb(`matches?select=${EXISTING_MATCH_SELECT}`);
    const byLpMatch = {};
    existing.forEach(m => { if (m.lp_id) byLpMatch[m.lp_id] = m; });
    let stageRecords = [];
    try { stageRecords = await sb("stage_records?select=id,name,ord,records"); } catch {}

    // 서버 함수는 60초 안에 끝나야 한다.
    // ⚠ started 를 여기서 찍으면 그 앞의 준비 작업(관리자 확인·이름표 내려받기 11회·
    //   선수/경기/스테이지 조회)이 예산 밖이 된다. 실제로는 이미 3~5초를 쓴 뒤다.
    //   그래서 예산을 32초로 잡고, 뒤에 오는 저장·MVP 에 여유를 남긴다. (2026-08-07)
    const started = reqStart;
    const BUDGET_MS = 32000;
    let rows = [], games = null, cached = false;
    const sgWarnAll = [], cacheWarnAll = [];
    const pageOf = {};                    // 경기 → 어느 대회 페이지에서 왔는지
    const seriesMetaByLp = new Map();     // MatchSchedule의 BestOf·공식 최종 결과
    const doneOf = {};                    // 대회 페이지별로 끝까지 받았는지
    const progress = [];
    // ⚠ **아직 못 받은 대회를 먼저** 받는다.
    //   예전에는 적힌 순서대로 받아서, '시즌 전체'를 누르면 라운드 1-2(2,250행)가
    //   예산을 다 먹고 정작 진행 중인 라운드 3-4 는 손도 못 댔다. (2026-08-07)
    const doneAlready = {};
    for (const pg of pages) {
      try {
        const h = JSON.parse((await loadSetting(cacheKeyOf(pg))) || "null");
        doneAlready[pg] = !!(h && h.v === RAW_VERSION && h.done);
      } catch { doneAlready[pg] = false; }
    }
    const order = [...pages].sort((a, b) => (doneAlready[a] ? 1 : 0) - (doneAlready[b] ? 1 : 0));

    for (let i = 0; i < order.length; i++) {
      const pg = order[i];
      // 일정 수집기가 받아 둔 정본 메타만 쓴다. 없으면 신규 fallback 경기는 아래에서
      // 보수적으로 차단한다. 원본 페이지 완료 여부를 시리즈 종료 증거로 쓰지 않는다.
      try {
        const cachedSchedule = JSON.parse((await loadSetting(scheduleCacheKeyOf(pg))) || "null");
        (cachedSchedule && Array.isArray(cachedSchedule.rows) ? cachedSchedule.rows : []).forEach(r => {
          const lpId = String(val(r, "MatchId") || "").trim();
          if (lpId) seriesMetaByLp.set(lpId, r);
        });
      } catch { /* 일정 캐시가 없거나 깨졌으면 신규 fallback 경기만 차단한다 */ }
      // 남은 시간을 남은 대회 수로 나눠 준다 (한 대회가 시간을 다 쓰지 않게)
      const left = order.length - i;
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

    // 세트 단위 기록을 그 세트에 붙인다. 승자는 아래에서 PlayerWin과 Winner/WinTeam을
    // 교차 검증한 뒤 정한다 — 한 출처를 먼저 true로 합치면 충돌을 알아낼 수 없다.
    if (games) {
      games.forEach(x => {
        const g = byGame[val(x, "GameId")];
        if (!g) return;
        const t1 = val(x, "Team1"), t2 = val(x, "Team2");
        g.teams[t1] = g.teams[t1] || { side: "1", win: false };
        g.teams[t2] = g.teams[t2] || { side: "2", win: false };
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
        const winnerName = resolveGameWinner(g.teams, g.sg);
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
            // ⚠ 장신구(와드·렌즈)는 **아이템이 아니다.** 아이템 칸에 끼워 넣으면
            //   6칸 아이템 사이에 와드가 섞여 보인다. 따로 담는다. (2026-08-08)
            const items = splitList(val(r, "Items")).map(ko.item);
            const trinket = String(val(r, "Trinket") || "").trim();
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
              trinket: trinket ? ko.item(trinket) : "",
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
    let rejectedDetailSets = 0;
    const rejectedDetailMatchIds = new Set();
    const blockedFallbackMatchIds = new Set();
    const prevInfoById = {};   // 기존 경기의 status·스코어 (정합성 검사가 신규뿐 아니라 기존도 보게)
    const pickers = {};
    matches.forEach(m => {
      const prev = byLpMatch[m.lpMatchId];
      const id = prev ? prev.id : matchIdOf(m.lpMatchId);
      const pg = pageOf[m.lpMatchId] || pages[0];
      const fallbackTid = tidOf[pg] || null;
      // 일정 갱신이 이미 만들어 둔 경기는 손대지 않는다 — 일정·스코어·그룹의 주인은 그쪽이다.
      // 아직 없는 경기는 대회를 끝까지 받고, 아래에서 시리즈 종료까지 증명될 때만 만든다.
      // (페이지 완료만으로는 진행 중 BO3의 1:0을 최종 결과로 오인할 수 있다)
      // 페이지를 끝까지 받지 못했고 일정표에도 없는 신규 fallback은 경기 행이 없다.
      // 상세뿐 아니라 POM까지 반드시 같은 경기 id로 차단해야 orphan 수상이 생기지 않는다.
      if (shouldBlockIncompleteFallback(prev, doneOf[pg])) {
        blockedFallbackMatchIds.add(id);
        rejectedDetailSets += m.sets.length;
        warnings.push(`정합성 ${id}: 대회 페이지를 끝까지 받지 못함 — 신규 fallback 경기·상세·POM 저장 차단`);
        return;
      }
      if (prev) {
        // 이 경기가 종료 상태로 저장돼 있으면 정합성 검사 대상에 넣는다 (아래 블록).
        // 여기서 안 담으면 m8류(기존 경기 재수집에서 win 뒤집힘)를 수집 단계가 통째로 놓친다.
        if (prev) prevInfoById[id] = prev;
        // 기존 경기라도 **대회가 틀렸으면** 그것만 바로잡는다.
        //   예전에는 이미 있는 경기의 tid 를 아예 안 건드려서, 한 번 잘못 들어간 대회가
        //   재수집을 몇 번 해도 그대로 굳었다. (Road to MSI 5경기가 정규 라운드 3-4 에
        //   들어가 있어 경기 목록에서 찾을 수 없었다 — 2026-08-07)
        if (prev && fallbackTid && prev.tid !== fallbackTid) tidFixRows.push({ id, tid: fallbackTid });
        // ★ 승패·편 가르기의 기준은 **실제 저장된 경기의 a** 다.
        //   Leaguepedia 의 1세트 블루팀(m.a)과 다를 수 있고, 다르면 전부 뒤집힌다.
        const baseA = prev ? prev.a : m.a;
        const baseB = prev ? prev.b : m.b;
        m.sets.forEach(s => {
          const built = detailRowForSave(id, s, baseA, baseB, teamMap);
          if (built.row) detailRows.push(built.row);
          else {
            rejectedDetailSets++;
            rejectedDetailMatchIds.add(id);
            warnings.push(`정합성 ${id} ${s.n}세트: ${built.violations[0]} — 상세 저장 차단`);
          }
        });
        return;
      }
      // 신규 fallback 경기는 단 한 세트라도 있으면 done으로 만들던 옛 추정을 금지한다.
      // 일정표 BestOf의 필요 승수(또는 완전히 일치하는 공식 최종 결과)가 증명돼야만
      // 경기 행과 상세를 만든다. 증거가 없으면 upcoming으로 위장해 넣지도 않는다.
      const completion = newFallbackCompletion(m, seriesMetaByLp.get(m.lpMatchId));
      if (!completion.matchState) {
        blockedFallbackMatchIds.add(id);
        rejectedDetailSets += m.sets.length;
        warnings.push(`정합성 ${id}: ${completion.reason} — 신규 fallback 경기와 상세 저장 차단`);
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
        ...completion.matchState,
      });
      // 새로 만드는 경기도 같은 규칙 — 여기서는 저장할 a/b 가 m.a/m.b 다
      m.sets.forEach(s => {
        const built = detailRowForSave(id, s, m.a, m.b, teamMap);
        if (built.row) detailRows.push(built.row);
        else {
          rejectedDetailSets++;
          rejectedDetailMatchIds.add(id);
          warnings.push(`정합성 ${id} ${s.n}세트: ${built.violations[0]} — 상세 저장 차단`);
        }
      });
    });

    // 같은 id 가 두 번 들어가면 upsert 전체가 실패한다
    const dedup = new Map();
    matchRows.forEach(r => dedup.set(r.id, r));
    const matchRowsU = [...dedup.values()];

    // ── 수집 직후 정합성 검사 (P0-2) ─────────────────────────────
    // 세트 승수가 최종 스코어와 안 맞으면(예: BFX 0:2 BRO 인데 두 세트가 a 승)
    // 해당 경기의 상세를 **전부 저장하지 않고** 경고에 올린다. 한 세트만 빼고 쓰면
    // 기존·신규 행이 섞여 더 알아보기 어려운 데이터가 되므로 경기 단위로 격리한다.
    //
    // ⚠ 이번 수집이 세트를 건드린 **모든** 경기를 본다 — 신규(matchRowsU)뿐 아니라
    //   기존(prevInfoById)까지. m8 사고가 바로 기존 경기의 win 뒤집힘이라, 신규만
    //   보던 예전 검사는 그 계열을 구조적으로 못 잡았다 (적대적 검토 발견 2·5).
    const matchMeta = new Map(dedup);
    Object.entries(prevInfoById).forEach(([id, row]) => {
      if (!matchMeta.has(id)) matchMeta.set(id, row);
    });
    const checkedDetails = filterSafeDetailRows(matchMeta, detailRows);
    checkedDetails.violations.forEach(x =>
      warnings.push(`정합성 ${x.matchId}: ${x.messages[0]} — 이 경기 상세 ${
        detailRows.filter(r => r.match_id === x.matchId).length}세트 저장 차단`));
    const gatedNewMatches = gateNewFinishedMatches(
      matchRowsU, checkedDetails.rows, rejectedDetailMatchIds, checkedDetails.blocked);
    gatedNewMatches.violations.forEach(x =>
      warnings.push(`정합성 ${x.matchId}: ${x.messages[0]} — 신규 종료 경기와 상세 저장 차단`));
    const matchRowsToSave = gatedNewMatches.matchRows;
    const detailRowsToSave = gatedNewMatches.detailRows;
    const blockedNewMatchIds = new Set([...blockedFallbackMatchIds, ...gatedNewMatches.blocked]);
    const blockedNewMatches = blockedNewMatchIds.size;
    const blockedDetailSets = rejectedDetailSets + (detailRows.length - detailRowsToSave.length);

    // 한 경기의 신규 행·상세·대회 교정을 SECURITY DEFINER RPC 한 번으로 묶는다.
    // 함수 안 검증/저장 하나라도 실패하면 그 경기 묶음 전체가 롤백된다. 직접 REST
    // upsert fallback은 두지 않는다. 그래야 RPC 미적용 상태에서 부분 저장이 재발하지 않는다.
    await persistMatchBundles(sb, matchRowsToSave, detailRowsToSave, tidFixRows);

    // ── 경기 MVP(POM) ─────────────────────────────────────
    // LCK 공식 제도: 경기마다 MVP 1명에게 100pt. Leaguepedia 는 **세트마다** MVP 를 주므로
    // 한 경기에서 가장 많이 뽑힌 선수를 그 경기의 POM 으로 본다(동률이면 먼저 뽑힌 쪽).
    // MVP 칸이 없는 대회도 있어서, 실패해도 수집 전체를 멈추지 않는다.
    try {
      const mvpByMatch = {};
      for (const pg of pages) {
        if (Date.now() - started > BUDGET_MS + 8000) break;   // 시간이 모자라면 MVP 는 다음에
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
        if (blockedNewMatchIds.has(id)) return; // 정합성 실패로 새 경기 자체를 격리한 경우
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

    // 자동 수집이 잘 돌고 있는지 사장님이 볼 수 있게 마지막 결과를 남긴다.
    // 크론은 아무도 안 보는 시간에 도는데, 실패해도 알 길이 없으면 '알아서 되는' 걸 믿을 수 없다.
    try {
      await saveSetting("lp_last_run", JSON.stringify({
        at: Date.now(), by: byCron ? "자동" : "관리자",
        page, 경기: matchRowsToSave.length, 세트: detailRowsToSave.length,
        차단된경기: blockedNewMatches, 차단된세트: blockedDetailSets,
        끝까지: allDone, 경고: warnings.slice(0, 3),
      }));
    } catch { /* 기록에 실패해도 수집 자체는 성공이다 */ }

    return ok(res, { ...summary, 저장함: true, 저장된경기: matchRowsToSave.length, 저장된세트: detailRowsToSave.length,
                     차단된경기: blockedNewMatches, 차단된세트: blockedDetailSets,
                     POM저장: pomSaved, POM상세: pomInfo, 선수등록: madePlayers,
                     대회고침: tidFixRows.length, 경고: warnings,
                     대회: [...new Set(Object.values(tidOf).filter(Boolean))].join(", ") });
  } catch (e) {
    return fail(res, 500, e.message || String(e));
  }
};

// 네트워크나 운영 DB 없이 수집기의 가장 위험한 팀 기준 변환을 회귀 테스트한다.
// Vercel은 module.exports 함수만 호출하므로 런타임 동작에는 영향을 주지 않는다.
module.exports.__test = {
  EXISTING_MATCH_SELECT,
  PERSIST_MATCH_RPC,
  scoreboardWinner,
  resolveGameWinner,
  seriesCompletionProof,
  newFallbackCompletion,
  sideForTeam,
  detailRowForSave,
  filterSafeDetailRows,
  gateNewFinishedMatches,
  buildPersistenceBundles,
  persistMatchBundles,
  shouldBlockIncompleteFallback,
};
