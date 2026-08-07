# OG 이미지용 폰트 서브셋 만들기
#
# 왜 필요한가:
#   Noto Sans KR 전체는 4.7MB 다. OG 이미지에 실제로 쓰는 글자는 200자 남짓이라
#   그것만 남기면 70KB 로 줄어든다.
#
# 왜 자동 추출인가:
#   글자를 손으로 나열하면 반드시 빠뜨린다(실제로 '몇'·'별'·'@' 가 □ 로 나왔다).
#   api/og.py 안의 문자열을 직접 읽어 글자를 뽑으므로, 문구를 고치고 이걸 다시
#   돌리기만 하면 폰트가 따라온다.
#
# 쓰는 법:
#   pip install fonttools
#   curl -sL -o /tmp/NotoSansKR-Bold.otf \
#     https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/KR/NotoSansKR-Bold.otf
#   python3 assets/fonts/build.py /tmp/NotoSansKR-Bold.otf
#
# 라이선스: Noto Sans KR — SIL Open Font License 1.1 (재배포 허용)

import ast
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OG_PY = os.path.join(ROOT, "api", "og.py")
OUT = os.path.join(ROOT, "assets", "fonts", "nexus-og.otf")


def chars_from_source(path):
    """소스에 등장하는 모든 문자열 리터럴(f-string 포함)에서 글자를 모은다."""
    tree = ast.parse(open(path, encoding="utf-8").read())
    got = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            got |= set(node.value)
        elif isinstance(node, ast.JoinedStr):          # f"..." 의 고정 부분
            for v in node.values:
                if isinstance(v, ast.Constant) and isinstance(v.value, str):
                    got |= set(v.value)
    return got


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "/tmp/NotoSansKR-Bold.otf"
    chars = chars_from_source(OG_PY)
    # DB 에서 오는 값(팀 약칭·스테이지 이름)과 숫자·기호는 소스에 없을 수 있으니 따로 더한다
    chars |= set("0123456789")
    chars |= set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz")
    chars |= set(" .,:;·/-–—+()[]%@#&!?'\"…")
    chars |= set("라운드레전드라이즈그룹플레이오프정규시즌스플릿승강전선발전")
    chars |= set("경기종료예정오늘시분초년월일세트팬평점참여명전적순위잔여")
    chars |= set("남은가지조합전수계산자력확보선안회피동률득실산술가능매일갱신")
    chars |= set("우리팀은몇승이더필요한가비공식프로젝트예측심지수")
    # 주석에서 딸려온 글자까지 넣으면 커지므로, 소스 문자열만으로 충분한지 확인 후 조정

    from fontTools import subset
    opts = subset.Options(layout_features="*", notdef_outline=True)
    font = subset.load_font(src, opts)
    s = subset.Subsetter(options=opts)
    s.populate(text="".join(sorted(chars)))
    s.subset(font)
    subset.save_font(font, OUT, opts)

    from fontTools.ttLib import TTFont
    cmap = TTFont(OUT).getBestCmap()
    missing = {c for c in chars if ord(c) not in cmap and not c.isspace()}
    print(f"글자 {len(chars)}종 → {os.path.getsize(OUT) // 1024} KB")
    print("누락:", "".join(sorted(missing)) if missing else "없음 ✓")


if __name__ == "__main__":
    main()
