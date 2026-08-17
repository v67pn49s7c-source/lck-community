// 2차 운영 안정화: 서울 리전·보안 헤더·캐시 용량 폴백·초기 장애 표시
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

let n = 0;
const ok = (value, message) => { assert.ok(value, message); n++; };

const vercel = JSON.parse(read("vercel.json"));
assert.deepStrictEqual(vercel.regions, ["icn1"]); n++;
const globalHeaders = (vercel.headers.find(x => x.source === "/(.*)") || {}).headers || [];
const headerMap = Object.fromEntries(globalHeaders.map(x => [x.key, x.value]));
["X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy",
  "Strict-Transport-Security"].forEach(key => ok(headerMap[key], `${key} 보안 헤더가 필요함`));

const store = read("assets/store.js");
const start = store.indexOf('const SNAP_KEY = "nexus_snap_v4";');
const end = store.indexOf("\nfunction snapshotLoad", start);
ok(start >= 0 && end > start, "스냅샷 저장 코드를 찾을 수 있어야 함");

const stored = {};
const session = {};
const Cache = {
  tournaments: [], matches: [], records: [], players: [], posts: [], details: { huge: "가".repeat(1000000) },
  settings: {}, pom: [], awards: [], polls: [], founding: [], profiles: [], idx: null, myVoter: null,
  stats: { pred: [], rating: [], ratingVoters: [], pollChoice: [], pollVoters: [], reaction: [], commentLike: [], fandom: [], ranking: [] },
  mine: { predictions: [], ratings: [], pollVotes: [], reactions: [], commentLikes: [], postUpvotes: [] },
};
const context = {
  Cache, Auth: { profile: null, session: null }, console,
  localStorage: {
    removeItem: key => { delete stored[key]; },
    setItem: (key, value) => { stored[key] = value; },
  },
  sessionStorage: {
    setItem: (key, value) => { session[key] = value; },
    getItem: key => session[key] || null,
  },
};
vm.createContext(context);
vm.runInContext(store.slice(start, end), context, { filename: "snapshot-part.js" });
ok(context.snapshotSave(), "큰 스냅샷도 경량판으로 저장돼야 함");
const first = JSON.parse(stored.nexus_snap_v4);
ok(first.snapshot_mode === "compact", "한도 초과 시 상세를 뺀 경량판을 선택해야 함");
ok(first.c.details && Object.keys(first.c.details).length === 0, "경량판은 큰 경기 상세를 제외해야 함");
ok(context.snapshotDiagnostics().ok && context.snapshotDiagnostics().mode === "compact",
  "관리자 화면에서 경량 저장 사실을 확인할 수 있어야 함");

const originalSet = context.localStorage.setItem;
context.localStorage.setItem = (key, value) => {
  if (key === "nexus_snap_v4" && JSON.parse(value).snapshot_mode !== "minimal") {
    const error = new Error("quota"); error.name = "QuotaExceededError"; throw error;
  }
  originalSet(key, value);
};
ok(context.snapshotSave(), "전체·경량 저장이 실패해도 최소판을 마지막으로 시도해야 함");
ok(JSON.parse(stored.nexus_snap_v4).snapshot_mode === "minimal", "최소판 폴백이 실제 저장돼야 함");

ok(/const critical = \[\[t, "대회"\][\s\S]+throw new Error\(`핵심 데이터/.test(store),
  "핵심 요청 실패를 빈 사이트로 위장하면 안 됨");
ok(/function showStoreLoadFailure\(error, hasSnapshot\)/.test(store),
  "첫 방문 실패와 저장본 사용 실패를 사용자에게 구분해 알려야 함");
ok(/showStoreLoadFailure\(error, snapshotUsed\)/.test(store), "초기 로드 실패 처리기가 실제 연결돼야 함");
ok(/snapshotDiagnostics\(\)/.test(read("admin.html")), "관리자 운영 현황에서 캐시 상태를 읽어야 함");

const uptime = read("api/uptime.js");
const workflow = read(".github/workflows/uptime.yml");
ok(/matches\?select=id&limit=1/.test(uptime) && /database: "reachable"/.test(uptime),
  "상태 확인 API가 실제 DB 왕복을 검사해야 함");
ok(!/SUPABASE_SERVICE_KEY|process\.env/.test(uptime), "상태 확인 응답 코드가 비밀 환경변수를 다루면 안 됨");
ok(/cron: "17 \* \* \* \*"/.test(workflow) && /api\/uptime/.test(workflow),
  "GitHub Actions가 매시간 홈페이지와 DB 연결을 확인해야 함");
ok(/curl --fail/.test(workflow) && /grep -q '\"ok\":true'/.test(workflow),
  "HTTP 오류나 거짓 health 응답이면 점검이 실패해야 함");

console.log(`\nops-stability.test: ${n} 통과, 0 실패`);
