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



