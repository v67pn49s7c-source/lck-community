// 팬덤 UX — 오늘의 서사(Match Story) · 히어로 · 내 응원팀 · 경기 훅
//
// 이 테스트가 지키려는 것 두 가지:
//  ① **없는 사실을 지어내지 않는다** — 자동 서사는 우리가 실제로 가진 기록만 쓴다.
//  ② **서사가 없어도 화면은 멀쩡하다** — 카피가 없는 경기도 그냥 잘 나와야 한다.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const read = f => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

const story = read("assets/story.js");
const app = read("assets/app.js");
const store = read("assets/store.js");
const html = read("index.html");
const admin = read("admin.html");
const css = read("assets/styles.css");

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

// ── ① 지어내지 않는다 ───────────────────────────────────
const auto = story.slice(story.indexOf("function storyAuto"), story.indexOf("function storyFor"));
ok(/storyPrevMeeting\(match\)/.test(auto), "리매치는 실제 직전 맞대결에서만");
ok(/cumulativeRankOf/.test(auto), "순위 경쟁은 실제 순위표에서만");
ok(/storyStreak\(match\.a, match\.at\)/.test(auto), "연승·연패는 실제 전적에서만");
ok(/prev\.scoreA !== prev\.scoreB/.test(auto), "무승부·미확정 경기로 리매치를 만들면 안 됨");
// 자동 서사가 손대면 안 되는 유형들 — 우리 DB에 근거가 없다
["rivalry", "meme", "reunion", "rookie", "star"].forEach(k =>
  ok(!new RegExp(`type: "${k}"`).test(auto),
    `${k} 서사는 근거 데이터가 없으므로 자동 생성하면 안 됨 (운영자 입력 전용)`));
ok(/storyAdmin\(match\.id\) \|\| storyAuto\(match\)/.test(story), "운영자 서사가 자동보다 우선");

// 리매치를 마지막에 두는 이유 — 풀리그라 거의 모든 경기가 재대결이다
ok(auto.indexOf("cumulativeRankOf") < auto.indexOf("storyPrevMeeting"),
  "순위 경쟁이 리매치보다 먼저 (안 그러면 모든 줄이 '재대결'로 똑같아진다)");
ok(auto.indexOf("storyStreak") < auto.indexOf("storyPrevMeeting"),
  "연승도 리매치보다 먼저");
ok(/headline: `\$\{pLoser\.abbr\}의 설욕전`/.test(auto),
  "리매치 제목엔 팀 이름이 들어가야 줄마다 달라진다");
ok(/subheadline: `\$\{hiT\.name\} vs \$\{loT\.name\}`/.test(auto),
  "부제가 제목을 되풀이하면 안 됨");

// ── ② 서사가 없어도 멀쩡 ────────────────────────────────
ok(/return null;\s*\}\s*\/\*\* 이 경기의 서사/.test(story.replace(/\n/g, "")) ||
   /\n  return null;\n\}/.test(auto), "조건에 안 맞으면 서사 없음(null)을 돌려줘야 함");
const hero = app.slice(app.indexOf("function renderHomeFeature"), app.indexOf("function renderHomeMyTeam"));
ok(/const eyebrow = story \? story\.eyebrow : "다음 경기"/.test(hero), "서사 없으면 기본 눈썹");
ok(/const headline = story \? story\.headline : `\$\{A\.abbr\} vs \$\{B\.abbr\}`/.test(hero),
  "서사 없으면 팀 이름으로 폴백");
ok(/\$\{sub \? `<p class="hero-sub">/.test(hero) && /\$\{desc \? `<p class="hero-desc">/.test(hero),
  "빈 부제·설명은 빈 태그를 남기지 말아야 함");
ok(/hook \? `<span class="home-match-hook">/.test(app) && /hook \? `<em class="home-schedule-hook">/.test(app),
  "훅이 없는 경기는 줄 자체가 생기면 안 됨");
ok(/\.home-match-game\.has-hook \{/.test(css) && /\.home-schedule-row\.has-hook \{/.test(css),
  "훅이 붙은 행만 2줄이 되어야 함 (없는 행은 예전 높이 유지)");

// ── 선수 얼굴 ───────────────────────────────────────────
ok(/function heroSideHTML\(team, player, side\)/.test(app), "히어로 한쪽을 그리는 함수");
ok(/playerPhotoURL\(player, 160\)/.test(app), "지정 선수는 공식 사진으로");
ok(/: `<span class="hero-crest">\$\{teamLogoHTML\(team, 54\)\}<\/span>`/.test(app),
  "사진이 없으면 팀 로고로 조용히 폴백");
ok(/picked\.find\(p => p\.team === match\.a\)/.test(app),
  "지정 선수는 자기 팀 쪽에 세워야 함 (입력 순서를 믿지 않는다)");
ok(/player-photos\.js/.test(html), "홈이 선수 사진 표를 실어야 얼굴이 나온다");
ok(/getPlayer\(id\)\)\.filter\(Boolean\)/.test(story),
  "로스터에서 사라진 선수는 조용히 빼야 함");

// ── 응원하기 ────────────────────────────────────────────
ok(/if \(cur !== null\) \{ location\.href = /.test(hero),
  "이미 응원팀이 있으면 말없이 바꾸지 말고 경기 화면으로 (회원은 30일 잠금)");
ok(/const r = await setFavTeam\(id\)/.test(hero), "안 고른 사람은 이 버튼으로 응원팀 등록");
ok(/mine \? `내 팀 \$\{esc\(t\.abbr\)\}`/.test(hero), "내 팀은 상태로 보여 줘야 함");
ok(/\.hero-cheer-btn\.mine \{[^}]*var\(--team-color\)/.test(css), "내 팀 버튼은 팀 색으로");

// ── 히어로가 고르는 경기 ────────────────────────────────
ok(/const STORY_WEIGHT = \{ admin: 4, standings: 3, streak: 2, rematch: 1 \}/.test(app),
  "서사가 강한 경기가 히어로로 올라와야 함");
ok(/const storyGap = homeStoryWeight\(b\) - homeStoryWeight\(a\)/.test(app),
  "팬 참여 수보다 서사 강도가 먼저");

// ── 내 응원팀 ───────────────────────────────────────────
const my = app.slice(app.indexOf("function renderHomeMyTeam"));
ok(/if \(!team\) \{ el\.style\.display = "none"; return; \}/.test(my), "안 고른 사람에겐 안 보여야 함");
ok(/예정된 경기 없음/.test(my), "다음 경기가 없어도 깨지지 않아야 함");
ok(/renderHomeMyTeam\(\);/.test(app.slice(app.indexOf("async function initHome"))),
  "홈을 그릴 때 같이 그려야 함");
ok(/\.myteam-roster \{[^}]*text-overflow: ellipsis/.test(css), "로스터가 길어도 줄이 안 밀려야 함");

// ── 저장 ────────────────────────────────────────────────
const save = store.slice(store.indexOf("async function setMatchStory"));
ok(/await reloadSetting\(STORY_KEY\)/.test(save), "다른 창에서 넣은 서사를 덮어쓰면 안 됨");
ok(/if \(id !== matchId && !live\.has\(id\)\) delete all\[id\]/.test(save),
  "끝난 경기 서사는 지워야 함 (설정 한 칸이 시즌 내내 커지면 안 된다)");
ok(/else delete all\[matchId\]/.test(save), "제목이 비면 자동 서사로 되돌아가야 함");

// ── 관리자 ──────────────────────────────────────────────
ok(/id="hc-match"/.test(admin) && /id="hc-type"/.test(admin) && /id="hc-headline"/.test(admin),
  "경기·유형·제목을 고를 수 있어야 함");
ok(/id="hc-p\$\{slot\}"/.test(admin) && /playerOpts\("a", match\.a\)/.test(admin) &&
   /playerOpts\("b", match\.b\)/.test(admin), "팀별 주인공 선수를 고를 수 있어야 함");
ok(/getElementById\("hc-pa"\)\.value, document\.getElementById\("hc-pb"\)\.value/.test(admin),
  "저장할 때 두 선수를 함께 읽어야 함");
ok(/이 경기를 비워 두면 자동 서사가 나갑니다/.test(admin),
  "안 넣으면 무엇이 나가는지 미리 보여 줘야 함");
ok(/setMatchStory\(match\.id, null\)/.test(admin), "비우기 버튼");
ok(/STORY_TYPES\.map/.test(admin), "유형 목록은 story.js 한 곳에서");

// ── 모바일 우선순위 ─────────────────────────────────────
const narrow = css.slice(css.indexOf("@media (max-width: 720px)"));
ok(/grid-template-areas: "copy" "stage" "actions"/.test(narrow),
  "모바일은 서사 → 얼굴 → 응원 순서로 쌓여야 함");
const tiny = css.slice(css.indexOf("@media (max-width: 560px)"));
ok(/\.hero-cheer, \.hero-links \{ display: grid; grid-template-columns: 1fr 1fr/.test(tiny),
  "좁은 화면에서 버튼은 2칸씩 (가로로 밀리면 안 됨)");
ok(/\.hero-face \{ width: 76px; height: 76px; \}/.test(tiny), "좁은 화면에서 얼굴 크기 조정");

console.log(`\nfandom-story.test: ${n} 통과, 0 실패`);
