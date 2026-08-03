// LCK 2026 팀 · 일정 · 순위 데이터 (프로토타입 목업)
// 표시 순서: 약어 알파벳순 (순위표는 성적순으로 별도 정렬됨)
const TEAMS = [
  { id: "bfx", abbr: "BFX", name: "BNK FEARX",       color: "#ffc900", dark: "#3a2e00" },
  { id: "bro", abbr: "BRO", name: "한진 브리온",       color: "#18a05e", dark: "#07301c" },
  { id: "dk",  abbr: "DK",  name: "Dplus KIA",       color: "#0ec7b5", dark: "#06302c" },
  { id: "dns", abbr: "DNS", name: "DN SOOPers",      color: "#1f7bff", dark: "#082044" },
  { id: "gen", abbr: "GEN", name: "Gen.G",           color: "#a9852a", dark: "#2e2408" },
  { id: "hle", abbr: "HLE", name: "한화생명e스포츠",   color: "#f07800", dark: "#3a1e02" },
  { id: "krx", abbr: "KRX", name: "KIWOOM DRX",      color: "#4a7dff", dark: "#0d1c40" },
  { id: "kt",  abbr: "KT",  name: "kt 롤스터",        color: "#ff2d2d", dark: "#3a0a0a" },
  { id: "ns",  abbr: "NS",  name: "농심 레드포스",     color: "#de2027", dark: "#38080b" },
  { id: "t1",  abbr: "T1",  name: "T1",              color: "#e2012d", dark: "#3a0710" },
];

const TEAM_MAP = Object.fromEntries(TEAMS.map(t => [t.id, t]));

// 경기 일정 (2026 스플릿 3, 8월 첫 주)
const SCHEDULE = [
  {
    date: "26. 08. 02 일", today: true,
    matches: [
      { time: "10:00", a: "dns", b: "bro", status: "done", scoreA: 2, scoreB: 1 },
      { time: "13:15", a: "kt", b: "hle", status: "upcoming", oddsA: 3.50, oddsB: 1.30,
        startsAt: "2026-08-02T13:15:00+09:00", pctA: 19.6, pctB: 80.4 },
    ],
  },
  {
    date: "26. 08. 05 수",
    matches: [
      { time: "10:00", a: "bro", b: "ns",  status: "upcoming", oddsA: 2.60, oddsB: 1.50, startsAt: "2026-08-05T10:00:00+09:00" },
      { time: "12:00", a: "hle", b: "gen", status: "upcoming", oddsA: 1.65, oddsB: 2.25, startsAt: "2026-08-05T12:00:00+09:00" },
    ],
  },
  {
    date: "26. 08. 06 목",
    matches: [
      { time: "10:00", a: "krx", b: "dns", status: "upcoming", oddsA: 1.42, oddsB: 2.90, startsAt: "2026-08-06T10:00:00+09:00" },
      { time: "12:00", a: "dk",  b: "t1",  status: "upcoming", oddsA: 2.05, oddsB: 1.78, startsAt: "2026-08-06T12:00:00+09:00" },
    ],
  },
  {
    date: "26. 08. 07 금",
    matches: [
      { time: "10:00", a: "kt",  b: "gen", status: "upcoming", oddsA: 2.35, oddsB: 1.60, startsAt: "2026-08-07T10:00:00+09:00" },
      { time: "12:00", a: "bfx", b: "bro", status: "upcoming", oddsA: 1.50, oddsB: 2.60, startsAt: "2026-08-07T12:00:00+09:00" },
    ],
  },
];

// 2026 라운드 3-4 순위
const STANDINGS = {
  legend: [
    { team: "dk",  w: 2, l: 0, pt: 3 },
    { team: "kt",  w: 1, l: 0, pt: 2 },
    { team: "t1",  w: 1, l: 1, pt: 0 },
    { team: "hle", w: 0, l: 1, pt: -1 },
    { team: "gen", w: 0, l: 2, pt: -4 },
  ],
  rise: [
    { team: "ns",  w: 2, l: 0, pt: 3 },
    { team: "bfx", w: 1, l: 1, pt: 1 },
    { team: "dns", w: 1, l: 1, pt: 1 },
    { team: "krx", w: 1, l: 1, pt: 0 },
    { team: "bro", w: 0, l: 2, pt: -3 },
  ],
};

// 주간 예측 랭킹 (목업)
const PREDICT_RANKING = [
  { nick: "협곡의봄", hit: 14, total: 15 },
  { nick: "미드갱승", hit: 13, total: 15 },
  { nick: "바텀차이", hit: 12, total: 14 },
  { nick: "한타의신", hit: 11, total: 13 },
  { nick: "오브젝트", hit: 11, total: 15 },
];

// 실시간 인기 글 (목업)
const HOT_POSTS = [
  { team: "kt",  cat: "경기 분석", title: "펜리르 2경기 연속 선발, 오늘 HLE전 미드-정글 동선 예상", nick: "협곡의봄", up: 214, cmt: 87, time: "1시간 전" },
  { team: "t1",  cat: "자유",     title: "어제 KT전 0:2… 탑정글 합 이대로 괜찮은가", nick: "티원십년팬", up: 189, cmt: 143, time: "3시간 전" },
  { team: "dns", cat: "경기 분석", title: "DN수퍼스 1세트 한진 브리온 상대 초반 설계 복기", nick: "바텀차이", up: 121, cmt: 45, time: "2시간 전" },
  { team: "gen", cat: "선수·팀",  title: "쵸비 이주의 선수 선정 — 0승 2패인데 폼은 리그 최상위", nick: "미드갱승", up: 98,  cmt: 52, time: "5시간 전" },
  { team: "hle", cat: "밴픽·메타", title: "오늘 KT전 HLE 밴픽 예상 — 자르반·신짜오 1티어 정글 싸움", nick: "한타의신", up: 76,  cmt: 31, time: "4시간 전" },
  { team: "bro", cat: "자유",     title: "브리온 아쉽지만 1세트는 진짜 잘했다", nick: "브리온화이팅", up: 54, cmt: 19, time: "2시간 전" },
];

// 팀별 게시판 기본 글 (목업)
const BOARD_POSTS = {
  common: [
    { cat: "공지", title: "팀 게시판 이용 안내 — 비방·혐오 없이 응원해 주세요", nick: "운영자", up: 42, cmt: 5, time: "7/28" },
  ],
  t1: [
    { cat: "자유", title: "DK전 미리보기 — 8/6 12시, 이번엔 진짜 이긴다", nick: "티원십년팬", up: 88, cmt: 34, time: "오늘" },
    { cat: "경기 분석", title: "KT전 패배 복기: 바텀 다이브 타이밍이 전부 늦었다", nick: "한타의신", up: 61, cmt: 27, time: "어제" },
  ],
  kt: [
    { cat: "자유", title: "오늘 13:15 HLE전 가즈아 — 레전드 그룹 2연승 가자", nick: "케티팬", up: 73, cmt: 29, time: "오늘" },
    { cat: "선수·팀", title: "펜리르 2경기 연속 선발 출전 기사 떴다", nick: "협곡의봄", up: 55, cmt: 18, time: "오늘" },
  ],
  gen: [
    { cat: "선수·팀", title: "쵸비 이주의 선수 — 팀은 0승 2패, 그래도 믿는다", nick: "미드갱승", up: 47, cmt: 21, time: "어제" },
  ],
  hle: [
    { cat: "밴픽·메타", title: "KT전 승률 80.4% 예측… 방심은 금물", nick: "한화팬", up: 39, cmt: 12, time: "오늘" },
  ],
  dk: [
    { cat: "자유", title: "레전드 그룹 2승 0패 단독 1위! 이 기세 그대로", nick: "디플황제", up: 66, cmt: 23, time: "어제" },
  ],
  dns: [
    { cat: "경기 분석", title: "브리온전 2:1 승리 — 달라진 초반 설계 정리", nick: "바텀차이", up: 44, cmt: 15, time: "오늘" },
  ],
  ns: [
    { cat: "자유", title: "라이즈 그룹 2연승, 승격 가자", nick: "레드포스", up: 31, cmt: 9, time: "어제" },
  ],
  krx: [
    { cat: "자유", title: "8/6 DNS전 배당 1.42 — 이건 이겨야 한다", nick: "드락스", up: 25, cmt: 7, time: "오늘" },
  ],
  bfx: [
    { cat: "자유", title: "8/7 브리온전 승리로 5할 복귀하자", nick: "피어엑스", up: 22, cmt: 6, time: "어제" },
  ],
  bro: [
    { cat: "자유", title: "DNS전 아쉽다… 그래도 1세트 경기력은 희망 봤다", nick: "브리온화이팅", up: 28, cmt: 11, time: "오늘" },
  ],
};
