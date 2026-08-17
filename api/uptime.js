// 외부 상태 점검용 최소 엔드포인트.
// 환경변수의 존재·길이 같은 내부 정보는 절대 공개하지 않고, DB 왕복 성공 여부만 답한다.
const { ok, fail, sb } = require("./_lib");

module.exports = async (_req, res) => {
  const started = Date.now();
  res.setHeader("cache-control", "no-store, max-age=0");
  try {
    await sb("matches?select=id&limit=1");
    return ok(res, { ok: true, database: "reachable", latency_ms: Date.now() - started });
  } catch (error) {
    console.error("[uptime] database", error);
    return fail(res, 503, "database unavailable");
  }
};
