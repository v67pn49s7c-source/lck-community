// ── 선수 상반신 사진 ──────────────────────────────────────
// 출처: LoL Esports 공식 static CDN (esports-api.lolesports.com 공개 API).
// 공식 DB에 사진이 없는 선수는 리그피디아 공식 프로필을 assets/players/ 에 저장해 사용.
//
// 키는 "팀id:닉네임(소문자)" — 관리자에서 선수를 지웠다 다시 등록해 내부 id가 바뀌어도
// 사진 연결이 끊기지 않는다. 로스터가 바뀌면 아래에 한 줄만 추가하면 된다.
const PLAYER_PHOTOS = {
  "bfx:clear": "http://static.lolesports.com/players/1769091426725_LCK_BFX_Clear_F.png", // BFX Clear
  "bfx:daystar": "http://static.lolesports.com/players/1769091448891_LCK_BFX_Daystar_F.PNG", // BFX Daystar
  "bfx:kellin": "http://static.lolesports.com/players/1769091436066_LCK_BFX_Kellin_F.PNG", // BFX Kellin
  "bfx:raptor": "http://static.lolesports.com/players/1769091440054_LCK_BFX_Raptor_F.PNG", // BFX Raptor
  "bfx:taeyoon": "http://static.lolesports.com/players/1778842617008_LCK_BFX_Taeyoon_F.PNG", // BFX Taeyoon
  "bfx:vicla": "http://static.lolesports.com/players/1769091444387_LCK_BFX_VicLa_F.PNG", // BFX VicLa
  "bro:casting": "http://static.lolesports.com/players/1769091238011_LCK_BRO_Casting_F.png", // BRO Casting
  "bro:gideon": "http://static.lolesports.com/players/1769091233026_LCK_BRO_GIDEON_F.PNG", // BRO GIDEON
  "bro:namgung": "http://static.lolesports.com/players/1769091222686_LCK_BRO_Namgung_F.PNG", // BRO Namgung
  "bro:pungyeon": "http://static.lolesports.com/players/1769232251135_Pungyeon.png", // BRO Pungyeon
  "bro:roamer": "http://static.lolesports.com/players/1769091227250_LCK_BRO_Roamer_F.PNG", // BRO Roamer
  "bro:teddy": "http://static.lolesports.com/players/1769091213345_LCK_BRO_Teddy_F.PNG", // BRO Teddy
  "dk:career": "http://static.lolesports.com/players/1778842708132_LCK_DK_Career_F.PNG", // DK Career
  "dk:lucid": "http://static.lolesports.com/players/1778842716183_LCK_DK_Lucid_F.PNG", // DK Lucid
  "dk:showmaker": "http://static.lolesports.com/players/1778842721951_LCK_DK_Showmaker_F.png", // DK ShowMaker
  "dk:siwoo": "http://static.lolesports.com/players/1778842731846_LCK_DK_Siwoo_F.PNG", // DK Siwoo
  "dk:smash": "http://static.lolesports.com/players/1778842749985_LCK_DK_Smash_F.PNG", // DK Smash
  "dns:clozer": "http://static.lolesports.com/players/1769090740623_LCK_DNS_Clozer_F.PNG", // DNS Clozer
  "dns:deokdam": "http://static.lolesports.com/players/1769090748726_LCK_DNS_deokdam_F.PNG", // DNS deokdam
  "dns:dudu": "http://static.lolesports.com/players/1769090757762_LCK_DNS_DuDu_F.PNG", // DNS DuDu
  "dns:life": "http://static.lolesports.com/players/1769090753765_LCK_DNS_Life_F.PNG", // DNS Life
  "dns:peter": "http://static.lolesports.com/players/1769090762247_LCK_DNS_Peter_F.PNG", // DNS Peter
  "dns:pyosik": "http://static.lolesports.com/players/1769090766931_LCK_DNS_Pyosik_F.png", // DNS Pyosik
  "dns:sharvel": "assets/players/dns-shavel.webp", // DNS Sharvel — DK.C 2026 공식 프로필(사이트 저장본)
  "dns:shavel": "assets/players/dns-shavel.webp", // DNS Shavel — 옛 표기 대응
  "gen:canyon": "http://static.lolesports.com/players/1778842984822_LCK_GEN_Canyon_F.PNG", // GEN Canyon
  "gen:chovy": "http://static.lolesports.com/players/1778842975847_LCK_GEN_Chovy_F.png", // GEN Chovy
  "gen:duro": "http://static.lolesports.com/players/1778842969792_LCK_GEN_Duro_F.PNG", // GEN Duro
  "gen:kiin": "http://static.lolesports.com/players/1778842963805_LCK_GEN_Kiin_F.PNG", // GEN Kiin
  "gen:ruler": "http://static.lolesports.com/players/1778842957393_LCK_GEN_Ruler_F.PNG", // GEN Ruler
  "hle:delight": "http://static.lolesports.com/players/1769089417110_LCK_HLE_Delight_F.PNG", // HLE Delight
  "hle:gumayusi": "http://static.lolesports.com/players/1769089421483_LCK_HLE_Gumayusi_F.PNG", // HLE Gumayusi
  "hle:kanavi": "http://static.lolesports.com/players/1769089425886_LCK_HLE_Kanavi_F.PNG", // HLE Kanavi
  "hle:zeka": "http://static.lolesports.com/players/1769089430303_LCK_HLE_Zeka_F.PNG", // HLE Zeka
  "hle:zeus": "http://static.lolesports.com/players/1769089435131_LCK_HLE_Zeus_F.PNG", // HLE Zeus
  "krx:aiming": "http://static.lolesports.com/players/1769088886678_LCK_KT_Aiming_F.PNG", // KRX Aiming
  "krx:andil": "http://static.lolesports.com/players/1769090483396_LCK_DRX_Andil_F.PNG", // KRX Andil
  "krx:frog": "http://static.lolesports.com/players/1769088684062_image6-2026-01-22T143101.541.png", // KRX Frog
  "krx:ucal": "http://static.lolesports.com/players/1778842833744_LCK_DRX_Ucal_F.PNG", // KRX Ucal
  "krx:vincenzo": "http://static.lolesports.com/players/1778842840049_LCK_DRX_Vincenzo_F.PNG", // KRX Vincenzo
  "krx:willer": "http://static.lolesports.com/players/1778842847968_LCK_DRX_Willer_F.PNG", // KRX Willer
  "kt:bdd": "http://static.lolesports.com/players/1769088894551_LCK_KT_Bdd_F.PNG", // KT Bdd
  "kt:cuzz": "http://static.lolesports.com/players/1769088880566_LCK_KT_Cuzz_F.PNG", // KT Cuzz
  "kt:effort": "http://static.lolesports.com/players/1769085556949_image6-2026-01-22T133848.159.png", // KT Effort
  "kt:fenrir": "http://static.lolesports.com/players/1769085625159_image6-2026-01-22T133959.277.png", // KT FenRir
  "kt:perfect": "http://static.lolesports.com/players/1769088904650_LCK_KT_PerfecT_F.png", // KT PerfecT
  "ns:calix": "http://static.lolesports.com/players/1769088332489_LCK_NS_Calix_F.png", // NS Calix
  "ns:diable": "http://static.lolesports.com/players/1778842694156_LCK_NS_Diable_F.PNG", // NS Diable
  "ns:kingen": "http://static.lolesports.com/players/1769088303035_LCK_NS_Kingen_F.PNG", // NS Kingen
  "ns:lehends": "http://static.lolesports.com/players/1769088308486_LCK_NS_Lehends_F.PNG", // NS Lehends
  "ns:scout": "http://static.lolesports.com/players/1769088313446_LCK_NS_Scout_F.png", // NS Scout
  "ns:sponge": "http://static.lolesports.com/players/1769088325879_LCK_NS_Sponge_F.PNG", // NS Sponge
  "t1:doran": "http://static.lolesports.com/players/1769087520664_LCK_T1_Doran_F.PNG", // T1 Doran
  "t1:faker": "http://static.lolesports.com/players/1769087499078_LCK_T1_Faker_F.PNG", // T1 Faker
  "t1:keria": "http://static.lolesports.com/players/1769087515444_LCK_T1_Keria_F.PNG", // T1 Keria
  "t1:oner": "http://static.lolesports.com/players/1769087509929_LCK_T1_Oner_F.PNG", // T1 Oner
  "t1:peyz": "http://static.lolesports.com/players/1769087491906_LCK_T1_Peyz_F.PNG", // T1 Peyz
};

function playerPhotoKey(p) {
  return `${p.team}:${(p.nick || "").toLowerCase()}`;
}

// 표시용 URL (외부 사진은 공식 사이트와 같은 리사이저를 거쳐 축소본으로 받음)
function playerPhotoURL(p, size) {
  const u = typeof p === "string" ? PLAYER_PHOTOS[p] : PLAYER_PHOTOS[playerPhotoKey(p)];
  if (!u) return null;
  if (!/^https?:/.test(u)) return u;             // 사이트에 저장된 사진은 그대로
  return "https://am-a.akamaihd.net/image?resize=" + (size || 160) + ":&f=" + encodeURIComponent(u);
}

// 아바타: 사진이 있으면 상반신 사진, 없으면(또는 로드 실패 시) 이니셜 카드
// big: false | true | "xl"("xl" = 선수 목록 카드처럼 사진을 크게 쓰는 자리)
function playerAvatarHTML(p, color, big) {
  const xl = big === "xl";
  const cls = "player-avatar" + (xl ? " xl" : big ? " big" : "");
  const initial = esc((p.nick || "").slice(0, 2));
  const u = playerPhotoURL(p, xl ? 384 : big ? 256 : 160);
  if (!u) return `<span class="${cls}" style="--team-color:${color}">${initial}</span>`;
  return `<img class="${cls} photo" style="--team-color:${color}" src="${u}" alt="${esc(p.nick)}" loading="lazy"
      onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex'">` +
    `<span class="${cls}" style="display:none; --team-color:${color}">${initial}</span>`;
}
