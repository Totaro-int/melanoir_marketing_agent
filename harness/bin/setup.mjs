#!/usr/bin/env node
// One-shot installer — run after cloning. Idempotent: re-running is safe.
//   node harness/bin/setup.mjs
//   node harness/bin/setup.mjs --link=/path/to/your/project   # also create the Claude Code plugin symlink
//
// What it does:
//   1) Verify Node >= 20
//   2) npm install (skipped if node_modules exists)
//   3) cp .env.example .env.local  (skipped if .env.local exists)
//   4) mkdir -p auth out posts/  (gitignored runtime dirs)
//   5) chmod +x bin/*.mjs statusline/statusline.sh
//   6) optional: ln -s <repo>  <link>/.claude/plugins/marketing_agent
//
// ⚠ ZERO-DEPENDENCY 부트스트랩: 이 스크립트는 npm install 을 '돌리는' 주체라
//    절대 외부 패키지(picocolors 등)나 _lib.mjs 를 import 하면 안 된다.
//    (fresh clone 엔 node_modules 가 없어서 import 즉시 크래시함 — 실제로 그랬음.)
//    Node 내장만 사용 + 색은 ANSI 문자열로 직접.

import { existsSync, mkdirSync, copyFileSync, chmodSync, symlinkSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// ROOT/HARNESS_ROOT 를 _lib 없이 직접 계산 (이 파일: harness/bin/setup.mjs)
const HARNESS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..'); // harness/
const ROOT = resolve(HARNESS_ROOT, '..');                                    // project root

// 색 — ANSI 내장 (의존성 X)
const C = (code) => (s) => `\x1b[${code}m${s}\x1b[0m`;
const bold = C('1'), cyan = C('36'), dimc = C('2');
const ok   = (m) => console.log(`${C('32')('✅')} ${m}`);
const err  = (m) => console.log(`${C('31')('❌')} ${m}`);
const info = (m) => console.log(`${cyan('ℹ️ ')} ${m}`);
const warn = (m) => console.log(`${C('33')('⚠️ ')} ${m}`);
const dim  = (m) => console.log(dimc(m));

const argv = process.argv.slice(2);
const linkTarget = argv.find((a) => a.startsWith('--link='))?.split('=')[1];

console.log();
console.log(bold(cyan('🚀 marketing_agent setup')));
console.log();

// 1) Node check
if (process.version < 'v20') {
  err(`Node ${process.version} 감지. v20 이상 필요. (https://nodejs.org)`);
  process.exit(1);
}
ok(`Node ${process.version}`);

// 2) deps
if (existsSync(resolve(ROOT, 'node_modules'))) {
  dim('node_modules 존재 — npm install 건너뜀');
} else {
  info('npm install 실행...');
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSync(npmCmd, ['install', '--no-audit', '--no-fund'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { err('npm install 실패'); process.exit(r.status ?? 1); }
  ok('의존성 설치 완료');
}

// 3) .env.local
const envLocal = resolve(ROOT, '.env.local');
const envExample = resolve(ROOT, '.env.example');
if (existsSync(envLocal)) {
  dim('.env.local 존재 — 그대로 사용');
} else if (existsSync(envExample)) {
  copyFileSync(envExample, envLocal);
  ok('.env.local 생성 (기본 inhouse-slides — 키 없이 동작)');
} else {
  warn('.env.example 없음 — 수동 설정 필요');
}

// 4) Runtime dirs (PROJECT_ROOT 기준)
for (const d of ['auth', 'auth/cookies', 'out', 'posts/campaigns', 'posts/by-channel', 'posts/sources', 'logs']) {
  mkdirSync(resolve(ROOT, d), { recursive: true });
}
ok('runtime dirs 준비 (auth/, auth/cookies/, out/, posts/, logs/)');

// 5) chmod +x (harness/ 내부) — Windows 에선 무의미하지만 안전하게 try
const binDir = resolve(HARNESS_ROOT, 'bin');
for (const f of readdirSync(binDir)) {
  if (f.endsWith('.mjs')) try { chmodSync(resolve(binDir, f), 0o755); } catch {}
}
const sl = resolve(HARNESS_ROOT, 'statusline/statusline.sh');
if (existsSync(sl)) try { chmodSync(sl, 0o755); } catch {}
ok('실행 권한 설정 (bin/*.mjs, statusline.sh)');

// 6) Optional plugin symlink
if (linkTarget) {
  const pluginsDir = resolve(linkTarget, '.claude', 'plugins');
  mkdirSync(pluginsDir, { recursive: true });
  const linkPath = resolve(pluginsDir, 'marketing_agent');
  if (existsSync(linkPath)) {
    dim(`이미 링크 존재: ${linkPath}`);
  } else {
    try {
      symlinkSync(ROOT, linkPath, 'dir');
      ok(`플러그인 링크: ${linkPath} → ${ROOT}`);
    } catch (e) {
      err(`링크 실패: ${e.message}`);
    }
  }
}

console.log();
console.log(bold('다음 단계:'));
console.log(dimc('  1. ') + 'node harness/bin/doctor.mjs     ' + dimc('# 환경 진단 (전부 green 확인)'));
console.log(dimc('  2. ') + '.env.local — 그대로 둬도 됨 (기본 inhouse-slides 는 API 키 0개)');
console.log(dimc('  3. ') + 'Claude Code 안에서 /sns-start   ' + dimc('# 프로필 인터뷰 → 캠페인 → 검수 → 발행'));
console.log(dimc('  4. ') + '매일 아침 자동화: npm run morning   ' + dimc('(또는 scripts/install-morning-cron 등록)'));
console.log();
