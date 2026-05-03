#!/usr/bin/env node
// Diagnose the local marketing_agent install: Node version, deps, env, auth files,
// plugin link, fal/openai/threads/linkedin readiness. Output is a single table users
// can paste into a support thread.

import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import pc from 'picocolors';
import { PATHS, ROOT, HARNESS_ROOT, ui, readYaml, enabledChannels, checkForUpdates } from './_lib.mjs';
import { listProviders, getActiveProviderId } from '../src/content-engine/registry.mjs';
import { knownChannels, CHANNEL_META, isDryRun } from '../src/publisher/registry.mjs';
import { visibleWidth } from '../src/util/width.mjs';

checkForUpdates();

const QUICK = process.argv.includes('--quick');

const rows = [];
// status: 'ok' | 'warn' | 'fail'. `add(g,n,bool,d)` 기존 호출 backward-compat: true=ok, false=fail.
const add = (group, name, status, detail = '') => {
  if (status === true) status = 'ok';
  else if (status === false) status = 'fail';
  rows.push({ group, name, status, detail });
};

// 1) Node + package
add('runtime', 'Node version', process.version >= 'v20', process.version);
const pkg = readPkg();
add('runtime', 'package.json', !!pkg, pkg ? `${pkg.name}@${pkg.version}` : 'missing');
add('runtime', 'node_modules', existsSync(resolve(ROOT, 'node_modules')), existsSync(resolve(ROOT, 'node_modules')) ? '' : 'run: npm install');

// 2) Profile
add('profile', 'company-profile.yaml', existsSync(PATHS.profile),
  existsSync(PATHS.profile) ? '' : 'run: /sns-onboard');

// 3) Env / providers
add('env', '.env.local', existsSync(resolve(ROOT, '.env.local')),
  existsSync(resolve(ROOT, '.env.local')) ? '' : 'cp .env.example .env.local');
const envProvider = process.env.CONTENT_ENGINE_PROVIDER;
add('env', 'CONTENT_ENGINE_PROVIDER', envProvider ? 'ok' : 'fail',
  envProvider ?? '미설정 — .env.local 에 CONTENT_ENGINE_PROVIDER=fal 추가');
let activeProvider = envProvider;
for (const p of listProviders()) {
  // 활성 provider 만 fail, 나머지는 warn (선택 안 한 provider 가 미설정인 건 사고가 아님).
  const status = p.health.ok ? 'ok' : (p.id === activeProvider ? 'fail' : 'warn');
  add('content-engine', `provider: ${p.id}`, status, p.health.ok ? '' : (p.health.reason ?? ''));
}

if (!QUICK) {
// 4) Publisher credentials
const authDir = resolve(ROOT, 'auth');
const authFiles = existsSync(authDir) ? readdirSync(authDir).filter((f) => f.endsWith('.json')) : [];
add('publisher', 'auth/ dir', existsSync(authDir) ? (authFiles.length ? 'ok' : 'warn') : 'fail',
  authFiles.length ? authFiles.join(', ') : 'empty (run: /sns-auth add <channel>)');
for (const f of authFiles) {
  const p = resolve(authDir, f);
  const mode = (statSync(p).mode & 0o777).toString(8);
  add('publisher', `mode 0600: ${f}`, mode === '600', `mode ${mode}`);
}
const dryRun = isDryRun();
add('publisher', 'PUBLISHER_DRY_RUN', dryRun ? 'ok' : 'warn',
  dryRun ? 'ON (safe)' : 'off (real publish enabled)');

// Enabled channels (from profile) — 토큰 등록 여부 채널별 점검.
let profile = null;
try { if (existsSync(PATHS.profile)) profile = readYaml(PATHS.profile); } catch {}
const enabled = enabledChannels(profile);
if (!enabled.length) {
  add('channels', 'enabled in profile', 'fail', '/sns-onboard 또는 /sns-onboard update channels — 1개 이상 필요');
} else {
  add('channels', 'enabled in profile', 'ok', enabled.join(', '));
  for (const ch of enabled) {
    const known = knownChannels().includes(ch);
    if (!known) { add('channels', `[${ch}] adapter`, 'fail', '등록되지 않은 채널 ID'); continue; }
    const hasAuth = authFiles.includes(`${ch}.json`);
    const meta = CHANNEL_META[ch];
    // 토큰 미등록은 warn (자동 dry-run fallback). 사용자가 의도적으로 미등록일 수 있음.
    add('channels', `[${ch}] auth/${ch}.json`, hasAuth ? 'ok' : 'warn',
      hasAuth ? meta?.media ?? '' : `없음 — /sns-auth add ${ch} (${meta?.auth ?? ''})`);
  }
}

// 5) Plugin link (best-effort hint, since the link lives outside this repo)
add('plugin', 'plugin.json', existsSync(PATHS.pluginManifest));

// 6) Campaigns
const campCount = existsSync(PATHS.campaignsDir) ? readdirSync(PATHS.campaignsDir).length : 0;
add('campaigns', 'campaigns/', true, `${campCount} item(s)`);

// 7) Queue worker (auto-publish)
const queueScript = resolve(HARNESS_ROOT, 'bin/queue-tick.mjs');
add('queue', 'queue-tick.mjs', existsSync(queueScript), existsSync(queueScript) ? '' : 'missing');
let scheduled = 0, attention = 0;
if (existsSync(PATHS.campaignsDir)) {
  for (const d of readdirSync(PATHS.campaignsDir)) {
    const bp = resolve(PATHS.campaignsDir, d, 'brief.yaml');
    if (!existsSync(bp)) continue;
    try {
      const b = readYaml(bp);
      for (const v of Object.values(b.status ?? {})) {
        if (v === 'scheduled') scheduled++;
        if (v === 'needs_attention') attention++;
      }
    } catch {}
  }
}
add('queue', 'scheduled items', attention > 0 ? 'warn' : 'ok',
  `${scheduled} 대기 · ${attention} needs_attention`);
} // end !QUICK

// Render — 라벨 컬럼 폭은 가시폭 기준으로 통일.
const ICON = { ok: pc.green('✓'), warn: pc.yellow('⚠'), fail: pc.red('✗') };
const labelW = Math.max(28, ...rows.map((r) => visibleWidth(r.name)));

console.log();
console.log(pc.bold(pc.cyan(`🩺 marketing_agent doctor${QUICK ? ' (quick)' : ''}`)));
console.log();
let lastGroup = '';
for (const r of rows) {
  if (r.group !== lastGroup) {
    if (lastGroup) console.log();
    console.log(pc.dim(`── ${r.group} ─────────────────────────────────`));
    lastGroup = r.group;
  }
  const pad = ' '.repeat(Math.max(1, labelW - visibleWidth(r.name) + 2));
  console.log(`  ${ICON[r.status]}  ${r.name}${pad}${pc.dim(r.detail)}`);
}
console.log();

const fails = rows.filter((r) => r.status === 'fail').length;
const warns = rows.filter((r) => r.status === 'warn').length;
if (fails) {
  ui.err(`${fails} 항목 실패${warns ? ` · ${warns} 경고` : ''} — 위 detail 참고`);
  process.exit(1);
}
if (warns) {
  ui.warn(`모든 필수 항목 OK · ${warns} 경고 (선택 항목)`);
  process.exit(0);
}
ui.ok('모든 항목 정상');

// ---- helpers ----
function readPkg() {
  try { return JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')); }
  catch { return null; }
}

