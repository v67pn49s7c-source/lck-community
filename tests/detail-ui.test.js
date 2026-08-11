const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("assets/ddragon.js", "utf8");
const live = fs.readFileSync("live.html", "utf8");
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

  assert(live.includes('class="dt-dmg-meter"'), "딜량 막대 UI가 있어야 함");
  assert(live.includes('ddChampHTML(p.champ, 44)'), "상세 챔피언 초상화는 큰 크기로 요청해야 함");
  assert(live.includes('class="dt-pos"'), "선수 포지션 아이콘이 있어야 함");
  assert(css.includes(".dt-champ .dd-nm { display: none; }"), "상세 표에서는 챔피언 이름을 숨겨야 함");
  assert(css.includes(".dt-dmg-meter > i > b"), "딜량 막대 채움 스타일이 있어야 함");
  assert(css.includes(".sb-drake-icon"), "드래곤 종류는 이모지 대신 공식 아이콘으로 보여야 함");
  console.log("✓ 경기 상세 아이콘·딜량 UI 회귀 테스트 통과");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
