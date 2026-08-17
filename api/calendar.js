// ── LCK 경기 캘린더 구독 ──────────────────────────────────
// /calendar/lck.ics 또는 /calendar/t1.ics 를 캘린더 앱에 구독하면
// 일정 변경이 자동 반영된다. 푸시 서버를 운영하지 않고도 사용자의 캘린더가
// 경기 전에 알림을 맡아 주므로 1인 운영 사이트에 맞는 재방문 장치다.

const { sb } = require("./_lib");

const SITE = "https://lck-community.vercel.app";
const TEAMS = {
  t1: "T1", gen: "GEN", hle: "HLE", dk: "DK", kt: "KT",
  bro: "BRO", bfx: "BFX", krx: "KRX", ns: "NS", dns: "DNS",
};

const icsText = value => String(value ?? "")
  .replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n")
  .replace(/,/g, "\\,").replace(/;/g, "\\;");

const icsDate = value => {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
};

// RFC 5545는 긴 줄을 75 octet 안에서 접으라고 한다. 한글은 3바이트라 문자 수로
// 자르면 중간 바이트가 깨질 수 있어 Buffer 단위로 안전한 경계를 찾는다.
function foldLine(line) {
  const out = [];
  let rest = String(line);
  let first = true;
  while (Buffer.byteLength(rest, "utf8") > (first ? 75 : 74)) {
    const max = first ? 75 : 74;
    let cut = 0, bytes = 0;
    for (const ch of rest) {
      const n = Buffer.byteLength(ch, "utf8");
      if (bytes + n > max) break;
      bytes += n;
      cut += ch.length;
    }
    out.push((first ? "" : " ") + rest.slice(0, cut));
    rest = rest.slice(cut);
    first = false;
  }
  out.push((first ? "" : " ") + rest);
  return out.join("\r\n");
}

function buildCalendar(matches, teamId = "") {
  const filtered = (matches || []).filter(m => m && m.id && m.at && TEAMS[m.a] && TEAMS[m.b])
    .filter(m => !teamId || m.a === teamId || m.b === teamId)
    .sort((a, b) => new Date(a.at) - new Date(b.at));
  const name = teamId ? `${TEAMS[teamId]} 경기 — The Nexus` : "LCK 경기 — The Nexus";
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//The Nexus//LCK Calendar//KO",
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsText(name)}`,
    "X-WR-TIMEZONE:Asia/Seoul", "REFRESH-INTERVAL;VALUE=DURATION:PT30M", "X-PUBLISHED-TTL:PT30M",
  ];
  filtered.forEach(m => {
    const start = new Date(m.at);
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
    const done = m.status === "done" && m.score_a != null && m.score_b != null;
    const score = done ? ` ${m.score_a}:${m.score_b}` : "";
    const summary = `LCK | ${TEAMS[m.a]} vs ${TEAMS[m.b]}${score}`;
    const detail = [m.label, m.stage, done ? "경기 종료" : "경기 정보·팬 예측 보기"]
      .filter(Boolean).join(" · ");
    lines.push("BEGIN:VEVENT", `UID:${icsText(m.id)}@lck-community.vercel.app`,
      `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsText(summary)}`, `DESCRIPTION:${icsText(detail)}`,
      `URL:${SITE}/match/${encodeURIComponent(m.id)}`, "STATUS:CONFIRMED", "END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

module.exports = async (req, res) => {
  if (req.method && req.method !== "GET") {
    res.setHeader("allow", "GET");
    return res.status(405).send("Method Not Allowed");
  }
  const team = String((req.query && req.query.team) || "").trim().toLowerCase();
  if (team && !TEAMS[team]) return res.status(404).send("Unknown team");
  try {
    const rows = await sb("matches?select=id,at,a,b,status,score_a,score_b,label,stage&order=at.asc&limit=500");
    res.setHeader("content-type", "text/calendar; charset=utf-8");
    res.setHeader("content-disposition", `inline; filename="the-nexus-${team || "lck"}.ics"`);
    res.setHeader("cache-control", "public, s-maxage=900, stale-while-revalidate=300");
    res.setHeader("x-robots-tag", "noindex");
    return res.status(200).send(buildCalendar(rows, team));
  } catch (error) {
    res.setHeader("content-type", "text/plain; charset=utf-8");
    return res.status(500).send("경기 캘린더를 만들지 못했습니다");
  }
};

module.exports._test = { TEAMS, icsText, icsDate, foldLine, buildCalendar };
