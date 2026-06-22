#!/usr/bin/env bash
# Marketing Agent - Demo Start (macOS / Linux)
# Windows 의 start-demo.ps1 와 동일 동작.
#
# Usage: bash scripts/start-demo.sh
#   or:  chmod +x scripts/start-demo.sh && scripts/start-demo.sh

set -e

# 스크립트 위치 기반 ROOT (한국어/공백 경로 안전)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
CHROME_PROFILE="$ROOT/auth/chrome-attach-profile"

# Chrome 경로 자동 감지 (macOS / Linux)
CHROME_EXE=""
CANDIDATES=(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  "$HOME/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  "/usr/bin/google-chrome"
  "/usr/bin/google-chrome-stable"
  "/usr/bin/chromium"
  "/usr/bin/chromium-browser"
  "/snap/bin/chromium"
)
for p in "${CANDIDATES[@]}"; do
  if [ -x "$p" ]; then CHROME_EXE="$p"; break; fi
done

if [ -z "$CHROME_EXE" ]; then
  echo "[ERROR] Chrome 실행 파일 못 찾음. 다음 경로 중 하나에 설치 필요:"
  printf '  %s\n' "${CANDIDATES[@]}"
  exit 1
fi

echo ""
echo "[Marketing Agent] Demo start"
echo "  ROOT: $ROOT"
echo ""

# 1. Chrome 9222 alive?
chrome_alive=false
if curl -s -o /dev/null -w "%{http_code}" http://localhost:9222/json/version 2>/dev/null | grep -q "^200$"; then
  chrome_alive=true
fi

if $chrome_alive; then
  echo "  [OK] Chrome 9222 already running"
else
  echo "  [..] Starting Chrome 9222..."
  mkdir -p "$CHROME_PROFILE"
  nohup "$CHROME_EXE" \
    --remote-debugging-port=9222 \
    --user-data-dir="$CHROME_PROFILE" \
    --no-first-run \
    --no-default-browser-check \
    >/dev/null 2>&1 &
  disown $!
  sleep 5
  echo "  [OK] Chrome 9222 started"
fi

# 1.5 Restore saved cookies into Chrome (missing-only; never overwrites current login)
( cd "$ROOT" && node harness/bin/cookie-store.mjs restore 2>&1 | sed 's/^/  /' ) || true

# 2. Dashboard alive?
dash_alive=false
if curl -s -o /dev/null -w "%{http_code}" http://localhost:7777/api/today 2>/dev/null | grep -q "^200$"; then
  dash_alive=true
fi

if $dash_alive; then
  echo "  [OK] Dashboard already running"
else
  echo "  [..] Starting dashboard server..."
  cd "$ROOT"
  nohup node harness/bin/dashboard.mjs --no-open >/dev/null 2>&1 &
  disown $!
  # 최대 12초 polling
  ok=false
  for i in 1 2 3 4 5 6; do
    sleep 2
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:7777/api/today 2>/dev/null | grep -q "^200$"; then
      ok=true; break
    fi
  done
  if $ok; then echo "  [OK] Dashboard started"
  else echo "  [WARN] Dashboard 12초 안에 안 뜸 — 수동: node harness/bin/dashboard.mjs"; fi
fi

# 2.5 카드 스튜디오 (7799) — 대시보드 '📸 카드 스튜디오' 탭이 임베드
if curl -s -o /dev/null -w "%{http_code}" http://localhost:7799/health 2>/dev/null | grep -q "^200$"; then
  echo "  [OK] 카드 스튜디오 already running"
else
  cd "$ROOT"
  nohup node harness/bin/card-studio.mjs >/dev/null 2>&1 &
  disown $!
  echo "  [OK] 카드 스튜디오 (http://localhost:7799)"
fi

# 3. Open dashboard tab (macOS: open / Linux: xdg-open)
if command -v open >/dev/null 2>&1; then
  open "http://localhost:7777/" 2>/dev/null && echo "  [OK] Dashboard tab activated (open)"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:7777/" 2>/dev/null && echo "  [OK] Dashboard tab activated (xdg-open)"
else
  echo "  [INFO] http://localhost:7777 수동 오픈"
fi

echo ""
echo "[READY]"
echo "  Dashboard: http://localhost:7777"
echo "  Chrome:    port 9222"
echo ""
