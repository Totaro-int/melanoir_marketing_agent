// Shared helpers for marketing_ai CLI scripts.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  pluginManifest:      resolve(ROOT, 'plugin.json'),
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
  const manifest = loadJson(PATHS.pluginManifest);
  return manifest.channels ?? [];
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
  return text
    .normalize('NFKC')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/-+/g, '-')
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
