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
# ⚠ **git 이 추적하는 HTML 만** 본다. 예전엔 작업 폴더 전체를 훑어서, 배포되지도 않는
#   미추적 시안 파일(home-preview.html 등)의 옛 버전 때문에 게이트가 붉게 떴다.
#   붉은 게이트가 일상이 되면 진짜 사고를 놓친다. 배포 대상만 검사한다.
VERS=$(git ls-files -z '*.html' | xargs -0 grep -aho '?v=[0-9]\{8\}[a-z]' | sort -u)
NV=$(echo "$VERS" | grep -c .)
if [ "$NV" -eq 1 ]; then okk "자산 버전 통일: $VERS"
else bad "자산 버전이 ${NV}가지: $(echo $VERS | tr '\n' ' ')"; fi

# HTML 밖에서 헤더/파비콘/로딩 마크가 다시 지정하는 브랜드 URL도 같은 버전이어야 한다.
# 이 경로만 옛 값이면 HTML을 올려도 로고가 그 직후 30일 캐시 주소로 되돌아간다.
RUNTIME_VERS=$(grep -aho '?v=[0-9]\{8\}[a-z]' \
  assets/app.js assets/store.js assets/styles.css api/match.js | sort -u)
NRV=$(echo "$RUNTIME_VERS" | grep -c .)
if [ "$NRV" -eq 1 ] && [ "$RUNTIME_VERS" = "$VERS" ]; then
  okk "런타임 브랜드 자산 버전 통일: $RUNTIME_VERS"
else
  bad "HTML/런타임 자산 버전 불일치: HTML=$VERS 런타임=$(echo $RUNTIME_VERS | tr '\n' ' ')"
fi

# 핵심 브라우저 자산을 바꿨는데 main과 같은 버전을 쓰면, 배포 후에도 방문자가
# 30일 캐시된 옛 JS/CSS를 받을 수 있다. origin/main이 있는 환경에서는 이것도 막는다.
CACHE_BASE_REF=${CACHE_BASE_REF:-origin/main}
if git rev-parse --verify "$CACHE_BASE_REF^{commit}" >/dev/null 2>&1; then
  CHANGED_CORE=$(git diff --name-only "$CACHE_BASE_REF" -- 'assets/*.js' 'assets/*.css')
  BASE_VERS=$(git show "$CACHE_BASE_REF:index.html" 2>/dev/null | grep -ao '?v=[0-9]\{8\}[a-z]' | sort -u)
  if [ -n "$CHANGED_CORE" ] && [ "$NV" -eq 1 ] && [ "$VERS" = "$BASE_VERS" ]; then
    bad "핵심 자산이 바뀌었지만 캐시 버전이 $CACHE_BASE_REF 와 같음: $VERS"
  else
    okk "핵심 자산 변경 시 캐시 버전 상승 확인 ($CACHE_BASE_REF 기준)"
  fi
else
  echo "- 캐시 버전 상승 비교 생략 ($CACHE_BASE_REF 없음)"
fi

# ── ② NUL 문자 — 텍스트 파일에 있으면 grep 이 바이너리로 취급해 ①이 뚫린다 ──
# 새로 만든 미추적 파일도 배포 후보이므로 git index만 보지 않는다.
NULS=$(find . -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' -o -name '*.sql' -o -name '*.md' \) \
  -not -path './.git/*' -print0 \
  | xargs -0 python3 -c 'import sys; [print(p) for p in sys.argv[1:] if b"\x00" in open(p,"rb").read()]' 2>/dev/null)
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
# ── CSS 중괄호 짝 검사 ────────────────────────────────────────────
# 규칙이 실수로 @media·@container 블록 **안으로 빨려 들어가면** 그 스타일이
# 특정 화면 크기에서만 먹는다. 브라우저는 조용히 넘어가고 눈으로도 잘 안 보인다.
# (2026-08-12 실제로 스코어보드 스타일 일부가 520px 이하 전용이 됐다)
node -e '
  const fs = require("fs");
  let bad = 0;
  for (const f of ["assets/styles.css"]) {
    const s = fs.readFileSync(f, "utf8");
    let d = 0, line = 1;
    for (const ch of s) {
      if (ch === "\n") line++;
      else if (ch === "{") d++;
      else if (ch === "}") { d--; if (d < 0) { console.error(`${f}:${line} 짝 없는 }`); bad = 1; break; } }
    }
    if (d !== 0) { console.error(`${f} 닫히지 않은 블록 ${d}개`); bad = 1; }
  }
  process.exit(bad);
' && okk "CSS 중괄호 짝 맞음" || bad "CSS 중괄호가 어긋남 — 규칙이 엉뚱한 블록 안에 들어갔을 수 있다"

node tests/invariants.test.js || bad "invariants.test 실패"
node tests/leaguepedia-integrity.test.js || bad "leaguepedia-integrity.test 실패"
node tests/leaguepedia-atomic-transport.test.js || bad "leaguepedia-atomic-transport.test 실패"
node tests/race.golden.test.js || bad "race.golden.test 실패"
node tests/admin-save-order.test.js || bad "admin-save-order.test 실패"
node tests/snapshot-refresh.test.js || bad "snapshot-refresh.test 실패"
node tests/detail-ui.test.js || bad "detail-ui.test 실패"
node tests/team-content.test.js || bad "team-content.test 실패"
node tests/home-redesign.test.js || bad "home-redesign.test 실패"
node tests/match-experience.test.js || bad "match-experience.test 실패"
node tests/player-radar.test.js || bad "player-radar.test 실패"
node tests/team-board-private.test.js || bad "team-board-private.test 실패"

# ── ⑥ vercel.json 이 유효한 JSON 인가 (_comment 키가 배포를 깬 전력) ──
python3 -c "import json; json.load(open('vercel.json'))" || bad "vercel.json 파싱 실패"
okk "vercel.json OK"

echo
if [ "$FAIL" -eq 1 ]; then echo "══ 검사 실패 — 배포 금지 ══"; exit 1
else echo "══ 모든 검사 통과 ══"; fi
