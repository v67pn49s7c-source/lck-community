// 서버 함수가 환경변수를 제대로 보고 있는지 확인용 (값은 절대 노출하지 않는다)
module.exports = async (req, res) => {
  const has = k => {
    const v = process.env[k];
    return v ? { 설정됨: true, 길이: String(v).length } : { 설정됨: false };
  };
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.status(200).send(JSON.stringify({
    SUPABASE_URL: has("SUPABASE_URL"),
    SUPABASE_SERVICE_KEY: has("SUPABASE_SERVICE_KEY"),
    ADMIN_TASK_TOKEN: has("ADMIN_TASK_TOKEN"),
    node: process.version,
    // URL이 https://로 시작하는지만 확인 (주소 자체는 공개 정보라 앞부분만)
    urlStartsWith: (process.env.SUPABASE_URL || "").slice(0, 8),
  }, null, 1));
};
