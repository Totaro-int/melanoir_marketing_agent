#!/usr/bin/env node
// Single-shot orchestrator: brief → generate → preview → (optional approve) → (optional publish).
//
// Usage:
//   node bin/run.mjs --topic "<topic>" \
//                    --channels=threads,linkedin \
//                    [--goal=awareness] [--cadence=single] \
//                    [--approve]              # 가드 통과 채널 자동 승인
//                    [--publish]              # 승인 + 발행 (실 발행: PUBLISHER_DRY_RUN unset 또는 ∉ {1,true,yes})
//                    [--dry-run]              # publish 시 dry-run 강제
//
// 스케줄을 쓰려면 /sns-schedule (bin/schedule-plan.mjs) 사용. 이 스크립트는 단건 즉시 흐름.

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PATHS, ui, readYaml, enabledChannels, activeChannels, checkForUpdates } from './_lib.mjs';
checkForUpdates();

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flags = parseFlags(argv);

if (!flags.topic) {
  ui.err('사용법: run.mjs --topic "<주제>" --channels=threads[,linkedin] [--goal=...] [--cadence=...] [--approve] [--publish] [--dry-run]');
  process.exit(2);
}

if (!existsSync(PATHS.profile)) {
  ui.err('company-profile.yaml 없음 — 먼저 /sns-onboard 실행하세요.');
  process.exit(2);
}

// 채널 우선순위: --channels 플래그 > profile.channels.enabled > plugin manifest active.
let channels = [];
if (flags.channels) {
  channels = String(flags.channels).split(',').map((s) => s.trim()).filter(Boolean);
} else {
  let profile = null;
  try { profile = readYaml(PATHS.profile); } catch {}
  channels = enabledChannels(profile);
  if (!channels.length) channels = activeChannels();
}
if (!channels.length) {
  ui.err('활성 채널 없음. /sns-onboard 또는 --channels= 플래그 사용.');
  process.exit(2);
}

// 1) campaign-new
const newArgs = [flags.topic, `--channels=${channels.join(',')}`];
if (flags.goal) newArgs.push(`--goal=${flags.goal}`);
if (flags.cadence) newArgs.push(`--cadence=${flags.cadence}`);

const created = run('campaign-new.mjs', newArgs);
if (created.status !== 0) process.exit(created.status ?? 1);

const slug = parseSlug(created.stdout);
if (!slug) {
  ui.err('새 캠페인 slug 파싱 실패. 위 출력 확인.');
  process.exit(1);
}

// 2) generate per channel
for (const ch of channels) {
  const r = run('generate.mjs', [slug, `--channel=${ch}`]);
  if (r.status !== 0) {
    ui.err(`[${ch}] generate 실패`);
    process.exit(r.status ?? 1);
  }
}

// 3) preview (전체)
run('preview.mjs', [slug], { stream: true });

// 4) optional approve
if (flags.approve) {
  for (const ch of channels) {
    const r = run('approve.mjs', [slug, `--channel=${ch}`]);
    if (r.status !== 0) ui.warn(`[${ch}] 자동 승인 실패 (가드가 막았을 수 있음) — /sns-preview 확인`);
  }
}

// 5) optional publish
if (flags.publish) {
  const pubArgs = [slug];
  if (flags['dry-run']) pubArgs.push('--dry-run');
  for (const ch of channels) {
    const r = run('publish.mjs', [...pubArgs, `--channel=${ch}`]);
    if (r.status !== 0) ui.warn(`[${ch}] publish 실패 — /sns-preview 후 수동 처리`);
  }
}

ui.ok(`run 완료 — ${slug}`);
ui.dim('다음:');
ui.dim('  · /sns-preview ' + slug);
ui.dim('  · /sns-status');

function parseFlags(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > -1) out[a.slice(2, eq)] = a.slice(eq + 1);
    else {
      const next = args[i + 1];
      if (next && !next.startsWith('--')) { out[a.slice(2)] = next; i++; }
      else out[a.slice(2)] = true;
    }
  }
  return out;
}

function run(script, args, { stream = false } = {}) {
  const cmd = process.execPath;
  const allArgs = [resolve(here, script), ...args];
  // 자식 프로세스에서 update check 다시 안 돌게 (중복 알림 + 시간 낭비 방지).
  const env = { ...process.env, MARKETING_AGENT_SKIP_UPDATE_CHECK: '1' };
  if (stream) {
    const r = spawnSync(cmd, allArgs, { stdio: 'inherit', env });
    return { status: r.status ?? 0, stdout: '' };
  }
  const r = spawnSync(cmd, allArgs, { encoding: 'utf8', env });
  process.stdout.write(r.stdout ?? '');
  process.stderr.write(r.stderr ?? '');
  return { status: r.status ?? 0, stdout: r.stdout ?? '' };
}

function parseSlug(stdout) {
  const m = stdout.match(/캠페인 생성:\s*([^\s]+)/);
  return m ? m[1] : null;
}
