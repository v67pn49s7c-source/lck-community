// ── Data Dragon (라이엇 공개 CDN) — 챔피언·아이템·룬·스펠 아이콘 ──────────
// API 키 불필요. 한국어 이름 → 이미지 id 변환표를 최신 패치 기준으로 한 번 받아
// localStorage에 캐시하고, 화면에서는 한글 텍스트를 실제 인게임 아이콘으로 바꾼다.
// 네트워크 실패 시에는 기존처럼 텍스트로 표시된다 (안전한 성능 저하).

const DD = { ver: null, items: {}, spells: {}, runes: {}, champs: {} };
const DD_CDN = "https://ddragon.leagueoflegends.com/cdn";

// 옛 이름·다른 표기 → 현재 정식 이름 (시즌 개편으로 이름이 바뀐 것들)
const DD_ALIAS = {
  // 아이템
  "루덴의 동반자": "루덴의 메아리",
  "루덴의 폭풍": "루덴의 메아리",
  "흑색 절단기": "칠흑의 양날 도끼",
  "세라프의 포옹": "대천사의 포옹",
  "나보리 신속검": "나보리 명멸검",
  "나보리 회전검": "나보리 명멸검",
  // 룬
  "소환: 아에리": "콩콩이 소환",
  "아에리 소환": "콩콩이 소환",
  "난입": "폭풍전사의 포효",
  "돌파": "폭풍전사의 포효",
  "시대의 흐름": "폭풍전사의 포효",
};

// 이름 찾기: 정확한 이름 → 별칭 → 공백 무시 (판금장화 ↔ 판금 장화)
function ddLookup(map, name) {
  if (!name) return null;
  if (map[name] != null) return map[name];
  const alias = DD_ALIAS[name];
  if (alias && map[alias] != null) return map[alias];
  if (!map.__norm) {
    const n = {};
    Object.keys(map).forEach(k => { n[k.replace(/\s+/g, "")] = map[k]; });
    Object.defineProperty(map, "__norm", { value: n, enumerable: false });
  }
  return map.__norm[name.replace(/\s+/g, "")] ?? null;
}

async function ddInit() {
  try {
    const vers = await (await fetch("https://ddragon.leagueoflegends.com/api/versions.json")).json();
    const ver = vers[0];
    // 같은 패치면 캐시 재사용 (패치가 바뀌면 자동 갱신)
    try {
      const cached = JSON.parse(localStorage.getItem("nexus_dd") || "null");
      if (cached && cached.ver === ver) { Object.assign(DD, cached); return true; }
    } catch {}
    const base = `${DD_CDN}/${ver}/data/ko_KR/`;
    const [item, summ, runes, champ] = await Promise.all([
      fetch(base + "item.json").then(r => r.json()),
      fetch(base + "summoner.json").then(r => r.json()),
      fetch(base + "runesReforged.json").then(r => r.json()),
      fetch(base + "champion.json").then(r => r.json()),
    ]);
    DD.ver = ver;
    Object.entries(item.data).forEach(([id, it]) => {
      if (it.name && DD.items[it.name] == null) DD.items[it.name] = id;
    });
    Object.values(summ.data).forEach(s => { DD.spells[s.name] = s.image.full; });
    runes.forEach(tree => {
      DD.runes[tree.name] = tree.icon; // 트리 이름 (정밀·지배·마법·결의·영감)
      tree.slots.forEach(sl => sl.runes.forEach(r => { DD.runes[r.name] = r.icon; }));
    });
    Object.values(champ.data).forEach(ch => { DD.champs[ch.name] = ch.image.full; });
    try { localStorage.setItem("nexus_dd", JSON.stringify(DD)); } catch {}
    return true;
  } catch (e) { console.error("[ddragon]", e); return false; }
}

// 챔피언: 아이콘 + 이름
function ddChampHTML(name) {
  name = (name || "").trim();
  if (!name) return "";
  const f = ddLookup(DD.champs, name);
  return f
    ? `<img class="dd-ic champ" src="${DD_CDN}/${DD.ver}/img/champion/${f}" alt="${esc(name)}" title="${esc(name)}" loading="lazy"> <span class="dd-nm">${esc(name)}</span>`
    : esc(name);
}
// 소환사 주문: "점멸, 점화" / "점멸/텔레포트" 등 구분자 자유
function ddSpellHTML(str) {
  const parts = (str || "").split(/[,/·]/).map(s => s.trim()).filter(Boolean);
  if (!parts.length) return "";
  if (!DD.ver) return esc(str);
  return parts.map(nm => {
    const f = ddLookup(DD.spells, nm);
    return f
      ? `<img class="dd-ic" src="${DD_CDN}/${DD.ver}/img/spell/${f}" alt="${esc(nm)}" title="${esc(nm)}" loading="lazy">`
      : `<span class="dd-miss" title="이름이 정확하지 않아요">${esc(nm)}</span>`;
  }).join("");
}
// 아이템: 쉼표 구분
function ddItemsHTML(str) {
  const parts = (str || "").split(/[,·]/).map(s => s.trim()).filter(Boolean);
  if (!parts.length) return "";
  if (!DD.ver) return esc(str);
  return parts.map(nm => {
    const id = ddLookup(DD.items, nm);
    return id
      ? `<img class="dd-ic" src="${DD_CDN}/${DD.ver}/img/item/${id}.png" alt="${esc(nm)}" title="${esc(nm)}" loading="lazy">`
      : `<span class="dd-miss" title="이름이 정확하지 않아요">${esc(nm)}</span>`;
  }).join("");
}
// 룬: "정복자/결의" 처럼 핵심룬/보조트리
function ddRunesHTML(str) {
  const parts = (str || "").split(/[,/·]/).map(s => s.trim()).filter(Boolean);
  if (!parts.length) return "";
  if (!DD.ver) return esc(str);
  return parts.map(nm => {
    const ic = ddLookup(DD.runes, nm);
    return ic
      ? `<img class="dd-ic rune" src="${DD_CDN}/img/${ic}" alt="${esc(nm)}" title="${esc(nm)}" loading="lazy">`
      : `<span class="dd-miss" title="이름이 정확하지 않아요">${esc(nm)}</span>`;
  }).join("");
}
