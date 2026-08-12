const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "assets/store.js"), "utf8");

// 지금은 v4만 사용하고, 이미 방문한 브라우저의 v1~v3 는 모두 즉시 폐기해야 한다.
// (v3 에는 목록과 함께 받아 둔 팀 게시판 **본문**이 남아 있다 — schema26 이후로는
//  응원팀을 바꾼 뒤에도 그 기기에서만 옛 본문이 보일 수 있으므로 반드시 버려야 한다)
const snapStart = source.indexOf('const SNAP_KEY = "nexus_snap_v4";');
const snapEnd = source.indexOf("\nfunction snapshotSave", snapStart);
assert(snapStart >= 0 && snapEnd > snapStart, "v4 스냅샷 초기화 블록을 찾을 수 없음");

const removed = [];
const snapContext = {
  localStorage: { removeItem: key => removed.push(key) },
};
vm.createContext(snapContext);
vm.runInContext(source.slice(snapStart, snapEnd) + "\nglobalThis.__snapKey = SNAP_KEY;", snapContext);
assert.strictEqual(snapContext.__snapKey, "nexus_snap_v4");
assert.deepStrictEqual(removed, ["nexus_snap_v1", "nexus_snap_v2", "nexus_snap_v3"]);

// cacheFingerprint만 떼어 공식 여부/경기 연결 전환이 새 데이터 알림을 발생시키는지 검증한다.
const fingerprintStart = source.indexOf("function cacheFingerprint()");
const fingerprintEnd = source.indexOf("\n// 새 데이터가 있다는 안내", fingerprintStart);
assert(fingerprintStart >= 0 && fingerprintEnd > fingerprintStart, "cacheFingerprint 함수를 찾을 수 없음");

const Cache = {
  matches: [],
  posts: [
    { id: "p-new", official: false, match_id: null, comments: [] },
    { id: "p-old", official: false, match_id: null, comments: [] },
  ],
  details: {}, players: [], polls: [], awards: [], pom: [], records: [], settings: {},
};
const context = { Cache, Auth: { session: null } };
vm.createContext(context);
vm.runInContext(source.slice(fingerprintStart, fingerprintEnd), context);

const before = context.cacheFingerprint();
Cache.posts[1].official = true;
const afterOfficial = context.cacheFingerprint();
assert.notStrictEqual(afterOfficial, before, "첫 글이 아닌 글의 공식 여부 변경도 감지해야 함");

Cache.posts[1].match_id = "m8";
const afterMatchLink = context.cacheFingerprint();
assert.notStrictEqual(afterMatchLink, afterOfficial, "공식 글의 경기 연결 변경도 감지해야 함");

Cache.posts[0].match_id = "m9";
assert.notStrictEqual(context.cacheFingerprint(), afterMatchLink, "모든 글의 경기 연결 상태를 감지해야 함");

console.log("✓ 스냅샷 v3 폐기/공식 경기방 갱신 회귀 테스트");
