// ── 오늘의 서사 (Match Story) ────────────────────────────────────
// 같은 T1 vs DK 라도 팬에게는 여러 개의 이야기가 있다. 이 파일은 그 이야기를
// 하나의 데이터로 다루고, **없으면 없는 대로** 안전하게 비워 둔다.
//
// ⚠ 이 파일의 제1원칙: **없는 사실을 지어내지 않는다.**
//   라이벌 관계·별명·밈·전 동료 같은 건 우리 DB에 없다. 그런 서사는 오직
//   운영자가 손으로 넣었을 때만 나온다(source: "admin").
//   코드가 자동으로 만드는 건 우리가 **실제로 가진 기록**뿐이다 —
//   직전 맞대결 결과, 실제 순위표, 실제 연승·연패. 그 밖은 만들지 않는다.
//
// 저장 위치는 site_settings["match_stories"] (경기 id → 서사) 라 새 테이블이
// 필요 없다. 지난 경기 서사는 저장할 때 정리하므로 무한정 늘지 않는다.

const STORY_TYPES = [
  { k: "rivalry",   name: "선수 라이벌리", eyebrow: "오늘의 빅매치" },
  { k: "star",      name: "스타 플레이어", eyebrow: "오늘의 주인공" },
  { k: "team",      name: "팀 라이벌리",   eyebrow: "오늘의 빅매치" },
  { k: "rematch",   name: "리매치·복수전", eyebrow: "리매치" },
  { k: "standings", name: "순위 경쟁",     eyebrow: "순위 경쟁" },
  { k: "playoff",   name: "플레이오프 경쟁", eyebrow: "가을을 향해" },
  { k: "rookie",    name: "신인 vs 베테랑", eyebrow: "세대 교차" },
  { k: "reunion",   name: "전 동료·친정팀", eyebrow: "다시 마주 앉다" },
  { k: "streak",    name: "연승·연패",     eyebrow: "기록 행진" },
  { k: "position",  name: "포지션 대결",   eyebrow: "이 라인을 보세요" },
  { k: "meme",      name: "팬덤 밈·별명",  eyebrow: "오늘의 관전 포인트" },
];
const STORY_TYPE_MAP = {};
STORY_TYPES.forEach(t => { STORY_TYPE_MAP[t.k] = t; });

const STORY_KEY = "match_stories";

/** 저장된 서사 전부 (경기 id → 서사). 깨진 값은 조용히 빈 객체로 본다. */
function storyAll() {
  try {
    const raw = typeof getSetting === "function" ? getSetting(STORY_KEY) : "";
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

/** 운영자가 넣은 서사. 제목이 비어 있으면 서사가 아닌 것으로 본다. */
function storyAdmin(matchId) {
  const s = storyAll()[matchId];
  if (!s || !String(s.headline || "").trim()) return null;
  const type = STORY_TYPE_MAP[s.type] ? s.type : "star";
  return {
    source: "admin", type,
    eyebrow: String(s.eyebrow || "").trim() || STORY_TYPE_MAP[type].eyebrow,
    headline: String(s.headline).trim(),
    subheadline: String(s.subheadline || "").trim(),
    description: String(s.description || "").trim(),
    players: Array.isArray(s.players) ? s.players.slice(0, 2).filter(Boolean) : [],
  };
}

// ── 사실 재료 ────────────────────────────────────────────────────

/** 이 경기 이전의 같은 대진 최근 1경기. */
function storyPrevMeeting(match) {
  if (typeof sortedMatches !== "function") return null;
  const at = new Date(match.at).getTime();
  return sortedMatches().filter(m => m.id !== match.id && m.status === "done" &&
    new Date(m.at).getTime() < at &&
    ((m.a === match.a && m.b === match.b) || (m.a === match.b && m.b === match.a)))
    .sort((x, y) => new Date(y.at) - new Date(x.at))[0] || null;
}

/** 이 시점 기준 연승·연패. { kind: "w"|"l", n } — 2연속 미만이면 null. */
function storyStreak(teamId, beforeAt) {
  if (typeof sortedMatches !== "function") return null;
  const at = new Date(beforeAt).getTime();
  const played = sortedMatches().filter(m => m.status === "done" &&
    (m.a === teamId || m.b === teamId) && new Date(m.at).getTime() < at &&
    m.scoreA != null && m.scoreB != null && m.scoreA !== m.scoreB)
    .sort((x, y) => new Date(y.at) - new Date(x.at));
  if (!played.length) return null;
  const won = m => (m.a === teamId ? m.scoreA > m.scoreB : m.scoreB > m.scoreA);
  const kind = won(played[0]) ? "w" : "l";
  let n = 0;
  for (const m of played) {
    if ((won(m) ? "w" : "l") !== kind) break;
    n++;
  }
  return n >= 2 ? { kind, n } : null;
}

// ── 자동 서사 — 우리가 실제로 가진 기록만 ────────────────────────
// 우선순위: 순위 경쟁 > 연승·연패 > 리매치.
//
// ⚠ 리매치를 맨 뒤로 둔 이유: LCK 정규 시즌은 풀리그라 **거의 모든 경기가 재대결**이다.
//   리매치를 먼저 잡으면 일정표의 모든 줄이 "N일 만의 재대결"로 똑같아져서,
//   한 줄을 더 붙였는데 정보량은 0 이 된다 (실제로 그렇게 나왔다).
//   그래서 드물고 구별되는 서사(순위 경쟁·연승)를 먼저 쓴다.

function storyAuto(match) {
  const A = TEAM_MAP[match.a], B = TEAM_MAP[match.b];
  if (!A || !B) return null;

  // 1) 순위 경쟁 — 실제 순위표에서 두 팀이 가깝고 둘 다 상위권일 때만
  if (typeof cumulativeRankOf === "function") {
    const ra = cumulativeRankOf(match.a), rb = cumulativeRankOf(match.b);
    if (ra && rb && Math.abs(ra.rank - rb.rank) <= 2 && Math.max(ra.rank, rb.rank) <= 6) {
      const hiT = ra.rank < rb.rank ? A : B, loT = ra.rank < rb.rank ? B : A;
      const hiR = Math.min(ra.rank, rb.rank), loR = Math.max(ra.rank, rb.rank);
      return {
        source: "auto", type: "standings", eyebrow: "순위 경쟁",
        headline: `${hiR}위 ${hiT.abbr} vs ${loR}위 ${loT.abbr}`,
        // 부제는 제목을 되풀이하면 안 된다 — 팀 정식 이름으로 정보를 더한다
        subheadline: `${hiT.name} vs ${loT.name}`,
        description: "이 경기 결과에 따라 순위가 갈릴 수 있습니다.",
        players: [],
      };
    }
  }

  // 2) 연승·연패 — 실제 전적에서 3연속 이상일 때만
  const cand = [{ t: A, s: storyStreak(match.a, match.at) }, { t: B, s: storyStreak(match.b, match.at) }]
    .filter(x => x.s && x.s.n >= 3)
    .sort((x, y) => y.s.n - x.s.n)[0];
  if (cand) {
    const { t, s } = cand;
    return s.kind === "w"
      ? { source: "auto", type: "streak", eyebrow: "연승 행진",
          headline: `${t.abbr} ${s.n}연승, 오늘도 이어갈까`,
          subheadline: `${t.name} ${s.n}연승 중`,
          description: "기세를 탄 쪽과 그것을 끊으려는 쪽이 만납니다.", players: [] }
      : { source: "auto", type: "streak", eyebrow: "반등의 길목",
          headline: `${t.abbr}, ${s.n}연패를 끊을까`,
          subheadline: `${t.name} ${s.n}연패 중`,
          description: "오늘이 흐름을 바꿀 기회입니다.", players: [] };
  }

  // 3) 리매치 — 직전 맞대결이 실제로 있고 승부가 갈렸을 때만.
  //    제목에 **진 팀 이름**을 넣어야 줄마다 달라진다 ("N일 만의 재대결"은 전부 똑같다).
  const prev = storyPrevMeeting(match);
  if (prev && prev.scoreA !== prev.scoreB) {
    const pWinner = prev.scoreA > prev.scoreB ? TEAM_MAP[prev.a] : TEAM_MAP[prev.b];
    const pLoser = prev.scoreA > prev.scoreB ? TEAM_MAP[prev.b] : TEAM_MAP[prev.a];
    const hi = Math.max(prev.scoreA, prev.scoreB), lo = Math.min(prev.scoreA, prev.scoreB);
    const days = Math.max(1, Math.round((new Date(match.at) - new Date(prev.at)) / 86400e3));
    if (days <= 45) return {
      source: "auto", type: "rematch", eyebrow: "리매치",
      headline: `${pLoser.abbr}의 설욕전`,
      subheadline: `${days}일 전 ${pWinner.abbr} ${hi}:${lo} 승리`,
      description: `${pLoser.name}가 지난 패배를 되갚을 차례입니다.`,
      players: [],
    };
  }

  return null;
}

/** 이 경기의 서사. 운영자 것이 먼저, 없으면 사실 기반 자동, 그것도 없으면 null. */
function storyFor(match) {
  if (!match) return null;
  return storyAdmin(match.id) || storyAuto(match);
}

/** 경기 카드 한 줄에 붙는 짧은 훅. 길면 카드가 깨지므로 제목만 쓴다. */
function storyHook(match) {
  const s = storyFor(match);
  return s ? s.headline : "";
}

/** 서사에 지정된 선수 2명(있으면). 로스터에서 사라진 선수는 조용히 뺀다. */
function storyPlayers(story) {
  if (!story || !story.players || !story.players.length) return [];
  if (typeof getPlayer !== "function") return [];
  return story.players.map(id => getPlayer(id)).filter(Boolean).slice(0, 2);
}

if (typeof module !== "undefined" && module.exports)
  module.exports = { STORY_TYPES, STORY_KEY, storyStreak, storyAuto, storyAdmin, storyFor, storyHook };
