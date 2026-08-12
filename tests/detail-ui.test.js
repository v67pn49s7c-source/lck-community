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
  assert(app.includes("DRAKE_SVG") && app.includes("function drakeIconHTML"),
    "드래곤 종류는 이모지가 아니라 아이콘으로 보여야 함");
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
  console.log("✓ 경기 상세 아이콘·딜량 UI 회귀 테스트 통과");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
