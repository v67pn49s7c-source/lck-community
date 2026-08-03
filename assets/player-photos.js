// ── 선수 상반신 사진 (LoL Esports 공식 static CDN) ──────────
// 출처: esports-api.lolesports.com getTeams (공개 API) — 2026-08-03 기준 54/56명 매칭.
// 사진이 없는 선수(KT Peter, DNS Shavel)는 기존 이니셜 카드로 표시된다.
// 로스터가 바뀌면 이 파일에 "선수id": "사진URL" 한 줄만 추가하면 된다.
const PLAYER_PHOTOS = {
  "bfx-clear": "http://static.lolesports.com/players/1769091426725_LCK_BFX_Clear_F.png", // BFX Clear
  "bfx-daystar-1785696803255": "http://static.lolesports.com/players/1769091448891_LCK_BFX_Daystar_F.PNG", // BFX Daystar
  "bfx-kellin": "http://static.lolesports.com/players/1769091436066_LCK_BFX_Kellin_F.PNG", // BFX Kellin
  "bfx-raptor": "http://static.lolesports.com/players/1769091440054_LCK_BFX_Raptor_F.PNG", // BFX Raptor
  "bfx-taeyoon-1785696794062": "http://static.lolesports.com/players/1778842617008_LCK_BFX_Taeyoon_F.PNG", // BFX Taeyoon
  "bfx-vicla": "http://static.lolesports.com/players/1769091444387_LCK_BFX_VicLa_F.PNG", // BFX VicLa
  "bro-casting-1785696819742": "http://static.lolesports.com/players/1769091238011_LCK_BRO_Casting_F.png", // BRO Casting
  "bro-gideon-1785696832175": "http://static.lolesports.com/players/1769091233026_LCK_BRO_GIDEON_F.PNG", // BRO GIDEON
  "bro-namgung-1785696861425": "http://static.lolesports.com/players/1769091222686_LCK_BRO_Namgung_F.PNG", // BRO Namgung
  "bro-pungyeon-1785696870387": "http://static.lolesports.com/players/1769232251135_Pungyeon.png", // BRO Pungyeon
  "bro-roamer-1785696840930": "http://static.lolesports.com/players/1769091227250_LCK_BRO_Roamer_F.PNG", // BRO Roamer
  "bro-teddy-1785696850962": "http://static.lolesports.com/players/1769091213345_LCK_BRO_Teddy_F.PNG", // BRO Teddy
  "dk-career-1785696394105": "http://static.lolesports.com/players/1778842708132_LCK_DK_Career_F.PNG", // DK Career
  "dk-lucid": "http://static.lolesports.com/players/1778842716183_LCK_DK_Lucid_F.PNG", // DK Lucid
  "dk-showmaker": "http://static.lolesports.com/players/1778842721951_LCK_DK_Showmaker_F.png", // DK ShowMaker
  "dk-siwoo": "http://static.lolesports.com/players/1778842731846_LCK_DK_Siwoo_F.PNG", // DK Siwoo
  "dk-smash": "http://static.lolesports.com/players/1778842749985_LCK_DK_Smash_F.PNG", // DK Smash
  "dns-clozer-1785696668233": "http://static.lolesports.com/players/1769090740623_LCK_DNS_Clozer_F.PNG", // DNS Clozer
  "dns-deokdam-1785696678691": "http://static.lolesports.com/players/1769090748726_LCK_DNS_deokdam_F.PNG", // DNS deokdam
  "dns-dudu-1785696660242": "http://static.lolesports.com/players/1769090757762_LCK_DNS_DuDu_F.PNG", // DNS DuDu
  "dns-life-1785696698237": "http://static.lolesports.com/players/1769090753765_LCK_DNS_Life_F.PNG", // DNS Life
  "dns-peter-1785696688846": "http://static.lolesports.com/players/1769090762247_LCK_DNS_Peter_F.PNG", // DNS Peter
  "dns-pyosik-1785696707312": "http://static.lolesports.com/players/1769090766931_LCK_DNS_Pyosik_F.png", // DNS Pyosik
  "gen-canyon": "http://static.lolesports.com/players/1778842984822_LCK_GEN_Canyon_F.PNG", // GEN Canyon
  "gen-chovy": "http://static.lolesports.com/players/1778842975847_LCK_GEN_Chovy_F.png", // GEN Chovy
  "gen-duro": "http://static.lolesports.com/players/1778842969792_LCK_GEN_Duro_F.PNG", // GEN Duro
  "gen-kiin": "http://static.lolesports.com/players/1778842963805_LCK_GEN_Kiin_F.PNG", // GEN Kiin
  "gen-ruler": "http://static.lolesports.com/players/1778842957393_LCK_GEN_Ruler_F.PNG", // GEN Ruler
  "hle-delight": "http://static.lolesports.com/players/1769089417110_LCK_HLE_Delight_F.PNG", // HLE Delight
  "hle-gumayusi-1785696329218": "http://static.lolesports.com/players/1769089421483_LCK_HLE_Gumayusi_F.PNG", // HLE Gumayusi
  "hle-kanavi-1785696306601": "http://static.lolesports.com/players/1769089425886_LCK_HLE_Kanavi_F.PNG", // HLE Kanavi
  "hle-zeka": "http://static.lolesports.com/players/1769089430303_LCK_HLE_Zeka_F.PNG", // HLE Zeka
  "hle-zeus": "http://static.lolesports.com/players/1769089435131_LCK_HLE_Zeus_F.PNG", // HLE Zeus
  "krx-aiming-1785696472017": "http://static.lolesports.com/players/1769088886678_LCK_KT_Aiming_F.PNG", // KRX Aiming
  "krx-andil-1785696553028": "http://static.lolesports.com/players/1769090483396_LCK_DRX_Andil_F.PNG", // KRX Andil
  "krx-frog-1785696517776": "http://static.lolesports.com/players/1769088684062_image6-2026-01-22T143101.541.png", // KRX Frog
  "krx-ucal": "http://static.lolesports.com/players/1778842833744_LCK_DRX_Ucal_F.PNG", // KRX Ucal
  "krx-vincenzo-1785696588919": "http://static.lolesports.com/players/1778842840049_LCK_DRX_Vincenzo_F.PNG", // KRX Vincenzo
  "krx-willer-1785696540742": "http://static.lolesports.com/players/1778842847968_LCK_DRX_Willer_F.PNG", // KRX Willer
  "kt-bdd": "http://static.lolesports.com/players/1769088894551_LCK_KT_Bdd_F.PNG", // KT Bdd
  "kt-cuzz-1785696455823": "http://static.lolesports.com/players/1769088880566_LCK_KT_Cuzz_F.PNG", // KT Cuzz
  "kt-fenrir-1785696440857": "http://static.lolesports.com/players/1769085625159_image6-2026-01-22T133959.277.png", // KT FenRir
  "kt-perfect": "http://static.lolesports.com/players/1769088904650_LCK_KT_PerfecT_F.png", // KT PerfecT
  "ns-calix-1785696769328": "http://static.lolesports.com/players/1769088332489_LCK_NS_Calix_F.png", // NS Calix
  "ns-diable-1785696759356": "http://static.lolesports.com/players/1778842694156_LCK_NS_Diable_F.PNG", // NS Diable
  "ns-kingen-1785696735478": "http://static.lolesports.com/players/1769088303035_LCK_NS_Kingen_F.PNG", // NS Kingen
  "ns-lehends": "http://static.lolesports.com/players/1769088308486_LCK_NS_Lehends_F.PNG", // NS Lehends
  "ns-scout-1785696751182": "http://static.lolesports.com/players/1769088313446_LCK_NS_Scout_F.png", // NS Scout
  "ns-sponge-1785696742452": "http://static.lolesports.com/players/1769088325879_LCK_NS_Sponge_F.PNG", // NS Sponge
  "t1-doran": "http://static.lolesports.com/players/1769087520664_LCK_T1_Doran_F.PNG", // T1 Doran
  "t1-faker": "http://static.lolesports.com/players/1769087499078_LCK_T1_Faker_F.PNG", // T1 Faker
  "t1-keria": "http://static.lolesports.com/players/1769087515444_LCK_T1_Keria_F.PNG", // T1 Keria
  "t1-oner": "http://static.lolesports.com/players/1769087509929_LCK_T1_Oner_F.PNG", // T1 Oner
  "t1-peyz-1785696354910": "http://static.lolesports.com/players/1769087491906_LCK_T1_Peyz_F.PNG", // T1 Peyz
};

// 표시용 리사이즈 URL (공식 사이트와 같은 이미지 리사이저 사용)
function playerPhotoURL(pid, size) {
  const u = PLAYER_PHOTOS[pid];
  if (!u) return null;
  return "https://am-a.akamaihd.net/image?resize=" + (size || 160) + ":&f=" + encodeURIComponent(u);
}

// 아바타: 사진이 있으면 상반신 사진, 없으면(또는 로드 실패 시) 이니셜 카드
function playerAvatarHTML(p, color, big) {
  const cls = "player-avatar" + (big ? " big" : "");
  const initial = esc(p.nick.slice(0, 2));
  const u = playerPhotoURL(p.id, big ? 256 : 160);
  if (!u) return `<span class="${cls}" style="--team-color:${color}">${initial}</span>`;
  return `<img class="${cls} photo" style="--team-color:${color}" src="${u}" alt="${esc(p.nick)}" loading="lazy"
      onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex'">` +
    `<span class="${cls}" style="display:none; --team-color:${color}">${initial}</span>`;
}
