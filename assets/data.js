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

// ── 해외 팀 (MSI · EWC · 월즈) ──────────────────────────────────
// ⚠ 이 목록은 **일부러 TEAMS 에 넣지 않는다.** TEAMS 는 "우리가 팬덤을 다루는 팀"이라
//   응원팀 고르기·팀 게시판·창립 팬·순위표가 전부 이 배열을 돈다. 여기에 해외 팀을
//   섞으면 응원팀 목록에 20팀이 나오고 LCK 순위표가 오염된다.
//   경기 화면이 필요한 건 TEAM_MAP 조회뿐이므로, **지도에만** 합친다.
// 로고는 파일로 받지 않고 공식 CDN 주소를 그대로 쓴다 (teamLogoHTML 이 team.logo 를 먼저 본다).
// 색은 로고에서 가장 많이 쓰인 선명한 색을 뽑아 넣었다 — 눈대중으로 지어내지 않았다.
const INTL_TEAMS = [
  { id: "agal", abbr: "AGAL", name: "AG.AL", color: "#fce49c", dark: "#373222",
    logo: "https://static.lolesports.com/teams/1783069593213_t103524.png" },
  { id: "blg", abbr: "BLG", name: "BILIBILI GAMING", color: "#3cccfc", dark: "#0d2c37",
    logo: "https://static.lolesports.com/teams/1682322954525_Bilibili_Gaming_logo_20211.png" },
  { id: "dcg", abbr: "DCG", name: "Relove Deep Cross Gaming", color: "#0c6ccc", dark: "#02172c",
    logo: "https://static.lolesports.com/teams/1785400397160_LCP_DCG_Full_W1.png" },
  { id: "fur", abbr: "FUR", name: "FURIA", color: "#8a93a6", dark: "#1e2024",
    logo: "https://static.lolesports.com/teams/FURIA---black.png" },   // 흑백 로고 — 브랜드색이 없어 중립색
  { id: "g2", abbr: "G2", name: "G2 Esports", color: "#fc543c", dark: "#37120d",
    logo: "https://static.lolesports.com/teams/G2-FullonDark.png" },
  { id: "gam", abbr: "GAM", name: "GAM Esports", color: "#fcb40c", dark: "#372702",
    logo: "https://static.lolesports.com/teams/1643263093448_GAMyellow.png" },
  { id: "jdg", abbr: "JDG", name: "Beijing JDG Esports", color: "#cc0c3c", dark: "#2c020d",
    logo: "https://static.lolesports.com/teams/1627457924722_29.png" },
  { id: "kc", abbr: "KC", name: "Karmine Corp", color: "#0ce4fc", dark: "#023237",
    logo: "https://static.lolesports.com/teams/1704714951336_KC.png" },
  { id: "lyon", abbr: "LYON", name: "LYON", color: "#b49c84", dark: "#27221d",
    logo: "https://static.lolesports.com/teams/1743717443673_isotypelyon-03.png" },
  { id: "mkoi", abbr: "MKOI", name: "Movistar KOI", color: "#549ce4", dark: "#122232",
    logo: "https://static.lolesports.com/teams/1734012609283_MKOI_FullColor_Blue.png" },
  { id: "ml", abbr: "ML", name: "MIBR.LOS", color: "#24243c", dark: "#07070d",
    logo: "https://static.lolesports.com/teams/1783069635946_600px-MIBR_LOS_allmode.png" },
  { id: "sen", abbr: "SEN", name: "Sentinels", color: "#cc0c3c", dark: "#2c020d",
    logo: "https://static.lolesports.com/teams/1767769784669_Sentinels_2020_Icon.png" },
  { id: "tes", abbr: "TES", name: "TOP ESPORTS", color: "#fc3c24", dark: "#370d07",
    logo: "https://static.lolesports.com/teams/1592592064571_TopEsportsTES-01-FullonDark.png" },
  { id: "tlaw", abbr: "TLAW", name: "Team Liquid Alienware", color: "#8a93a6", dark: "#1e2024",
    logo: "https://static.lolesports.com/teams/1769357207762_TLAlienware_Minimal_Bug-White.png" },   // 흑백 로고 — 브랜드색이 없어 중립색
  { id: "ts", abbr: "TS", name: "Team Secret", color: "#8a93a6", dark: "#1e2024",
    logo: "https://static.lolesports.com/teams/1656693717651_TS.png" },   // 흑백 로고 — 브랜드색이 없어 중립색
  { id: "tsw", abbr: "TSW", name: "Team Secret Whales", color: "#8a93a6", dark: "#1e2024",
    logo: "https://static.lolesports.com/teams/1774598000328_White_EyeText_600p.png" },   // 흑백 로고 — 브랜드색이 없어 중립색
];

// 조회용 지도에는 해외 팀도 넣는다 (경기 카드·상세가 팀을 못 찾으면 화면이 비어 버린다)
const TEAM_MAP = Object.fromEntries([...TEAMS, ...INTL_TEAMS].map(t => [t.id, t]));


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



