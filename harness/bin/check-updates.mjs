#!/usr/bin/env node
// Update-check 단일 진입점 — 슬래시 명령이 호출 직전에 부르는 짧은 상태 체크.
//
// 출력 (한 줄):
//   OK                                              현재 origin 과 동기화됨 또는 체크 스킵 (cache hit / offline / .git 없음)
//   UPDATE_AVAILABLE <count> <last commit oneline>  origin/<defaultBranch> 가 N개 commit 앞섬
//
// Exit: 항상 0. 흐름 차단 X.
//
// _lib.mjs 의 checkForUpdates() 와 같은 30분 cache 공유 — 둘 중 누가 먼저 fetch 해도 OK.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HARNESS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(HARNESS_ROOT, '..');
const cacheDir = resolve(ROOT, 'out');
const cacheFile = resolve(cacheDir, '.update-check');
const minIntervalMs = 30 * 60 * 1000;

const skip = (process.env.MARKETING_AGENT_SKIP_UPDATE_CHECK ?? '').toLowerCase();
if (['1', 'true', 'yes', 'on'].includes(skip)) { console.log('OK'); process.exit(0); }

// cache hit?
try {
  const last = parseInt(readFileSync(cacheFile, 'utf8'), 10);
  if (Number.isFinite(last) && (Date.now() - last) < minIntervalMs) {
    // cache 가 새 버전 정보를 담고 있었으면 출력 생략 — 이미 이번 30분 안에 한 번 보여줌
    console.log('OK');
    process.exit(0);
  }
} catch { /* no cache */ }

const git = (args, opts = {}) =>
  spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', timeout: 5000, ...opts });

if (git(['rev-parse', '--git-dir'], { stdio: 'ignore' }).status !== 0) {
  console.log('OK');
  process.exit(0);
}

let defaultBranch = '';
const sym = git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
if (sym.status === 0) defaultBranch = (sym.stdout?.trim() || '').replace(/^origin\//, '');
if (!defaultBranch) {
  if (git(['rev-parse', '--verify', 'origin/main'], { stdio: 'ignore' }).status === 0) defaultBranch = 'main';
  else if (git(['rev-parse', '--verify', 'origin/master'], { stdio: 'ignore' }).status === 0) defaultBranch = 'master';
  else defaultBranch = 'main';
}

const fetchRes = git(['fetch', 'origin', defaultBranch, '--quiet'], { stdio: 'ignore' });
try { mkdirSync(cacheDir, { recursive: true }); writeFileSync(cacheFile, String(Date.now())); } catch {}

if (fetchRes.status !== 0) { console.log('OK'); process.exit(0); }

const behindStr = git(['rev-list', '--count', `HEAD..origin/${defaultBranch}`]).stdout?.trim();
const behind = parseInt(behindStr || '0', 10);
if (!Number.isFinite(behind) || behind <= 0) { console.log('OK'); process.exit(0); }

const lastCommit = git(['log', `HEAD..origin/${defaultBranch}`, '--oneline', '-1']).stdout?.trim() || '';
console.log(`UPDATE_AVAILABLE ${behind} ${lastCommit}`);
process.exit(0);
