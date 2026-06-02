# Marketing Agent - Morning Routine (Windows PowerShell)
# 컴퓨터 켜고 한 번 실행 → Chrome 탭 N개 발행 직전 상태까지 자동 진행.
# 사용자는 각 탭에서 [공유] 클릭만 하면 됨.
#
# Usage: Right-click → "Run with PowerShell"
#   또는 powershell -ExecutionPolicy Bypass -File scripts\morning.ps1
#
# 옵션:
#   -DryRun        : 시뮬레이션 (Chrome 모달 안 엶)
#   -Slug X        : 특정 캠페인만
#   -Channel X     : 특정 채널만
#   -Max N         : 최대 N개 채널 (default 5)

[CmdletBinding()]
param(
  [switch]$DryRun,
  [string]$Slug,
  [string]$Channel,
  [int]$Max = 5
)

$ErrorActionPreference = "Continue"
$ROOT = Split-Path -Parent $PSScriptRoot

Write-Host ""
Write-Host "[Marketing Agent] 🌅 Morning routine" -ForegroundColor Cyan
Write-Host "  ROOT: $ROOT" -ForegroundColor Gray
if ($DryRun)  { Write-Host "  --dry-run (시뮬레이션 — Chrome 모달 안 엶)" -ForegroundColor Yellow }
if ($Slug)    { Write-Host "  --slug=$Slug" -ForegroundColor Gray }
if ($Channel) { Write-Host "  --channel=$Channel" -ForegroundColor Gray }
Write-Host ""

# 1. start-demo 단계 — Chrome 9222 + 대시보드 (이미 떠 있으면 skip)
$startDemo = Join-Path $PSScriptRoot "start-demo.ps1"
if (Test-Path $startDemo) {
  & powershell -ExecutionPolicy Bypass -File $startDemo
} else {
  Write-Host "  [WARN] start-demo.ps1 없음 — morning-routine 이 자체 검증" -ForegroundColor Yellow
}

# 2. morning-routine.mjs 인자 조립
$args = @("harness\bin\morning-routine.mjs")
if ($DryRun)  { $args += "--dry-run" }
if ($Slug)    { $args += "--slug=$Slug" }
if ($Channel) { $args += "--channel=$Channel" }
if ($Max -gt 0) { $args += "--max=$Max" }

Write-Host ""
Write-Host "[Morning routine] node harness\bin\morning-routine.mjs $($args[1..($args.Length-1)] -join ' ')" -ForegroundColor Cyan
Write-Host ""

# ProcessStartInfo — 한국어 path 안전 + stdout/stderr 직접 흘림
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "node"
$psi.Arguments = $args -join ' '
$psi.WorkingDirectory = $ROOT
$psi.UseShellExecute = $false

$proc = [System.Diagnostics.Process]::Start($psi)
$proc.WaitForExit()
$exitCode = $proc.ExitCode

Write-Host ""
if ($exitCode -eq 0) {
  Write-Host "[READY] Chrome 탭 검토 → [공유] 클릭하시면 됩니다." -ForegroundColor Green
  Write-Host "  대시보드: http://localhost:7777" -ForegroundColor Gray
} else {
  Write-Host "[FAIL] morning-routine 종료 코드 $exitCode" -ForegroundColor Red
  Write-Host "  대시보드 미니맵 / 콘솔 로그 확인" -ForegroundColor Gray
}
Write-Host ""
