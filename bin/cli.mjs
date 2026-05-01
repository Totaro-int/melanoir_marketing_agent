#!/usr/bin/env node
// Thin dispatcher so `marketing-ai <subcmd>` works.
// Subcommands: validate | profile-show | campaign-new

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [sub, ...rest] = process.argv.slice(2);

const map = {
  validate: 'profile-validate.mjs',
  'profile-show': 'profile-show.mjs',
  'campaign-new': 'campaign-new.mjs',
};

if (!sub || !map[sub]) {
  console.log('사용법: marketing-ai <subcommand> [args]');
  console.log('  validate       — company-profile.yaml 검증');
  console.log('  profile-show   — 프로필 요약 출력');
  console.log('  campaign-new   — 새 캠페인 디렉터리 생성');
  process.exit(sub ? 2 : 0);
}

const r = spawnSync(process.execPath, [resolve(here, map[sub]), ...rest], {
  stdio: 'inherit',
});
process.exit(r.status ?? 0);
