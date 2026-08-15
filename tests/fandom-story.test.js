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
// 같은 대진을 세 번 적어 카드만 커졌던 것 (2026-08-15)
ok(/!\[A\.abbr, B\.abbr\]\.every\(x => headline\.includes\(x\)\)/.test(hero),
  "제목에 이미 두 팀 이름이 있으면 부제를 접어야 함");
ok(!/hero-when">\$\{esc\(A\.abbr\)\} vs/.test(hero), "대진을 또 적는 줄이 남아 있으면 안 됨");
// 대표 선수 사진이 기본이 됐다 (2026-08-15). 근거 없는 선택이 되지 않게 규칙을 못 박는다.
const face = app.slice(app.indexOf("function heroFaceOf"), app.indexOf("function heroSideHTML"));
ok(/getFavPlayers\(\)/.test(face), "① 내가 찜한 선수가 이 팀에 있으면 그 선수부터");
ok(/pomPointsFor\(p\.id\)/.test(face), "② 팬들이 MVP 로 가장 많이 뽑은 선수");
ok(/rows\.length < 2/.test(face),
  "③ 팬 평점은 2경기 이상만 — 한 번 10점 받은 선수가 대표가 되면 안 된다");
ok(/return null;\s*\}$/m.test(face.trimEnd()) || /\n  return null;\n\}/.test(face),
  "근거가 없으면 null → 팀 로고로 내려앉아야 함");
ok(!/pos === "미드"|roster\[0\]/.test(face),
  "포지션·로스터 순서로 고르면 근거가 아니라 편애다");
// 공식 선수 사진은 **투명 컷아웃**이라 틀에 가두지 않는다 (박스면 증명사진처럼 답답하다)
ok(/playerPhotoURL\(player, 320\)/.test(app), "컷아웃을 크게 받아 틀 없이 세운다");
ok(!/hero-face|hero-badge/.test(app), "사진을 감싸던 상자·배지 마크업이 남아 있으면 안 됨");
ok(/\.hero-cut \{[\s\S]{0,220}drop-shadow/.test(css),
  "컷아웃은 윤곽을 따라가는 그림자로 띄운다 (box-shadow 면 네모가 생긴다)");
ok(/\.hero-side::after \{[\s\S]{0,260}linear-gradient\(180deg, transparent/.test(css),
  "바닥은 검정 그라데이션으로 잠기게 — 그 위에 로고·이름이 얹힌다");
ok(/\.hero-name \{[\s\S]{0,160}position: absolute;[\s\S]{0,80}z-index: 1/.test(css),
  "이름·로고는 그라데이션 위로 올라와야 함");
ok(/margin:14px -15px 0/.test(css), "카드 여백까지 넘겨 시원하게 쓴다");
ok(/\.hero-side\.no-photo \.hero-name \{ position: static/.test(css),
  "사진이 없는 팀도 빈 칸이 남지 않아야 함");
ok(/hook \? `<span class="home-match-hook">/.test(app) && /hook \? `<em class="home-schedule-hook">/.test(app),
  "훅이 없는 경기는 줄 자체가 생기면 안 됨");
ok(/\.home-match-game\.has-hook \{/.test(css) && /\.home-schedule-row\.has-hook \{/.test(css),
  "훅이 붙은 행만 2줄이 되어야 함 (없는 행은 예전 높이 유지)");

// ── 선수 얼굴 ───────────────────────────────────────────
ok(/function heroSideHTML\(team, player, side\)/.test(app), "히어로 한쪽을 그리는 함수");
ok(/teamLogoHTML\(team, photo \? 22 : 34\)/.test(app),
  "사진이 없으면 로고를 키워 그 자리를 대신한다");
ok(/picked\.find\(p => p\.team === match\.a\)/.test(app),
  "지정 선수는 자기 팀 쪽에 세워야 함 (입력 순서를 믿지 않는다)");
ok(/player-photos\.js/.test(html), "홈이 선수 사진 표를 실어야 얼굴이 나온다");
ok(/getPlayer\(id\)\)\.filter\(Boolean\)/.test(story),
  "로스터에서 사라진 선수는 조용히 빼야 함");

// ── 응원하기 ────────────────────────────────────────────
// 응원 버튼은 **아직 안 고른 사람에게만** 뜬다. 이미 고른 사람에겐 아무 일도 안 하는
// 버튼이 둘 늘어날 뿐이라 정작 눌러야 할 '예측하기' 가 묻힌다.
ok(/const cheer = fav === null/.test(hero), "응원 버튼은 팀을 안 고른 사람에게만");
ok(/const r = await setFavTeam\(btn\.dataset\.team\)/.test(hero), "그 버튼으로 응원팀 등록");
ok(/\.hero-cheer-btn:hover \{[^}]*var\(--team-color\)/.test(css), "응원 버튼은 팀 색으로 반응");

// ── 히어로가 고르는 경기 ────────────────────────────────
ok(/const STORY_WEIGHT = \{ admin: 4, standings: 3, streak: 2, rematch: 1 \}/.test(app),
  "서사가 강한 경기가 히어로로 올라와야 함");
ok(/const storyGap = homeStoryWeight\(b\) - homeStoryWeight\(a\)/.test(app),
  "팬 참여 수보다 서사 강도가 먼저");

// ── 내 응원팀 ───────────────────────────────────────────
const my = app.slice(app.indexOf("function renderHomeMyTeam"), app.indexOf("function renderHomeMatchBar"));
ok(/if \(!team && !subs\.length && !favPlayers\.length\) \{ el\.style\.display = "none"; return; \}/.test(my),
  "최애팀·관심팀·최애선수가 하나도 없으면 안 보여야 함");
ok(/예정된 경기 없음/.test(my), "다음 경기가 없어도 깨지지 않아야 함");
// A안 — 권리는 최애팀에만. 관심팀 줄에 글쓰기·응원 동선을 주면 안 된다
ok(/응원하러 가기/.test(my.slice(0, my.indexOf("myteam-row subs"))),
  "'응원하러 가기' 는 최애팀 줄에만");
ok(!/응원하러 가기/.test(my.slice(my.indexOf("myteam-row subs"))),
  "관심팀·선수 줄에는 응원 동선을 주지 않는다 (권리 차등이 눈에도 보여야 한다)");
ok(/오늘 출전/.test(my) && /fmtDayKey\(x\.at\) === todayKey/.test(my),
  "최애선수는 **오늘 경기가 있을 때만** 보여 준다");
ok(/renderHomeMyTeam\(\);/.test(app.slice(app.indexOf("async function initHome"))),
  "홈을 그릴 때 같이 그려야 함");
ok(/\.myteam-row \+ \.myteam-row \{[^}]*border-top/.test(css),
  "최애팀·관심팀·선수 줄은 선으로 나뉘어야 함 (한 덩어리로 뭉치면 뭐가 뭔지 안 읽힌다)");
ok(/\.myteam-tag\.sub \{[^}]*var\(--text-dim\)/.test(css),
  "관심팀·선수 표식은 최애팀보다 한 단계 조용해야 함 (권리 차이가 눈에도 보이게)");

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
// 히어로는 사이드바로 갔다. 좁은 화면엔 사이드바가 없으므로 상자를 없애고(display:contents)
// 순서로 예전 자리(맨 위)를 지킨다 — 안 그러면 서사가 게시판 아래로 밀린다.
ok(/\.home-sidebar \{ display: contents; \}/.test(narrow), "좁은 화면에선 사이드바 상자를 없앤다");
["#home-hero { order: 1; }", "#home-myteam { order: 2; }", ".home-main-column { order: 3; }"]
  .forEach(rule => ok(narrow.includes(rule), `모바일 순서: ${rule}`));
ok(/\.hero-cheer \{[^}]*width: 100%/.test(css),
  "응원 버튼 두 개는 한 줄을 채운다 (좁은 칸에서 밀리지 않게)");

// ── 다중 응원 (A안) ─────────────────────────────────────
// ⚠ 이 파일들은 함수 정의가 통째로 사라져도 node --check 는 통과한다.
//   실제로 블록을 교체하다 renderFanPickBar 를 지워 홈 전체가 죽은 적이 있다 (2026-08-14).
//   화면을 그리는 데 꼭 필요한 함수는 여기서 이름으로 확인한다.
["renderHeader", "renderFanPickBar", "renderHomeMatchBar", "renderHomeFeature",
 "renderHomeMyTeam", "teamStripHTML", "navDrawerHTML", "authSlotHTML"].forEach(fn =>
  ok(new RegExp(`function ${fn}\\(`).test(app), `app.js 에 ${fn} 가 있어야 함`));
["getSubTeams", "getFavPlayers", "setSubTeams", "setFavPlayers", "toggleFavPlayer", "myTeams"]
  .forEach(fn => ok(new RegExp(`function ${fn}\\(`).test(store), `store.js 에 ${fn} 가 있어야 함`));

const sql = read("supabase/schema29_fandom_multi.sql");
ok(/add column if not exists sub_teams   text\[\]/.test(sql), "관심팀 칸");
ok(/add column if not exists fav_players text\[\]/.test(sql), "최애선수 칸");
ok(/array_length\(clean, 1\) > 2/.test(sql), "관심팀은 서버에서도 2개까지");
ok(/array_length\(clean, 1\) > 5/.test(sql), "최애선수는 서버에서도 5명까지");
ok(/and t is distinct from cur/.test(sql), "최애팀은 관심팀이 될 수 없다");
ok(/join public\.players p on p\.id = x\.id/.test(sql), "없는 선수 id 는 걸러낸다");
ok(/'sub_teams', coalesce\(r\.sub_teams/.test(sql), "my_profile 이 새 칸을 돌려줘야 함");
ok(/sub_teams = coalesce\(/.test(sql), "최애팀을 바꾸면 관심팀에서 겹치는 것을 뺀다");
// A안의 핵심 — 관심팀에는 권리를 주지 않는다
const canPost = store.slice(store.indexOf("function canPostToTeam"), store.indexOf("function canPostToTeam") + 260);
ok(/Auth\.profile\?\.fav_team === teamId/.test(canPost) && !/sub_teams/.test(canPost),
  "팀 게시판 글쓰기는 최애팀만 — 관심팀이 끼면 '그 팀 팬 전용' 원칙이 무너진다");
ok(/isMissingFunction\(r\.error\)/.test(store.slice(store.indexOf("async function setSubTeams"))),
  "SQL 을 아직 안 돌린 DB 에서도 화면은 살아야 함");

// ── 운영자는 창립 팬에서 뺀다 (2026-08-15) ──────────────
// 100인은 "먼저 온 진짜 팬" 이 가치의 전부라, 운영자가 한 칸을 쓰면 그 자리가
// 팬에게서 사라진다. 그리고 운영자가 특정 팀 팬으로 보이면 운영이 편파적으로 읽힌다.
const sql30 = read("supabase/schema30_admin_not_founding.sql");
ok(/운영자 계정은 창립 팬에 등록하지 않습니다/.test(sql30), "등록 자체를 서버가 막아야 함");
ok(/delete from public\.founding_fans f[\s\S]{0,200}coalesce\(p\.is_admin, false\)/.test(sql30),
  "이미 등록된 운영자는 빼야 함");
ok(/create or replace view public\.v_public_profiles/.test(sql30) &&
   /case when coalesce\(is_admin, false\) then null else fav_team end/.test(sql30),
  "공개 목록에서 운영자의 응원팀은 가려야 함");
ok(/revoke select \(fav_team\) on public\.profiles from anon, authenticated/.test(sql30),
  "화면에서 숨기는 것만으론 부족하다 — 원본 칸 권한을 거둬야 진짜로 못 본다");
ok(/from\("v_public_profiles"\)/.test(store), "브라우저는 뷰로 읽어야 함");
ok(/v_public_profiles/.test(store.slice(store.indexOf("Cache.profiles ="))),
  "뷰가 없는 DB 에서는 원본으로 되돌아가야 함");
const fr = app.slice(app.indexOf("function renderFoundingRace"), app.indexOf("function renderPredictRanking"));
ok(/const isAdmin = !!\(Auth\.profile && Auth\.profile\.is_admin\)/.test(fr) && /const cta = isAdmin/.test(fr),
  "운영자에겐 등록 버튼 대신 이유를 보여 줘야 함");

console.log(`\nfandom-story.test: ${n} 통과, 0 실패`);
