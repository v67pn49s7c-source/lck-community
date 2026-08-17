// ── 경기 상세 페이지 (서버가 미리 그려 준다) ─────────────────
//   /match/<경기id>  →  이 함수가 완성된 HTML 을 돌려준다
//
// 왜 필요한가
//   우리 사이트는 내용을 브라우저가 그린다. 그래서 검색 로봇이 받아 가는 HTML 에는
//   팀 이름도 점수도 한 글자 없다(실제로 확인함). 구글은 나중에 자바스크립트를 돌려
//   일부 건지지만, **네이버는 그걸 못 한다** — 네이버 스스로 서버 렌더링을 권고한다.
//   그래서 경기 페이지만은 서버가 제목·본문을 채워서 내보낸다.
//
// 나머지 화면(홈·커뮤니티·관리자)은 손대지 않는다. 이 파일 하나로 끝난다.

const { sb } = require("./_lib");

const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const SITE = "https://lck-community.vercel.app";

// 한국 시간으로 표기 (보는 사람 위치와 상관없이)
const KST = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const KST_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
});

// 팀 표시 이름 — 화면 코드(assets/data.js)와 같은 값을 서버에도 둔다.
// (data.js 는 브라우저용 전역 스크립트라 서버에서 불러 쓸 수 없다)
const TEAMS = {
  t1:  { abbr: "T1",  name: "T1" },
  gen: { abbr: "GEN", name: "Gen.G" },
  hle: { abbr: "HLE", name: "한화생명e스포츠" },
  dk:  { abbr: "DK",  name: "Dplus KIA" },
  kt:  { abbr: "KT",  name: "kt 롤스터" },
  bro: { abbr: "BRO", name: "한진 브리온" },
  bfx: { abbr: "BFX", name: "BNK FEARX" },
  krx: { abbr: "KRX", name: "KIWOOM DRX" },
  ns:  { abbr: "NS",  name: "농심 레드포스" },
  dns: { abbr: "DNS", name: "DN SOOPers" },
};
const teamName = id => (TEAMS[id] || {}).name || id || "미정";
const teamAbbr = id => (TEAMS[id] || {}).abbr || id || "미정";

function html(res, body, cacheSeconds, status) {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control",
    `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}`);
  res.status(status || 200).send(body);
}

// 검색 로봇이 이해할 수 있게 경기 정보를 구조화해 넣는다.
// (한국 구글에는 이벤트 리치 스니펫이 아직 안 나오지만, 검색·AI 가 "무슨 경기인지"를
//  확정적으로 이해하게 해 주는 값은 있다)
function jsonLd(m, title, url) {
  const data = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: title,
    startDate: m.at,
    eventStatus: m.status === "done"
      ? "https://schema.org/EventScheduled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/MixedEventAttendanceMode",
    sport: "League of Legends",
    url,
    competitor: [m.a, m.b].map(t => ({ "@type": "SportsTeam", name: teamName(t) })),
    organizer: { "@type": "Organization", name: "LCK" },
  };
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

function page(m, details, players, tournamentName) {
  const A = teamAbbr(m.a), B = teamAbbr(m.b);
  const AN = teamName(m.a), BN = teamName(m.b);
  const when = m.at ? KST.format(new Date(m.at)) : "";
  const done = m.status === "done" && m.score_a != null && m.score_b != null;
  const live = m.status === "live";

  const title = done
    ? `${A} vs ${B} 경기 결과 ${m.score_a}:${m.score_b} — ${tournamentName || "LCK 2026"} | The Nexus`
    : live
    ? `${A} vs ${B} 경기 중 — ${tournamentName || "LCK 2026"} | The Nexus`
    : `${A} vs ${B} ${when} 경기 일정 — ${tournamentName || "LCK 2026"} | The Nexus`;

  const desc = done
    ? `${AN} ${m.score_a} : ${m.score_b} ${BN}. ${when} 한국시간. ${tournamentName || "LCK 2026"} 경기 결과와 세트별 선수 기록, 팬 평점을 확인하세요.`
    : live
    ? `${AN} vs ${BN} 경기가 진행 중입니다. ${when} 한국시간. 실시간 팬심지수와 승부예측에 참여해 보세요.`
    : `${AN} vs ${BN} 경기가 ${when}(한국시간)에 열립니다. ${tournamentName || "LCK 2026"}. 무료 승부예측과 팬심지수 투표에 참여해 보세요.`;

  const url = `${SITE}/match/${encodeURIComponent(m.id)}`;
  const byId = {};
  (players || []).forEach(p => { byId[p.id] = p; });

  // 세트별 표 — 검색 로봇이 읽을 수 있게 **글자로** 만든다
  const setsHTML = (details || []).sort((x, y) => x.set_index - y.set_index).map(d => {
    const rows = (d.players || []).map(p => {
      const pl = byId[p.pid];
      if (!pl) return "";
      return `<tr><td>${esc(pl.nick)}</td><td>${esc(pl.pos)}</td><td>${esc(p.champ || "")}</td>`
        + `<td>${esc(p.k)} / ${esc(p.d)} / ${esc(p.a)}</td><td>${esc(p.cs ?? "")}</td>`
        + `<td>${p.gold ? esc(p.gold) + "k" : ""}</td></tr>`;
    }).join("");
    if (!rows) return "";
    const winner = d.win === "a" ? AN : BN;
    return `<section><h3>${d.set_index + 1}세트 — ${esc(winner)} 승</h3>
      <table><thead><tr><th>선수</th><th>포지션</th><th>챔피언</th><th>K/D/A</th><th>CS</th><th>골드</th></tr></thead>
      <tbody>${rows}</tbody></table></section>`;
  }).join("");

  const head = `<h1>${esc(AN)} vs ${esc(BN)}${done ? ` ${m.score_a} : ${m.score_b}` : ""}</h1>
    <p>${esc(when)} 한국시간 · ${esc(tournamentName || "")} ${esc(m.stage || "")}</p>
    <p>${done ? `${esc(m.score_a > m.score_b ? AN : BN)} 승리` : live ? "경기 진행 중" : "경기 예정"}</p>`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="The Nexus">
<meta property="og:locale" content="ko_KR">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${SITE}/og/match/${encodeURIComponent(m.id)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(`${AN} ${m.score_a ?? ""} : ${m.score_b ?? ""} ${BN}`)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="/assets/brand/nexus-icon.png?v=20260817d">
${jsonLd(m, `${AN} vs ${BN}`, url)}
<style>
/* 검색 로봇과 자바스크립트가 꺼진 사람을 위한 최소 화면.
   자바스크립트가 켜져 있으면 아래에서 원래 경기 화면으로 넘어간다. */
body{background:#0f1015;color:#e8eaed;font:16px/1.7 -apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;margin:0;padding:24px}
main{max-width:860px;margin:0 auto}h1{font-size:26px;margin:0 0 6px}h3{margin:22px 0 8px;color:#ff4655}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #262a33;padding:6px 8px;text-align:left}
th{background:#171923;color:#99a1af}a{color:#ff4655}
.go{display:inline-block;margin:18px 0;padding:10px 16px;background:#ff4655;color:#fff;text-decoration:none;font-weight:700}
</style>
</head>
<body>
<main>
${head}
<a class="go" href="/live.html?match=${encodeURIComponent(m.id)}">경기 상세·팬 평점·승부예측 보기 →</a>
${setsHTML}
<p><a href="/">The Nexus 홈</a> · <a href="/schedule.html">전체 경기 일정</a></p>
<p style="color:#667080;font-size:13px;margin-top:28px">
The Nexus는 LCK·라이엇 게임즈와 무관한 비공식 팬 커뮤니티입니다.<br>
Some content is provided courtesy of Leaguepedia, under a CC-BY-SA 3.0 license.</p>
</main>
<script>
// 사람이 열었으면 원래 경기 화면으로 넘긴다. 검색 로봇은 자바스크립트를 돌리지 않거나
// 돌리더라도 위 내용을 이미 읽은 뒤라 색인에는 영향이 없다.
location.replace("/live.html?match=${encodeURIComponent(m.id)}" + location.hash);
</script>
</body>
</html>`;
}

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || "").trim();
  if (!id) return html(res, notFound("경기를 지정해 주세요"), 60, 404);

  try {
    const rows = await sb(`matches?id=eq.${encodeURIComponent(id)}&select=*`);
    const m = rows && rows[0];
    // 없는 경기는 반드시 404 — 200 으로 빈 페이지를 주면 검색엔진이 그걸 저장한다
    if (!m) return html(res, notFound("경기를 찾을 수 없습니다"), 300, 404);

    const [details, players, tours] = await Promise.all([
      sb(`match_details?match_id=eq.${encodeURIComponent(id)}&select=set_index,win,players`).catch(() => []),
      sb("players?select=id,nick,pos,team").catch(() => []),
      m.tid ? sb(`tournaments?id=eq.${encodeURIComponent(m.tid)}&select=name`).catch(() => []) : [],
    ]);

    // 같은 주소가 하루 사이에 예고 → 중계 → 결과로 바뀐다. 상태에 맞게 캐시를 잡는다.
    const cache = m.status === "live" ? 30 : m.status === "done" ? 1800 : 300;
    return html(res, page(m, details, players, (tours[0] || {}).name), cache);
  } catch (e) {
    return html(res, notFound("경기 정보를 불러오지 못했습니다"), 30, 500);
  }
};

function notFound(msg) {
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>${esc(msg)} — The Nexus</title><meta name="robots" content="noindex">
<style>body{background:#0f1015;color:#e8eaed;font-family:sans-serif;padding:40px;text-align:center}a{color:#ff4655}</style>
</head><body><h1>${esc(msg)}</h1>
<p><a href="/schedule.html">전체 경기 일정 보기</a> · <a href="/">The Nexus 홈</a></p></body></html>`;
}
