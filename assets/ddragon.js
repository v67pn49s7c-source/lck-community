// ── Data Dragon (라이엇 공개 CDN) — 챔피언·아이템·룬·스펠 아이콘 ──────────
// API 키 불필요. 한국어 이름 → 이미지 id 변환표를 최신 패치 기준으로 한 번 받아
// localStorage에 캐시하고, 화면에서는 한글 텍스트를 실제 인게임 아이콘으로 바꾼다.
// 네트워크 실패 시에는 기존처럼 텍스트로 표시된다 (안전한 성능 저하).

const DD = { ver: null, items: {}, trinkets: {}, itemInfo: {}, spells: {}, runes: {}, runeInfo: {}, champs: {} };
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
function ddNormKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function ddLookup(map, name) {
  if (!name) return null;
  if (map[name] != null) return map[name];
  const alias = DD_ALIAS[name];
  if (alias && map[alias] != null) return map[alias];
  if (!map.__norm) {
    const n = {};
    Object.keys(map).forEach(k => { n[ddNormKey(k)] = map[k]; });
    Object.defineProperty(map, "__norm", { value: n, enumerable: false });
  }
  return map.__norm[ddNormKey(alias || name)] ?? null;
}

async function ddInit() {
  try {
    const vers = await (await fetch("https://ddragon.leagueoflegends.com/api/versions.json")).json();
    const ver = vers[0];
    // 같은 패치면 캐시 재사용 (패치가 바뀌면 자동 갱신)
    try {
      const cached = JSON.parse(localStorage.getItem("nexus_dd_v7") || "null");
      if (cached && cached.ver === ver) { Object.assign(DD, cached); return true; }
    } catch {}
    const base = `${DD_CDN}/${ver}/data/ko_KR/`;
    const enBase = `${DD_CDN}/${ver}/data/en_US/`;
    const [item, itemEn, summ, runes, champ, champEn, summEn, runesEn] = await Promise.all([
      fetch(base + "item.json").then(r => r.json()),
      fetch(enBase + "item.json").then(r => r.json()),
      fetch(base + "summoner.json").then(r => r.json()),
      fetch(base + "runesReforged.json").then(r => r.json()),
      fetch(base + "champion.json").then(r => r.json()),
      fetch(enBase + "champion.json").then(r => r.json()),
      // 국제 대회(MSI·EWC) 기록은 원본이 **영어**다 ("Teleport", "Lethal Tempo").
      // 아이템·챔피언은 진작 영어까지 받고 있었는데 스펠·룬만 한글만 받아서,
      // 영문 이름이 아이콘을 못 찾고 글자 그대로 나왔다 (2026-08-16 사장님 화면).
      fetch(enBase + "summoner.json").then(r => r.json()),
      fetch(enBase + "runesReforged.json").then(r => r.json()),
    ]);
    DD.ver = ver;
    // ⚠ 장신구(와드·렌즈)는 아이템 칸에서 걸러야 한다. Data Dragon 이 종류를 알려 준다
    //   (tags 에 "Trinket", 또는 inStore=false / 상점 밖 아이템).
    //   이미 저장된 기록에 섞여 있어서, 화면에서도 한 번 더 거른다. (2026-08-08)
    const itemInfoById = {};
    Object.entries(item.data).forEach(([id, it]) => {
      if (!it.name) return;
      if (DD.items[it.name] == null) DD.items[it.name] = id;
      if ((it.tags || []).includes("Trinket")) DD.trinkets[it.name] = id;
      // 마우스를 올렸을 때 보여 줄 것 — 이름 · 값 · 한 줄 설명
      DD.itemInfo[it.name] = itemInfoById[id] = {
        gold: (it.gold && it.gold.total) || 0,
        // plaintext 가 가장 짧고 읽기 쉽다. 없으면 설명에서 태그를 걷어 낸다.
        text: (it.plaintext || "").trim()
          || String(it.description || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").trim().slice(0, 90),
      };
    });
    // Leaguepedia 기록에는 영문명과 한글명이 섞인다. 같은 id의 en_US 이름도 함께
    // 등록해 두면 Jak'Sho처럼 쉼표·따옴표 표기가 달라도 아이콘으로 찾을 수 있다.
    Object.entries(itemEn.data).forEach(([id, it]) => {
      if (!it.name) return;
      if (DD.items[it.name] == null) DD.items[it.name] = id;
      if ((it.tags || []).includes("Trinket")) DD.trinkets[it.name] = id;
      DD.itemInfo[it.name] = itemInfoById[id] || {
        gold: (it.gold && it.gold.total) || 0,
        text: (it.plaintext || "").trim(),
      };
    });
    // ⚠ 같은 이름의 소환사 주문이 여러 개다 — 소환사의 협곡(CLASSIC)용과
    //   아레나(JADE·CHERRY)용이 따로 있고, 이름은 '점멸'로 똑같다.
    //   그냥 넣으면 **나중 것이 덮어써서** 프로 경기 화면에 아레나 아이콘이 뜬다
    //   (SummonerFlash_Jade 등 — 실제로 그랬다). 협곡용을 우선한다. (2026-08-08)
    Object.values(summ.data).forEach(sp => {
      const classic = (sp.modes || []).includes("CLASSIC");
      if (classic || DD.spells[sp.name] == null) {
        if (classic || !DD.spells[sp.name]) DD.spells[sp.name] = sp.image.full;
      }
      if (classic) DD.spells[sp.name] = sp.image.full;     // 협곡용이면 무조건 이긴다
    });
    // 영어 이름도 같은 아이콘으로 이어 준다. 한글 이름을 덮어쓰지는 않는다.
    Object.values(summEn.data || {}).forEach(sp => {
      if ((sp.modes || []).includes("CLASSIC") && DD.spells[sp.name] == null) DD.spells[sp.name] = sp.image.full;
    });
    runes.forEach(tree => {
      DD.runes[tree.name] = tree.icon; // 트리 이름 (정밀·지배·마법·결의·영감)
      DD.runeInfo[tree.name] = { text: `${tree.name} 계열` };
      tree.slots.forEach(sl => sl.runes.forEach(r => {
        DD.runes[r.name] = r.icon;
        DD.runeInfo[r.name] = {
          text: String(r.shortDesc || r.longDesc || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").trim().slice(0, 110),
        };
      }));
    });
    (runesEn || []).forEach(tree => {
      if (DD.runes[tree.name] == null) DD.runes[tree.name] = tree.icon;
      tree.slots.forEach(sl => sl.runes.forEach(r => {
        if (DD.runes[r.name] == null) DD.runes[r.name] = r.icon;
      }));
    });
    // 같은 표시 이름을 쓰는 이벤트/아레나 변형(Jade_Alistar 등)이 정식 초상화를
    // 덮어쓰지 못하게 기본 id를 우선한다. 데이터 파일에서 변형이 먼저 나올 수도 있다.
    const isChampVariant = id => /^(?:Jade|Cherry|Strawberry|Arena)_/i.test(String(id || ""));
    const registerChamp = ch => {
      const before = DD.champs[ch.name];
      if (before == null || (isChampVariant(before) && !isChampVariant(ch.id))) DD.champs[ch.name] = ch.id;
    };
    Object.values(champ.data).forEach(registerChamp);
    Object.values(champEn.data).forEach(registerChamp);
    try {
      localStorage.removeItem("nexus_dd_v3");
      localStorage.removeItem("nexus_dd_v4");
      localStorage.removeItem("nexus_dd_v5");
      localStorage.removeItem("nexus_dd_v6");   // v7: 스펠·룬 영어 이름 추가
      localStorage.setItem("nexus_dd_v7", JSON.stringify(DD));
    } catch {}
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
// 라이엇의 **정사각 아이콘**은 챔피언마다 그려진 연도가 달라 화풍이 제각각이다
// (233개를 픽셀 단위로 비교해 보니 Data Dragon 과 CommunityDragon 은 완전히 같은 그림이었다 —
//  즉 소스 문제가 아니라 라이엇 원본이 섞여 있는 것).
// 로딩 화면용 **타일**은 최신 기준으로 다시 그려져 화풍이 일정하다. 그래서 타일을 먼저 쓰고,
// 없으면 정사각 아이콘으로 물러난다. 380x380 정사각이라 잘림 없이 그대로 쓸 수 있다.
function ddChampSrc(id) {
  return `https://cdn.communitydragon.org/latest/champion/${id}/tile`;
}
function ddChampHTML(name, size) {
  name = (name || "").trim();
  if (!name) return "";
  const id = ddLookup(DD.champs, name);
  if (!id) return ddUnknownChip(name, "챔피언", "champ");
  const px = size || 26;
  const square = DD.ver ? `${DD_CDN}/${DD.ver}/img/champion/${id}.png`
                        : `https://cdn.communitydragon.org/latest/champion/${id}/square`;
  return `<span class="dd-chip"><img class="dd-ic champ" src="${square}" data-fallback="${ddChampSrc(id)}"`
    + ` alt="${esc(name)}" width="${px}" height="${px}" decoding="async">`
    + `<span class="dd-tip"><b>${esc(name)}</b></span></span>`
    + ` <span class="dd-nm">${esc(name)}</span>`;
}
// 소환사 주문: "점멸, 점화" / "점멸/텔레포트" 등 구분자 자유
function ddSpellHTML(str) {
  const parts = (str || "").split(/[,/·;]/).map(s => s.trim()).filter(Boolean);
  if (!parts.length) return "";
  if (!DD.ver) return esc(str);
  return parts.map(nm => {
    const f = ddLookup(DD.spells, nm);
    return f
      ? ddChip(`${DD_CDN}/${DD.ver}/img/spell/${f}`, nm, "소환사 주문")
      : `<span class="dd-miss" title="이름이 정확하지 않아요">${esc(nm)}</span>`;
  }).join("");
}
// 아이템: 쉼표 구분
// 아이콘 하나 — 마우스를 올리면 이름과 설명이 뜨는 껍데기로 감싼다.
// title 속성은 브라우저가 1초쯤 뒤에야 보여 주고 꾸밀 수도 없어서, 직접 만든다.
function ddChip(src, name, sub, cls) {
  return `<span class="dd-chip" tabindex="0">
    <img class="dd-ic ${cls || ""}" src="${src}" alt="${esc(name)}" width="22" height="22" decoding="async">
    <span class="dd-tip"><b>${esc(name)}</b>${sub ? `<em>${esc(sub)}</em>` : ""}</span>
  </span>`;
}

function ddUnknownChip(name, kind, cls) {
  return `<span class="dd-chip dd-unknown" tabindex="0" aria-label="${esc(name)}">
    <span class="dd-ic dd-unknown-ic ${cls || ""}" aria-hidden="true">?</span>
    <span class="dd-tip"><b>${esc(name)}</b><em>${esc(kind || "아이콘 확인 중")}</em></span>
  </span>`;
}

// 쉼표는 아이템 목록 구분자이면서 정식 아이템명 안에도 들어간다.
// 예: "Jak'Sho, The Protean". 먼저 나눈 뒤 현재 조각이 아이템이 아니고
// 다음 조각과 합쳤을 때 정식 아이템이면 한 칸으로 되돌린다.
function ddItemParts(str) {
  const raw = (str || "").split(/[,·;]/).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const now = raw[i];
    if (!ddLookup(DD.items, now) && i + 1 < raw.length) {
      const joined = `${now}, ${raw[i + 1]}`;
      if (ddLookup(DD.items, joined)) {
        out.push(joined);
        i++;
        continue;
      }
    }
    out.push(now);
  }
  return out;
}

/** 장신구처럼 **거르지 않고** 그대로 그려야 하는 아이콘 (와드·렌즈) */
function ddItemsAny(str) {
  const parts = ddItemParts(str);
  if (!parts.length || !DD.ver) return esc(str || "");
  return parts.map(nm => {
    const id = ddLookup(DD.items, nm);
    if (!id) return ddUnknownChip(nm, "장신구");
    return ddChip(`${DD_CDN}/${DD.ver}/img/item/${id}.png`, nm, "장신구");
  }).join("");
}

function ddItemsHTML(str) {
  const parts = ddItemParts(str);
  if (!parts.length) return "";
  if (!DD.ver) return esc(str);
  return parts
    // 장신구(와드·렌즈)는 아이템이 아니다 — 이미 저장된 기록에 섞여 있어 여기서 거른다
    .filter(nm => !ddLookup(DD.trinkets, nm))
    .map(nm => {
      const id = ddLookup(DD.items, nm);
      if (!id) return ddUnknownChip(nm, "아이템");
      const info = ddLookup(DD.itemInfo, nm) || {};
      const sub = [info.gold ? `${info.gold.toLocaleString()}골드` : "", info.text].filter(Boolean).join(" · ");
      return ddChip(`${DD_CDN}/${DD.ver}/img/item/${id}.png`, nm, sub);
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
    kind === "champ" ? ddChampSrc(x.id) :
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
  const parts = (str || "").split(/[,/·;]/).map(s => s.trim()).filter(Boolean);
  if (!parts.length) return "";
  if (!DD.ver) return esc(str);
  return parts.map(nm => {
    const ic = ddLookup(DD.runes, nm);
    if (!ic) return `<span class="dd-miss" title="이름이 정확하지 않아요">${esc(nm)}</span>`;
    return ddChip(`${DD_CDN}/img/${ic}`, nm, (DD.runeInfo[nm] || {}).text || "룬", "rune");
  }).join("");
}
