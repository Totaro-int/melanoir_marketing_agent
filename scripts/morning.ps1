# Marketing Agent - Morning Routine (Windows PowerShell)
# Run once when PC boots -> Chrome tabs ready at pre-publish state.
# User just clicks [Share]/[Publish] in each tab.
#
# Usage: Right-click -> "Run with PowerShell"
#   or:  powershell -ExecutionPolicy Bypass -File scripts\morning.ps1
#
# Options:
#   -DryRun       : simulation (no Chrome modals)
#   -Slug X       : single campaign
#   -Channel X    : single channel
#   -Max N        : max N channels (default 5)
#
# NOTE: all log strings in ASCII for Task Scheduler / minimized PS host
#       (CP949 fallback breaks Korean strings under -WindowStyle Minimized).

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
Write-Host "[Marketing Agent] Morning routine" -ForegroundColor Cyan
Write-Host "  ROOT: $ROOT" -ForegroundColor Gray
if ($DryRun)  { Write-Host "  --dry-run (simulation, no Chrome modal)" -ForegroundColor Yellow }
if ($Slug)    { Write-Host "  --slug=$Slug" -ForegroundColor Gray }
if ($Channel) { Write-Host "  --channel=$Channel" -ForegroundColor Gray }
Write-Host ""

# 1. start-demo: Chrome 9222 + dashboard (skip if already alive)
$startDemo = Join-Path $PSScriptRoot "start-demo.ps1"
if (Test-Path $startDemo) {
  & powershell -ExecutionPolicy Bypass -File $startDemo
} else {
  Write-Host "  [WARN] start-demo.ps1 not found - morning-routine will self-check" -ForegroundColor Yellow
}

# 2. morning-routine.mjs arg build
$mrArgs = @("harness\bin\morning-routine.mjs")
if ($DryRun)  { $mrArgs += "--dry-run" }
if ($Slug)    { $mrArgs += "--slug=$Slug" }
if ($Channel) { $mrArgs += "--channel=$Channel" }
if ($Max -gt 0) { $mrArgs += "--max=$Max" }

Write-Host ""
Write-Host "[Morning routine] node $($mrArgs -join ' ')" -ForegroundColor Cyan
Write-Host ""

# ProcessStartInfo handles Korean path safely
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "node"
$psi.Arguments = $mrArgs -join ' '
$psi.WorkingDirectory = $ROOT
$psi.UseShellExecute = $false

$proc = [System.Diagnostics.Process]::Start($psi)
$proc.WaitForExit()
$exitCode = $proc.ExitCode

Write-Host ""
if ($exitCode -eq 0) {
  Write-Host "[READY] Check Chrome tabs - click [Share]/[Publish] in each" -ForegroundColor Green
  Write-Host "  Dashboard: http://localhost:7777" -ForegroundColor Gray
} else {
  Write-Host "[FAIL] morning-routine exit code $exitCode" -ForegroundColor Red
  Write-Host "  Check dashboard minimap or console log" -ForegroundColor Gray
}
Write-Host ""
