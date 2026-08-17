// ── 대진표 모양 선언 ────────────────────────────────────────────
//
// 여기는 **대진 엔진이 아니다.** 누가 어느 경기에 나가는지는 이미 경기 기록
// (matches.a / matches.b)에 들어 있다 — 리그피디아가 알려 주고, 일정 갱신이 채운다.
// 그래서 이 파일이 할 일은 딱 둘이다:
//   ① 각 경기를 대진표의 **어느 칸**에 놓을 것인가 (열·행)
//   ② 각 자리가 **무슨 자리**인가 ("5위", "R1 승자 →") 와 이기면 무엇을 얻는가
//
// 이렇게 하면 계산이 틀릴 일이 없다. 아직 안 치러진 경기는 팀 자리가 비어 있고,
// 자리 라벨이 "누가 올 자리인지"를 대신 말해 준다 (공식 대진표와 같은 방식).
//
// match: 경기를 찾는 규칙. 우리 경기 id 는 리그피디아 MatchId 에서 오므로
//        (예: lpLCK2026SeasonRoadtoMSI_Round1_1) 그 꼬리로 짚는다.
//        관리자가 손으로 만든 경기는 label 에 마디 이름(R1·PI-F 등)을 적으면 그것도 잡는다.
// win/lose: 이기면·지면 어디로 가는가. kind 는 색 — adv(다음 라운드) · fin(최종 진출) · out(탈락)

// ⚠ 국제 대회는 마디가 14~20개라 한 판에 다 그리면 화면 밖으로 넘어간다.
//   그래서 **단계별로 나눠서**(parts) 그리고, 위에 단계 단추를 둔다.
//   compact: true 를 주면 칸이 작아진다 — 8강·승자조처럼 마디가 많은 대진표용.
//   (마디가 6개 이하인 LCK 대진표는 지금 크기가 오히려 읽기 좋다)

// MSI·EWC 는 우리가 직접 넣은 경기라 id 가 정해져 있다 (msi2026-07 …).
// 리그피디아에서 오는 대회처럼 짐작할 필요가 없어 **정확한 id 로** 짚는다.
const exact = id => new RegExp("^" + id + "$");

const BRACKETS = {

  // ── 2026 MSI (6/28~7/12) ──────────────────────────────────────
  // 플레이-인 4팀 더블 엘리미네이션에서 **딱 1팀**이 본선으로 올라간다.
  // 본선은 8팀 더블 엘리미네이션 — 두 번 져야 탈락이라 패자조가 길다.
  msi2026: {
    parts: [
      {
        key: "playin", name: "플레이-인",
        cols: ["1일차 (6/28)", "2일차 (6/29)", "3일차 (6/30)", "최종전 (7/1)"],
        rows: 4, compact: true,
        nodes: [
          { id: "PI-UB1", col: 0, row: 1, title: "승자조", find: exact("msi2026-01"),
            a: { from: "LCK 3시드" }, b: { from: "LTA 3시드" },
            win: { to: "승자조 결승", kind: "adv" }, lose: { to: "패자조", kind: "out" } },
          { id: "PI-UB2", col: 0, row: 2, title: "승자조", find: exact("msi2026-02"),
            a: { from: "LCP 3시드" }, b: { from: "LEC 3시드" },
            win: { to: "승자조 결승", kind: "adv" }, lose: { to: "패자조", kind: "out" } },
          { id: "PI-UBF", col: 1, row: 1, title: "승자조 결승", find: exact("msi2026-03"),
            a: { from: "승자", arrow: "↘", winOf: "PI-UB1" }, b: { from: "승자", arrow: "↗", winOf: "PI-UB2" },
            win: { to: "최종전 직행", kind: "adv" }, lose: { to: "패자조 결승", kind: "out" } },
          { id: "PI-LB1", col: 1, row: 3, title: "패자조", find: exact("msi2026-04"),
            a: { from: "패자", arrow: "↘", loseOf: "PI-UB1" }, b: { from: "패자", arrow: "↗", loseOf: "PI-UB2" },
            win: { to: "패자조 결승", kind: "adv" }, lose: { to: "탈락", kind: "out" } },
          { id: "PI-LBF", col: 2, row: 3, title: "패자조 결승", find: exact("msi2026-05"),
            a: { from: "패자", arrow: "↘", loseOf: "PI-UBF" }, b: { from: "승자", arrow: "↗", winOf: "PI-LB1" },
            win: { to: "최종전", kind: "adv" }, lose: { to: "탈락", kind: "out" } },
          { id: "PI-F", col: 3, row: 2, title: "최종전", find: exact("msi2026-06"),
            a: { from: "승자", arrow: "↘", winOf: "PI-UBF" }, b: { from: "승자", arrow: "↗", winOf: "PI-LBF" },
            win: { to: "본선 진출", kind: "fin" }, lose: { to: "탈락", kind: "out" } },
        ],
        legend: [["adv", "다음 경기 진출"], ["fin", "본선(토너먼트 스테이지) 진출"]],
      },
      {
        key: "main", name: "토너먼트 스테이지",
        cols: ["1라운드", "2라운드", "3라운드", "4라운드", "결승 (7/12)"],
        rows: 6, compact: true,
        nodes: [
          { id: "UB1", col: 0, row: 1, title: "승자조 1R", find: exact("msi2026-07"),
            a: {}, b: {}, win: { to: "승자조 2R", kind: "adv" }, lose: { to: "패자조", kind: "out" } },
          { id: "UB2", col: 0, row: 2, title: "승자조 1R", find: exact("msi2026-08"),
            a: {}, b: {}, win: { to: "승자조 2R", kind: "adv" }, lose: { to: "패자조", kind: "out" } },
          { id: "UB3", col: 0, row: 3, title: "승자조 1R", find: exact("msi2026-09"),
            a: {}, b: {}, win: { to: "승자조 2R", kind: "adv" }, lose: { to: "패자조", kind: "out" } },
          { id: "UB4", col: 0, row: 4, title: "승자조 1R", find: exact("msi2026-10"),
            a: {}, b: {}, win: { to: "승자조 2R", kind: "adv" }, lose: { to: "패자조", kind: "out" } },
          { id: "LB1", col: 0, row: 5, title: "패자조 1R", find: exact("msi2026-11"),
            a: { from: "패자", arrow: "↘", loseOf: "UB1" }, b: { from: "패자", arrow: "↗", loseOf: "UB2" },
            win: { to: "패자조 2R", kind: "adv" }, lose: { to: "탈락", kind: "out" } },
          { id: "LB2", col: 0, row: 6, title: "패자조 1R", find: exact("msi2026-14"),
            a: { from: "패자", arrow: "↘", loseOf: "UB4" }, b: { from: "패자", arrow: "↗", loseOf: "UB3" },
            win: { to: "패자조 2R", kind: "adv" }, lose: { to: "탈락", kind: "out" } },

          { id: "UB5", col: 1, row: 1, title: "승자조 2R", find: exact("msi2026-12"),
            a: { from: "승자", arrow: "↘", winOf: "UB1" }, b: { from: "승자", arrow: "↗", winOf: "UB2" },
            win: { to: "승자조 결승", kind: "adv" }, lose: { to: "패자조 2R", kind: "out" } },
          { id: "UB6", col: 1, row: 2, title: "승자조 2R", find: exact("msi2026-13"),
            a: { from: "승자", arrow: "↘", winOf: "UB4" }, b: { from: "승자", arrow: "↗", winOf: "UB3" },
            win: { to: "승자조 결승", kind: "adv" }, lose: { to: "패자조 2R", kind: "out" } },
          { id: "LB3", col: 1, row: 5, title: "패자조 2R", find: exact("msi2026-15"),
            a: { from: "패자", arrow: "↘", loseOf: "UB6" }, b: { from: "승자", arrow: "↗", winOf: "LB1" },
            win: { to: "패자조 3R", kind: "adv" }, lose: { to: "탈락", kind: "out" } },
          { id: "LB4", col: 1, row: 6, title: "패자조 2R", find: exact("msi2026-16"),
            a: { from: "패자", arrow: "↘", loseOf: "UB5" }, b: { from: "승자", arrow: "↗", winOf: "LB2" },
            win: { to: "패자조 3R", kind: "adv" }, lose: { to: "탈락", kind: "out" } },

          { id: "UBF", col: 2, row: 1, title: "승자조 결승", find: exact("msi2026-17"),
            a: { from: "승자", arrow: "↘", winOf: "UB6" }, b: { from: "승자", arrow: "↗", winOf: "UB5" },
            win: { to: "결승 직행", kind: "fin" }, lose: { to: "패자조 결승", kind: "out" } },
          { id: "LB5", col: 2, row: 5, title: "패자조 3R", find: exact("msi2026-18"),
            a: { from: "승자", arrow: "↘", winOf: "LB4" }, b: { from: "승자", arrow: "↗", winOf: "LB3" },
            win: { to: "패자조 결승", kind: "adv" }, lose: { to: "탈락", kind: "out" } },
          { id: "LBF", col: 3, row: 5, title: "패자조 결승", find: exact("msi2026-19"),
            a: { from: "승자", arrow: "↘", winOf: "LB5" }, b: { from: "패자", arrow: "↗", loseOf: "UBF" },
            win: { to: "결승 진출", kind: "adv" }, lose: { to: "3위", kind: "out" } },

          { id: "GF", col: 4, row: 3, title: "결승", find: exact("msi2026-20"),
            a: { from: "승자", arrow: "↘", winOf: "UBF" }, b: { from: "승자", arrow: "↗", winOf: "LBF" },
            win: { to: "2026 MSI 우승", kind: "fin" }, lose: { to: "준우승", kind: "out" } },
        ],
        legend: [["adv", "다음 라운드 진출"], ["fin", "결승 직행 · 우승"]],
      },
    ],
  },

  // ── 2026 Esports World Cup (7/15~7/19) ────────────────────────
  // 앞의 그룹 스테이지(20경기)는 대진표로 그릴 모양이 아니라 경기 일정에서 본다.
  // 여기서는 그룹을 통과한 8팀의 녹아웃만 그린다.
  ewc2026: {
    compact: true,
    cols: ["8강 (7/17)", "4강 (7/18)", "결승 (7/19)"],
    rows: 4,
    nodes: [
      { id: "QF1", col: 0, row: 1, title: "8강", find: exact("ewc2026-21"),
        a: { from: "그룹 통과" }, b: { from: "그룹 통과" },
        win: { to: "4강", kind: "adv" }, lose: { to: "탈락", kind: "out" } },
      { id: "QF2", col: 0, row: 2, title: "8강", find: exact("ewc2026-22"),
        a: { from: "그룹 통과" }, b: { from: "그룹 통과" },
        win: { to: "4강", kind: "adv" }, lose: { to: "탈락", kind: "out" } },
      { id: "QF3", col: 0, row: 3, title: "8강", find: exact("ewc2026-23"),
        a: { from: "그룹 통과" }, b: { from: "그룹 통과" },
        win: { to: "4강", kind: "adv" }, lose: { to: "탈락", kind: "out" } },
      { id: "QF4", col: 0, row: 4, title: "8강", find: exact("ewc2026-24"),
        a: { from: "그룹 통과" }, b: { from: "그룹 통과" },
        win: { to: "4강", kind: "adv" }, lose: { to: "탈락", kind: "out" } },

      { id: "SF1", col: 1, row: 1, title: "4강", find: exact("ewc2026-25"),
        a: { from: "승자", arrow: "↘", winOf: "QF3" }, b: { from: "승자", arrow: "↗", winOf: "QF1" },
        win: { to: "결승", kind: "adv" }, lose: { to: "3·4위전", kind: "out" } },
      { id: "SF2", col: 1, row: 3, title: "4강", find: exact("ewc2026-26"),
        a: { from: "승자", arrow: "↘", winOf: "QF2" }, b: { from: "승자", arrow: "↗", winOf: "QF4" },
        win: { to: "결승", kind: "adv" }, lose: { to: "3·4위전", kind: "out" } },

      { id: "GF", col: 2, row: 1, title: "결승", find: exact("ewc2026-28"),
        a: { from: "승자", arrow: "↘", winOf: "SF1" }, b: { from: "승자", arrow: "↗", winOf: "SF2" },
        win: { to: "2026 EWC 우승", kind: "fin" }, lose: { to: "준우승", kind: "out" } },
      { id: "TP", col: 2, row: 3, title: "3·4위전", find: exact("ewc2026-27"),
        a: { from: "패자", arrow: "↘", loseOf: "SF2" }, b: { from: "패자", arrow: "↗", loseOf: "SF1" },
        win: { to: "3위", kind: "adv" }, lose: { to: "4위", kind: "out" } },
    ],
    legend: [["adv", "다음 라운드 진출"], ["fin", "우승"]],
  },
  // ── 2026 LCK Road to MSI (6팀 · 5경기) ──────────────────────
  // 1-2라운드 순위 상위 6팀. 1·2위는 한 경기로 MSI 1시드를 가리고,
  // 3~6위는 아래에서부터 올라온다.
  "lck2026-msi": {
    // MSI·EWC 와 **같은 모양**으로 통일한다 (사장님 2026-08-17).
    // 붉은 머리띠 대신 조용한 라벨, 작은 칸 — 대회마다 생김새가 다르면 같은 사이트로 안 보인다.
    compact: true,
    cols: ["1라운드", "2라운드", "3-4라운드", "최종전"],
    rows: 2,
    nodes: [
      { id: "R1", col: 0, row: 2, title: "Round 1", find: /_Round1_1$/i,
        a: { from: "5위", seed: 5 }, b: { from: "6위", seed: 6 },
        win: { to: "2라운드", kind: "adv" }, lose: { to: "탈락", kind: "out" } },

      { id: "R2", col: 1, row: 2, title: "Round 2", find: /_Round2_1$/i,
        a: { from: "4위", seed: 4 }, b: { from: "R1 승자", arrow: "→", winOf: "R1" },
        win: { to: "4라운드", kind: "adv" }, lose: { to: "탈락", kind: "out" } },

      { id: "R3", col: 2, row: 1, title: "Round 3", find: /_Round3_1$/i,
        a: { from: "1위", seed: 1 }, b: { from: "2위", seed: 2 },
        win: { to: "MSI 1시드", kind: "fin" }, lose: { to: "최종전", kind: "adv" } },

      { id: "R4", col: 2, row: 2, title: "Round 4", find: /_Round3_2$/i,
        a: { from: "3위", seed: 3 }, b: { from: "R2 승자", arrow: "→", winOf: "R2" },
        win: { to: "최종전", kind: "adv" }, lose: { to: "탈락", kind: "out" } },

      { id: "F", col: 3, row: 0, title: "Final Round", find: /_Round4_1$/i,
        a: { from: "R3 패자", arrow: "↘", loseOf: "R3" }, b: { from: "R4 승자", arrow: "↗", winOf: "R4" },
        win: { to: "MSI 2시드", kind: "fin" }, lose: { to: "탈락", kind: "out" } },
    ],
    seedTags: ["1-2라운드 1위","2위","3위","4위","5위","6위"],
    legend: [["adv", "다음 라운드 진출"], ["fin", "2026 MSI 진출"]],
  },

  // ── 2026 LCK 플레이-인 (4팀 · 3경기 · 8/26~28) ──────────────
  // 2025년의 4팀 더블 엘리미네이션이 아니라 3경기로 압축된 시드 토너먼트다.
  // ⚠ 1라운드 승자는 **바로 플레이오프**로 가고, 2라운드 승자는 한 경기를 더 해야 한다.
  //    같은 열에 있다고 같은 라운드가 아니다.
  "lck2026-playin": {
    // MSI·EWC 와 **같은 모양**으로 통일한다 (사장님 2026-08-17).
    // 붉은 머리띠 대신 조용한 라벨, 작은 칸 — 대회마다 생김새가 다르면 같은 사이트로 안 보인다.
    compact: true,
    cols: ["1·2라운드", "최종전"],
    rows: 2,
    nodes: [
      { id: "PI-R1", col: 0, row: 1, title: "Round 1 (8/26)",
        a: { from: "레전드 5위", seed: 1 }, b: { from: "라이즈 1위", seed: 2 },
        win: { to: "플레이오프 5시드", kind: "fin" }, lose: { to: "최종전", kind: "adv" } },

      { id: "PI-R2", col: 0, row: 2, title: "Round 2 (8/27)",
        a: { from: "라이즈 2위", seed: 3 }, b: { from: "라이즈 3위", seed: 4 },
        win: { to: "최종전", kind: "adv" }, lose: { to: "시즌 8위", kind: "out" } },

      { id: "PI-F", col: 1, row: 0, title: "Final Round (8/28)",
        a: { from: "R1 패자", arrow: "↘", loseOf: "PI-R1" }, b: { from: "R2 승자", arrow: "↗", winOf: "PI-R2" },
        win: { to: "플레이오프 6시드", kind: "fin" }, lose: { to: "시즌 7위", kind: "out" } },
    ],
    seedTags: ["레전드 5위","라이즈 1위","라이즈 2위","라이즈 3위"],
    legend: [["adv", "다음 경기 진출"], ["fin", "플레이오프 진출"]],
  },

  // ── 2026 LCK 플레이오프 (6팀 · 10경기 · 8/29~9/13) ──────────
  // 풀 더블 엘리미네이션. 두 번 지면 탈락, 결승에서 브래킷 리셋은 없다.
  // ⚠ 자리 라벨에 '지목'이 나오는 곳이 둘 있다 — 3시드와 1시드가 상대를 고른다.
  //    우리가 그걸 계산하지는 않는다. 대진이 정해지면 실제 대진이 경기 기록으로 들어오고,
  //    라벨은 "그 자리가 어떻게 정해지는 자리인지"만 말해 준다.
  "lck2026-playoffs": {
    // MSI·EWC 와 **같은 모양**으로 통일한다 (사장님 2026-08-17).
    // 붉은 머리띠 대신 조용한 라벨, 작은 칸 — 대회마다 생김새가 다르면 같은 사이트로 안 보인다.
    compact: true,
    cols: ["1라운드", "2라운드", "3라운드", "4라운드", "결승"],
    rows: 4,
    nodes: [
      // 승자조
      { id: "UB-R1-M1", col: 0, row: 1, title: "승자조 R1 (8/29)",
        a: { from: "레전드 3위", seed: 3 }, b: { from: "3시드가 지목", arrow: "PI 통과팀" },
        win: { to: "승자조 R2", kind: "adv" }, lose: { to: "패자조 R1", kind: "out" } },
      { id: "UB-R1-M2", col: 0, row: 2, title: "승자조 R1 (8/30)",
        a: { from: "레전드 4위", seed: 4 }, b: { from: "지목받지 않은", arrow: "PI 통과팀" },
        win: { to: "승자조 R2", kind: "adv" }, lose: { to: "패자조 R1", kind: "out" } },

      { id: "UB-R2-M1", col: 1, row: 1, title: "승자조 R2 (9/1)",
        a: { from: "레전드 1위", seed: 1 }, b: { from: "1시드가 지목", arrow: "UB R1 승자" },
        win: { to: "승자조 R3", kind: "adv" }, lose: { to: "패자조", kind: "out" } },
      { id: "UB-R2-M2", col: 1, row: 2, title: "승자조 R2 (9/2)",
        a: { from: "레전드 2위", seed: 2 }, b: { from: "지목받지 않은", arrow: "UB R1 승자" },
        win: { to: "승자조 R3", kind: "adv" }, lose: { to: "패자조", kind: "out" } },

      { id: "UB-R3", col: 2, row: 1, title: "승자조 R3 (9/5)",
        a: { from: "UB R2-M1 승자", arrow: "↘", winOf: "UB-R2-M1" }, b: { from: "UB R2-M2 승자", arrow: "↗", winOf: "UB-R2-M2" },
        win: { to: "결승 직행", kind: "fin" }, lose: { to: "결승 진출전", kind: "adv" } },

      // 패자조
      { id: "LB-R1", col: 1, row: 3, title: "패자조 R1 (9/3)",
        a: { from: "UB R1-M1 패자", arrow: "↘", loseOf: "UB-R1-M1" }, b: { from: "UB R1-M2 패자", arrow: "↗", loseOf: "UB-R1-M2" },
        win: { to: "패자조 R2", kind: "adv" }, lose: { to: "시즌 6위", kind: "out" } },
      { id: "LB-R2", col: 2, row: 3, title: "패자조 R2 (9/4)",
        a: { from: "LB R1 승자", arrow: "↘", winOf: "LB-R1" }, b: { from: "UB R2 패자 중 낮은 시드" },
        win: { to: "패자조 R3", kind: "adv" }, lose: { to: "시즌 5위", kind: "out" } },
      { id: "LB-R3", col: 3, row: 3, title: "패자조 R3 (9/6)",
        a: { from: "UB R2 패자 중 높은 시드" }, b: { from: "LB R2 승자", arrow: "↗", winOf: "LB-R2" },
        win: { to: "결승 진출전", kind: "adv" }, lose: { to: "시즌 4위", kind: "out" } },
      { id: "LB-F", col: 3, row: 1, title: "결승 진출전 (9/12)",
        a: { from: "UB R3 패자", arrow: "↘", loseOf: "UB-R3" }, b: { from: "LB R3 승자", arrow: "↗", winOf: "LB-R3" },
        win: { to: "결승", kind: "adv" }, lose: { to: "시즌 3위", kind: "out" } },

      { id: "GF", col: 4, row: 0, title: "결승 (9/13)",
        a: { from: "UB R3 승자", arrow: "↘", winOf: "UB-R3" }, b: { from: "결승 진출전 승자", arrow: "↗", winOf: "LB-F" },
        win: { to: "2026 LCK 우승", kind: "fin" }, lose: { to: "준우승", kind: "out" } },
    ],
    seedTags: ["레전드 1위","레전드 2위","레전드 3위","레전드 4위","PI 1차 통과","PI 최종 통과"],
    legend: [["adv", "다음 라운드 진출"], ["fin", "결승 직행 · 우승"]],
  },
};

/** 대회 하나의 대진표를 그릴 재료를 만든다.
 *  경기를 못 찾은 마디도 **그대로 돌려준다** — 아직 안 치러진 경기는 빈 칸으로 보여야 한다.
 *
 *  경기를 찾는 순서 (**관리자가 이어 둔 것이 언제나 1순위**):
 *    ① tournaments.bracket.links[마디id] — 관리자 화면에서 드롭다운으로 이어 둔 경기
 *    ② match 정규식 — 리그피디아 id 패턴. **실제로 확인한 대회에만** 넣는다.
 *       플레이-인·플레이오프는 리그피디아가 무슨 id 를 붙일지 알 수 없어 정규식이 없다.
 *
 *  ⚠ 예전에는 label 로도 찾았는데 그건 죽은 코드였다 —
 *    api/schedule-sync.js 가 갱신할 때마다 label 을 빈 문자열로 덮어쓴다. (2026-08-07)
 */
function bracketOf(tid, partKey) {
  const t = (Cache.tournaments || []).find(x => x.id === tid);
  const cfg = (t && t.bracket) || {};
  let spec = BRACKETS[cfg.format] || BRACKETS[tid];
  if (!spec) return null;
  // 단계가 나뉜 대회(MSI 등)는 고른 단계 하나만 그린다. 고르지 않았으면 첫 단계.
  if (spec.parts) {
    const parts = spec.parts;
    const one = parts.find(p => p.key === partKey) || parts[0];
    spec = { ...one, parts: parts.map(p => ({ key: p.key, name: p.name })), partKey: one.key };
  }

  const ms = (Cache.matches || []).filter(m => m.tid === tid);
  const nodes = spec.nodes.map(n => ({ ...n, match: null, linkBroken: false }));

  // ① 관리자가 이어 둔 연결 먼저
  nodes.forEach(n => {
    const id = cfg.links && cfg.links[n.id];
    if (!id) return;
    const m = ms.find(x => x.id === id);
    if (m) n.match = m; else n.linkBroken = true;
  });
  // ② 남은 자리만 정규식으로
  const used = new Set(nodes.filter(n => n.match).map(n => n.match.id));
  nodes.forEach(n => {
    if (n.match || n.linkBroken || !n.find) return;
    const m = ms.find(x => !used.has(x.id) && n.find.test(x.id));
    if (m) { n.match = m; used.add(m.id); }
  });

  // ③ 시드 표 — 관리자가 넣은 값. 순위표에서 짐작하지 않는다.
  //    (순위표는 동점을 이름순으로 가르기 때문에 시드를 파생하면 틀릴 수 있다)
  const tags = spec.seedTags || [];
  const saved = cfg.seeds || [];
  const seeds = tags.map((tag, i) => ({ no: i + 1, tag, team: saved[i] || "" }));

  resolveSlots(nodes, seeds);
  return { ...spec, tid, nodes, seeds, planned: !!(t && t.planned) };
}

/** 각 자리에 어느 팀이 오는지 채운다.
 *  경기가 이미 있으면 그 경기의 a/b 가 답이다(가장 확실). 없으면 시드·앞 경기 결과로 채운다.
 *  **확실하지 않으면 비워 둔다** — 자리 라벨이 대신 설명한다. */
function resolveSlots(nodes, seeds) {
  const byId = {};
  nodes.forEach(n => { byId[n.id] = n; });
  const seedTeam = no => {
    const s = seeds[no - 1];
    return s && isRealTeam(s.team) ? s.team : null;
  };
  const put = (n, side, team) => { n[side + "Team"] = isRealTeam(team) ? team : null; };

  // 결과로 정해지는 자리는 앞 경기부터 차례로 풀어야 하므로 몇 번 돈다
  for (let pass = 0; pass < nodes.length; pass++) {
    nodes.forEach(n => {
      ["a", "b"].forEach(side => {
        if (n[side + "Team"]) return;
        const m = n.match;
        // 경기가 있으면 그게 답이다
        const fromMatch = m ? (side === "a" ? m.a : m.b) : null;
        if (isRealTeam(fromMatch)) { put(n, side, fromMatch); return; }
        const meta = n[side] || {};
        if (meta.seed) { put(n, side, seedTeam(meta.seed)); return; }
        if (meta.winOf || meta.loseOf) {
          const src = byId[meta.winOf || meta.loseOf];
          const sm = src && src.match;
          if (!sm || sm.status !== "done" || sm.scoreA == null || sm.scoreB == null) return;
          if (sm.scoreA === sm.scoreB) return;                 // 동점은 판정하지 않는다
          const winSide = sm.scoreA > sm.scoreB ? "a" : "b";
          const wantWin = !!meta.winOf;
          const pick = wantWin ? winSide : (winSide === "a" ? "b" : "a");
          put(n, side, src[pick + "Team"] || (pick === "a" ? sm.a : sm.b));
        }
      });
    });
  }
}

// ── 대진표 그리기 ──────────────────────────────────────────────
// 열 = 라운드, 행 = 위/아래 가지. 아직 팀이 안 정해진 자리는 라벨만 보여 준다.
// ⚠ 이 결과는 **#bracket-body 안에** 들어간다. 그 요소가 곧 .bracket(가로 flex) 이므로
//   여기서 .bracket 을 또 만들면 안 되고, 범례도 여기 넣으면 열 옆에 붙는다.
//   범례는 bracketLegendHTML() 로 따로 뽑아 화면 아래쪽 자리에 넣는다.
function bracketHTML(spec) {
  return spec.cols.map((name, ci) => {
    const inCol = spec.nodes.filter(n => n.col === ci);
    return `
      <div class="bracket-col">
        <div class="bracket-col-title">${esc(name)}</div>
        <div class="bracket-col-body" style="--rows:${spec.rows || 1}">
          ${inCol.map(n => nodeHTML(n, spec)).join("")}
        </div>
      </div>`;
  }).join("");
}

function bracketLegendHTML(spec) {
  const keys = (spec.legend || []).map(([k, t]) =>
    `<span class="bl-key"><i class="${k}"></i>${esc(t)}</span>`).join("");
  return keys + ` <span class="bl-key" style="color:var(--text-dim)">경기 칸을 누르면 그 경기 페이지로 갑니다</span>`;
}

function nodeHTML(n, spec) {
  const m = n.match;
  const done = m && m.status === "done" && m.scoreA != null && m.scoreB != null;
  const winSide = !done ? null : (m.scoreA > m.scoreB ? "a" : m.scoreA < m.scoreB ? "b" : null);

  const slot = side => {
    const meta = n[side] || {};
    // 자리값은 해석기(resolveSlots)가 채워 둔다 — 경기가 없어도 시드·앞 경기 결과로 채워진다
    const team = n[side + "Team"] || (m ? (side === "a" ? m.a : m.b) : null);
    const score = m ? (side === "a" ? m.scoreA : m.scoreB) : null;
    const t = isRealTeam(team) ? TEAM_MAP[team] : null;
    const won = winSide === side;
    const lost = winSide && winSide !== side;
    // 이겨서 무엇을 얻었나 — 색이 갈린다 (범례와 짝)
    const kind = won ? (n.win && n.win.kind) || "adv" : "";
    return `
      <div class="bm-slot ${t ? "" : "tbd"} ${won ? "winner" : ""} ${kind === "fin" ? "adv-final" : ""} ${lost ? "loser" : ""}">
        <span class="bm-from">${esc(meta.from || "")}${meta.arrow ? `<span class="arrow">${esc(meta.arrow)}</span>` : ""}</span>
        <span class="bm-who">${t ? teamLogoHTML(t, 22) : `<span class="team-logo tbd-logo"></span>`}
          <span>${t ? esc(t.abbr) : "TBD"}</span></span>
        <span class="score">${score != null ? score : ""}</span>
      </div>`;
  };

  const when = m && m.at
    ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" }).format(new Date(m.at))
    : "";
  const inner = `
    <div class="bm-head"><span>${esc(n.title)}</span><span class="bm-date">${esc(when)}</span></div>
    ${slot("a")}${slot("b")}`;

  const style = n.row ? `style="grid-row:${n.row}"` : `style="grid-row:1 / -1; align-self:center"`;
  return m
    ? `<a class="bracket-match" ${style} href="/match/${q(m.id)}">${inner}</a>`
    : `<div class="bracket-match" ${style}>${inner}</div>`;
}
