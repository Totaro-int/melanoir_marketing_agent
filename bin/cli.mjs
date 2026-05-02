#!/usr/bin/env node
// Thin dispatcher so `marketing-agent <subcmd>` works.

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [sub, ...rest] = process.argv.slice(2);

const map = {
  validate:       'profile-validate.mjs',
  'profile-show': 'profile-show.mjs',
  'campaign-new': 'campaign-new.mjs',
  generate:       'generate.mjs',
  preview:        'preview.mjs',
  approve:        'approve.mjs',
  reject:         'reject.mjs',
  publish:        'publish.mjs',
  auth:           'auth.mjs',
  status:         'board.mjs',
  board:          'board.mjs',
  doctor:         'doctor.mjs',
  setup:          'setup.mjs',
};

if (!sub || !map[sub]) {
  console.log('사용법: marketing-agent <subcommand> [args]');
  for (const k of Object.keys(map)) console.log(`  ${k}`);
  process.exit(sub ? 2 : 0);
}

const r = spawnSync(process.execPath, [resolve(here, map[sub]), ...rest], { stdio: 'inherit' });
process.exit(r.status ?? 0);
