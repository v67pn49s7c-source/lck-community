// 국제 대회(MSI · EWC) 다시보기 — 치지직 공식 채널
//
// 왜 따로 만드나:
//   LCK 정규 시즌은 api/full-vod.js 가 **채널의 최근 영상 목록**을 훑어 찾는다.
//   그 방식은 어제 경기에는 맞지만 **한 달 전 대회에는 안 맞는다** — 공식 채널은
//   하루에도 수십 개를 올려서 MSI(7월) 영상이 목록 저 뒤로 밀려 있다.
//   그래서 여기서는 목록이 아니라 **치지직 영상 검색**을 쓴다.
//
// 어디에 있나 (실제로 확인하고 적었다, 2026-08-15):
//   MSI  → 치지직 'LCK' 공식 채널.  예) "LYON vs HLE 게임 5 VOD | 07.11 | 2026 MSI"
//   EWC  → 치지직 'EWC 공식 채널A'. 예) "KC vs DK 3세트 VOD | 결승 | 리그오브레전드 | EWC 2026"
//   ⚠ EWC 는 LCK 채널에 없고, 유튜브에도 한국어 영상이 없다. 공식 대회 API 에도
//     EWC 의 한국어 VOD 는 비어 있다(영어·트위치뿐). 치지직이 유일한 한국어 출처다.
const { ok, fail } = require("./_lib");

const LCK_CHZZK = "9381e7d6816e6d915a44a13c0195b202";              // 치지직 LCK 공식(인증)
// ⚠ EWC 는 여러 종목을 동시에 중계해서 공식 채널이 **여럿**이다. LoL 경기도 A·B 두 채널에
//   나뉘어 올라간다 (같은 8강인데 T1 vs HLE 는 A, GEN vs JDG 는 B). 한 곳만 보면 절반을 놓친다.
const EWC_CHZZK = ["fce7c8735e0646e642007198a8875882", "2b753bd5325fc34bba16d66659c67aa2"];

// 대회마다 채널과 검색어 꼬리가 다르다. 여기 없는 대회는 이 API 를 쓰지 않는다.
// ⚠ 검색어의 "리그오브레전드" 는 **띄어쓰기 없이** 써야 한다 — EWC 채널 제목 표기가 그렇다.
const TOURS = {
  msi2026: { channelIds: [LCK_CHZZK], terms: ["MSI 2026", "게임 VOD MSI 2026"],
             name: "MSI", channelLabel: "치지직 LCK 공식" },
  ewc2026: { channelIds: EWC_CHZZK, terms: ["리그오브레전드 EWC 2026", "세트 VOD EWC 2026"],
             name: "EWC", channelLabel: "치지직 EWC 공식" },
};

const UA = "Mozilla/5.0 (compatible; TheNexus-LCK-FanSite/2.0)";
const CACHE_MS = 30 * 60 * 1000;             // 끝난 대회라 자주 바뀌지 않는다
const cache = new Map();

const esc = v => String(v || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 팀 약어는 **독립 낱말로만** 찾는다. 그냥 includes 로 보면 NS 가 DNS 안에서 걸린다. */
function hasTeam(title, abbr) {
  if (!abbr) return false;
  return new RegExp(`(^|[^A-Za-z0-9])${esc(abbr)}([^A-Za-z0-9]|$)`, "i").test(String(title || ""));
}

/** 경기일 근처에 올라온 영상만. 대회는 같은 팀이 여러 번 붙으므로 날짜가 유일한 구분점이다.
 *  ⚠ 새벽 경기는 다음 날 올라오므로 뒤로 넉넉히(+4일), 앞은 좁게(-1일) 잡는다. */
function nearMatch(publishDate, at) {
  const t = Date.parse(at || ""), p = Date.parse(publishDate || "");
  if (!Number.isFinite(t) || !Number.isFinite(p)) return true;
  const day = 86400000;
  return p > t - day && p < t + 4 * day;
}

const isHighlight = t => /하이라이트|인터뷰|시상식|리뷰|프리뷰|예측|같이|응원|스킬|밈|쇼츠/.test(t);
// ⚠ 두 표기를 모두 받아야 한다 — 숫자가 앞에 오기도 하고 뒤에 오기도 한다.
//   LCK 채널: "게임 5 VOD"   ·   EWC 채널: "3세트 VOD"
const setNoOf = t => {
  const m = String(t || "").match(/([1-5])\s*세트|게임\s*([1-5])/);
  return m ? Number(m[1] || m[2]) : null;
};

async function searchChzzk(keyword) {
  const url = `https://api.chzzk.naver.com/service/v1/search/videos?size=30&keyword=${encodeURIComponent(keyword)}`;
  const r = await fetch(url, { headers: { "user-agent": UA } });
  if (!r.ok) throw new Error(`chzzk ${r.status}`);
  const body = await r.json();
  const rows = (body && body.content && body.content.data) || [];
  return rows.map(row => {
    const v = row.video || row;
    return {
      videoNo: v.videoNo,
      title: v.videoTitle || "",
      publishDate: v.publishDate || "",
      channelId: (row.channel || v.channel || {}).channelId || "",
    };
  }).filter(v => v.videoNo);
}

/** 검색 결과에서 이 경기 것만 고른다. 확실하지 않으면 **버린다** —
 *  엉뚱한 경기 영상을 걸어 두는 것이 아무것도 안 거는 것보다 나쁘다. */
function pick(rows, { a, b, at, channelIds }) {
  const mine = rows.filter(v =>
    channelIds.includes(v.channelId) && hasTeam(v.title, a) && hasTeam(v.title, b) && nearMatch(v.publishDate, at));
  const sets = [];
  let full = null;
  mine.forEach(v => {
    if (isHighlight(v.title)) return;
    const n = setNoOf(v.title);
    if (n) { if (!sets[n - 1]) sets[n - 1] = v; return; }
    if (!full && /VOD|전체|다시/i.test(v.title)) full = v;
  });
  return { full, sets: sets.filter(Boolean) };
}

const toUrl = v => (v ? {
  url: `https://chzzk.naver.com/video/${v.videoNo}`,
  title: v.title, published: v.publishDate,
} : null);

async function handler(req, res) {
  const q = (req && req.query) || {};
  const a = String(q.a || "").trim();
  const b = String(q.b || "").trim();
  const tour = TOURS[String(q.tour || "").trim()];
  if (!a || !b) return fail(res, 400, "두 팀이 필요합니다");
  if (!tour) return fail(res, 400, "지원하지 않는 대회입니다");

  const key = `${q.tour}|${a}|${b}|${q.at || ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return ok(res, hit.value, 1800);

  const channelUrl = `https://chzzk.naver.com/${tour.channelIds[0]}/videos`;
  try {
    // 검색은 한 번에 30개만 돌려준다. 그래서 **검색어를 바꿔 가며 모아** 합친다 —
    // 한 번만 던지면 5판 경기에서 1세트가 잘려 나간다 (실제로 그랬다).
    const seen = new Map();
    let got = { full: null, sets: [] };
    for (const term of tour.terms) {
      const rows = await searchChzzk(`${a} vs ${b} ${term}`);
      rows.forEach(v => seen.set(v.videoNo, v));
      got = pick([...seen.values()], { a, b, at: q.at, channelIds: tour.channelIds });
      if (got.sets.length >= 5) break;              // 5판 3선승이 최대다. 더 찾을 것이 없다
    }
    const value = {
      source: tour.channelLabel, tournament: tour.name, channelUrl,
      full: toUrl(got.full),
      sets: got.sets.map(toUrl),
    };
    cache.set(key, { at: Date.now(), value });
    return ok(res, value, 1800);
  } catch (e) {
    return ok(res, {
      source: tour.channelLabel, tournament: tour.name, channelUrl,
      full: null, sets: [], unavailable: e.message || String(e),
    }, 300);
  }
}

module.exports = handler;
module.exports._test = { hasTeam, nearMatch, isHighlight, setNoOf, pick, TOURS };
