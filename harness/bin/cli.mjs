#!/usr/bin/env node
// Thin dispatcher so `marketing-agent <subcmd>` works.

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [sub, ...rest] = process.argv.slice(2);

const map = {
  validate:        'profile-validate.mjs',
  'profile-show':  'profile-show.mjs',
  'campaign-new':  'campaign-new.mjs',
  generate:        'generate.mjs',
  preview:         'preview.mjs',
  approve:         'approve.mjs',
  reject:          'reject.mjs',
  // 발행은 browser-publish(크롬 쿠키)만 — 레거시 API publish/auth 서브커맨드 제거(2026-06).
  'browser-publish': 'browser-publish.mjs',
  status:          'board.mjs',
  board:           'board.mjs',
  doctor:          'doctor.mjs',
  setup:           'setup.mjs',
  run:             'run.mjs',
  'schedule-plan': 'schedule-plan.mjs',
  schedule:        'schedule-plan.mjs',
  'queue-tick':    'queue-tick.mjs',
  queue:           'queue-tick.mjs',
  'install-cron':  'install-cron.mjs',
};

if (!sub || !map[sub]) {
  console.log('사용법: marketing-agent <subcommand> [args]');
  for (const k of Object.keys(map)) console.log(`  ${k}`);
  process.exit(sub ? 2 : 0);
}

const r = spawnSync(process.execPath, [resolve(here, map[sub]), ...rest], { stdio: 'inherit' });
process.exit(r.status ?? 0);
