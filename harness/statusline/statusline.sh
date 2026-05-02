#!/usr/bin/env bash
# Claude Code statusline for marketing_agent.
# Shows: 📣 <slug> │ <published>/<total> ▓▓▓░░ │ <current-stage>  with color.
# Reads the most recently modified posts/campaigns/*/brief.yaml.

set -u

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
CAMPAIGNS_DIR="$ROOT/posts/campaigns"

# ANSI color helpers — disable when stdout is not a TTY.
if [ -t 1 ]; then
  C_DIM='\033[2m'; C_RESET='\033[0m'
  C_GREEN='\033[32m'; C_YELLOW='\033[33m'; C_CYAN='\033[36m'; C_RED='\033[31m'
else
  C_DIM=''; C_RESET=''; C_GREEN=''; C_YELLOW=''; C_CYAN=''; C_RED=''
fi

if [ ! -d "$CAMPAIGNS_DIR" ]; then
  printf "📣 ${C_DIM}marketing_agent │ no campaign yet${C_RESET}"
  exit 0
fi

LATEST_BRIEF="$(find "$CAMPAIGNS_DIR" -name 'brief.yaml' -type f -print0 2>/dev/null \
  | xargs -0 ls -t 2>/dev/null | head -n 1)"

if [ -z "$LATEST_BRIEF" ]; then
  printf "📣 ${C_DIM}marketing_agent │ no campaign yet${C_RESET}"
  exit 0
fi

SLUG="$(basename "$(dirname "$LATEST_BRIEF")")"

# Count statuses inside the `status:` block.
COUNT_RE='^[[:space:]]+[a-z_]+:[[:space:]]*'
PUBLISHED=$(awk "/${COUNT_RE}published[[:space:]]*\$/" "$LATEST_BRIEF" 2>/dev/null | wc -l | tr -d ' ')
FAILED=$(   awk "/${COUNT_RE}failed[[:space:]]*\$/"    "$LATEST_BRIEF" 2>/dev/null | wc -l | tr -d ' ')
APPROVED=$( awk "/${COUNT_RE}approved[[:space:]]*\$/"  "$LATEST_BRIEF" 2>/dev/null | wc -l | tr -d ' ')
TOTAL=$(awk "/${COUNT_RE}(drafting|preview|approved|scheduled|published|failed|skipped)[[:space:]]*\$/" \
  "$LATEST_BRIEF" 2>/dev/null | wc -l | tr -d ' ')
CURRENT=$(awk "/${COUNT_RE}(drafting|preview|approved|scheduled)[[:space:]]*\$/{
  gsub(/:/, \"\", \$1); print \$1 \" \" \$2; exit }" "$LATEST_BRIEF" 2>/dev/null)

if [ -z "$CURRENT" ]; then
  if [ "$FAILED" -gt 0 ]; then CURRENT="${C_RED}❌ ${FAILED} failed${C_RESET}"
  elif [ "$PUBLISHED" -eq "$TOTAL" ] && [ "$TOTAL" -gt 0 ]; then CURRENT="${C_GREEN}완료${C_RESET}"
  else CURRENT="${C_DIM}대기${C_RESET}"
  fi
fi

# Progress bar (5 cells).
BAR_FILLED=0
[ "$TOTAL" -gt 0 ] && BAR_FILLED=$(( PUBLISHED * 5 / TOTAL ))
BAR=""
for i in 1 2 3 4 5; do
  if [ "$i" -le "$BAR_FILLED" ]; then BAR="${BAR}▓"; else BAR="${BAR}░"; fi
done

# Color the published count.
if [ "$PUBLISHED" -eq "$TOTAL" ] && [ "$TOTAL" -gt 0 ]; then COUNT_COLOR="$C_GREEN"
elif [ "$PUBLISHED" -gt 0 ]; then COUNT_COLOR="$C_CYAN"
else COUNT_COLOR="$C_DIM"
fi

printf "📣 %s ${C_DIM}│${C_RESET} ${COUNT_COLOR}%s/%s${C_RESET} %s ${C_DIM}│${C_RESET} %b" \
  "$SLUG" "$PUBLISHED" "$TOTAL" "$BAR" "$CURRENT"
