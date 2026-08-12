// 글에 붙는 모의밴픽 (schema28) — 화면·저장 쪽 계약
// 규칙 자체는 draft.test.js 가 본다. 여기는 "그 규칙을 실제로 쓰는가"를 본다.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const read = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

const store = read("assets/store.js");
const board = read("assets/board.js");
const write = read("write.html");
const post = read("post.html");
const css = read("assets/styles.css");
const sql = read("supabase/schema28_post_draft.sql");

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

// ── SQL ─────────────────────────────────────────────────
ok(/alter table public\.posts add column if not exists draft jsonb/.test(sql), "draft 칸을 만들어야 함");
ok(/grant select \(draft\) on public\.posts to anon, authenticated/.test(sql),
  "schema26 이 컬럼 권한을 잠갔으므로 새 칸은 따로 열어 줘야 함");
const fn = sql.slice(sql.indexOf("function public.set_post_draft"));
ok(/security definer/.test(fn.slice(0, 400)) && /set search_path = public/.test(fn.slice(0, 400)),
  "RPC 는 security definer + search_path 고정");
ok(/is distinct from v_uid and not public\.is_admin\(\)/.test(fn), "본인·관리자만");
ok(/jsonb_array_length\(v_sets\) < 1 or jsonb_array_length\(v_sets\) > 5/.test(fn), "세트는 1~5개");
ok(/length\(p_draft::text\) > 20000/.test(fn), "너무 큰 값은 막아야 함");
ok(!/is_official/.test(fn), "공식 경기방과 무관해야 함");

// ── 저장 ────────────────────────────────────────────────
ok(/,draft,/.test(store), "글 목록에서 draft 칸도 받아야 함");
ok(/function setPostDraft/.test(store) && /rpc\("set_post_draft"/.test(store), "전용 RPC 로 저장");
ok(/isMissingFunction/.test(store.slice(store.indexOf("function setPostDraft"))),
  "RPC 가 없는 DB 에서는 글쓰기가 살아야 함");
const addPostSrc = store.slice(store.indexOf('sb.rpc("create_post"'), store.indexOf('sb.rpc("create_post"') + 260);
ok(!/p_draft/.test(addPostSrc), "create_post 인자에 끼워 넣으면 안 됨");
ok(/const bad = draftValidate\(DRAFT\)/.test(board), "저장 전에 규칙 검사를 해야 함");
ok(/글은 정상 등록됩니다/.test(board), "밴픽이 잘못돼도 글 자체는 등록돼야 함");

// ── 편집기 ──────────────────────────────────────────────
ok(/id="draft-attach"/.test(write) && /id="draft-editor"/.test(write), "글쓰기에 편집기 자리가 있어야 함");
ok(/assets\/draft\.js/.test(write) && /assets\/draft\.js/.test(post), "두 화면 모두 엔진을 실어야 함");
ok(/function renderDraftEditor/.test(board), "편집기 렌더러");
ok(/draftPlace\(DRAFT, draftSet, champ, draftLane\)/.test(board), "넣기는 엔진을 거쳐야 함 (규칙 우회 금지)");
ok(/addEventListener\("dragstart"/.test(board) && /addEventListener\("drop"/.test(board), "끌어다 놓기 지원");
ok(/pool\.addEventListener\("click"/.test(board), "눌러서 넣기도 있어야 함 (터치 기기는 끌기가 안 된다)");
ok(/draftBlocked\(DRAFT, draftSet\)/.test(board), "못 고르는 챔피언을 표시해야 함");
ok(/피어리스 잠김/.test(board), "피어리스로 잠긴 챔피언을 보여 줘야 함");
ok(/d-champ.*disabled/.test(board.replace(/\n/g, " ")), "잠긴 챔피언은 누를 수 없어야 함");
ok(/id="d-undo"/.test(board), "되돌리기");

// ── 글에 박히는 보기 ────────────────────────────────────
ok(/function draftViewHTML/.test(board) && /cur\.draft \? draftViewHTML/.test(board), "글 본문에 그려야 함");
ok(/실제 경기 기록이 아닙니다/.test(board),
  "가상 밴픽임을 밝혀야 함 (실제 경기 기록과 헷갈리면 안 된다)");
ok(/draftFearlessBans\(draft, i\)/.test(board),
  "피어리스는 저장값이 아니라 앞 세트에서 계산해야 함");
ok(/\.dch\.ban \.dd-ic \{[^}]*grayscale/.test(css), "밴은 흑백");
ok(/@media \(max-width: 640px\)[\s\S]{0,200}\.dv-board \{ grid-template-columns: 1fr/.test(css),
  "좁은 화면에서는 위아래로 쌓여야 함");

console.log(`\npost-draft.test: ${n} 통과, 0 실패`);
