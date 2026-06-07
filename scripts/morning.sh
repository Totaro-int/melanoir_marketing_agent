#!/usr/bin/env bash
# Marketing Agent - Morning Routine (macOS / Linux)
# Windows 의 morning.ps1 와 동일 동작.
#
# 매일 컴퓨터 켤 때 (또는 launchd Daily 09:00) 자동 호출 — Chrome 탭 N개 발행 직전 준비.
#
# Usage:
#   bash scripts/morning.sh
#   bash scripts/morning.sh --dry-run
#   bash scripts/morning.sh --slug=X --channel=naver-blog
#   bash scripts/morning.sh --max=3

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

# 옵션 파싱 (morning-routine.mjs 에 그대로 전달)
ARGS=("$@")

echo ""
echo "[Marketing Agent] 🌅 Morning routine"
echo "  ROOT: $ROOT"
[ ${#ARGS[@]} -gt 0 ] && echo "  args: ${ARGS[*]}"
echo ""

# 1. start-demo — Chrome + 대시보드 (이미 떠 있으면 skip)
START_DEMO="$ROOT/scripts/start-demo.sh"
if [ -f "$START_DEMO" ]; then
  bash "$START_DEMO"
else
  echo "  [WARN] start-demo.sh 없음 — morning-routine 이 자체 검증"
fi

# 2. morning-routine.mjs
echo ""
echo "[Morning routine] node harness/bin/morning-routine.mjs ${ARGS[*]}"
echo ""
cd "$ROOT"
node harness/bin/morning-routine.mjs "${ARGS[@]}"
RC=$?

echo ""
if [ $RC -eq 0 ]; then
  echo "[READY] Chrome 탭 검토 → [공유] 클릭하시면 됩니다."
  echo "  대시보드: http://localhost:7777"
else
  echo "[FAIL] morning-routine 종료 코드 $RC"
  echo "  대시보드 미니맵 / 콘솔 로그 확인"
fi
echo ""
exit $RC
