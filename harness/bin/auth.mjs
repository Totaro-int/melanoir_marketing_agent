#!/usr/bin/env node
// Manage local SNS credentials at auth/<channel>.json (gitignored, mode 0600).
//   node bin/auth.mjs list
//   node bin/auth.mjs add <channel>             # reads JSON from stdin
//   node bin/auth.mjs show <channel>            # masked
//   node bin/auth.mjs check <channel>           # adapter healthcheck
//   node bin/auth.mjs remove <channel>

import { ui } from './_lib.mjs';
import { load, save, list, remove } from '../src/publisher/credentials.mjs';
import { getAdapter } from '../src/publisher/registry.mjs';

const [cmd, channel] = process.argv.slice(2);

if (!cmd) { usage(); process.exit(2); }

switch (cmd) {
  case 'list': {
    const items = list();
    if (!items.length) ui.dim('(저장된 자격증명 없음)');
    else for (const id of items) console.log(`  · ${id}`);
    break;
  }
  case 'add': {
    if (!channel) { ui.err('channel 필요'); process.exit(2); }
    const json = await readStdin();
    if (!json.trim()) { ui.err('stdin 비어있음 — JSON을 파이프로 넘겨주세요'); process.exit(2); }
    let payload;
    try { payload = JSON.parse(json); } catch (e) { ui.err('JSON 파싱 실패: ' + e.message); process.exit(2); }
    const path = save(channel, payload);
    ui.ok(`저장: ${path}  (mode 0600, .gitignore 포함)`);
    break;
  }
  case 'show': {
    if (!channel) { ui.err('channel 필요'); process.exit(2); }
    const c = load(channel);
    if (!c) { ui.err(`auth/${channel}.json 없음`); process.exit(1); }
    console.log(JSON.stringify(masked(c), null, 2));
    break;
  }
  case 'check': {
    if (!channel) { ui.err('channel 필요'); process.exit(2); }
    const c = load(channel);
    const adapter = getAdapter(channel);
    const hc = await adapter.healthcheck(c);
    console.log(JSON.stringify(hc, null, 2));
    if (!hc.ok) process.exit(1);
    break;
  }
  case 'remove': {
    if (!channel) { ui.err('channel 필요'); process.exit(2); }
    remove(channel);
    ui.ok(`삭제: auth/${channel}.json`);
    break;
  }
  default:
    usage(); process.exit(2);
}

function usage() {
  console.log('사용법: auth.mjs <list|add|show|check|remove> [channel]');
  console.log('  add  은 stdin 으로 JSON 을 받습니다. 예:');
  console.log('    echo \'{"accessToken":"...","userId":"..."}\' | node bin/auth.mjs add threads');
}

function masked(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && /token|secret|key/i.test(k) && v.length > 8) {
      out[k] = v.slice(0, 4) + '…' + v.slice(-2) + ` (len ${v.length})`;
    } else out[k] = v;
  }
  return out;
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}
