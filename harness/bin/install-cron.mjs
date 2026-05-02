#!/usr/bin/env node
// Install/uninstall a periodic worker for queue-tick.mjs.
//
// Usage:
//   node bin/install-cron.mjs install [--every=15]   # 15분마다 (기본)
//   node bin/install-cron.mjs uninstall
//   node bin/install-cron.mjs status
//
// macOS → ~/Library/LaunchAgents/com.totaro.marketing-agent.plist + launchctl load
// Linux → crontab 한 줄 추가/제거 (`# marketing_agent` 마커)
// 안 깔아도 사용자가 직접 `node bin/queue-tick.mjs` 호출하면 됩니다.

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { homedir, platform } from 'node:os';
import { ROOT, HARNESS_ROOT, ui } from './_lib.mjs';

const cmd = process.argv[2];
const flags = Object.fromEntries(
  process.argv.slice(3).filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const everyMin = Math.max(1, parseInt(flags.every, 10) || 15);
const tickScript = resolve(HARNESS_ROOT, 'bin/queue-tick.mjs');
const logFile = resolve(ROOT, 'out/queue-tick.log');

if (!cmd || !['install', 'uninstall', 'status'].includes(cmd)) {
  ui.err('사용법: install-cron.mjs <install|uninstall|status> [--every=15]');
  process.exit(2);
}

mkdirSync(resolve(ROOT, 'out'), { recursive: true });

const isMac = platform() === 'darwin';

if (isMac) handleLaunchd();
else handleCrontab();

function handleLaunchd() {
  const label = 'com.totaro.marketing-agent';
  const plistPath = resolve(homedir(), 'Library/LaunchAgents', `${label}.plist`);
  const node = process.execPath;
  const interval = everyMin * 60;

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${node}</string>
    <string>${tickScript}</string>
    <string>--json</string>
  </array>
  <key>StartInterval</key><integer>${interval}</integer>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>${logFile}</string>
  <key>StandardErrorPath</key><string>${logFile}</string>
  <key>WorkingDirectory</key><string>${ROOT}</string>
</dict>
</plist>
`;

  if (cmd === 'status') {
    if (!existsSync(plistPath)) { ui.dim(`설치 안됨: ${plistPath}`); process.exit(0); }
    ui.ok(`설치됨: ${plistPath}`);
    spawnSync('launchctl', ['list', label], { stdio: 'inherit' });
    return;
  }

  if (cmd === 'uninstall') {
    if (existsSync(plistPath)) {
      spawnSync('launchctl', ['unload', plistPath], { stdio: 'ignore' });
      unlinkSync(plistPath);
      ui.ok(`제거됨: ${plistPath}`);
    } else ui.dim('설치된 항목 없음.');
    return;
  }

  // install
  mkdirSync(resolve(homedir(), 'Library/LaunchAgents'), { recursive: true });
  if (existsSync(plistPath)) spawnSync('launchctl', ['unload', plistPath], { stdio: 'ignore' });
  writeFileSync(plistPath, plist, 'utf8');
  const r = spawnSync('launchctl', ['load', plistPath], { encoding: 'utf8' });
  if (r.status !== 0) {
    ui.err(`launchctl load 실패: ${r.stderr}`);
    process.exit(1);
  }
  ui.ok(`설치 완료 — ${everyMin}분마다 실행`);
  ui.dim(`plist: ${plistPath}`);
  ui.dim(`로그:  ${logFile}`);
  ui.dim(`제거:  node bin/install-cron.mjs uninstall`);
}

function handleCrontab() {
  const marker = '# marketing_agent';
  // 경로에 공백이 있어도 안전하게 single-quote 로 묶음. 내부 ' 는 '\'' 로 escape.
  const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  const line = `*/${everyMin} * * * * cd ${sq(ROOT)} && ${sq(process.execPath)} ${sq(tickScript)} --json >> ${sq(logFile)} 2>&1 ${marker}`;
  const cur = spawnSync('crontab', ['-l'], { encoding: 'utf8' });
  const existing = cur.status === 0 ? cur.stdout : '';
  const cleaned = existing.split('\n').filter((l) => !l.includes(marker)).filter(Boolean).join('\n');

  if (cmd === 'status') {
    if (existing.includes(marker)) ui.ok(`설치됨: ${existing.split('\n').find((l) => l.includes(marker))}`);
    else ui.dim('설치 안됨.');
    return;
  }

  if (cmd === 'uninstall') {
    if (!existing.includes(marker)) { ui.dim('설치된 항목 없음.'); return; }
    const r = spawnSync('crontab', ['-'], { input: cleaned + '\n', encoding: 'utf8' });
    if (r.status !== 0) { ui.err(`crontab 갱신 실패: ${r.stderr}`); process.exit(1); }
    ui.ok('제거됨.');
    return;
  }

  const next = (cleaned ? cleaned + '\n' : '') + line + '\n';
  const r = spawnSync('crontab', ['-'], { input: next, encoding: 'utf8' });
  if (r.status !== 0) { ui.err(`crontab 갱신 실패: ${r.stderr}`); process.exit(1); }
  ui.ok(`설치 완료 — ${everyMin}분마다 실행 (${marker})`);
  ui.dim(`로그: ${logFile}`);
  ui.dim(`제거: node bin/install-cron.mjs uninstall`);
}
