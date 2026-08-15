// 국제 대회(MSI·EWC·월즈) 추가 회귀 테스트 (2026-08-15)
// 여기서 지키려는 것은 단 하나: **해외 팀이 팬덤 기능으로 새어 나가지 않는 것**.
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const read = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("✗ " + m); } };

const data = read("assets/data.js");
const app = read("assets/app.js");
const store = read("assets/store.js");
const story = read("assets/story.js");
const sql = read("supabase/schema31_intl_tournaments.sql");

// ── ① TEAMS 는 LCK 전용으로 남아야 한다 ──────────────────────
// TEAMS 를 도는 코드가 응원팀 고르기·팀 게시판·창립 팬·순위표다. 여기에 해외 팀이
// 섞이면 응원팀 목록에 26팀이 나오고 LCK 순위표가 오염된다.
const teamsBlock = data.slice(data.indexOf("const TEAMS = ["), data.indexOf("const INTL_TEAMS"));
ok(!/blg|g2|karmine|furia/i.test(teamsBlock), "TEAMS 에 해외 팀이 들어가면 안 됨");
ok((teamsBlock.match(/id: "/g) || []).length === 10, "TEAMS 는 LCK 10팀이어야 함");
ok(/const TEAM_MAP = Object\.fromEntries\(\[\.\.\.TEAMS, \.\.\.INTL_TEAMS\]/.test(data),
  "조회용 지도에는 해외 팀도 합쳐야 함 (경기 화면이 팀을 못 찾으면 비어 버린다)");

// ── ② 해외 팀 로고는 공식 CDN 주소를 그대로 쓴다 ─────────────
ok(/const src = team\.logo \|\| `assets\/logos\/\$\{team\.id\}\.svg`/.test(app),
  "team.logo 가 있으면 그 주소를, 없으면 저장된 SVG 를 써야 함");
const intl = data.slice(data.indexOf("const INTL_TEAMS"), data.indexOf("const TEAM_MAP"));
ok((intl.match(/logo: "https:\/\//g) || []).length === (intl.match(/id: "/g) || []).length,
  "해외 팀은 전부 https 로고 주소를 가져야 함 (하나라도 빠지면 그 팀만 로고가 깨진다)");
ok(!/logo: "http:\/\//.test(intl), "http 주소는 안 됨 (혼합 콘텐츠로 막힌다)");

// ── ③ 국제 대회 결과가 LCK 연승·리매치에 섞이면 안 된다 ──────
// 그냥 두면 한화생명의 MSI 우승 연승이 LCK "연승 행진"으로 둔갑한다.
ok(/function isSeasonMatch\(m\)/.test(store) && /stageInTotal\(s\) && key\(s\.name\) === key\(m\.stage\)/.test(store),
  "정규 라운드 판정은 순위표와 같은 기준(in_total)을 써야 함");
ok(/function seasonOnly\(m\)/.test(story), "story.js 에 정규 라운드 필터가 있어야 함");
ok((story.match(/seasonOnly\(m\)/g) || []).length >= 3,
  "연승·리매치 두 곳 모두에 필터가 걸려야 함");

// ── ④ SQL ─────────────────────────────────────────────────
ok(/'msi2026'/.test(sql) && /'ewc2026'/.test(sql) && /'worlds2026'/.test(sql), "대회 3개");
const rows = (sql.match(/^\('(msi|ewc)2026-\d\d'/gm) || []).length;
ok(rows === 48, `경기 48개여야 함 (MSI 20 + EWC 28), 지금 ${rows}`);
ok(/on conflict \(id\) do update/.test(sql), "다시 돌려도 안전해야 함 (여러 번 실행될 수 있다)");
// 월즈는 참가팀이 안 정해졌으므로 경기를 만들면 안 된다 — 빈 대진이 팀 이름 자리를 깨뜨린다
ok(!/'worlds2026-/.test(sql), "월즈는 참가팀 확정 전이라 경기를 넣지 않는다");

// ── ⑤ 대진표 ─────────────────────────────────────────────
const br = read("assets/brackets.js");
const brHtml = read("bracket.html");
const css = read("assets/styles.css");

// 마디를 경기에 잇는 방법: MSI·EWC 는 우리가 직접 넣어 id 가 정해져 있으므로 **정확히** 짚는다.
// 리그피디아 대회처럼 꼬리 정규식으로 짐작하면 엉뚱한 경기가 붙을 수 있다.
ok(/const exact = id => new RegExp\("\^" \+ id \+ "\$"\)/.test(br), "id 로 정확히 짚어야 함");
const msi = br.slice(br.indexOf("msi2026: {"), br.indexOf("ewc2026: {"));
const ewc = br.slice(br.indexOf("ewc2026: {"), br.indexOf('"lck2026-msi"'));
ok((msi.match(/find: exact\("msi2026-\d\d"\)/g) || []).length === 20,
  "MSI 20경기가 모두 대진표 마디에 붙어야 함 (하나라도 빠지면 그 칸이 빈다)");
ok((ewc.match(/find: exact\("ewc2026-\d\d"\)/g) || []).length === 8,
  "EWC 는 녹아웃 8경기 (그룹 20경기는 대진표로 그릴 모양이 아니다)");
// 같은 경기를 두 마디가 가리키면 한쪽이 빈 채로 남는다
const ids = (br.match(/exact\("(msi|ewc)2026-\d\d"\)/g) || []);
ok(new Set(ids).size === ids.length, "한 경기를 두 마디가 가리키면 안 됨");

ok(/if \(spec\.parts\)/.test(br) && /parts\.find\(p => p\.key === partKey\)/.test(br),
  "단계가 나뉜 대회는 고른 단계만 그려야 함");
ok(/function renderParts\(spec\)/.test(brHtml) && /id="bracket-parts"/.test(brHtml),
  "단계 단추가 있어야 함");
// 단추를 .bracket 안에 넣으면 가로 flex 의 열 하나처럼 옆에 붙는다
ok(brHtml.indexOf('id="bracket-parts"') < brHtml.indexOf('id="bracket-body"'),
  "단계 단추는 대진표(.bracket) 바깥에 있어야 함");
ok(/state\.part = null/.test(brHtml), "대회를 바꾸면 단계 선택을 초기화해야 함");

// 압축 — 마디가 14~20개인 국제 대회는 기본 크기로는 화면을 넘어간다
ok(/\.bracket\.compact \.bm-slot \{[\s\S]{0,160}min-height:26px/.test(css), "압축 시 자리 높이 26px");
ok(/\.bracket\.compact \.bm-from \{ display: none; \}/.test(css) &&
   /\.bracket\.compact \.bm-slot\.tbd \.bm-from \{/.test(css),
  "끝난 대회에선 자리 라벨을 감추고, 미정 칸에서만 보여야 함");

console.log(`\nintl-tournaments.test: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
