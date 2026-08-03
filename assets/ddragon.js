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
      const cached = JSON.parse(localStorage.getItem("nexus_dd_v2") || "null");
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
    Object.values(champ.data).forEach(ch => { DD.champs[ch.name] = ch.id; }); // 영문 id (최신 초상화용)
    try { localStorage.setItem("nexus_dd_v2", JSON.stringify(DD)); } catch {}
    return true;
  } catch (e) { console.error("[ddragon]", e); return false; }
}

// 이미지 한 장이 실패해도 대체 주소로 한 번 더 시도 (error는 버블링하지 않으므로 캡처 단계)
document.addEventListener("error", e => {
  const img = e.target;
  if (img.tagName !== "IMG" || !img.dataset.fallback) return;
  const fb = img.dataset.fallback;
  delete img.dataset.fallback; // 무한 반복 방지
  img.src = fb;
}, true);

// 챔피언: 아이콘 + 이름
// 기본은 Data Dragon (아이템·룬과 같은 서버라 연결을 재사용해 빠르고, 누락이 없다).
// 실패하면 CommunityDragon으로 한 번 더 시도한다 (리메이크 직후 초상화가 빠르게 반영되는 쪽).
function ddChampHTML(name) {
  name = (name || "").trim();
  if (!name) return "";
  const id = ddLookup(DD.champs, name);
  if (!id) return esc(name);
  const cdrag = `https://cdn.communitydragon.org/latest/champion/${id}/square`;
  const src = DD.ver ? `${DD_CDN}/${DD.ver}/img/champion/${id}.png` : cdrag;
  const fb = src === cdrag ? "" : ` data-fallback="${cdrag}"`;
  return `<img class="dd-ic champ" src="${src}"${fb} alt="${esc(name)}" title="${esc(name)}"`
    + ` width="24" height="24" decoding="async"> <span class="dd-nm">${esc(name)}</span>`;
}
// 소환사 주문: "점멸, 점화" / "점멸/텔레포트" 등 구분자 자유
function ddSpellHTML(str) {
  const parts = (str || "").split(/[,/·]/).map(s => s.trim()).filter(Boolean);
  if (!parts.length) return "";
  if (!DD.ver) return esc(str);
  return parts.map(nm => {
    const f = ddLookup(DD.spells, nm);
    return f
      ? `<img class="dd-ic" src="${DD_CDN}/${DD.ver}/img/spell/${f}" alt="${esc(nm)}" title="${esc(nm)}" width="22" height="22" decoding="async">`
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
      ? `<img class="dd-ic" src="${DD_CDN}/${DD.ver}/img/item/${id}.png" alt="${esc(nm)}" title="${esc(nm)}" width="22" height="22" decoding="async">`
      : `<span class="dd-miss" title="이름이 정확하지 않아요">${esc(nm)}</span>`;
  }).join("");
}
// ── 관리자용 아이콘 선택기 ────────────────────────────────
// 텍스트 입력 대신 아이콘을 클릭해서 고르는 창. 카테고리·검색 지원.
let DDFull = null;
async function ddFullInit() {
  if (DDFull) return DDFull;
  const vers = await (await fetch("https://ddragon.leagueoflegends.com/api/versions.json")).json();
  const ver = vers[0];
  const base = `${DD_CDN}/${ver}/data/ko_KR/`;
  const [item, summ, runes, champ] = await Promise.all([
    fetch(base + "item.json").then(r => r.json()),
    fetch(base + "summoner.json").then(r => r.json()),
    fetch(base + "runesReforged.json").then(r => r.json()),
    fetch(base + "champion.json").then(r => r.json()),
  ]);
  const seen = new Set(), items = [];
  Object.entries(item.data).forEach(([id, it]) => {
    if (!it.name || seen.has(it.name)) return;
    if (!it.gold || !it.gold.purchasable || !it.gold.total) return; // 상점 구매 가능만
    if (it.maps && it.maps["11"] === false) return;                 // 소환사의 협곡만
    if (it.requiredAlly) return;                                    // 오른 강화템 제외
    seen.add(it.name);
    items.push({ name: it.name, id, tags: it.tags || [], gold: it.gold.total });
  });
  items.sort((a, b) => b.gold - a.gold);
  DDFull = {
    ver,
    items,
    champs: Object.values(champ.data).map(c => ({ name: c.name, id: c.id, tags: c.tags || [] }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko")),
    spells: Object.values(summ.data).filter(s => (s.modes || []).includes("CLASSIC"))
      .map(s => ({ name: s.name, file: s.image.full })),
    runeTrees: runes,
  };
  return DDFull;
}

const DD_CHAMP_CATS = [
  ["전체", null], ["전사", "Fighter"], ["탱커", "Tank"], ["마법사", "Mage"],
  ["암살자", "Assassin"], ["원거리", "Marksman"], ["서포터", "Support"],
];
const DD_ITEM_CATS = [
  ["전체", null],
  ["신발", it => it.tags.includes("Boots")],
  ["물리", it => it.tags.includes("Damage") && !it.tags.includes("SpellDamage")],
  ["주문력", it => it.tags.includes("SpellDamage")],
  ["공속·치명", it => it.tags.includes("AttackSpeed") || it.tags.includes("CriticalStrike")],
  ["방어", it => it.tags.includes("Armor") || it.tags.includes("SpellBlock") || it.tags.includes("Health")],
  ["마나·재생", it => it.tags.includes("Mana") || it.tags.includes("ManaRegen") || it.tags.includes("HealthRegen")],
  ["시야·소모품", it => it.tags.includes("Consumable") || it.tags.includes("Trinket") || it.tags.includes("Vision") || it.tags.includes("GoldPer")],
];

function openDDPicker(kind, input) {
  let el = document.getElementById("ddp-overlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "ddp-overlay";
    el.innerHTML = `
      <div class="ddp-panel">
        <div class="ddp-head">
          <b id="ddp-title"></b>
          <input id="ddp-search" placeholder="이름 검색" autocomplete="off">
          <button type="button" id="ddp-close">✕</button>
        </div>
        <div class="ddp-tabs" id="ddp-tabs"></div>
        <div class="ddp-grid" id="ddp-grid"></div>
        <div class="ddp-foot">
          <span id="ddp-sel"></span>
          <span class="ddp-foot-btns">
            <button type="button" id="ddp-clear">지우기</button>
            <button type="button" class="btn-primary" id="ddp-done">완료</button>
          </span>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener("click", e => { if (e.target === el) el.style.display = "none"; });
    el.querySelector("#ddp-close").addEventListener("click", () => { el.style.display = "none"; });
  }
  el.style.display = "flex";

  const D = DDFull;
  const title = { champ: "챔피언 선택", item: "아이템 선택", spell: "소환사 주문 선택", rune: "룬 선택 (핵심 룬 → 보조 트리)" }[kind];
  el.querySelector("#ddp-title").textContent = title;
  const searchEl = el.querySelector("#ddp-search");
  const tabsEl = el.querySelector("#ddp-tabs");
  const gridEl = el.querySelector("#ddp-grid");
  const selEl = el.querySelector("#ddp-sel");
  searchEl.value = "";
  searchEl.style.display = kind === "rune" ? "none" : "";

  let cat = 0;
  // 현재 입력값에서 선택 상태 복원
  let sel = new Set((input.value || "").split(/[,/]/).map(s => s.trim()).filter(Boolean));
  let runeSel = { key: "", tree: "" };
  if (kind === "rune") {
    const parts = (input.value || "").split("/").map(s => s.trim());
    runeSel = { key: parts[0] || "", tree: parts[1] || "" };
  }

  const write = () => {
    if (kind === "champ") input.value = [...sel][0] || "";
    else if (kind === "rune") input.value = runeSel.key && runeSel.tree ? `${runeSel.key}/${runeSel.tree}` : (runeSel.key || runeSel.tree || "");
    else input.value = [...sel].join(", ");
    selEl.textContent = input.value ? "선택: " + input.value : "선택 없음";
  };

  const iconOf = x =>
    kind === "champ" ? `${DD_CDN}/${D.ver}/img/champion/${x.id}.png` :
    kind === "item" ? `${DD_CDN}/${D.ver}/img/item/${x.id}.png` :
    `${DD_CDN}/${D.ver}/img/spell/${x.file}`;

  const draw = () => {
    if (kind === "rune") {
      tabsEl.innerHTML = "";
      gridEl.innerHTML = D.runeTrees.map(tree => `
        <div class="ddp-sec">핵심 룬 — ${esc(tree.name)}
          <button type="button" class="ddp-cell tree ${runeSel.tree === tree.name ? "on" : ""}" data-tree="${esc(tree.name)}" title="보조 트리로 선택">
            <img src="${DD_CDN}/img/${tree.icon}" loading="lazy"><span>${esc(tree.name)} 보조</span>
          </button>
        </div>
        <div class="ddp-row">
          ${tree.slots[0].runes.map(r => `
            <button type="button" class="ddp-cell ${runeSel.key === r.name ? "on" : ""}" data-key="${esc(r.name)}">
              <img src="${DD_CDN}/img/${r.icon}" loading="lazy"><span>${esc(r.name)}</span>
            </button>`).join("")}
        </div>`).join("");
      gridEl.querySelectorAll("[data-key]").forEach(b => b.addEventListener("click", () => {
        runeSel.key = b.dataset.key; write(); draw();
      }));
      gridEl.querySelectorAll("[data-tree]").forEach(b => b.addEventListener("click", () => {
        runeSel.tree = b.dataset.tree; write(); draw();
      }));
      write();
      return;
    }

    const cats = kind === "champ" ? DD_CHAMP_CATS : kind === "item" ? DD_ITEM_CATS : [["전체", null]];
    tabsEl.innerHTML = cats.map(([label], i) =>
      `<button type="button" class="${i === cat ? "active" : ""}" data-cat="${i}">${label}</button>`).join("");
    tabsEl.querySelectorAll("button").forEach(b => b.addEventListener("click", () => { cat = +b.dataset.cat; draw(); }));

    let list = kind === "champ" ? D.champs : kind === "item" ? D.items : D.spells;
    const filt = cats[cat][1];
    if (filt) list = list.filter(x => typeof filt === "function" ? filt(x) : (x.tags || []).includes(filt));
    const q = searchEl.value.trim();
    if (q) list = list.filter(x => x.name.includes(q));

    gridEl.innerHTML = list.map(x => `
      <button type="button" class="ddp-cell ${sel.has(x.name) ? "on" : ""}" data-name="${esc(x.name)}">
        <img src="${iconOf(x)}" loading="lazy"><span>${esc(x.name)}</span>
      </button>`).join("") || `<div class="empty-note">검색 결과가 없습니다</div>`;
    gridEl.querySelectorAll(".ddp-cell").forEach(b => b.addEventListener("click", () => {
      const nm = b.dataset.name;
      if (kind === "champ") { sel = new Set([nm]); write(); el.style.display = "none"; return; }
      if (sel.has(nm)) sel.delete(nm);
      else {
        if (kind === "spell" && sel.size >= 2) { alert("소환사 주문은 2개까지입니다. 기존 것을 눌러 해제하세요."); return; }
        sel.add(nm);
      }
      write(); draw();
    }));
    write();
  };

  searchEl.oninput = draw;
  el.querySelector("#ddp-clear").onclick = () => { sel = new Set(); runeSel = { key: "", tree: "" }; write(); draw(); };
  el.querySelector("#ddp-done").onclick = () => { el.style.display = "none"; };
  draw();
}

// 선택형 입력칸(.dd-pickable) 클릭 → 선택기 열기 (관리자 화면)
document.addEventListener("click", e => {
  const input = e.target.closest(".dd-pickable");
  if (!input) return;
  ddFullInit().then(() => openDDPicker(input.dataset.kind, input))
    .catch(() => alert("아이콘 데이터를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요."));
});

// 룬: "정복자/결의" 처럼 핵심룬/보조트리
function ddRunesHTML(str) {
  const parts = (str || "").split(/[,/·]/).map(s => s.trim()).filter(Boolean);
  if (!parts.length) return "";
  if (!DD.ver) return esc(str);
  return parts.map(nm => {
    const ic = ddLookup(DD.runes, nm);
    return ic
      ? `<img class="dd-ic rune" src="${DD_CDN}/img/${ic}" alt="${esc(nm)}" title="${esc(nm)}" width="22" height="22" decoding="async">`
      : `<span class="dd-miss" title="이름이 정확하지 않아요">${esc(nm)}</span>`;
  }).join("");
}
