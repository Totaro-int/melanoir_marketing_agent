# Marketing Agent - Morning Routine Task Scheduler (Windows)
#
# Auto-registers morning routine to Windows Task Scheduler.
# User boots PC -> 30 sec later, Chrome tabs ready at pre-publish state.
#
# Triggers:
#   1) AtLogOn  - on user login (PC boot)
#   2) Daily HH:MM (default 09:00)
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\install-morning-cron.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\install-morning-cron.ps1 -Uninstall
#   powershell -ExecutionPolicy Bypass -File scripts\install-morning-cron.ps1 -Status
#   powershell -ExecutionPolicy Bypass -File scripts\install-morning-cron.ps1 -Time "08:00"

[CmdletBinding()]
param(
  [switch]$Uninstall,
  [switch]$Status,
  [string]$Time = "09:00",
  [switch]$LogonOnly,
  [switch]$DailyOnly
)

$ErrorActionPreference = "Continue"

$TASK_NAME    = "MarketingAgentMorningRoutine"
$ROOT         = Split-Path -Parent $PSScriptRoot
$MORNING_PS1  = Join-Path $ROOT "scripts\morning.ps1"
$LOG_DIR      = Join-Path $ROOT "logs"
$LOG_PATH     = Join-Path $LOG_DIR "morning-routine.log"

Write-Host ""
Write-Host "[Marketing Agent] Morning Routine Task Scheduler" -ForegroundColor Cyan
Write-Host "  Task name: $TASK_NAME"
Write-Host "  ROOT     : $ROOT"
Write-Host ""

# --- Status mode ---
if ($Status) {
  $task = Get-ScheduledTask -TaskName $TASK_NAME -ErrorAction SilentlyContinue
  if (-not $task) {
    Write-Host "[NOT REGISTERED]" -ForegroundColor Yellow
    Write-Host "  Register with: powershell -ExecutionPolicy Bypass -File scripts\install-morning-cron.ps1"
    exit 0
  }
  $info = Get-ScheduledTaskInfo -TaskName $TASK_NAME
  Write-Host "[REGISTERED]" -ForegroundColor Green
  Write-Host "  State    : $($task.State)"
  Write-Host "  Last run : $($info.LastRunTime)"
  Write-Host "  Next run : $($info.NextRunTime)"
  Write-Host ""
  Write-Host "  Triggers:"
  foreach ($t in $task.Triggers) {
    $type = $t.GetType().Name
    Write-Host "    - $type StartBoundary=$($t.StartBoundary) Delay=$($t.Delay)"
  }
  if (Test-Path $LOG_PATH) {
    Write-Host ""
    Write-Host "  Recent log (last 10 lines):"
    Get-Content $LOG_PATH -Tail 10 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
  }
  exit 0
}

# --- Uninstall mode ---
if ($Uninstall) {
  $task = Get-ScheduledTask -TaskName $TASK_NAME -ErrorAction SilentlyContinue
  if (-not $task) {
    Write-Host "[SKIP] not registered" -ForegroundColor Yellow
    exit 0
  }
  Unregister-ScheduledTask -TaskName $TASK_NAME -Confirm:$false
  Write-Host "[OK] '$TASK_NAME' unregistered" -ForegroundColor Green
  exit 0
}

# --- Install mode ---
if (-not (Test-Path $MORNING_PS1)) {
  Write-Host "[ERROR] morning.ps1 not found: $MORNING_PS1" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $LOG_DIR)) {
  New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null
}

$existing = Get-ScheduledTask -TaskName $TASK_NAME -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "  existing task found - removing for re-register" -ForegroundColor Yellow
  Unregister-ScheduledTask -TaskName $TASK_NAME -Confirm:$false
}

# Action: powershell -> morning.ps1 with Start-Transcript log
$cmdBlock = "Start-Transcript -Path '$LOG_PATH' -Append -ErrorAction SilentlyContinue; & '$MORNING_PS1'; Stop-Transcript -ErrorAction SilentlyContinue"
$argString = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -Command `"$cmdBlock`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argString -WorkingDirectory $ROOT

# Triggers
$triggers = @()
if (-not $DailyOnly) {
  $t1 = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $t1.Delay = "PT30S"
  $triggers += $t1
  Write-Host "  Trigger 1: AtLogOn (delay 30s)"
}
if (-not $LogonOnly) {
  $t2 = New-ScheduledTaskTrigger -Daily -At $Time
  $triggers += $t2
  Write-Host "  Trigger 2: Daily $Time"
}
if ($triggers.Count -eq 0) {
  Write-Host "[ERROR] cannot use -LogonOnly and -DailyOnly together" -ForegroundColor Red
  exit 1
}

# Settings: battery OK, no network requirement, single instance, 30 min timeout
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

# Principal: current user, Interactive, Limited (no admin)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

try {
  Register-ScheduledTask -TaskName $TASK_NAME -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description "marketing_agent morning routine - Chrome tabs ready at pre-publish state" -Force | Out-Null
  Write-Host ""
  Write-Host "[OK] '$TASK_NAME' registered" -ForegroundColor Green
  Write-Host ""
  $info = Get-ScheduledTaskInfo -TaskName $TASK_NAME
  Write-Host "  Next run: $($info.NextRunTime)"
  Write-Host ""
  Write-Host "  Log path : $LOG_PATH"
  Write-Host "  Status   : powershell -ExecutionPolicy Bypass -File scripts\install-morning-cron.ps1 -Status"
  Write-Host "  Uninstall: powershell -ExecutionPolicy Bypass -File scripts\install-morning-cron.ps1 -Uninstall"
  Write-Host "  Run now  : Start-ScheduledTask -TaskName '$TASK_NAME'"
  Write-Host ""
} catch {
  Write-Host "[ERROR] register failed: $_" -ForegroundColor Red
  Write-Host "  Try Run As Administrator if permission denied" -ForegroundColor Yellow
  exit 1
}
