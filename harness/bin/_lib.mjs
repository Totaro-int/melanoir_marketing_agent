// Shared helpers for marketing_ai CLI scripts.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import pc from 'picocolors';

// Layout (Phase 8.1):
//   <PROJECT_ROOT>/
//     ├── harness/                ← 코드·스키마·예시·문서  (이 파일: harness/bin/_lib.mjs)
//     │   ├── bin/  src/  schemas/  examples/  channels/  commands/  skills/  agents/ ...
//     ├── posts/                  ← 사람이 보는 결과물
//     │   ├── campaigns/<slug>/   ← 캠페인 원본 (brief.yaml + per-channel drafts/assets)
//     │   └── by-channel/<ch>/    ← 채널별 한눈에 보기 (campaigns 로 향한 symlink)
//     ├── auth/                   ← 자격증명 (gitignored)
//     ├── out/                    ← 런타임 로그·이미지 (gitignored)
//     └── package.json, plugin.json, .env.local, company-profile.yaml, README.md ...
export const HARNESS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = resolve(HARNESS_ROOT, '..');

// Auto-load .env.local once at module init (KEY=VALUE per line, # comments).
// Existing process.env values win, so user-set env still overrides the file.
(() => {
  const envFile = resolve(ROOT, '.env.local');
  if (!existsSync(envFile)) return;
  for (const raw of readFileSync(envFile, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k in process.env) continue;
    process.env[k] = v.replace(/^["']|["']$/g, '');
  }
})();

export const PATHS = {
  // harness 내부 (코드와 함께 이동)
  schema:              resolve(HARNESS_ROOT, 'schemas/company-profile.schema.yaml'),
  campaignBriefSchema: resolve(HARNESS_ROOT, 'schemas/campaign-brief.schema.yaml'),
  example:             resolve(HARNESS_ROOT, 'examples/company-profile.example.yaml'),
  channelsDir:         resolve(HARNESS_ROOT, 'channels'),
  // PROJECT_ROOT (사용자 데이터 + 매니페스트)
  profile:             resolve(ROOT, 'company-profile.yaml'),
  campaignsDir:        resolve(ROOT, 'posts/campaigns'),
  postsByChannelDir:   resolve(ROOT, 'posts/by-channel'),
  pluginManifest:      resolve(ROOT, '.claude-plugin/plugin.json'),
  channelsManifest:    resolve(HARNESS_ROOT, 'channels.json'),
};

export function readYaml(path) {
  if (!existsSync(path)) {
    const err = new Error(`File not found: ${path}`);
    err.code = 'ENOENT_YAML';
    throw err;
  }
  return YAML.parse(readFileSync(path, 'utf8'));
}

export function writeYaml(path, data) {
  writeFileSync(path, YAML.stringify(data, { lineWidth: 100 }), 'utf8');
}

export function readText(path) {
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8');
}

export function loadChannelDocs(channel) {
  const dir = resolve(PATHS.channelsDir, channel);
  return {
    strategy:  readText(resolve(dir, 'strategy.md')),
    checklist: readText(resolve(dir, 'checklist.md')),
    templates: readText(resolve(dir, 'templates/post.md')),
  };
}

export function findCampaignDir(slug) {
  const dir = resolve(PATHS.campaignsDir, slug);
  if (!existsSync(dir)) {
    const err = new Error(`Campaign not found: ${slug}`);
    err.code = 'ENOENT_CAMPAIGN';
    throw err;
  }
  return dir;
}

export function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function listChannels() {
  // 채널 메타는 Claude Code plugin.json schema 와 충돌해서 별도 파일에 둠.
  try { return loadJson(PATHS.channelsManifest); }
  catch { return []; }
}

export function activeChannels() {
  return listChannels()
    .filter((c) => c.status === 'reference' || c.status === 'active')
    .map((c) => c.id);
}

// /sns-onboard 단계에서 사용자가 고른 채널. 없으면 빈 배열 — 호출부가 fallback 결정.
export function enabledChannels(profile) {
  const arr = profile?.channels?.enabled;
  if (!Array.isArray(arr)) return [];
  return arr.filter((c) => typeof c === 'string' && c.length > 0);
}

export function slugify(text) {
  // Keep Korean characters; collapse whitespace and forbidden filename chars.
  // 유니코드 dash 류 (em-, en-, figure-, minus, hyphen 등) → ASCII '-' 통일.
  return text
    .normalize('NFKC')
    .trim()
    .replace(/[‐-―−﹘﹣－]/g, '-') // dash family → ASCII '-'
    .replace(/[\s_]+/g, '-')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/-+/g, '-')                                       // 연속 dash 1개로
    .replace(/^-+|-+$/g, '')                                   // 양 끝 dash 제거
    .slice(0, 80);
}

export function todayKst() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export function nowKstIso() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().replace('Z', '+09:00');
}

export const ui = {
  ok: (msg) => console.log(pc.green('✅ ') + msg),
  warn: (msg) => console.log(pc.yellow('⚠️  ') + msg),
  err: (msg) => console.error(pc.red('❌ ') + msg),
  info: (msg) => console.log(pc.cyan('ℹ️  ') + msg),
  dim: (msg) => console.log(pc.dim(msg)),
  step: (i, n, msg) => console.log(pc.dim(`[${i}/${n}]`) + ' ' + msg),
};

// 자동 업데이트 알림 — 30분 throttle, 네트워크 실패 시 silent skip.
// 환경변수 MARKETING_AGENT_SKIP_UPDATE_CHECK=1 로 우회. CI 또는 재귀 spawn 시 도움.
export function checkForUpdates() {
  if (process.env.MARKETING_AGENT_SKIP_UPDATE_CHECK === '1') return;

  const cacheDir = resolve(ROOT, 'out');
  const cacheFile = resolve(cacheDir, '.update-check');
  const now = Date.now();
  const minIntervalMs = 30 * 60 * 1000;

  try {
    const last = parseInt(readFileSync(cacheFile, 'utf8'), 10);
    if (Number.isFinite(last) && (now - last) < minIntervalMs) return;
  } catch { /* no cache yet */ }

  const git = (args, opts = {}) =>
    spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', timeout: 5000, ...opts });

  // git repo 인지 먼저. zip 다운로드 사용자는 .git 없을 수 있음.
  if (git(['rev-parse', '--git-dir'], { stdio: 'ignore' }).status !== 0) return;

  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout?.trim() || 'main';
  const fetchRes = git(['fetch', 'origin', branch, '--quiet'], { stdio: 'ignore' });

  // 캐시는 fetch 시도 후 무조건 갱신 (네트워크 실패 시에도 30분간 retry 안 함).
  try { mkdirSync(cacheDir, { recursive: true }); writeFileSync(cacheFile, String(now)); } catch {}

  if (fetchRes.status !== 0) return; // offline / private auth 실패 등 silent

  const behindStr = git(['rev-list', '--count', `HEAD..origin/${branch}`]).stdout?.trim();
  const behind = parseInt(behindStr || '0', 10);
  if (!Number.isFinite(behind) || behind <= 0) return;

  const lastCommit = git(['log', `HEAD..origin/${branch}`, '--oneline', '-1']).stdout?.trim();
  console.log();
  console.log(pc.yellow('⚠️  ') + pc.bold(`marketing_agent: 새 버전 ${behind}개 commit 뒤처짐`));
  if (lastCommit) console.log(pc.dim(`   최신: ${lastCommit}`));
  console.log(pc.dim(`   업데이트:  ${pc.cyan(`git -C "${ROOT}" pull origin ${branch}`)}`));
  console.log(pc.dim(`             또는 Claude 안에서: /plugin update marketing_agent`));
  console.log();
}
