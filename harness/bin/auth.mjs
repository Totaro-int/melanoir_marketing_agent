#!/usr/bin/env node
// Manage local SNS credentials at auth/<channel>.json (gitignored, mode 0600).
//   node bin/auth.mjs list
//   node bin/auth.mjs add <channel>             # reads JSON from stdin
//   node bin/auth.mjs show <channel>            # masked
//   node bin/auth.mjs check <channel>           # adapter healthcheck
//   node bin/auth.mjs remove <channel>

import { ui, promptLine } from './_lib.mjs';
import { load, save, list, remove } from '../src/publisher/credentials.mjs';
import { getAdapter, knownChannels } from '../src/publisher/registry.mjs';
import { AUTH_SCHEMAS, setPath } from '../src/publisher/auth-schemas.mjs';

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
    if (!knownChannels().includes(channel)) {
      ui.err(`알 수 없는 채널: ${channel}. 사용 가능: ${knownChannels().join(', ')}`);
      process.exit(2);
    }
    let payload;
    if (process.stdin.isTTY) {
      payload = await interactiveAdd(channel);
    } else {
      const json = await readStdin();
      if (!json.trim()) { ui.err('stdin 비어있음 — JSON을 파이프로 넘겨주세요'); process.exit(2); }
      try { payload = JSON.parse(json); } catch (e) { ui.err('JSON 파싱 실패: ' + e.message); process.exit(2); }
    }
    const path = save(channel, payload);
    ui.ok(`저장: ${path}  (mode 0600, .gitignore 포함)`);
    // 저장 직후 healthcheck 제안
    if (process.stdin.isTTY) {
      const adapter = getAdapter(channel);
      const hc = await adapter.healthcheck(load(channel));
      if (hc.ok) ui.ok(`[${channel}] healthcheck 통과`);
      else ui.warn(`[${channel}] healthcheck 실패: ${hc.reason} — 자격증명을 확인하세요`);
    }
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
  console.log('  add  은 TTY 에서 대화형으로 필드를 입력, 파이프 사용 시 JSON stdin. 예:');
  console.log('    node bin/auth.mjs add threads                              # 대화형');
  console.log('    echo \'{"accessToken":"...","userId":"..."}\' | node bin/auth.mjs add threads  # 파이프');
}

async function interactiveAdd(channel) {
  const schema = AUTH_SCHEMAS[channel];
  if (!schema) {
    ui.warn(`${channel} 의 대화형 스키마 없음 — JSON stdin 모드로 전환`);
    ui.warn(`echo '{"key":"value"}' | node bin/auth.mjs add ${channel}`);
    process.exit(2);
  }
  console.log();
  ui.info(`[${channel}] 자격증명 대화형 입력`);
  if (schema.note) ui.warn(schema.note);
  console.log();

  const payload = {};
  for (const field of schema.fields) {
    const value = await promptLine(field.label, {
      secret: field.secret ?? false,
      optional: field.optional ?? false,
      hint: field.hint,
    });
    if (value !== '') setPath(payload, field.key, value);
  }
  console.log();
  return payload;
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
