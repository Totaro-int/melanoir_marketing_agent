# Marketing Agent - Demo Stop (graceful, cookies preserved)
# Chrome cookies SQLite flush guaranteed - NEVER use taskkill /F.
#
# NOTE: ASCII-only log strings for Task Scheduler / Minimized PS host.

$ErrorActionPreference = "Continue"
$ROOT = Split-Path -Parent $PSScriptRoot

Write-Host ""
Write-Host "[Marketing Agent] Demo stop (graceful)" -ForegroundColor Yellow
Write-Host ""

# 1. Chrome graceful shutdown via chrome-shutdown.mjs (CDP Browser.close)
Push-Location -LiteralPath $ROOT
& node "harness\bin\chrome-shutdown.mjs" --verify 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
Pop-Location

# 2. Dashboard server stop (port 7777 PID)
Write-Host ""
Write-Host "  [..] Stopping dashboard server..." -ForegroundColor Yellow
$portInfo = netstat -aon | Select-String "127.0.0.1:7777" | Select-String "LISTENING" | Select-Object -First 1
if ($portInfo) {
  $procId = ($portInfo.ToString() -split '\s+')[-1]
  Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  Write-Host "  [OK] dashboard PID $procId stopped" -ForegroundColor Gray
} else {
  Write-Host "  [INFO] dashboard not running" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[STOPPED] cookies + login preserved" -ForegroundColor Green
Write-Host ""
