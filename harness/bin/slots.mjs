#!/usr/bin/env node
// 반복 실행을 위한 캠페인 슬롯 관리.
//   node bin/slots.mjs list [--json]
//   node bin/slots.mjs save <slug>      # brief.yaml 읽어 upsert (최대 5개)
//   node bin/slots.mjs get <id>         # JSON stdout
//   node bin/slots.mjs remove <id>

import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import pc from 'picocolors';
import { PATHS, readYaml, writeYaml, ui } from './_lib.mjs';

const SLOTS_PATH = resolve(PATHS.campaignsDir, '..', 'slots.yaml');
const MAX_SLOTS = 5;

const [cmd, arg] = process.argv.slice(2);
if (!cmd) { usage(); process.exit(2); }

switch (cmd) {
  case 'list': {
    const slots = load();
    if (process.argv.includes('--json')) { console.log(JSON.stringify(slots)); break; }
    if (!slots.length) { ui.dim('(저장된 슬롯 없음)'); break; }
    console.log();
    console.log(pc.bold('  #  topic                           channels            마지막 실행'));
    console.log(pc.dim('  ─' + '─'.repeat(72)));
    for (const [i, s] of slots.entries()) {
      const topic = s.topic.slice(0, 30).padEnd(30);
      const ch = (s.channels ?? []).join(',').slice(0, 18).padEnd(18);
      const ago = relativeTime(s.lastRun);
      console.log(`  ${String(i + 1).padStart(1)}  ${topic}  ${ch}  ${pc.dim(ago)}`);
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
      contentPoints: brief.contentPoints?.length ? brief.contentPoints : [],
      angle: brief.angle ?? null,
      lastSlug: arg,
      lastRun: new Date().toISOString(),
      runCount: 1,
    };
    // 동일 topic 있으면 갱신 (소문자 trim 기준)
    const key = normalise(brief.topic);
    const idx = slots.findIndex((s) => normalise(s.topic) === key);
    if (idx >= 0) {
      entry.runCount = (slots[idx].runCount ?? 1) + 1;
      slots[idx] = entry;
    } else {
      slots.unshift(entry);
      if (slots.length > MAX_SLOTS) slots.splice(MAX_SLOTS);
    }
    saveSlots(slots);
    ui.ok(`슬롯 저장: "${brief.topic}"`);
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

function usage() {
  console.log('사용법: slots.mjs <list|save|get|remove> [arg] [--json]');
}
