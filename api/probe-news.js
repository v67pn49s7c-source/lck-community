// 임시 진단용 — 네이버 뉴스 검색이 실제로 무엇을 돌려주는지 원문 그대로 본다
const { ok, fail } = require("./_lib");
module.exports = async (req, res) => {
  const id = process.env.NAVER_API_KEY_ID, key = process.env.NAVER_API_KEY;
  if (!id || !key) return ok(res, { 키있음: false, id: !!id, key: !!key }, 0);
  const u = "https://naverapihub.apigw.ntruss.com/search/v1/news?query="
    + encodeURIComponent("LCK 리그오브레전드") + "&display=3&sort=date";
  try {
    const r = await fetch(u, { headers: {
      "X-NCP-APIGW-API-KEY-ID": id, "X-NCP-APIGW-API-KEY": key } });
    const text = await r.text();
    return ok(res, { 키있음: true, status: r.status, 원문: text.slice(0, 1200) }, 0);
  } catch (e) { return ok(res, { 키있음: true, 오류: String(e && e.message || e) }, 0); }
};
