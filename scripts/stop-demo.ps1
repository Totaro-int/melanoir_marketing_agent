# Marketing Agent - Demo Stop (graceful, cookies preserved)
# Chrome 의 cookies SQLite flush 보장 — taskkill /F 금지.

$ErrorActionPreference = "Continue"
$ROOT = Split-Path -Parent $PSScriptRoot

Write-Host ""
Write-Host "[Marketing Agent] Demo stop (graceful)" -ForegroundColor Yellow
Write-Host ""

# 1. Chrome graceful shutdown — chrome-shutdown.mjs 위임
Push-Location -LiteralPath $ROOT
& node "harness\bin\chrome-shutdown.mjs" --verify 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
Pop-Location

# 2. Dashboard server stop (port 7777 PID 찾기)
Write-Host ""
Write-Host "  [..] Stopping dashboard server..." -ForegroundColor Yellow
$portInfo = netstat -aon | Select-String "127.0.0.1:7777" | Select-String "LISTENING" | Select-Object -First 1
if ($portInfo) {
  $pid = ($portInfo.ToString() -split '\s+')[-1]
  Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
  Write-Host "  [OK] dashboard PID $pid stopped" -ForegroundColor Gray
} else {
  Write-Host "  [INFO] dashboard not running" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[STOPPED] cookies + login preserved" -ForegroundColor Green
Write-Host ""
