# nexus-og.otf

OG 이미지(공유 미리보기)를 서버에서 그릴 때 쓰는 폰트.

- 원본: **Noto Sans KR Bold** (Google, SIL Open Font License 1.1 — 재배포 허용)
- OG 이미지에 실제로 등장하는 글자 211종만 남겨 **4.7MB → 70KB** 로 줄였다.
- 새로운 한글 문구를 OG 이미지에 넣으려면 글자가 폰트에 없어 □ 로 나온다.
  그때는 `api/og.py` 의 문구를 바꾸는 대신, 아래 방법으로 폰트를 다시 만든다:

```
pip install fonttools
# 쓸 문구를 모두 모아 text= 로 넘긴다
pyftsubset NotoSansKR-Bold.otf --text="…모든 문구…" --output-file=nexus-og.otf
```
