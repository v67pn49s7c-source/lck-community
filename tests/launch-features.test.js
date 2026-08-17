const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const writeHtml = fs.readFileSync("write.html", "utf8");
const liveHtml = fs.readFileSync("live.html", "utf8");
const board = fs.readFileSync("assets/board.js", "utf8");
const app = fs.readFileSync("assets/app.js", "utf8");
const css = fs.readFileSync("assets/styles.css", "utf8");

// 관리자 공지: 화면 개방만으로 권한을 넓히지 않고, 공지는 전체 게시판·무첨부로 고정한다.
assert(writeHtml.includes('id="notice-mode-hint"') && writeHtml.includes('role="status"'),
  "공지 모드와 범위를 관리자에게 명확히 안내해야 함");
assert(board.includes('Auth.profile?.is_admin ? `<option value="공지">'),
  "공지 분류는 관리자에게만 보여야 함");
assert(board.includes('team: isNotice ? null : team') && board.includes('match_id: isNotice ? null : matchId'),
  "공지는 팀·공식 경기 연결 없이 전체 공지로 저장해야 함");
assert(board.includes("Auth.session && !isNotice") && board.includes('catSelect.addEventListener("change", setNoticeMode)'),
  "공지에는 일반 글 첨부가 들어가지 않아야 함");

// 경기 공유: 메신저 미리보기가 있는 SSR 경기 주소를 사용한다.
assert(liveHtml.includes('id="match-share"') && liveHtml.includes("shareMatch(match)"),
  "경기 화면에 접근 가능한 공유 버튼이 연결돼야 함");
assert(app.includes("navigator.share") && app.includes("navigator.clipboard?.writeText"),
  "기기 공유와 링크 복사 대체 동작을 모두 지원해야 함");
const fnSource = app.match(/function matchShareData[\s\S]*?\n}/)?.[0];
assert(fnSource, "경기 공유 데이터 생성 함수를 찾을 수 있어야 함");
const context = { URL, encodeURIComponent, slotName: value => value.toUpperCase(), location: { origin: "https://ignored.test" } };
vm.createContext(context);
vm.runInContext(`${fnSource}; result = matchShareData({id:"match / 1",a:"kt",b:"dk",status:"done",scoreA:2,scoreB:1}, "https://lck-community.vercel.app")`, context);
assert.strictEqual(context.result.url, "https://lck-community.vercel.app/match/match%20%2F%201");
assert(context.result.title.includes("KT vs DK 2:1"), "끝난 경기는 공유 제목에 스코어가 포함돼야 함");

assert(css.includes(".match-share-btn") && css.includes(".notice-mode-hint"),
  "신규 기능이 기존 디자인 체계 안에서 보여야 함");

console.log("✓ 3차 출시필수 공지·경기 공유 회귀 테스트 통과");
