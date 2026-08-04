// ── 서버 함수 공통 도구 ─────────────────────────────────
// 여기 코드는 브라우저가 아니라 Vercel 서버에서만 실행된다.
// 그래서 비밀 키(SUPABASE_SERVICE_KEY)를 안전하게 쓸 수 있다.
//
// 환경변수 (Vercel 대시보드 → Settings → Environment Variables)
//   SUPABASE_URL          예: https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY  Supabase → Settings → API → service_role (절대 공개 금지)
//   ADMIN_TASK_TOKEN      수집 작업을 부를 때 쓰는 임의의 긴 문자열

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

function ok(res, body, cacheSeconds) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  // 같은 응답을 서버 앞단에서 잠깐 재사용 (같은 데이터를 반복해서 계산하지 않게)
  if (cacheSeconds) res.setHeader("cache-control", `public, s-maxage=${cacheSeconds}, stale-while-revalidate=60`);
  res.status(200).send(JSON.stringify(body));
}

function fail(res, status, message) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.status(status).send(JSON.stringify({ error: message }));
}

// Supabase REST 호출 (service_role — RLS를 우회하므로 서버에서만)
async function sb(path, init) {
  if (!SB_URL || !SB_KEY) throw new Error("서버에 SUPABASE_URL / SUPABASE_SERVICE_KEY 환경변수가 없습니다");
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      authorization: `Bearer ${SB_KEY}`,
      "content-type": "application/json",
      ...(init && init.headers),
    },
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw new Error(typeof data === "string" ? data : (data && data.message) || `Supabase ${r.status}`);
  return data;
}

// 관리자만 실행할 수 있는 작업 보호.
// ① 관리자 화면에서 부를 때 → 로그인 토큰을 서버가 직접 확인하고 is_admin 대조
// ② 예약 실행(크론)에서 부를 때 → ADMIN_TASK_TOKEN 문자열 대조
async function requireAdmin(req) {
  const taskToken = process.env.ADMIN_TASK_TOKEN;
  const got = req.headers["x-task-token"] || (req.query && req.query.token);
  if (taskToken && got === taskToken) return { via: "token" };

  const auth = req.headers.authorization || "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!jwt) { const e = new Error("관리자 로그인이 필요합니다"); e.status = 401; throw e; }

  // 토큰이 진짜인지 Supabase에 확인 (브라우저 말을 믿지 않는다)
  const r = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: SB_KEY, authorization: `Bearer ${jwt}` },
  });
  if (!r.ok) { const e = new Error("로그인 정보가 유효하지 않습니다"); e.status = 401; throw e; }
  const user = await r.json();
  const prof = await sb(`profiles?id=eq.${user.id}&select=is_admin`);
  if (!prof[0] || !prof[0].is_admin) { const e = new Error("관리자만 실행할 수 있습니다"); e.status = 403; throw e; }
  return { via: "admin", uid: user.id };
}

module.exports = { ok, fail, sb, requireAdmin };
