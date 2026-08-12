// 글 본문 꾸미기 — 유튜브 영상 · 링크
//
// 지키려는 것: **임의 HTML 은 절대 실행되지 않는다.**
// 글에 <script> 를 넣어 남의 계정을 훔치는 건 커뮤니티에서 가장 흔한 공격이다.
// 우리는 전부 escape 한 뒤 **아는 모양(유튜브·http 주소)만** 골라 바꾼다.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "assets/board.js"), "utf8");
const start = src.indexOf("const YT_MAX");
const end = src.indexOf("// 이 글을 **읽을** 수 있나");
assert(start >= 0 && end > start, "본문 꾸미기 코드 범위를 찾을 수 있어야 함");

// app.js 의 esc 와 같은 규칙
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const postBodyHTML = new Function("esc", src.slice(start, end) + "; return postBodyHTML;")(esc);

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

// ① 악성 HTML 은 글자로만 남는다
const evil = postBodyHTML('<img src=x onerror="alert(1)"><script>alert(2)</script>');
ok(!/<img/i.test(evil) && !/<script/i.test(evil), "태그가 살아 있으면 안 된다");
ok(evil.includes("&lt;script&gt;"), "태그는 글자로 보여야 한다");

// ② 유튜브 주소 세 형태 모두 영상 틀로
["https://www.youtube.com/watch?v=dQw4w9WgXcQ",
 "https://youtu.be/dQw4w9WgXcQ",
 "https://www.youtube.com/shorts/dQw4w9WgXcQ",
 "https://m.youtube.com/watch?v=dQw4w9WgXcQ"].forEach(u =>
  ok(postBodyHTML("보세요 " + u + " 끝").includes("youtube-nocookie.com/embed/dQw4w9WgXcQ"),
    `영상 틀로 바뀌어야 함: ${u}`));

// ③ 유튜브가 아닌 주소는 링크로만 (틀을 만들면 아무 사이트나 우리 화면에 박힌다)
const link = postBodyHTML("https://example.com/a?b=1");
ok(link.includes('rel="noopener noreferrer nofollow ugc"'), "바깥 링크는 noopener 로 열어야 함");
ok(!link.includes("<iframe"), "유튜브가 아닌 주소를 영상 틀로 만들면 안 됨");

// ④ 가짜 유튜브 도메인 차단 — youtube.com.evil.kr 같은 주소
ok(!postBodyHTML("https://youtube.com.evil.kr/watch?v=dQw4w9WgXcQ").includes("<iframe"),
  "가짜 유튜브 도메인을 영상으로 만들면 안 됨");

// ⑤ 한 글에 영상은 3개까지 (도배 방지)
const many = postBodyHTML(Array.from({ length: 5 }, (_, i) => `https://youtu.be/aaaaaaaaaa${i}`).join("\n"));
ok((many.match(/<iframe/g) || []).length === 3, "영상은 3개까지만 틀로 만들어야 함");

// ⑥ 본문 렌더가 실제로 이 함수를 쓰는지 (esc 로 되돌아가면 영상이 안 나온다)
ok(src.includes("postBodyHTML(cur.body)"), "글 본문은 postBodyHTML 로 그려야 함");

console.log(`\npost-embed.test: ${n} 통과, 0 실패`);
