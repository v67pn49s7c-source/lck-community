// 팀 게시판 잠금 회귀 테스트 (schema26)
//
// 지키려는 것: **화면이 아니라 서버가 막는다.**
// 2026-08-12 에 curl 한 줄로 팀 게시판 본문이 그대로 읽히는 것을 확인했고,
// 그 구멍을 막은 구조가 조용히 되돌아가지 않게 여기서 붙잡는다.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const read = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const store = read("assets/store.js");
const board = read("assets/board.js");
const sql = read("supabase/schema26_team_board_private.sql");
const rollback = read("supabase/rollback_schema26.sql");

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

// ── ① 목록 요청이 본문을 가져오면 안 된다 ──────────────────────────
// select("*") 로 되돌아가면 두 가지가 한꺼번에 깨진다:
//   · body 권한이 없어 목록 요청 자체가 실패 → 사이트 전체가 빈다
//   · (권한을 되돌린 경우) 본문이 다시 통째로 새어 나간다
const postsSelect = store.match(/from\("posts"\)\s*\n?\s*\.select\((["'`])([^"'`]*)\1\)/);
ok(postsSelect, "store.js 에서 posts 목록 select 를 찾지 못했다");
ok(postsSelect[2] !== "*", 'posts 목록을 select("*") 로 받으면 안 된다 (body 권한 없음)');
ok(!/\bbody\b/.test(postsSelect[2]), "posts 목록 select 에 body 가 들어가면 안 된다");
// 목록·마이페이지가 실제로 쓰는 칸은 남아 있어야 한다
["id", "team", "cat", "title", "nick", "author_id", "match_id", "is_official", "up", "views", "created_at"]
  .forEach(col => ok(new RegExp(`\\b${col}\\b`).test(postsSelect[2]), `posts 목록 select 에 ${col} 이 빠졌다`));

// ── ② 본문은 서버 창구로만 ────────────────────────────────────────
ok(/function loadPostBody\(/.test(store), "store.js 에 loadPostBody 가 있어야 한다");
ok(/rpc\("get_post_body"/.test(store), "loadPostBody 는 get_post_body RPC 를 써야 한다");
// SQL 을 아직 안 돌린 DB 에서도 글이 빈칸으로 보이지 않게 하는 안전장치
ok(/isMissingFunction\(r\.error\)/.test(store.slice(store.indexOf("function loadPostBody"))),
  "loadPostBody 는 함수가 없는 DB(=SQL 미적용)를 대비한 폴백이 있어야 한다");

// ── ③ 화면 판정이 서버 규칙과 같아야 한다 ─────────────────────────
// 서버는 비회원의 응원팀을 확인할 수 없다. 화면만 localStorage 를 인정하면
// "열리는데 본문만 빈" 상태가 된다.
const canRead = board.slice(board.indexOf("function canReadPost"),
                            board.indexOf("function whyNoRead"));
ok(/if \(!Auth\.profile\) return false/.test(canRead),
  "canReadPost 는 비회원을 거부해야 한다 (서버가 신원을 확인할 수 없다)");
ok(!/getFavTeam\(\)/.test(canRead),
  "canReadPost 가 localStorage 응원팀(getFavTeam)을 믿으면 서버 판정과 어긋난다");
ok(/Auth\.profile\.fav_team === team/.test(canRead), "canReadPost 는 프로필 응원팀으로 판정해야 한다");
ok(/cat === "공지"/.test(canRead), "공지는 팀 게시판에서도 읽을 수 있어야 한다");

// ── ④ 서버가 거절하면 잠금 화면 ───────────────────────────────────
const postPage = board.slice(board.indexOf("async function initPostPage"));
ok(/await loadPostBody\(id\)/.test(postPage), "글 보기는 loadPostBody 로 본문을 받아야 한다");
ok(/if \(!got\.ok\) \{ showLocked\(\); return; \}/.test(postPage),
  "서버가 본문을 거절하면 잠금 화면으로 끝나야 한다 (서버가 최종 판정자)");
// 잠금이면 조회수도 올리지 않고 본문·댓글도 그리지 않는다
ok(postPage.indexOf("await loadPostBody(id)") < postPage.indexOf("bumpPostView"),
  "본문 자격 확인은 조회수 증가보다 먼저여야 한다");
ok(/noIndex\(\)/.test(postPage.slice(postPage.indexOf("showLocked"))),
  "잠긴 글은 검색에 잡히지 않게 noIndex 여야 한다");

// ── ⑤ SQL — 권한 회수와 창구 ──────────────────────────────────────
ok(/revoke select on public\.posts from anon, authenticated/.test(sql),
  "schema26 은 posts 의 테이블 단위 읽기 권한을 회수해야 한다");
const grantCols = sql.match(/grant select \(([\s\S]*?)\)\s*\n?\s*on public\.posts/);
ok(grantCols, "schema26 은 목록용 컬럼만 다시 grant 해야 한다");
ok(!/\bbody\b/.test(grantCols[1]), "다시 grant 하는 컬럼에 body 가 있으면 잠금이 무의미하다");
ok(/\btitle\b/.test(grantCols[1]), "제목은 공개여야 게시판 목록이 보인다");

["can_read_post", "get_post_body"].forEach(fn => {
  const def = sql.slice(sql.indexOf(`create or replace function public.${fn}`));
  ok(def.length > 0, `${fn} 이 정의돼야 한다`);
  ok(/security definer/.test(def.slice(0, 400)), `${fn} 은 security definer 여야 한다`);
  ok(/set search_path = public/.test(def.slice(0, 400)),
    `${fn} 은 search_path 를 고정해야 한다 (search_path 공격 방지)`);
  ok(new RegExp(`grant execute on function public\\.${fn}\\(text\\) to anon, authenticated`).test(sql),
    `${fn} 실행 권한을 anon·authenticated 에 줘야 한다`);
});

// ── ⑥ 댓글·투표도 같이 가려야 한다 ────────────────────────────────
// 본문만 막고 댓글이 열려 있으면 대화 내용이 그대로 새어 나간다.
ok(/create policy "read_visible_comments" on public\.comments[\s\S]{0,120}can_read_post\(post_id\)/.test(sql),
  "댓글 읽기 정책이 can_read_post 로 좁혀져야 한다");
ok(/create policy "read_polls" on public\.polls[\s\S]{0,160}post_id is null or public\.can_read_post\(post_id\)/.test(sql),
  "글에 붙은 투표도 같은 기준으로 가려야 한다 (경기 연동 투표는 공개 유지)");

// ── ⑦ 되돌리기가 실제로 되돌리는가 ────────────────────────────────
ok(/grant select on public\.posts to anon, authenticated/.test(rollback),
  "롤백은 posts 읽기 권한을 되돌려야 한다");
ok(/create policy "read_all_comments" on public\.comments for select using \(true\)/.test(rollback),
  "롤백은 댓글 정책을 되돌려야 한다");
ok(/using \(true\)/.test(rollback.slice(rollback.indexOf('"read_polls"'))),
  "롤백은 투표 정책을 되돌려야 한다");

console.log(`\nteam-board-private.test: ${n} 통과, 0 실패`);
