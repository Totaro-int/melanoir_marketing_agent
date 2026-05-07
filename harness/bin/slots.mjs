#!/usr/bin/env node
// 반복 실행을 위한 캠페인 슬롯 관리.
//   node bin/slots.mjs list [--json]
//   node bin/slots.mjs save <slug>                       # 단일 캠페인: brief.yaml 읽어 upsert
//   node bin/slots.mjs save-series --topic=... --channels=... \
//        --period=week|month --frequency=N [--time=09:00] [--titles="t1|t2"] \
//        [--slugs="s1,s2,..."] [--cadence=...] [--goal=...] [--keyMessage=...]
//   node bin/slots.mjs get <id>                          # JSON stdout
//   node bin/slots.mjs edit <id> --patch='<json>'        # 메타 부분 갱신
//   node bin/slots.mjs remove <id>

import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import pc from 'picocolors';
import { PATHS, readYaml, writeYaml, ui } from './_lib.mjs';

const SLOTS_PATH = resolve(PATHS.campaignsDir, '..', 'slots.yaml');
const MAX_SLOTS = 5;

const EDITABLE_FIELDS = new Set([
  'topic', 'channels', 'goal', 'cadence', 'keyMessage', 'contentPoints', 'angle',
  'period', 'frequency', 'time', 'titles', 'autoPublish',
]);

const [cmd, arg] = process.argv.slice(2);
if (!cmd) { usage(); process.exit(2); }

switch (cmd) {
  case 'list': {
    const slots = load();
    if (process.argv.includes('--json')) { console.log(JSON.stringify(slots)); break; }
    if (!slots.length) { ui.dim('(저장된 슬롯 없음)'); break; }
    console.log();
    console.log(pc.bold('  #  topic                           channels            형태       마지막 실행'));
    console.log(pc.dim('  ─' + '─'.repeat(82)));
    for (const [i, s] of slots.entries()) {
      const topic = s.topic.slice(0, 30).padEnd(30);
      const ch = (s.channels ?? []).join(',').slice(0, 18).padEnd(18);
      const kind = s.kind === 'series'
        ? `📅 ${s.frequency}/${s.period === 'month' ? '월' : '주'}`.padEnd(9)
        : '단일      ';
      const ago = relativeTime(s.lastRun);
      console.log(`  ${String(i + 1).padStart(1)}  ${topic}  ${ch}  ${kind}  ${pc.dim(ago)}`);
    }
    console.log();
    break;
  }
  case 'save': {
    if (!arg) { ui.err('slug 필요'); process.exit(2); }
    let brief;
    try {
      const { findCampaignDir } = await import('./_lib.mjs');
      brief = readYaml(resolve(findCampaignDir(arg), 'brief.yaml'));
    } catch (e) {
      ui.err(`brief 로드 실패: ${e.message}`);
      process.exit(1);
    }
    const slots = load();
    const entry = {
      topic: brief.topic,
      channels: brief.channels,
      goal: brief.goal,
      cadence: brief.cadence,
      keyMessage: brief.keyMessage ?? null,
      contentPoints: brief.contentPoints?.length ? brief.contentPoints : null,
      angle: brief.angle ?? null,
      lastSlug: arg,
      lastRun: new Date().toISOString(),
      runCount: 1,
    };
    upsertByTopic(slots, entry);
    saveSlots(slots);
    ui.ok(`슬롯 저장: "${brief.topic}"`);
    break;
  }
  case 'save-series': {
    const flags = parseFlags(process.argv.slice(3));
    if (!flags.topic || !flags.channels || !flags.period || !flags.frequency) {
      ui.err('사용법: save-series --topic="..." --channels=ch1,ch2 --period=week|month --frequency=N');
      process.exit(2);
    }
    const slots = load();
    const entry = {
      kind: 'series',
      topic: String(flags.topic),
      channels: String(flags.channels).split(',').map((s) => s.trim()).filter(Boolean),
      goal: flags.goal ?? 'awareness',
      cadence: flags.cadence ?? 'single',
      keyMessage: flags.keyMessage ?? null,
      contentPoints: flags.contentPoints
        ? String(flags.contentPoints).split('|').map((s) => s.trim()).filter(Boolean)
        : null,
      angle: flags.angle ?? null,
      period: String(flags.period),
      frequency: parseInt(flags.frequency, 10) || 1,
      time: flags.time ?? '09:00',
      titles: flags.titles
        ? String(flags.titles).split('|').map((s) => s.trim()).filter(Boolean)
        : null,
      autoPublish: flags['no-auto-publish'] ? false : true,
      lastSlugs: flags.slugs
        ? String(flags.slugs).split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      lastRun: new Date().toISOString(),
      runCount: 1,
    };
    upsertByTopic(slots, entry);
    saveSlots(slots);
    ui.ok(`시리즈 슬롯 저장: "${entry.topic}" (${entry.frequency}회/${entry.period})`);
    break;
  }
  case 'get': {
    const id = parseInt(arg, 10);
    if (!Number.isFinite(id) || id < 1) { ui.err('1 이상의 번호 필요'); process.exit(2); }
    const slots = load();
    const slot = slots[id - 1];
    if (!slot) { ui.err(`슬롯 #${id} 없음`); process.exit(1); }
    console.log(JSON.stringify(slot));
    break;
  }
  case 'edit': {
    const id = parseInt(arg, 10);
    if (!Number.isFinite(id) || id < 1) { ui.err('1 이상의 번호 필요'); process.exit(2); }
    const flags = parseFlags(process.argv.slice(3));
    if (!flags.patch) { ui.err('--patch=\'<json>\' 필요'); process.exit(2); }
    let patch;
    try { patch = JSON.parse(flags.patch); }
    catch (e) { ui.err(`patch JSON 파싱 실패: ${e.message}`); process.exit(2); }
    const slots = load();
    const slot = slots[id - 1];
    if (!slot) { ui.err(`슬롯 #${id} 없음`); process.exit(1); }
    const applied = [];
    for (const [k, v] of Object.entries(patch)) {
      if (!EDITABLE_FIELDS.has(k)) continue;
      slot[k] = v;
      applied.push(k);
    }
    if (!applied.length) { ui.err('편집 가능한 필드가 patch에 없음'); process.exit(2); }
    slot.updatedAt = new Date().toISOString();
    saveSlots(slots);
    ui.ok(`슬롯 #${id} 수정: ${applied.join(', ')}`);
    break;
  }
  case 'remove': {
    const id = parseInt(arg, 10);
    if (!Number.isFinite(id) || id < 1) { ui.err('1 이상의 번호 필요'); process.exit(2); }
    const slots = load();
    if (!slots[id - 1]) { ui.err(`슬롯 #${id} 없음`); process.exit(1); }
    const removed = slots.splice(id - 1, 1)[0];
    saveSlots(slots);
    ui.ok(`슬롯 삭제: "${removed.topic}"`);
    break;
  }
  default:
    usage(); process.exit(2);
}

function load() {
  if (!existsSync(SLOTS_PATH)) return [];
  try {
    const data = readYaml(SLOTS_PATH);
    return Array.isArray(data?.slots) ? data.slots : [];
  } catch { return []; }
}

function saveSlots(slots) {
  mkdirSync(resolve(SLOTS_PATH, '..'), { recursive: true });
  writeYaml(SLOTS_PATH, { version: 1, slots });
}

function upsertByTopic(slots, entry) {
  const key = normalise(entry.topic);
  const idx = slots.findIndex((s) => normalise(s.topic) === key);
  if (idx >= 0) {
    entry.runCount = (slots[idx].runCount ?? 1) + 1;
    slots[idx] = entry;
  } else {
    slots.unshift(entry);
    if (slots.length > MAX_SLOTS) slots.splice(MAX_SLOTS);
  }
}

function normalise(s) { return (s ?? '').trim().toLowerCase(); }

function relativeTime(iso) {
  if (!iso) return '알 수 없음';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

function parseFlags(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > -1) out[a.slice(2, eq)] = a.slice(eq + 1);
    else {
      const next = args[i + 1];
      if (next && !next.startsWith('--')) { out[a.slice(2)] = next; i++; }
      else out[a.slice(2)] = true;
    }
  }
  return out;
}

function usage() {
  console.log('사용법:');
  console.log('  slots.mjs list [--json]');
  console.log('  slots.mjs save <slug>');
  console.log('  slots.mjs save-series --topic="..." --channels=... --period=week|month --frequency=N [...]');
  console.log('  slots.mjs get <id>');
  console.log('  slots.mjs edit <id> --patch=\'<json>\'');
  console.log('  slots.mjs remove <id>');
}
