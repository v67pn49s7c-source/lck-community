const { ok } = require("./_lib");
module.exports = async (req, res) => {
  const u = String(req.query?.u || "");
  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    + "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  const t0 = Date.now();
  try {
    const r = await fetch(u, { headers: { "user-agent": UA, "accept-language": "ko-KR,ko;q=0.9" }, redirect: "follow" });
    const h = (await r.text()).slice(0, 120000);
    const m = h.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i);
    return ok(res, { status: r.status, ms: Date.now() - t0, len: h.length,
      final: r.url, img: m ? m[1] : null, head: h.slice(0, 200) }, 0);
  } catch (e) { return ok(res, { 오류: String(e && e.message || e), ms: Date.now() - t0 }, 0); }
};
