// Shared helpers for marketing_ai CLI scripts.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import pc from 'picocolors';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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
  schema: resolve(ROOT, 'schemas/company-profile.schema.yaml'),
  campaignBriefSchema: resolve(ROOT, 'schemas/campaign-brief.schema.yaml'),
  profile: resolve(ROOT, 'company-profile.yaml'),
  example: resolve(ROOT, 'examples/company-profile.example.yaml'),
  campaignsDir: resolve(ROOT, 'campaigns'),
  channelsDir: resolve(ROOT, 'channels'),
  pluginManifest: resolve(ROOT, 'plugin.json'),
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
