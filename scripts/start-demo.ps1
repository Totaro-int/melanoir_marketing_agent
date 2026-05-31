# Marketing Agent - Demo Start (Windows PowerShell)
# Uses $PSScriptRoot — works regardless of where the project lives.
# Usage:  Right-click → "Run with PowerShell"  또는  powershell -ExecutionPolicy Bypass -File scripts\start-demo.ps1

$ErrorActionPreference = "Continue"

# 프로젝트 루트 (이 스크립트의 부모 디렉토리)
$ROOT = Split-Path -Parent $PSScriptRoot
$CHROME_PROFILE = Join-Path $ROOT "auth\chrome-attach-profile"

# Chrome 경로 자동 감지 (32/64bit + user-local)
$CHROME_CANDIDATES = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$CHROME_EXE = $null
foreach ($p in $CHROME_CANDIDATES) {
  if (Test-Path -LiteralPath $p) { $CHROME_EXE = $p; break }
}
if (-not $CHROME_EXE) {
  Write-Host "[ERROR] Chrome 실행 파일 못 찾음. 다음 경로 중 하나에 Chrome 설치 필요:" -ForegroundColor Red
  $CHROME_CANDIDATES | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
  exit 1
}

Write-Host ""
Write-Host "[Marketing Agent] Demo start" -ForegroundColor Cyan
Write-Host "  ROOT: $ROOT" -ForegroundColor Gray
Write-Host ""

# 1. Chrome 9222 check
$chromeAlive = $false
try {
  $r = Invoke-WebRequest -Uri "http://localhost:9222/json/version" -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
  if ($r.StatusCode -eq 200) { $chromeAlive = $true }
} catch {}

if ($chromeAlive) {
  Write-Host "  [OK] Chrome 9222 already running" -ForegroundColor Green
} else {
  Write-Host "  [..] Starting Chrome 9222..." -ForegroundColor Yellow
  Start-Process -FilePath $CHROME_EXE -ArgumentList @(
    "--remote-debugging-port=9222",
    "--user-data-dir=$CHROME_PROFILE",
    "--no-first-run",
    "--no-default-browser-check"
  )
  Start-Sleep -Seconds 5
  Write-Host "  [OK] Chrome 9222 started" -ForegroundColor Green
}

# 2. Dashboard check + start
$dashAlive = $false
try {
  $r = Invoke-WebRequest -Uri "http://localhost:7777/api/today" -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
  if ($r.StatusCode -eq 200) { $dashAlive = $true }
} catch {}

if ($dashAlive) {
  Write-Host "  [OK] Dashboard already running" -ForegroundColor Green
} else {
  Write-Host "  [..] Starting dashboard server..." -ForegroundColor Yellow
  # ProcessStartInfo 로 한글 path 처리
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "node"
  $psi.Arguments = "harness\bin\dashboard.mjs --no-open"
  $psi.WorkingDirectory = $ROOT
  $psi.WindowStyle = "Minimized"
  $psi.UseShellExecute = $true
  [System.Diagnostics.Process]::Start($psi) | Out-Null
  # 5초 대기 + 5회 retry (시작 시간 변동성 흡수)
  $ok = $false
  for ($i = 0; $i -lt 6; $i++) {
    Start-Sleep -Seconds 2
    try {
      $r = Invoke-WebRequest -Uri "http://localhost:7777/api/today" -TimeoutSec 2 -UseBasicParsing
      if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch {}
  }
  if ($ok) { Write-Host "  [OK] Dashboard started" -ForegroundColor Green }
  else { Write-Host "  [WARN] Dashboard 시작 12초 초과 — 다시 시도하거나 수동: node harness/bin/dashboard.mjs" -ForegroundColor Yellow }
}

# 3. Open dashboard tab
Push-Location -LiteralPath $ROOT
& node "scripts\_open-dashboard-tab.mjs" 2>&1 | Out-Null
$tabOk = ($LASTEXITCODE -eq 0)
Pop-Location

if ($tabOk) { Write-Host "  [OK] Dashboard tab activated" -ForegroundColor Green }
else { Write-Host "  [INFO] Open http://localhost:7777 manually" -ForegroundColor Yellow }

Write-Host ""
Write-Host "[READY]" -ForegroundColor Cyan
Write-Host "  Dashboard: http://localhost:7777" -ForegroundColor White
Write-Host "  Chrome:    port 9222" -ForegroundColor White
Write-Host ""
Write-Host "  Stop:  scripts\stop-demo.ps1" -ForegroundColor Gray
Write-Host ""
