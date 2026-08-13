// 경기 상세 손입력기 — 수집기가 못 채운 칸을 관리자가 직접 메울 수 있는가.
// 이 테스트가 지키려는 사고: 8/1 GEN-DK 2세트는 리그피디아엔 밴픽·오브젝트가
// 다 있는데 우리 화면만 비어 있었다. 원인은 saveDetailSet 이 game 을 아예
// 저장하지 않아서 **손으로도 채울 수 없었던 것**이다.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const read = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

const store = read("assets/store.js");
const admin = read("admin.html");
const css = read("assets/styles.css");
const app = read("assets/app.js");

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

// ── 저장 계약 ───────────────────────────────────────────
const save = store.slice(store.indexOf("function saveDetailSet"), store.indexOf("function deleteDetailSet"));
ok(/if \("game" in setData\) row\.game = setData\.game/.test(save),
  "game 을 넘기면 저장해야 함 — 이게 없으면 밴픽·오브젝트를 손으로 못 채운다");
ok(!/row\.game = setData\.game \?\?/.test(save) && /"game" in setData/.test(save),
  "game 키가 없는 호출은 기존 game 을 건드리면 안 됨 (부분 저장이 기록을 지우면 안 된다)");
ok(/const merged = \{ \.\.\.\(prev \|\| \{\}\), \.\.\.setData, _idx: setIndex \}/.test(save),
  "캐시도 덮어쓰기가 아니라 합쳐야 기존 game 이 살아남음");

// ── 편집기 뼈대 ─────────────────────────────────────────
ok(/id="dt-gaps"/.test(admin), "빈칸 목록 자리가 있어야 함");
ok(/id="dt-search"/.test(admin), "경기 검색칸 — 드롭다운만으로는 못 찾는다");
ok(/id="dt-sets"/.test(admin) && !/id="dt-set"[^s]/.test(admin),
  "세트는 탭으로. 옛 dt-set 드롭다운은 남아 있으면 안 됨");
ok(/function dtSetGaps/.test(admin) && /function dtMatchGaps/.test(admin), "빈칸 계산 함수");
ok(/function renderDetailGaps/.test(admin), "빈칸 목록 렌더");
ok(/빈칸 없음/.test(admin), "다 채우면 그렇다고 말해 줘야 함");

// 빈칸으로 세는 항목 — 하나라도 빠지면 사장님이 못 알아챈다
["선수 기록", "밴픽", "오브젝트", "골드", "킬", "경기 시간"].forEach(k =>
  ok(new RegExp(`miss\\.push\\("${k}"\\)`).test(admin), `${k} 도 빈칸으로 세야 함`));

// ── 입력 항목이 화면이 읽는 키와 맞는가 ─────────────────
ok(/blue: "a", len: "", kills: z\(\), gold: z\(\)/.test(admin), "game 기본 뼈대");
["towers", "inhib", "barons", "heralds", "grubs", "atakhan"].forEach(k =>
  ok(new RegExp(`k: "${k}"`).test(admin), `${k} 입력칸이 있어야 함`));
ok(/g\.len/.test(admin) && /g\.len/.test(app), "경기 시간 키는 화면과 같은 len");
ok(/DT_DRAKES = \["infernal", "mountain", "ocean", "cloud", "hextech", "chemtech"\]/.test(admin),
  "드래곤 속성은 화면의 DRAKE_KO 와 같아야 함");
const drakeKo = app.slice(app.indexOf("const DRAKE_KO"), app.indexOf("const DRAKE_COLOR"));
["infernal", "mountain", "ocean", "cloud", "hextech", "chemtech", "elder"].forEach(k =>
  ok(new RegExp(`${k}:`).test(drakeKo), `화면쪽 DRAKE_KO 에 ${k} 가 있어야 함`));
ok(/drakeRow\("elder"\)/.test(admin), "장로는 drakes.elder 로 (화면 표시와 같은 규칙)");
ok(!/k: "elders"/.test(admin), "장로를 오브젝트 키로 또 만들면 이중 계산됨");

// 드래곤 총계 — 화면의 elementalDragons 가 장로를 **빼기** 때문에 저장은 포함해야 한다
ok(/g\.dragons = \{ a: total\("a"\), b: total\("b"\) \}/.test(admin), "dragons 총계를 저장해야 함");
ok(/Object\.keys\(g\.drakes\[s\] \|\| \{\}\)\.reduce/.test(admin),
  "총계는 장로까지 포함한 합 — 화면이 다시 빼므로 여기서 빼면 안 됨");
ok(/elementalDragons/.test(app) && /- \(\+d\.elder \|\| 0\)/.test(app),
  "화면쪽이 장로를 빼는 전제가 유지돼야 함");

// 부분 입력 왕복 — 1·3번 픽만 넣고 저장했다가 다시 열어도 라인이 밀리면 안 된다
ok(/const trimTail = arr =>/.test(admin) && /while \(a\.length && !a\[a\.length - 1\]\) a\.pop\(\)/.test(admin),
  "픽·밴은 빈 자리를 지키고 뒤쪽만 잘라야 함");
ok(!/\(g\[k\]\.a \|\| \[\]\)\.map\(x => \(x \|\| ""\)\.trim\(\)\)\.filter\(Boolean\)/.test(admin),
  "가운데 빈 칸을 걸러내면 자리가 밀린다");
ok(/const champs = \(list, kind\) => \(list \|\| \[\]\)\.filter\(Boolean\)/.test(app),
  "화면은 빈 자리를 건너뛰어야 함 (그래야 자리를 남겨 둘 수 있다)");
ok(/\(v\.a \|\| \[\]\)\.filter\(Boolean\)\.length && !\(v\.b \|\| \[\]\)\.filter\(Boolean\)\.length/.test(app),
  "빈 값만 든 밴픽은 줄을 그리지 않아야 함");

// ── 편의 ────────────────────────────────────────────────
ok(/list="dt-champ-names"/.test(admin) && /function dtFillChampNames/.test(admin),
  "챔피언은 타이핑 자동완성 — 10명×여러 칸을 모달로 찍는 건 너무 느리다");
ok(/dd-pickable" data-kind="champ"/.test(admin), "아이콘으로 고르는 길도 남겨 둬야 함");
ok(/class="dt-pkda" placeholder="K\/D\/A"/.test(admin), "KDA 는 한 칸에 (K·D·A 세 칸은 탭질이 많다)");
ok(/\/\(\\d\+\)\\D\+\(\\d\+\)\\D\+\(\\d\+\)\//.test(admin), "3/1/2 를 읽어야 함");
ok(/const syncPick =/.test(admin) && /el\.dataset\.fromPick === "1"/.test(admin),
  "픽 → 선수 챔피언 자동 채움. 단 손으로 고친 값은 덮지 않아야 함");
ok(/\.filter\(p => \(p\.champ \|\| ""\)\.trim\(\)\)/.test(admin),
  "챔피언이 빈 선수는 미출전 — 저장에서 빠져야 함 (예전 규칙 유지)");

// 커서 튐 방지 — 값 하나 고칠 때마다 다시 그리면 입력이 불가능해진다
ok(/let dtWork = null/.test(admin), "작업본에 값을 모아야 함");
ok(/box\.querySelector\("b"\)\.textContent = next/.test(admin),
  "오브젝트 +− 는 그 칸 숫자만 고쳐야 함 (전체 재렌더 금지)");
ok(/mSel\.onchange = \(\)/.test(admin) && /searchEl\.oninput = \(\)/.test(admin),
  "on* 로 넣어야 다시 그릴 때 핸들러가 쌓이지 않음");

// ── 모양 ────────────────────────────────────────────────
ok(/\.dt-blank \{[^}]*rgba\(255,193,7/.test(css), "빈칸은 노란 테두리로 스스로 드러나야 함");
ok(/\.dt-obj-row \{ display: grid; grid-template-columns: 1fr 128px 1fr/.test(css),
  "오브젝트는 화면 표시와 같은 좌우 대립 구도");
const narrow = css.slice(css.indexOf("@media (max-width: 860px)"));
ok(/\.dt-prow \{ grid-template-columns: repeat\(6, 1fr\)/.test(narrow),
  "좁은 화면에서 선수 행이 가로로 넘치면 안 됨");
ok(/\.dt-prow > \.dt-pkda, \.dt-prow > \.dt-pcs, \.dt-prow > \.dt-pgold \{ grid-column: span 2/.test(narrow),
  "KDA·CS·골드는 한 줄에 나란히 — 흩어지면 어느 칸인지 다시 헷갈린다");
ok(/\.dt-pb \{ grid-template-columns: 1fr/.test(narrow), "좁은 화면에서 밴픽 두 팀은 위아래로");
ok(/\.dt-obj-row > \.dt-step\[data-side="a"\] \{ justify-self: end/.test(css),
  "+− 칸이 열 전체로 늘어나면 대립 구도가 안 읽힘");

console.log(`\ndetail-editor.test: ${n} 통과, 0 실패`);
