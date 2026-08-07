# 기본 공유 카드(og-default.png) 를 미리 그려 둔다.
#
# 왜 미리 그리나:
#   모든 페이지가 쓰는 그림이라 요청이 가장 잦다. 서버 함수로 그리면 첫 요청이
#   1~2초 걸려 카카오톡 크롤러가 포기할 수 있다. 그림 자체는 바뀌지 않으므로
#   파일로 두는 편이 언제나 빠르다.
#
# 쓰는 법 (문구를 바꿨을 때):
#   python3 assets/fonts/build.py /tmp/NotoSansKR-Bold.otf   # 폰트 먼저
#   python3 assets/brand/build.py

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "api"))

import og  # noqa: E402

out = os.path.join(ROOT, "assets", "brand", "og-default.png")
og.og_site().save(out, "PNG", optimize=True)
print(f"{out} → {os.path.getsize(out) // 1024} KB")
