// 전체 메뉴 서랍 · 팀 줄 간소화 · 글씨 크기
//
// 배경(2026-08-14): 휴대폰에서는 상단 가로 메뉴(.main-nav)가 숨겨지고 하단 탭바는
// 5칸뿐이라, 선수·팀 / 대진표 / 수상 / 경우의 수 / 팀 게시판으로 갈 길이 없었다.
// 서랍이 그 통로다 — 이게 없어지면 화면 여럿이 통째로 고립된다.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const read = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

const app = read("assets/app.js");
const css = read("assets/styles.css");

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

// ── 서랍 ────────────────────────────────────────────────
ok(/<button class="btn-icon nav-open" id="nav-open"/.test(app), "헤더 왼쪽에 햄버거 버튼");
ok(/aria-expanded="false" aria-controls="nav-drawer"/.test(app), "열림 상태를 보조기기에 알려야 함");
ok(/function navDrawerHTML\(groupName, activeTeamId\)/.test(app), "서랍 마크업 함수");
ok(/function bindNavDrawer\(root\)/.test(app), "서랍 동작 함수");
ok(/NAV_GROUPS\.map\(g =>[\s\S]{0,400}g\.subs \|\| \[\]/.test(app),
  "묶음과 그 안의 갈래를 한 번에 펼쳐야 함 (두 번 눌러 들어가게 하지 않는다)");
ok(/item\("my\.html", "MY · 팬 여권"/.test(app), "MY 도 서랍에 있어야 함");
ok(/TEAMS\.map\(t => `[\s\S]{0,200}team\.html\?team=\$\{t\.id\}/.test(app), "10개 팀 게시판이 서랍에");

// 닫는 길이 여러 개여야 한다 — 하나만 있으면 갇힌다
ok(/e\.key === "Escape"/.test(app), "Esc 로 닫기");
ok(/querySelectorAll\("\[data-close\]"\)/.test(app), "닫기 버튼·바깥 배경으로 닫기");
ok(/nav-drawer-back" data-close/.test(app), "바깥을 눌러도 닫혀야 함");
ok(/document\.body\.classList\.toggle\("nav-open-lock", on\)/.test(app),
  "열려 있는 동안 뒤 본문이 같이 스크롤되면 안 됨");
ok(/body\.nav-open-lock \{ overflow: hidden; \}/.test(css), "그 잠금 스타일");
ok(/\.nav-drawer\[hidden\] \{ display: none; \}/.test(css),
  "hidden 만으로는 flex 가 이겨서 안 사라진다 — 명시해야 함");

// ── 팀 줄: 로고만 · 팀 화면에선 아예 없음 ───────────────
ok(/function teamStripHTML\(activeTeamId\)/.test(app), "팀 줄을 따로 그리는 함수");
ok(/if \(activeTeamId\) return "";/.test(app),
  "그 팀 게시판 안에서는 팀 줄을 그리지 않는다 (화면에 팀 배너가 이미 있다)");
const strip = app.slice(app.indexOf("function teamStripHTML"), app.indexOf("function navDrawerHTML"));
ok(!/team-abbr/.test(strip), "로고 밑 약자는 뺀다 (로고에 이미 이름이 들어 있다)");
ok(/aria-label="\$\{esc\(t\.name\)\} 게시판"/.test(strip), "글자를 뺐으니 이름은 보조기기에 남겨야 함");
ok(!/team-abbr/.test(css), "쓰지 않는 약자 스타일이 남아 있으면 안 됨");

// ── 글씨 크기 ───────────────────────────────────────────
const tok = {
  "--fs-xs": 13, "--fs-sm": 14, "--fs-base": 15, "--fs-md": 16, "--fs-lg": 20, "--fs-xl": 26,
};
Object.entries(tok).forEach(([k, v]) =>
  ok(new RegExp(`${k}: ${v}px;`).test(css), `${k} 는 ${v}px 여야 함`));
// 11px 은 휴대폰에서 읽기 힘들다 — 예전엔 61곳이나 있었다
// CSS 뿐 아니라 JS·HTML 이 style= 로 직접 박는 것까지 본다 —
// 실제로 CSS 만 고쳤을 때 인라인 11px 이 화면에 그대로 남아 있었다.
const FILES = ["assets/styles.css", "assets/app.js", "assets/board.js",
  "live.html", "race.html", "awards.html", "player.html", "admin.html"];
const tiny = FILES.flatMap(f => (read(f).match(/font-size: ?(9|10|11)px/g) || []).map(() => f));
ok(tiny.length === 0, `9~11px 글씨가 남아 있다 — 휴대폰에서 안 읽힌다: ${[...new Set(tiny)].join(", ")}`);

console.log(`\nnav-drawer.test: ${n} 통과, 0 실패`);
