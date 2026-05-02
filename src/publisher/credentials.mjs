// Credential storage for Publisher.
// Stores per-channel tokens at auth/<channel>.json (gitignored, file mode 0600).
// No keychain dependency — keep it boring and inspectable. Move to keychain in Phase 6 if needed.

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, rmSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('.', import.meta.url).pathname, '../..');
const AUTH_DIR = resolve(ROOT, 'auth');

function pathFor(channel) {
  if (!/^[a-z0-9_-]+$/i.test(channel)) throw new Error(`invalid channel id: ${channel}`);
  return resolve(AUTH_DIR, `${channel}.json`);
}

export function load(channel) {
  const p = pathFor(channel);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

export function save(channel, payload) {
  mkdirSync(AUTH_DIR, { recursive: true });
  const p = pathFor(channel);
  writeFileSync(p, JSON.stringify(payload, null, 2), 'utf8');
  try { chmodSync(p, 0o600); } catch {}
  return p;
}

export function remove(channel) {
  const p = pathFor(channel);
  if (existsSync(p)) rmSync(p);
}

export function list() {
  if (!existsSync(AUTH_DIR)) return [];
  return readdirSync(AUTH_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
}
