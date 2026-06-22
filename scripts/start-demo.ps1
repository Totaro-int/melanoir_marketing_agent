# Marketing Agent - Demo Start (Windows PowerShell)
# Uses $PSScriptRoot so it works regardless of where the project lives.
# Usage:  Right-click -> "Run with PowerShell"
#    or:  powershell -ExecutionPolicy Bypass -File scripts\start-demo.ps1
#
# NOTE: ASCII-only log strings for Task Scheduler / Minimized PS host.

$ErrorActionPreference = "Continue"

# project root (parent of scripts/)
$ROOT = Split-Path -Parent $PSScriptRoot
$CHROME_PROFILE = Join-Path $ROOT "auth\chrome-attach-profile"

# Chrome path auto-detect (32/64bit + user-local)
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
  Write-Host "[ERROR] Chrome not found at any candidate path:" -ForegroundColor Red
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

# 1.5 Restore saved cookies into Chrome (missing-only; never overwrites current login)
Push-Location -LiteralPath $ROOT
& node "harness\bin\cookie-store.mjs" restore 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
Pop-Location

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
  # ProcessStartInfo handles Korean path safely
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "node"
  $psi.Arguments = "harness\bin\dashboard.mjs --no-open"
  $psi.WorkingDirectory = $ROOT
  $psi.WindowStyle = "Minimized"
  $psi.UseShellExecute = $true
  [System.Diagnostics.Process]::Start($psi) | Out-Null
  # 2sec x 5 retry (start time variance)
  $ok = $false
  for ($i = 0; $i -lt 6; $i++) {
    Start-Sleep -Seconds 2
    try {
      $r = Invoke-WebRequest -Uri "http://localhost:7777/api/today" -TimeoutSec 2 -UseBasicParsing
      if ($r.StatusCode -eq 200) { $ok = $true; break }
    } catch {}
  }
  if ($ok) { Write-Host "  [OK] Dashboard started" -ForegroundColor Green }
  else { Write-Host "  [WARN] Dashboard not up in 12s - manual: node harness/bin/dashboard.mjs" -ForegroundColor Yellow }
}

# 2.5 Card Studio (7799) - dashboard '카드 스튜디오' tab embeds it
$studioAlive = $false
try { $r = Invoke-WebRequest -Uri "http://localhost:7799/health" -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue; if ($r.StatusCode -eq 200) { $studioAlive = $true } } catch {}
if ($studioAlive) {
  Write-Host "  [OK] Card Studio already running" -ForegroundColor Green
} else {
  $psi2 = New-Object System.Diagnostics.ProcessStartInfo
  $psi2.FileName = "node"
  $psi2.Arguments = "harness\bin\card-studio.mjs"
  $psi2.WorkingDirectory = $ROOT
  $psi2.WindowStyle = "Minimized"
  $psi2.UseShellExecute = $true
  [System.Diagnostics.Process]::Start($psi2) | Out-Null
  Write-Host "  [OK] Card Studio (http://localhost:7799)" -ForegroundColor Green
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
