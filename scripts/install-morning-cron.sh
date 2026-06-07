#!/usr/bin/env bash
# Marketing Agent - Morning Routine 자동 등록 (macOS launchd / Linux cron)
#
# macOS: ~/Library/LaunchAgents/<label>.plist
# Linux: ~/.config/systemd/user/<label>.timer + service  (OR fallback crontab)
#
# Triggers:
#   1) AtLogin (RunAtLoad) — 사용자 로그인 시
#   2) Daily HH:MM (default 09:00)
#
# Usage:
#   bash scripts/install-morning-cron.sh                 # 등록
#   bash scripts/install-morning-cron.sh --uninstall     # 제거
#   bash scripts/install-morning-cron.sh --status        # 상태
#   bash scripts/install-morning-cron.sh --time=08:00    # 시각 변경

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
LABEL="com.marketing-agent.morning-routine"
MORNING_SH="$ROOT/scripts/morning.sh"
LOG_DIR="$ROOT/logs"
LOG_PATH="$LOG_DIR/morning-routine.log"

# 옵션
TIME_HH=9
TIME_MM=0
MODE="install"
LOGON_ONLY=false
DAILY_ONLY=false

while [ $# -gt 0 ]; do
  case "$1" in
    --uninstall) MODE="uninstall" ;;
    --status) MODE="status" ;;
    --logon-only) LOGON_ONLY=true ;;
    --daily-only) DAILY_ONLY=true ;;
    --time=*)
      TIME_STR="${1#--time=}"
      TIME_HH="$(echo "$TIME_STR" | cut -d: -f1 | sed 's/^0*//')"
      TIME_MM="$(echo "$TIME_STR" | cut -d: -f2 | sed 's/^0*//')"
      [ -z "$TIME_HH" ] && TIME_HH=0
      [ -z "$TIME_MM" ] && TIME_MM=0
      ;;
    -h|--help)
      grep '^#' "$0" | head -20
      exit 0
      ;;
    *) echo "[ERROR] unknown arg: $1"; exit 1 ;;
  esac
  shift
done

# ─── OS 감지 ──────────────────────────────────────────────
case "$(uname -s)" in
  Darwin) OS="macos" ;;
  Linux) OS="linux" ;;
  *) echo "[ERROR] 지원하지 않는 OS: $(uname -s) (macOS/Linux 만)"; exit 1 ;;
esac

echo ""
echo "[Marketing Agent] Morning Routine Auto-register"
echo "  OS       : $OS"
echo "  Label    : $LABEL"
echo "  ROOT     : $ROOT"
echo ""

# ─── macOS (launchd) ─────────────────────────────────────
if [ "$OS" = "macos" ]; then
  PLIST_DIR="$HOME/Library/LaunchAgents"
  PLIST="$PLIST_DIR/$LABEL.plist"

  if [ "$MODE" = "status" ]; then
    if launchctl list "$LABEL" >/dev/null 2>&1; then
      echo "[REGISTERED]"
      launchctl list "$LABEL"
      echo ""
      [ -f "$PLIST" ] && echo "  PLIST: $PLIST"
      [ -f "$LOG_PATH" ] && { echo; echo "  Recent log (last 10 lines):"; tail -10 "$LOG_PATH" | sed 's/^/    /'; }
    else
      echo "[NOT REGISTERED]"
      echo "  Register: bash scripts/install-morning-cron.sh"
    fi
    exit 0
  fi

  if [ "$MODE" = "uninstall" ]; then
    launchctl unload "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    echo "[OK] '$LABEL' uninstalled"
    exit 0
  fi

  # Install
  if [ ! -f "$MORNING_SH" ]; then
    echo "[ERROR] morning.sh not found: $MORNING_SH"
    exit 1
  fi
  chmod +x "$MORNING_SH"
  [ -f "$ROOT/scripts/start-demo.sh" ] && chmod +x "$ROOT/scripts/start-demo.sh"

  mkdir -p "$PLIST_DIR" "$LOG_DIR"

  # 기존 unload + 삭제
  launchctl unload "$PLIST" 2>/dev/null || true

  # plist 작성
  cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$MORNING_SH</string>
  </array>

  <key>WorkingDirectory</key>
  <string>$ROOT</string>

  <key>StandardOutPath</key>
  <string>$LOG_PATH</string>
  <key>StandardErrorPath</key>
  <string>$LOG_PATH</string>

PLIST_EOF

  if ! $DAILY_ONLY; then
    cat >> "$PLIST" <<PLIST_EOF
  <key>RunAtLoad</key>
  <true/>

PLIST_EOF
  fi

  if ! $LOGON_ONLY; then
    cat >> "$PLIST" <<PLIST_EOF
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>$TIME_HH</integer>
    <key>Minute</key>
    <integer>$TIME_MM</integer>
  </dict>

PLIST_EOF
  fi

  cat >> "$PLIST" <<PLIST_EOF
  <key>KeepAlive</key>
  <false/>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>HOME</key>
    <string>$HOME</string>
  </dict>
</dict>
</plist>
PLIST_EOF

  launchctl load "$PLIST"

  echo "[OK] '$LABEL' registered"
  echo "  PLIST    : $PLIST"
  if ! $DAILY_ONLY; then echo "  Trigger 1: AtLogin (RunAtLoad)"; fi
  if ! $LOGON_ONLY; then printf "  Trigger 2: Daily %02d:%02d\n" "$TIME_HH" "$TIME_MM"; fi
  echo "  Log path : $LOG_PATH"
  echo ""
  echo "  Status   : bash scripts/install-morning-cron.sh --status"
  echo "  Uninstall: bash scripts/install-morning-cron.sh --uninstall"
  echo "  Run now  : launchctl start $LABEL"
  echo ""
  exit 0
fi

# ─── Linux (systemd user 또는 crontab fallback) ───────────
if [ "$OS" = "linux" ]; then
  SYSTEMD_USER_DIR="$HOME/.config/systemd/user"
  SERVICE_FILE="$SYSTEMD_USER_DIR/marketing-agent-morning.service"
  TIMER_FILE="$SYSTEMD_USER_DIR/marketing-agent-morning.timer"

  if [ "$MODE" = "status" ]; then
    if systemctl --user list-unit-files marketing-agent-morning.timer >/dev/null 2>&1; then
      echo "[REGISTERED — systemd]"
      systemctl --user status marketing-agent-morning.timer 2>/dev/null || true
      echo ""
      systemctl --user list-timers marketing-agent-morning.timer 2>/dev/null || true
      [ -f "$LOG_PATH" ] && { echo; echo "  Recent log:"; tail -10 "$LOG_PATH" | sed 's/^/    /'; }
    elif crontab -l 2>/dev/null | grep -q "$MORNING_SH"; then
      echo "[REGISTERED — crontab]"
      crontab -l | grep "$MORNING_SH"
    else
      echo "[NOT REGISTERED]"
    fi
    exit 0
  fi

  if [ "$MODE" = "uninstall" ]; then
    if [ -f "$TIMER_FILE" ]; then
      systemctl --user stop marketing-agent-morning.timer 2>/dev/null || true
      systemctl --user disable marketing-agent-morning.timer 2>/dev/null || true
      rm -f "$SERVICE_FILE" "$TIMER_FILE"
      systemctl --user daemon-reload 2>/dev/null || true
      echo "[OK] systemd timer uninstalled"
    fi
    # crontab fallback 도 제거
    if crontab -l 2>/dev/null | grep -q "$MORNING_SH"; then
      crontab -l | grep -v "$MORNING_SH" | crontab -
      echo "[OK] crontab entry removed"
    fi
    exit 0
  fi

  # Install
  if command -v systemctl >/dev/null 2>&1 && systemctl --user --version >/dev/null 2>&1; then
    chmod +x "$MORNING_SH"
    [ -f "$ROOT/scripts/start-demo.sh" ] && chmod +x "$ROOT/scripts/start-demo.sh"
    mkdir -p "$SYSTEMD_USER_DIR" "$LOG_DIR"

    cat > "$SERVICE_FILE" <<SVC_EOF
[Unit]
Description=marketing_agent morning routine
After=graphical-session.target

[Service]
Type=oneshot
WorkingDirectory=$ROOT
ExecStart=/bin/bash $MORNING_SH
StandardOutput=append:$LOG_PATH
StandardError=append:$LOG_PATH
SVC_EOF

    cat > "$TIMER_FILE" <<TMR_EOF
[Unit]
Description=marketing_agent morning routine timer

[Timer]
OnCalendar=*-*-* $(printf "%02d:%02d:00" "$TIME_HH" "$TIME_MM")
$(if ! $DAILY_ONLY; then echo "OnStartupSec=30s"; fi)
Persistent=true

[Install]
WantedBy=timers.target
TMR_EOF

    systemctl --user daemon-reload
    systemctl --user enable --now marketing-agent-morning.timer

    echo "[OK] systemd user timer registered"
    printf "  Trigger 2: Daily %02d:%02d\n" "$TIME_HH" "$TIME_MM"
    if ! $DAILY_ONLY; then echo "  Trigger 1: OnStartupSec=30s"; fi
    echo "  Log path : $LOG_PATH"
  else
    # crontab fallback
    echo "  systemd 없음 — crontab fallback"
    CRON_LINE="$(printf "%d %d * * * %s >> %s 2>&1" "$TIME_MM" "$TIME_HH" "$MORNING_SH" "$LOG_PATH")"
    (crontab -l 2>/dev/null | grep -v "$MORNING_SH"; echo "$CRON_LINE") | crontab -
    echo "[OK] crontab entry added"
    echo "  $CRON_LINE"
  fi
  exit 0
fi
