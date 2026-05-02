#!/usr/bin/env node
// Diagnose the local marketing_agent install: Node version, deps, env, auth files,
// plugin link, fal/openai/threads/linkedin readiness. Output is a single table users
// can paste into a support thread.

import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import pc from 'picocolors';
import { PATHS, ROOT, ui } from './_lib.mjs';
import { listProviders } from '../src/content-engine/registry.mjs';

const rows = [];
const add = (group, name, ok, detail = '') => rows.push({ group, name, ok, detail });

// 1) Node + package
add('runtime', 'Node version', process.version >= 'v20', process.version);
const pkg = readPkg();
add('runtime', 'package.json', !!pkg, pkg ? `${pkg.name}@${pkg.version}` : 'missing');
add('runtime', 'node_modules', existsSync(resolve(ROOT, 'node_modules')), existsSync(resolve(ROOT, 'node_modules')) ? '' : 'run: npm install');

// 2) Profile
add('profile', 'company-profile.yaml', existsSync(PATHS.profile),
  existsSync(PATHS.profile) ? '' : 'run: /onboard');

// 3) Env / providers
add('env', '.env.local', existsSync(resolve(ROOT, '.env.local')),
  existsSync(resolve(ROOT, '.env.local')) ? '' : 'cp .env.example .env.local');
add('env', 'CONTENT_ENGINE_PROVIDER', !!process.env.CONTENT_ENGINE_PROVIDER, process.env.CONTENT_ENGINE_PROVIDER ?? '(unset → mock)');
for (const p of listProviders()) {
  add('content-engine', `provider: ${p.id}`, p.health.ok, p.health.ok ? '' : (p.health.reason ?? ''));
}

// 4) Publisher credentials
const authDir = resolve(ROOT, 'auth');
const authFiles = existsSync(authDir) ? readdirSync(authDir).filter((f) => f.endsWith('.json')) : [];
add('publisher', 'auth/ dir', existsSync(authDir), authFiles.length ? authFiles.join(', ') : 'empty (run: /auth add <channel>)');
for (const f of authFiles) {
  const p = resolve(authDir, f);
  const mode = (statSync(p).mode & 0o777).toString(8);
  add('publisher', `mode 0600: ${f}`, mode === '600', `mode ${mode}`);
}
add('publisher', 'PUBLISHER_DRY_RUN', true, process.env.PUBLISHER_DRY_RUN ? 'ON (safe)' : 'off (real publish enabled)');

// 5) Plugin link (best-effort hint, since the link lives outside this repo)
add('plugin', 'plugin.json', existsSync(PATHS.pluginManifest));

// 6) Campaigns
const campCount = existsSync(PATHS.campaignsDir) ? readdirSync(PATHS.campaignsDir).length : 0;
add('campaigns', 'campaigns/', true, `${campCount} item(s)`);

// Render
console.log();
console.log(pc.bold(pc.cyan('🩺 marketing_agent doctor')));
console.log();
let lastGroup = '';
for (const r of rows) {
  if (r.group !== lastGroup) {
    if (lastGroup) console.log();
    console.log(pc.dim(`── ${r.group} ─────────────────────────────────`));
    lastGroup = r.group;
  }
  const dot = r.ok ? pc.green('●') : pc.red('●');
  console.log(`  ${dot}  ${r.name.padEnd(28)}  ${pc.dim(r.detail)}`);
}
console.log();

const failures = rows.filter((r) => !r.ok).length;
if (failures) { ui.warn(`${failures} 항목이 비활성/누락 — 위 detail 참고`); process.exit(1); }
ui.ok('모든 항목 정상');

// ---- helpers ----
function readPkg() {
  try { return JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')); }
  catch { return null; }
}
