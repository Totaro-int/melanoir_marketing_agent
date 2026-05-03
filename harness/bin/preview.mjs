#!/usr/bin/env node
// Pretty-print the latest draft for a campaign (one or all channels).
//   node bin/preview.mjs <slug> [--channel=threads]

import pc from 'picocolors';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { readYaml, findCampaignDir, latestDraftYaml, ui } from './_lib.mjs';

const argv = process.argv.slice(2);
const slug = argv.find((a) => !a.startsWith('--'));
const channelFlag = argv.find((a) => a.startsWith('--channel='))?.split('=')[1];

if (!slug) { ui.err('사용법: preview.mjs <slug> [--channel=...]'); process.exit(2); }

const dir = findCampaignDir(slug);
const brief = readYaml(resolve(dir, 'brief.yaml'));
const channels = channelFlag ? [channelFlag] : brief.channels;

console.log();
console.log(pc.bold(pc.cyan(`📣 ${slug}`)));
console.log(pc.dim(`  ${brief.topic} · goal: ${brief.goal} · cadence: ${brief.cadence}`));
console.log();

for (const ch of channels) {
  const path = latestDraftYaml(resolve(dir, ch));
  if (!path) {
    ui.warn(`[${ch}] draft 없음 — node bin/generate.mjs ${slug} --channel=${ch}`);
    continue;
  }
  const d = readYaml(path);
  const status = brief.status?.[ch] ?? 'unknown';
  const sevColor = d.guardian.severity === 'block' ? pc.red : d.guardian.severity === 'warn' ? pc.yellow : pc.green;

  console.log(pc.bold(`── ${ch} `) + pc.dim(`(${status})`) + pc.bold(' ' + '─'.repeat(Math.max(0, 60 - ch.length - status.length))));
  console.log();
  console.log(d.text);
  console.log();
  console.log(pc.dim(`assets: ${d.assets.join(', ') || '(none)'}`));
  console.log(sevColor(`guardian: ${d.guardian.severity}  ·  blocks ${d.guardian.summary.blocks} · warns ${d.guardian.summary.warns}`));
  for (const f of d.guardian.findings) {
    const c = f.severity === 'block' ? pc.red : f.severity === 'warn' ? pc.yellow : pc.dim;
    console.log('  ' + c(`${f.severity} ${f.code}${f.detail ? ' — ' + f.detail : ''}`));
  }
  console.log();
}

ui.dim(`승인:  /sns-approve ${slug} --channel=<ch>`);
ui.dim(`거절:  /sns-reject  ${slug} --channel=<ch> [--reason="..."]`);
