#!/usr/bin/env node
// Learn user preferences from approved/rejected campaign drafts.
// approve.mjs / reject.mjs 가 자동 호출. 수동 실행도 가능 (모든 approved 캠페인 일괄 학습).
//
// Usage:
//   node bin/learn.mjs approve <slug> --channel=<ch>
//   node bin/learn.mjs reject  <slug> --channel=<ch> [--reason="..."]
//   node bin/learn.mjs show                              # 현재 학습 상태 출력
//   node bin/learn.mjs rebuild                           # preferences.yaml 재생성 (모든 approved 채널 재학습)
//   node bin/learn.mjs reset                             # 빈 상태로 초기화

import { resolve } from 'node:path';
import { existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { PATHS, readYaml, findCampaignDir, ui } from './_lib.mjs';
import {
  PREFS_PATH, emptyPrefs, loadPrefs, savePrefs,
  readChannelText, extractSignals, applyApproval, applyRejection, renderGuide,
} from '../src/preferences.mjs';

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd) { usage(); process.exit(2); }

switch (cmd) {
  case 'approve': await learnApprove(rest); break;
  case 'reject':  await learnReject(rest); break;
  case 'show':    showPrefs(rest); break;
  case 'rebuild': await rebuild(); break;
  case 'reset':   resetPrefs(); break;
  default: usage(); process.exit(2);
}

async function learnApprove(args) {
  const { slug, channel } = parseSlugChannel(args);
  const dir = findCampaignDir(slug);
  const brief = readYaml(resolve(dir, 'brief.yaml'));
  const text = readChannelText(resolve(dir, channel));
  if (!text) { ui.warn(`[learn] ${channel} 본문 없음 — 학습 skip`); return; }

  const signals = extractSignals(text);
  const prefs = loadPrefs();
  applyApproval(prefs, channel, signals, brief);
  savePrefs(prefs);

  ui.ok(`[learn] approve 누적 — sampleCount=${prefs.sampleCount}, ${channel} ${signals.length}자`);
}

async function learnReject(args) {
  const { slug, channel } = parseSlugChannel(args);
  const reason = args.find((a) => a.startsWith('--reason='))?.split('=').slice(1).join('=');
  const prefs = loadPrefs();
  applyRejection(prefs, channel, reason || null);
  savePrefs(prefs);
  ui.ok(`[learn] reject 누적 — ${channel} 누적 거절 ${prefs.channels[channel]?.rejected ?? 0}회`);
}

function showPrefs(args) {
  const channel = args.find((a) => a.startsWith('--channel='))?.split('=')[1];
  if (!existsSync(PREFS_PATH)) { ui.dim('(학습 데이터 없음)'); return; }
  const prefs = loadPrefs();
  const guide = renderGuide(prefs, { channel });
  if (!guide) { ui.dim('(학습 데이터 없음)'); return; }
  console.log();
  console.log(guide);
  console.log();
  if (channel) ui.dim(`(${channel} 채널 기준)`);
  ui.dim(`파일: ${PREFS_PATH}`);
}

async function rebuild() {
  ui.info('[learn] 모든 approved 캠페인에서 다시 학습합니다...');
  const fresh = emptyPrefs();
  let learned = 0;
  for (const name of readdirSync(PATHS.campaignsDir)) {
    const dir = resolve(PATHS.campaignsDir, name);
    if (!safeIsDir(dir)) continue;
    const briefPath = resolve(dir, 'brief.yaml');
    if (!existsSync(briefPath)) continue;
    let brief;
    try { brief = readYaml(briefPath); } catch { continue; }
    const status = brief?.status ?? {};
    for (const [channel, st] of Object.entries(status)) {
      if (st !== 'approved' && st !== 'published') continue;
      const text = readChannelText(resolve(dir, channel));
      if (!text) continue;
      applyApproval(fresh, channel, extractSignals(text), brief);
      learned++;
    }
    // 거절 이력
    for (const [channel, list] of Object.entries(brief?.feedback ?? {})) {
      if (!Array.isArray(list)) continue;
      for (const r of list) applyRejection(fresh, channel, r?.reason ?? null);
    }
  }
  savePrefs(fresh);
  ui.ok(`[learn] rebuild 완료 — 학습 샘플 ${learned}건, 누적 ${fresh.sampleCount}건`);
}

function resetPrefs() {
  if (existsSync(PREFS_PATH)) { try { unlinkSync(PREFS_PATH); } catch {} }
  ui.ok('[learn] 학습 데이터 초기화됨');
}

function parseSlugChannel(args) {
  const slug = args.find((a) => !a.startsWith('--'));
  const channel = args.find((a) => a.startsWith('--channel='))?.split('=')[1];
  if (!slug || !channel) {
    ui.err('사용법: learn.mjs approve|reject <slug> --channel=<ch>');
    process.exit(2);
  }
  return { slug, channel };
}

function safeIsDir(p) { try { return statSync(p).isDirectory(); } catch { return false; } }

function usage() {
  console.log('사용법:');
  console.log('  learn.mjs approve <slug> --channel=<ch>');
  console.log('  learn.mjs reject  <slug> --channel=<ch> [--reason="..."]');
  console.log('  learn.mjs show [--channel=<ch>]');
  console.log('  learn.mjs rebuild');
  console.log('  learn.mjs reset');
}
