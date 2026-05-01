#!/usr/bin/env bash
# Claude Code statusline for marketing_ai.
# Shows: 📣 <campaign-slug> │ <done>/<total> 채널 │ <current-stage>
#
# Reads campaigns/*/brief.yaml and aggregates status across channels.
# Falls back to a quiet placeholder when no active campaign.

set -u

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
CAMPAIGNS_DIR="$ROOT/campaigns"

if [ ! -d "$CAMPAIGNS_DIR" ]; then
  printf "📣 marketing_ai │ no campaign yet"
  exit 0
fi

# Most recently modified brief.yaml = active campaign.
LATEST_BRIEF="$(find "$CAMPAIGNS_DIR" -name 'brief.yaml' -type f -print0 2>/dev/null \
  | xargs -0 ls -t 2>/dev/null | head -n 1)"

if [ -z "$LATEST_BRIEF" ]; then
  printf "📣 marketing_ai │ no campaign yet"
  exit 0
fi

SLUG="$(basename "$(dirname "$LATEST_BRIEF")")"

# Naive YAML parsing (Phase 1 — replaced with a real parser later).
# Counts channels by terminal state.
PUBLISHED=$(grep -cE ':\s*published\s*$' "$LATEST_BRIEF" 2>/dev/null || echo 0)
TOTAL=$(awk '/^\s*[a-z_]+:\s*(drafting|preview|approved|scheduled|published|failed|skipped)\s*$/' \
  "$LATEST_BRIEF" 2>/dev/null | wc -l | tr -d ' ')
CURRENT=$(awk '/^\s*[a-z_]+:\s*(drafting|preview|approved|scheduled)\s*$/{print $1 " " $2; exit}' \
  "$LATEST_BRIEF" 2>/dev/null | sed 's/://' | sed 's/[[:space:]]*$//')

if [ -z "$CURRENT" ]; then
  CURRENT="대기"
fi

printf "📣 %s │ %s/%s 채널 │ %s" "$SLUG" "$PUBLISHED" "$TOTAL" "$CURRENT"
