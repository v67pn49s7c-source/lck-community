// ── 사이트맵 (검색엔진에 "이런 주소가 있다"고 알리는 목록) ──
//   /sitemap.xml  →  이 함수가 만들어 준다
//
// 손으로 만든 파일은 경기가 늘 때마다 사람이 고쳐야 해서 금세 낡는다.
// 서버가 매번 DB 를 보고 만들면, 관리자 화면에서 경기를 추가하는 순간 여기에도 들어간다.
// (Vercel 은 배포 후 파일을 새로 쓸 수 없어서, 이렇게 그때그때 만드는 방식이 맞다)

const { sb } = require("./_lib");

const SITE = "https://lck-community.vercel.app";
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

// 자주 바뀌지 않는 고정 화면들
const STATIC = [
  ["/", "1.0", "hourly"],
  ["/matches.html", "0.9", "hourly"],
  ["/standings.html", "0.8", "daily"],
  ["/race.html", "0.8", "daily"],
  ["/predict.html", "0.8", "hourly"],
  ["/live.html", "0.7", "hourly"],
  ["/community.html", "0.7", "hourly"],
  ["/teams.html", "0.6", "weekly"],
  ["/players.html", "0.6", "weekly"],
  ["/awards.html", "0.5", "weekly"],
  ["/ranking.html", "0.5", "daily"],
  ["/terms.html", "0.2", "yearly"],
];

module.exports = async (req, res) => {
  const url = (loc, pri, freq, lastmod) =>
    `<url><loc>${esc(SITE + loc)}</loc>`
    + (lastmod ? `<lastmod>${esc(lastmod)}</lastmod>` : "")
    + `<changefreq>${freq}</changefreq><priority>${pri}</priority></url>`;

  let body = STATIC.map(([l, p, f]) => url(l, p, f)).join("");
  // 팀·선수 페이지는 브라우저에서 그리는 화면이라 로봇에게는 빈 껍데기로 보인다.
  // 빈 페이지 수백 장을 제출하면 검색 평가만 깎이므로, 서버가 미리 그려 주는
  // 주소(/match/…)와 정적 안내가 있는 화면만 알린다 (2026-08-06).

  try {
    // 경기: 서버가 미리 그려 주는 주소(/match/<id>)를 넣는다
    const matches = await sb("matches?select=id,at,status&order=at.desc&limit=1000");
    body += (matches || []).map(m => {
      const last = m.at ? new Date(m.at).toISOString().slice(0, 10) : "";
      // 끝난 경기는 더 이상 바뀌지 않는다 → 로봇이 자주 안 와도 된다
      const freq = m.status === "done" ? "monthly" : "daily";
      const pri = m.status === "done" ? "0.7" : "0.8";
      return url(`/match/${encodeURIComponent(m.id)}`, pri, freq, last);
    }).join("");
  } catch (e) {
    // DB 를 못 읽어도 고정 주소만이라도 내보낸다 (빈 사이트맵보다 낫다)
  }

  res.setHeader("content-type", "application/xml; charset=utf-8");
  res.setHeader("cache-control", "public, s-maxage=3600, stale-while-revalidate=600");
  res.status(200).send(
    `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`);
};
