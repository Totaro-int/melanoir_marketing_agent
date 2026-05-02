#!/usr/bin/env node
// One-shot installer — run after cloning. Idempotent: re-running is safe.
//   node bin/setup.mjs
//   node bin/setup.mjs --link=/path/to/your/project   # also create the Claude Code plugin symlink
//
// What it does:
//   1) Verify Node ≥ 20
//   2) npm install (skipped if node_modules exists)
//   3) cp .env.example .env.local  (skipped if .env.local exists)
//   4) mkdir -p auth out campaigns  (gitignored runtime dirs)
//   5) chmod +x bin/*.mjs statusline/statusline.sh
//   6) optional: ln -s <repo>  <link>/.claude/plugins/marketing_agent
//
// No interactive prompts — print next-step hints at the end so the user can decide.

import { existsSync, mkdirSync, copyFileSync, chmodSync, symlinkSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import pc from 'picocolors';
import { ROOT, ui } from './_lib.mjs';

const argv = process.argv.slice(2);
const linkTarget = argv.find((a) => a.startsWith('--link='))?.split('=')[1];

console.log();
console.log(pc.bold(pc.cyan('🚀 marketing_agent setup')));
console.log();

// 1) Node check
if (process.version < 'v20') {
  ui.err(`Node ${process.version} 감지. v20 이상 필요. (https://nodejs.org)`);
  process.exit(1);
}
ui.ok(`Node ${process.version}`);

// 2) deps
if (existsSync(resolve(ROOT, 'node_modules'))) {
  ui.dim('node_modules 존재 — npm install 건너뜀');
} else {
  ui.info('npm install 실행...');
  const r = spawnSync('npm', ['install', '--silent'], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) { ui.err('npm install 실패'); process.exit(r.status ?? 1); }
  ui.ok('의존성 설치 완료');
}

// 3) .env.local
const envLocal = resolve(ROOT, '.env.local');
const envExample = resolve(ROOT, '.env.example');
if (existsSync(envLocal)) {
  ui.dim('.env.local 존재 — 그대로 사용');
} else if (existsSync(envExample)) {
  copyFileSync(envExample, envLocal);
  ui.ok('.env.local 생성 (값을 채워주세요)');
} else {
  ui.warn('.env.example 없음 — 수동 설정 필요');
}

// 4) Runtime dirs
for (const d of ['auth', 'out', 'campaigns']) {
  mkdirSync(resolve(ROOT, d), { recursive: true });
}
ui.ok('runtime dirs 준비 (auth/, out/, campaigns/)');

// 5) chmod +x
const binDir = resolve(ROOT, 'bin');
for (const f of readdirSync(binDir)) {
  if (f.endsWith('.mjs')) try { chmodSync(resolve(binDir, f), 0o755); } catch {}
}
const sl = resolve(ROOT, 'statusline/statusline.sh');
if (existsSync(sl)) try { chmodSync(sl, 0o755); } catch {}
ui.ok('실행 권한 설정 (bin/*.mjs, statusline.sh)');

// 6) Optional plugin symlink
if (linkTarget) {
  const pluginsDir = resolve(linkTarget, '.claude', 'plugins');
  mkdirSync(pluginsDir, { recursive: true });
  const linkPath = resolve(pluginsDir, 'marketing_agent');
  if (existsSync(linkPath)) {
    ui.dim(`이미 링크 존재: ${linkPath}`);
  } else {
    try {
      symlinkSync(ROOT, linkPath, 'dir');
      ui.ok(`플러그인 링크: ${linkPath} → ${ROOT}`);
    } catch (e) {
      ui.err(`링크 실패: ${e.message}`);
    }
  }
}

console.log();
console.log(pc.bold('다음 단계:'));
console.log(pc.dim('  1. ') + 'node bin/doctor.mjs           ' + pc.dim('# 환경 진단'));
console.log(pc.dim('  2. ') + '에디터로 .env.local 열어 키 채우기 (FAL_KEY 권장)');
console.log(pc.dim('  3. ') + 'Claude Code 안에서 /onboard   ' + pc.dim('# 회사 프로필 인터뷰'));
console.log(pc.dim('  4. ') + '/campaign new "<주제>"  →  /generate  →  /preview  →  /approve  →  /publish --dry-run');
console.log();
