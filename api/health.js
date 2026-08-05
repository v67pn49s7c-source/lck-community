// 서버 함수가 환경변수를 제대로 보고 있는지 확인용 (값은 절대 노출하지 않는다)
// ※ 관리자만 볼 수 있다. 예전에는 누구나 열 수 있어서 서버 키의 설정 여부와
//    글자 수, node 버전이 그대로 공개됐다.
const { requireAdmin, fail } = require("./_lib");

module.exports = async (req, res) => {
  try { await requireAdmin(req); }
  catch (e) { return fail(res, e.status || 500, e.message); }

  const has = k => {
    const v = process.env[k];
    return v ? { 설정됨: true, 길이: String(v).length } : { 설정됨: false };
  };
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.status(200).send(JSON.stringify({
    SUPABASE_URL: has("SUPABASE_URL"),
    SUPABASE_SERVICE_KEY: has("SUPABASE_SERVICE_KEY"),
    ADMIN_TASK_TOKEN: has("ADMIN_TASK_TOKEN"),
    CRON_SECRET: has("CRON_SECRET"),
    node: process.version,
    // URL이 https://로 시작하는지만 확인 (주소 자체는 공개 정보라 앞부분만)
    urlStartsWith: (process.env.SUPABASE_URL || "").slice(0, 8),
  }, null, 1));
};
