#!/usr/bin/env node
// Chrome 9222 graceful shutdown — cookies SQLite flush 보장.
// taskkill /F 절대 X. CDP Browser.close 시도 → CloseMainWindow → 마지막 강제.
//
// Usage:
//   node harness/bin/chrome-shutdown.mjs            # 기본 9222 graceful
//   node harness/bin/chrome-shutdown.mjs --port=9223
//   node harness/bin/chrome-shutdown.mjs --verify   # 종료 후 cookies SQLite mtime 확인

import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './_lib.mjs';

const argv = process.argv.slice(2);
const port = Number(argv.find((a) => a.startsWith('--port='))?.split('=')[1] || 9222);
const verify = argv.includes('--verify');

const COOKIES_DB = resolve(ROOT, 'auth/chrome-attach-profile/Default/Network/Cookies');

function tsBeforeShutdown() {
  if (!existsSync(COOKIES_DB)) return null;
  return statSync(COOKIES_DB).mtimeMs;
}

async function tryCdpClose() {
  try {
    const { chromium } = await import('playwright');
    const b = await chromium.connectOverCDP(`http://localhost:${port}`, { timeout: 4000 });
    await b.close();
    console.log('[1] CDP Browser.close — disconnect 완료 (attach 모드라 Chrome 자체는 안 닫힘)');
    return true;
  } catch (e) {
    console.log(`[1] CDP attach 실패: ${e.message}`);
    return false;
  }
}

function runPs(script) {
  return new Promise((resolveP) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-Command', script], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => out += d.toString());
    p.stderr.on('data', (d) => out += d.toString());
    p.on('exit', () => resolveP(out.trim()));
  });
}

async function findChromePidFromCmdLine() {
  const ps = `Get-CimInstance Win32_Process -Filter "name = 'chrome.exe'" |
    Where-Object { $_.CommandLine -like '*remote-debugging-port=${port}*' } |
    Select-Object -First 1 -ExpandProperty ProcessId`;
  const out = await runPs(ps);
  const pid = parseInt(out, 10);
  return Number.isNaN(pid) ? null : pid;
}

async function closeMainWindow(pid) {
  // CloseMainWindow 는 X 버튼 시뮬레이션 — Chrome 의 graceful 흐름 트리거 (cookies flush 포함)
  const ps = `
    $p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
    if ($p) {
      $sent = $p.CloseMainWindow()
      Write-Output ("CloseMainWindow signal: " + $sent)
      if ($p.WaitForExit(10000)) {
        Write-Output "Chrome exited gracefully"
      } else {
        Write-Output "Chrome did not exit in 10s — falling back to graceful Stop-Process"
        Stop-Process -Id ${pid} -ErrorAction SilentlyContinue
      }
    }`;
  const out = await runPs(ps);
  console.log('[2] CloseMainWindow:\n' + out.split('\n').map((l) => '    ' + l).join('\n'));
}

// ── main ──
const before = tsBeforeShutdown();
console.log(`Chrome graceful shutdown (port ${port})`);
console.log('');

await tryCdpClose();

const pid = await findChromePidFromCmdLine();
if (pid) {
  console.log(`[2] Chrome 9222 root PID: ${pid}`);
  await closeMainWindow(pid);
} else {
  console.log('[2] Chrome 9222 process 없음 (이미 종료됐거나 다른 PID)');
}

if (verify && existsSync(COOKIES_DB)) {
  const after = statSync(COOKIES_DB).mtimeMs;
  const changed = before === null ? 'unknown' : (after > before ? 'YES (flushed)' : 'NO');
  console.log('');
  console.log(`[verify] Cookies SQLite mtime ${changed === 'unknown' ? '확인 불가' : changed === 'YES (flushed)' ? '갱신됨 — flush 성공' : '변경 없음 — flush 안 됐을 수 있음'}`);
  console.log(`         path: ${COOKIES_DB}`);
}

console.log('\n완료. 다음 시작: scripts/start-demo.bat 또는 PowerShell Start-Process');
process.exit(0);
