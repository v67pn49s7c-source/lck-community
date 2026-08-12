// 글에 붙는 '참조 경기' 카드 (schema27)
//
// 지키려는 것
//  ① posts.match_id 를 재활용하지 않는다 — 그 칸은 **관리자 전용**이다(P0-1).
//     일반 회원이 보내면 create_post 가 조용히 버리므로 첨부가 동작하지 않는다.
//  ② create_post 의 인자 목록을 늘리지 않는다 — 하나만 어긋나도 글쓰기가 통째로 죽는다.
//  ③ schema26 이 컬럼별 읽기 권한을 잠갔으므로 **새 칸은 grant 를 따로** 해야 한다.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const read = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const store = read("assets/store.js");
const board = read("assets/board.js");
const write = read("write.html");
const post = read("post.html");
const css = read("assets/styles.css");
const sql = read("supabase/schema27_post_ref_match.sql");
const rollback = read("supabase/rollback_schema27.sql");

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

// ── SQL ──────────────────────────────────────────────────
ok(/alter table public\.posts add column if not exists ref_match_id text/.test(sql),
  "참조 경기 칸을 새로 만들어야 함");
ok(/grant select \(ref_match_id\) on public\.posts to anon, authenticated/.test(sql),
  "schema26 이 컬럼 권한을 잠갔으므로 새 칸은 따로 열어 줘야 함 (안 하면 글 목록이 죽는다)");
const fn = sql.slice(sql.indexOf("function public.set_post_ref_match"));
ok(/security definer/.test(fn.slice(0, 400)) && /set search_path = public/.test(fn.slice(0, 400)),
  "RPC 는 security definer + search_path 고정이어야 함");
ok(/is distinct from v_uid and not public\.is_admin\(\)/.test(fn),
  "글쓴이 본인이나 관리자만 첨부할 수 있어야 함");
ok(/not exists \(select 1 from public\.matches where id = v_ref\)/.test(fn),
  "없는 경기 id 를 넣지 못하게 막아야 함");
ok(!/is_official/.test(fn) && !/\bmatch_id\b\s*=/.test(fn),
  "참조 첨부가 공식 경기방(match_id·is_official)을 건드리면 안 됨");
ok(/grant execute on function public\.set_post_ref_match\(text, text\) to authenticated/.test(sql),
  "회원에게 실행 권한을 줘야 함");
ok(!/drop column/.test(rollback.split("-- 칸까지")[0]),
  "롤백이 칸을 지우면 그동안 붙인 첨부가 사라진다 — 기본 동작이면 안 됨");

// ── 코드 ─────────────────────────────────────────────────
ok(/\.select\("id,team,cat,title,nick,author_team,author_id,match_id,ref_match_id,/.test(store),
  "글 목록에서 참조 경기 칸도 받아야 함");
ok(/첨부 칸 없음/.test(store) && /\(ref_match_id\|draft\)/.test(store) && /retry/.test(store),
  "SQL 을 아직 안 돌린 DB 에서도 글 목록이 죽지 않아야 함 (새 칸만 빼고 재요청)");
ok(/function setPostRefMatch/.test(store) && /rpc\("set_post_ref_match"/.test(store),
  "첨부는 전용 RPC 로 걸어야 함");
ok(/isMissingFunction\(r\.error\)/.test(store.slice(store.indexOf("function setPostRefMatch"))),
  "RPC 가 없는 DB 에서는 첨부만 건너뛰고 글쓰기는 살아야 함");
// create_post 인자 목록은 그대로여야 한다
const addPostSrc = store.slice(store.indexOf("addPost.lastSave = sb.rpc(\"create_post\""), store.indexOf("addPost.lastSave = sb.rpc(\"create_post\"") + 260);
ok(!/p_ref_match/.test(addPostSrc),
  "create_post 인자에 참조 경기를 끼워 넣으면 안 됨 (배포 순서에 따라 글쓰기가 죽는다)");

ok(/id="match-attach"/.test(write), "글쓰기 화면에 경기 선택칸이 있어야 함");
ok(/status === "done"/.test(board.slice(board.indexOf('id="match-attach"') - 900, board.indexOf('id="match-attach"') + 900))
   || /m\.status === "done" && knownTeams\(m\)/.test(board),
  "끝난 경기만 첨부 후보로 보여야 함");
ok(/await setPostRefMatch\(pid, refPick\)/.test(board), "글 저장 뒤에 첨부를 걸어야 함");
ok(/function refMatchCardHTML/.test(board) && /cur\.refMatch \? refMatchCardHTML/.test(board),
  "글 보기에서 카드를 그려야 함");
ok(/<details class="ref-match">/.test(board), "카드는 접혔다 펴져야 함 (기본은 스코어·날짜)");
ok(/rm-set-no/.test(board) && /champs\(\(g\["?picks"?\]/.test(board) === false || /g\[key\] \|\| \{\}/.test(board),
  "펼치면 세트별 밴픽이 나와야 함");
ok(/assets\/ddragon\.js/.test(post),
  "글 페이지에 챔피언 아이콘 스크립트가 있어야 함 (없으면 밴픽이 안 그려진다)");
ok(/loadDetailsLater/.test(board),
  "세트 상세는 늦게 오므로 도착 후 카드를 다시 그려야 함");
ok(/\.rm-ch\.ban \.dd-ic \{[^}]*grayscale/.test(css), "밴은 흑백으로 보여야 함");

console.log(`\npost-ref-match.test: ${n} 통과, 0 실패`);
