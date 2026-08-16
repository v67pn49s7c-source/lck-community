const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("assets/ddragon.js", "utf8");
const live = fs.readFileSync("live.html", "utf8");
const app = fs.readFileSync("assets/app.js", "utf8");
const css = fs.readFileSync("assets/styles.css", "utf8");

const itemKo = {
  data: {
    "6665": { name: "작쇼, 변화하는 자", tags: ["Health"], gold: { total: 3200 }, plaintext: "방어 아이템" },
  },
};
const itemEn = {
  data: {
    "6665": { name: "Jak'Sho, The Protean", tags: ["Health"], gold: { total: 3200 }, plaintext: "Defensive item" },
  },
};
const champKo = { data: {
  JadeJarvan: { name: "자르반 4세", id: "Jade_JarvanIV" },
  JarvanIV: { name: "자르반 4세", id: "JarvanIV" },
  Renata: { name: "레나타 글라스크", id: "Renata" },
} };
const champEn = { data: { Renata: { name: "Renata Glasc", id: "Renata" } } };
const emptySumm = { data: {} };

const storage = new Map();
const context = {
  console,
  document: { addEventListener() {} },
  localStorage: {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  },
  esc: value => String(value),
  fetch: async url => ({
    json: async () => url.endsWith("versions.json") ? ["99.1.1"]
      : url.includes("ko_KR/item.json") ? itemKo
      : url.includes("en_US/item.json") ? itemEn
      : url.includes("summoner.json") ? emptySumm
      : url.includes("runesReforged.json") ? []
      : url.includes("ko_KR/champion.json") ? champKo
      : url.includes("en_US/champion.json") ? champEn
      : {},
  }),
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source + "\n;globalThis.__ddTest = { DD, ddInit, ddLookup, ddItemsHTML, ddChampHTML };", context);

(async () => {
  const api = context.__ddTest;
  assert.strictEqual(await api.ddInit(), true, "Data Dragon 초기화가 성공해야 함");
  assert.strictEqual(api.ddLookup(api.DD.items, "Jak'Sho The Protean"), "6665",
    "쉼표가 빠진 영문 아이템명도 같은 아이콘 id로 연결해야 함");
  assert(api.ddItemsHTML("Jak'Sho The Protean").includes("/img/item/6665.png"),
    "영문 아이템을 텍스트 대신 아이콘으로 렌더해야 함");
  const commaItem = api.ddItemsHTML("Jak'Sho, The Protean");
  assert(commaItem.includes("/img/item/6665.png") && !commaItem.includes("dd-unknown"),
    "정식 아이템명 안의 쉼표를 아이템 구분자로 잘못 나누면 안 됨");
  assert(api.ddChampHTML("Renata Glasc", 44).includes("champion/Renata/tile"),
    "영문 챔피언명도 챔피언 초상화로 렌더해야 함");
  assert.strictEqual(api.ddLookup(api.DD.champs, "자르반 4세"), "JarvanIV",
    "이벤트 변형 챔피언보다 정식 챔피언 id를 우선해야 함");
  assert(storage.has("nexus_dd_v6"), "새 다국어 매핑 캐시를 저장해야 함");

  assert(live.includes('class="dt-dmg"'), "딜량 막대 UI가 있어야 함");
  assert(live.includes('ddChampHTML(p.champ, 46)'), "상세 챔피언 초상화는 큰 크기로 요청해야 함");
  assert(live.includes('${esc(p.champ || "")}${pos ? ` · ${esc(pos)}` : ""}'),
    "선수 이름 아래에 챔피언과 포지션을 함께 보여야 함");
  assert(css.includes(".dt-face .dd-nm { display: none; }"), "상세 표에서는 챔피언 이름을 숨겨야 함");
  assert(css.includes(".dt-dmg > i > b"), "딜량 막대 채움 스타일이 있어야 함");
  assert(app.includes("function drakeIconHTML") && app.includes("dragon_elder.png"),
    "드래곤 종류는 이모지가 아니라 공식 게임 아이콘으로 보여야 함");
  // 정보창은 양 끝 칸에서 화면 밖으로 나가 잘렸다 — 칸 기준으로 안쪽을 향해 펴야 한다
  assert(/td\.dt-player \.dd-tip \{[^}]*left: 0/.test(css) && /td\.dt-items \.dd-tip \{[^}]*right: 0/.test(css),
    "표 양 끝 칸의 정보창은 안쪽으로 펴져 잘리지 않아야 함");
  // 모바일에서 td 선택자가 더 세서 아이템 격자가 무너졌었다
  assert(/table\.detail-table td\.dt-items \{[^}]*display: grid/.test(css),
    "좁은 화면에서도 아이템은 격자를 유지해야 함 (td 선택자에 밀리면 세로로 쌓인다)");
  // 아이템은 6칸(포지션 임무로 7칸)이 **한 줄**에. 예전에는 wrap 이라 4+2 로 접혔다.
  assert(live.includes("const slotN = Math.max(6"), "아이템 칸은 최소 6칸이어야 함");
  assert(live.includes(`class="dt-slot-empty"`) && live.includes("--slots:${slotN + 1}"),
    "빈 칸도 자리를 잡고, 장신구까지 같은 격자에 들어가야 함");
  assert(/\.dt-items \{[^}]*repeat\(var\(--slots, 7\)/.test(css) && !/\.dt-items \{[^}]*flex-wrap: wrap/.test(css),
    "아이템은 칸 수만큼 한 줄로 배치하고 줄바꿈하지 않아야 함");
  // 분당 지표는 경기 시간이 있을 때만 — 없는데 0으로 채우면 거짓말이 된다
  assert(live.includes("DPM ${Math.round(dmg / lenM)}") && live.includes("(cs / lenM).toFixed(1)"),
    "경기 시간이 있으면 DPM 과 분당 CS 를 보여야 함");
  assert(/lenM \? `<small>DPM/.test(live) && /lenM \? `<small>\$\{\(cs \/ lenM\)/.test(live),
    "경기 시간이 없는 세트에서는 분당 지표를 그리지 않아야 함");
  // ── 모바일 선수 스탯 표 — 한 선수 한 줄 (2026-08-16) ──────────
  // 숫자를 두 줄 더 깔았더니 한 선수가 138px, 다섯 명이면 690px 이 됐다.
  // 좁은 화면에 여섯 가지 숫자를 다 넣으려던 것이 원인이었다. 줄바꿈을 막고 눕힌다.
  assert(/table\.detail-table tr \{[^}]*flex-wrap: nowrap/.test(css),
    "선수 줄은 줄바꿈하지 않아야 함 (접히는 순간 두 줄이 된다)");
  assert(/\.dt-player \{ order: 1[\s\S]{0,120}\.dt-kda    \{ order: 2[\s\S]{0,140}td\.dt-items \{ order: 3/.test(css),
    "한 줄 배치는 [선수] [KDA] [아이템] 순서여야 함");
  // ⚠ 선택자가 `table.detail-table td.` 여야 한다. 위쪽 `table.detail-table td { display: block }`
  //   이 더 세서, 그냥 `.dt-dmg` 로 쓰면 딜량 칸만 안 사라진다 (실제로 그랬다).
  assert(/table\.detail-table td\.dt-dmg, table\.detail-table td\.dt-cs,[\s\S]{0,120}display: none;/.test(css),
    "좁은 화면에서는 딜량·CS·골드·시야를 감춰야 함 (선택자가 약하면 안 먹는다)");
  assert(/\.dt-kda small \{ display: block/.test(css),
    "KDA 비율은 숫자 아래 줄에 와야 함");
  // 넓은 화면 표에서는 그대로 다 보여야 한다 — 감춘 것은 미디어 블록 안에서만이다
  assert(!/^\.dt-dmg \{ display: none/m.test(css),
    "딜량 칸을 전역으로 감추면 데스크톱 표에서도 사라진다");

  console.log("✓ 경기 상세 아이콘·딜량 UI 회귀 테스트 통과");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
