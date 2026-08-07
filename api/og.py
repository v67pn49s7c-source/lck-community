# ── 공유 미리보기 이미지(og:image) 를 그때그때 그려 준다 ─────────────
#   /og/match/<경기id>   → DK 0 : 2 T1 스코어 카드
#   /og/race             → 경우의 수 요약 카드
#
# 왜 서버에서 그리나:
#   카카오톡·인스타 DM·X 에 링크를 보내면 미리보기 이미지가 뜨는데, 지금까지는
#   모든 링크가 같은 로고 한 장이었다. 경기 결과가 보이면 눌러 볼 이유가 생긴다.
#
# 왜 파이썬인가:
#   이 저장소는 package.json 을 두지 않는다(프런트에 빌드 도구를 들이지 않는 규칙).
#   Vercel 은 파이썬 함수를 requirements.txt 로 따로 관리하므로, 프런트 구조를
#   건드리지 않고 이미지 생성만 붙일 수 있다.
#
# 한글 폰트:
#   assets/fonts/nexus-og.otf — Noto Sans KR Bold 에서 이 파일에 쓰는 글자만 남긴 것(70KB).
#   문구를 새로 추가하면 폰트에 없는 글자는 □ 로 나온다 → assets/fonts/README.md 참고.

import json
import os
import urllib.request
from http.server import BaseHTTPRequestHandler
from io import BytesIO
from urllib.parse import urlparse, parse_qs

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_PATH = os.path.join(ROOT, "assets", "fonts", "nexus-og.otf")
SITE = "lck-community.vercel.app"
HANDLE = "@thenexus.lolgg"

SB_URL = os.environ.get("SUPABASE_URL", "")
SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_ANON_KEY", "")

# 팀 색·약칭 — assets/data.js 와 같은 값 (브라우저용 전역이라 서버에서 못 불러 쓴다)
TEAMS = {
    "t1":  ("T1",  "#e2012d"), "gen": ("GEN", "#cfb887"), "hle": ("HLE", "#f07800"),
    "dk":  ("DK",  "#0f9a8e"), "kt":  ("KT",  "#ff2d2d"), "bro": ("BRO", "#3b6ff0"),
    "bfx": ("BFX", "#f5a623"), "krx": ("DRX", "#5b8def"), "ns":  ("NS",  "#e4002b"),
    "dns": ("DNS", "#7a5cff"),
}


def font(px):
    return ImageFont.truetype(FONT_PATH, px)


def hx(c):
    c = (c or "#4a8cff").lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def sb(path):
    """Supabase REST 읽기 — 실패해도 이미지는 나와야 하므로 예외를 삼킨다."""
    if not SB_URL or not SB_KEY:
        return None
    try:
        req = urllib.request.Request(
            SB_URL + "/rest/v1/" + path,
            headers={"apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY},
        )
        with urllib.request.urlopen(req, timeout=6) as r:
            return json.loads(r.read().decode())
    except Exception:
        return None


def canvas(col_a, col_b):
    """어두운 바탕 + 양 팀 색이 좌우에서 은은하게 번지는 배경."""
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=(int(19 - 8 * t), int(21 - 9 * t), int(31 - 14 * t)))

    glow = Image.new("RGB", (W, H), (0, 0, 0))
    g = ImageDraw.Draw(glow)
    for cx, col in ((W * 0.15, col_a), (W * 0.85, col_b)):
        c, r0 = hx(col), 440
        for i in range(48, 0, -1):
            rr = r0 * i / 48
            a = (1 - i / 48) ** 2 * 0.32
            g.ellipse([cx - rr, H * 0.46 - rr, cx + rr, H * 0.46 + rr],
                      fill=(int(c[0] * a), int(c[1] * a), int(c[2] * a)))
    # 가산 합성 (빛이 겹치는 느낌)
    px, gx = img.load(), glow.load()
    for y in range(H):
        for x in range(W):
            r, gg, b = px[x, y]
            r2, g2, b2 = gx[x, y]
            px[x, y] = (min(255, r + r2), min(255, gg + g2), min(255, b + b2))

    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 7], fill=hx("#ff4655"))
    return img, d


def footer(d, note=""):
    d.line([(64, H - 96), (W - 64, H - 96)], fill=(35, 40, 56), width=2)
    d.text((64, H - 76), SITE, font=font(24), fill=(91, 99, 115))
    d.text((W - 64, H - 76), HANDLE, font=font(24), fill=(124, 132, 150), anchor="ra")
    if note:
        d.text((W / 2, H - 76), note, font=font(24), fill=(91, 99, 115), anchor="ma")


def brand(d, sub):
    d.text((64, 50), "THE NEXUS", font=font(34), fill=hx("#ff4655"))
    d.text((64, 100), sub, font=font(26), fill=(138, 146, 163))


def og_match(match_id):
    rows = sb("matches?select=a,b,score_a,score_b,status,stage,at&id=eq." +
              urllib.parse.quote(match_id, safe="")) or []
    m = rows[0] if rows else None
    if not m:
        return None
    a, b = m.get("a"), m.get("b")
    na, ca = TEAMS.get(a, (str(a).upper()[:4], "#4a8cff"))
    nb, cb = TEAMS.get(b, (str(b).upper()[:4], "#ff4655"))
    done = m.get("status") == "done" and m.get("score_a") is not None

    img, d = canvas(ca, cb)
    stage = (m.get("stage") or "").strip()
    brand(d, ("2026 LCK · " + stage) if stage else "2026 LCK")

    cy = H * 0.45
    d.text((W * 0.19, cy), na, font=font(88), fill=hx(ca), anchor="mm")
    d.text((W * 0.81, cy), nb, font=font(88), fill=hx(cb), anchor="mm")
    if done:
        d.text((W * 0.42, cy), str(m["score_a"]), font=font(150), fill=(242, 244, 248), anchor="mm")
        d.text((W * 0.58, cy), str(m["score_b"]), font=font(150), fill=(242, 244, 248), anchor="mm")
        d.rectangle([W / 2 - 2, cy - 60, W / 2 + 2, cy + 60], fill=(70, 78, 95))
        label = "경기 종료 · 세트별 팬 평점 참여"
    else:
        d.text((W * 0.50, cy), "VS", font=font(60), fill=(58, 65, 80), anchor="mm")
        label = "승부예측 · 팬심지수 참여"
    d.text((64, H - 156), label, font=font(38), fill=(233, 235, 241))
    footer(d)
    return img


def og_race():
    """경우의 수 요약 — 잔여 경기 수와 조합 수만 (계산 자체는 화면이 한다)."""
    ms = sb("matches?select=status,stage&limit=500") or []
    remain = sum(1 for m in ms if m.get("status") != "done"
                 and "3-4" in (m.get("stage") or ""))
    img, d = canvas("#4a8cff", "#ff4655")
    brand(d, "LCK 경우의 수")
    d.text((64, H * 0.36), "우리 팀은 몇 승이 더 필요한가", font=font(64), fill=(242, 244, 248))
    if remain:
        combos = 2 ** min(remain, 20)
        d.text((64, H * 0.56), f"남은 {remain}경기 · {combos:,}가지 조합 전수 계산",
               font=font(40), fill=hx("#f5b942"))
    d.text((64, H - 156), "자력 확보선 · 산술 가능선 · 매일 갱신", font=font(34), fill=(154, 161, 176))
    footer(d)
    return img


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
        kind = (q.get("kind") or ["match"])[0]
        mid = (q.get("id") or [""])[0]
        try:
            img = og_race() if kind == "race" else (og_match(mid) if mid else None)
        except Exception:
            img = None
        if img is None:                       # 실패해도 링크가 깨지지 않게 브랜드 카드로
            img, d = canvas("#4a8cff", "#ff4655")
            brand(d, "LCK 팬 커뮤니티")
            d.text((64, H * 0.44), "THE NEXUS", font=font(88), fill=(242, 244, 248))
            footer(d)

        buf = BytesIO()
        img.save(buf, "PNG", optimize=True)
        body = buf.getvalue()
        self.send_response(200)
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(body)))
        # 끝난 경기는 오래, 예정 경기는 짧게 (스코어가 바뀐다)
        self.send_header("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=86400")
        self.end_headers()
        self.wfile.write(body)
