// ── 팀 공식 유튜브 최신 영상 수집 ──────────────────────────
// 유튜브는 채널마다 RSS 주소를 공개한다(키 불필요). 다만 브라우저에서 직접
// 부르면 보안 정책(CORS)에 막히므로 서버가 대신 받아 정리해서 넘긴다.
//
//   /api/team-feed?team=t1        → 그 팀 최신 영상 (서버에서 10분 캐시)
//   /api/team-feed                → 등록된 모든 팀
//
// 채널 id는 관리자 화면에서 site_settings의 team_youtube 키에 저장한다.
//   {"t1":"UCwZTsl_jHRb5RZ4Rlbu-mBg", "gen":"UC..."}

const { ok, fail, sb } = require("./_lib");

// 팀별 공식 유튜브 채널 id 기본값.
// 10개 채널 모두 RSS 를 직접 열어 채널 이름·최신 영상까지 확인했다(2026-08-05).
// 관리자 화면에서 등록한 값이 있으면 그쪽이 우선한다 — 팀이 채널을 바꾸면 덮어쓰면 된다.
const DEFAULT_CHANNELS = {
  t1: "UCJprx3bX49vNl6Bcw01Cwfg",     // T1
  gen: "UCDmmbxGg8g-EBkC_ku6vybg",    // 젠지 이스포츠
  hle: "UCrfB1-zWijAYkgfZW7Ehc8Q",    // 한화생명e스포츠
  dk: "UCepHesz_5Lwr7qRaqjB-p1A",     // Dplus KIA
  kt: "UC8FErYSi74YwGUAoTpjvgzQ",     // kt Rolster
  bro: "UCYQO6n0KZmwfwzWtm4_nAPA",    // 한진 브리온
  bfx: "UCxedTJNaGRHiq6YfNtQVCNA",    // BNK 피어엑스 LoL
  krx: "UC5WN-znPsJK0BbA8aHxZHWQ",    // 키움 DRX
  ns: "UC4PoHC-R9EeJYTuUv3ndmJw",     // NS RedForce
  dns: "UCGW76VChAJKee9kYzvyoycQ",    // DN SOOPers LoL
};

async function loadChannels() {
  const rows = await sb("site_settings?key=eq.team_youtube&select=value");
  let saved = {};
  try { saved = JSON.parse((rows[0] || {}).value || "{}"); } catch { saved = {}; }
  // 저장된 값이 우선, 없는 팀은 기본값으로 채운다
  const out = { ...DEFAULT_CHANNELS };
  Object.entries(saved).forEach(([k, v]) => { if (v) out[k] = v; });
  return out;
}

// RSS(XML)에서 필요한 것만 뽑아낸다 — 라이브러리 없이 정규식으로 충분
function parseFeed(xml, teamId) {
  const out = [];
  const entries = xml.split("<entry>").slice(1);
  entries.forEach(e => {
    const pick = (tag) => {
      const m = e.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
    };
    const id = pick("yt:videoId");
    if (!id) return;
    out.push({
      team: teamId,
      videoId: id,
      title: pick("title"),
      published: pick("published"),
      thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${id}`,
    });
  });
  return out;
}

module.exports = async (req, res) => {
  try {
    const channels = await loadChannels();
    const want = (req.query.team || "").trim();
    const targets = want ? (channels[want] ? { [want]: channels[want] } : {}) : channels;
    if (!Object.keys(targets).length) {
      return ok(res, { videos: [], note: "등록된 유튜브 채널이 없습니다 (관리자 → 팀 채널)" }, 300);
    }

    const lists = await Promise.all(Object.entries(targets).map(async ([teamId, chId]) => {
      try {
        const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(chId)}`,
          { headers: { "user-agent": "TheNexus-LCK-FanSite/1.0" } });
        if (!r.ok) return [];
        return parseFeed(await r.text(), teamId).slice(0, 8);
      } catch { return []; }
    }));

    const videos = lists.flat().sort((a, b) => (a.published < b.published ? 1 : -1)).slice(0, 40);
    // 10분 동안은 같은 응답을 재사용 (유튜브에도, 우리 서버에도 부담이 없게)
    return ok(res, { videos, count: videos.length }, 600);
  } catch (e) {
    return fail(res, 500, e.message || String(e));
  }
};
