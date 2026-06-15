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
import { ROOT, HARNESS_ROOT, ui } from './_lib.mjs';

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

// 4) Runtime dirs (PROJECT_ROOT 기준)
for (const d of ['auth', 'out', 'posts/campaigns', 'posts/by-channel']) {
  mkdirSync(resolve(ROOT, d), { recursive: true });
}
ui.ok('runtime dirs 준비 (auth/, out/, posts/campaigns/, posts/by-channel/)');

// 5) chmod +x (harness/ 내부)
const binDir = resolve(HARNESS_ROOT, 'bin');
for (const f of readdirSync(binDir)) {
  if (f.endsWith('.mjs')) try { chmodSync(resolve(binDir, f), 0o755); } catch {}
}
const sl = resolve(HARNESS_ROOT, 'statusline/statusline.sh');
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
console.log(pc.dim('  1. ') + 'npm run doctor                ' + pc.dim('# 환경 진단 (전부 green 확인)'));
console.log(pc.dim('  2. ') + '.env.local — 그대로 둬도 됨 (기본 inhouse-slides 는 API 키 0개)');
console.log(pc.dim('     ') + pc.dim('AI 이미지 쓸 때만 FAL_KEY 추가: https://fal.ai/dashboard/keys'));
console.log(pc.dim('  3. ') + 'Claude Code 안에서 /sns-start   ' + pc.dim('# 프로필 인터뷰 → 캠페인 → 검수 → 발행 자동'));
console.log(pc.dim('  4. ') + '매일 아침 자동화: npm run morning   ' + pc.dim('(또는 scripts/install-morning-cron 등록)'));
console.log();
