#!/bin/bash
# 저장소 정적 검사 — bash tests/check.sh
# 실패하면(exit 1) 배포하면 안 된다. CI 없이도 push 전에 손으로 돌릴 수 있다.
set -u
cd "$(dirname "$0")/.."
FAIL=0
bad() { echo "✗ $1"; FAIL=1; }
okk() { echo "✓ $1"; }

# ── ① 자산 버전 통일 — 전 HTML 이 같은 ?v= 를 써야 한다 ─────────────
# admin.html 이 NUL 때문에 grep 에서 빠져 20260808i 로 남았던 실제 사고의 재발 방지.
# (버전이 다르면 그 페이지만 30일 캐시된 옛 JS 를 계속 쓴다)
VERS=$(grep -ahro '?v=[0-9]\{8\}[a-z]' --include="*.html" . | sort -u)
NV=$(echo "$VERS" | grep -c .)
if [ "$NV" -eq 1 ]; then okk "자산 버전 통일: $VERS"
else bad "자산 버전이 ${NV}가지: $(echo $VERS | tr '\n' ' ')"; fi

# ── ② NUL 문자 — 텍스트 파일에 있으면 grep 이 바이너리로 취급해 ①이 뚫린다 ──
NULS=$(git ls-files '*.html' '*.js' '*.css' '*.sql' '*.md' 2>/dev/null \
  | xargs -I{} sh -c 'python3 -c "import sys;sys.exit(0 if b\"\x00\" in open(\"{}\",\"rb\").read() else 1)" && echo {}' 2>/dev/null)
if [ -z "$NULS" ]; then okk "NUL 문자 없음"
else bad "NUL 문자 발견: $NULS"; fi

# ── ③ JS 구문 검사 ──────────────────────────────────────────────────
for f in assets/*.js api/*.js tests/*.js; do
  [ -f "$f" ] || continue
  node --check "$f" 2>/dev/null || bad "JS 구문 오류: $f"
done
okk "JS 구문 검사 완료"

# ── ④ Python 구문 검사 (api/og.py) ──────────────────────────────────
for f in api/*.py; do
  [ -f "$f" ] || continue
  python3 -m py_compile "$f" 2>/dev/null || bad "Python 구문 오류: $f"
done
okk "Python 구문 검사 완료"

# ── ⑤ 회귀 테스트 ───────────────────────────────────────────────────
node tests/invariants.test.js || bad "invariants.test 실패"
node tests/race.golden.test.js || bad "race.golden.test 실패"

# ── ⑥ vercel.json 이 유효한 JSON 인가 (_comment 키가 배포를 깬 전력) ──
python3 -c "import json; json.load(open('vercel.json'))" || bad "vercel.json 파싱 실패"
okk "vercel.json OK"

echo
if [ "$FAIL" -eq 1 ]; then echo "══ 검사 실패 — 배포 금지 ══"; exit 1
else echo "══ 모든 검사 통과 ══"; fi
