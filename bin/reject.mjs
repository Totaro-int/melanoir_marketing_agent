#!/usr/bin/env node
// Reject a channel draft and (optionally) record the reason for re-generation.
//   node bin/reject.mjs <slug> --channel=<ch> [--reason="짧음, 1줄 더 살려줘"]

import { resolve } from 'node:path';
import { readYaml, writeYaml, findCampaignDir, nowKstIso, ui } from './_lib.mjs';

const argv = process.argv.slice(2);
const slug = argv.find((a) => !a.startsWith('--'));
const channel = argv.find((a) => a.startsWith('--channel='))?.split('=')[1];
const reason = argv.find((a) => a.startsWith('--reason='))?.split('=').slice(1).join('=');

if (!slug || !channel) { ui.err('사용법: reject.mjs <slug> --channel=<ch> [--reason="..."]'); process.exit(2); }

const dir = findCampaignDir(slug);
const briefPath = resolve(dir, 'brief.yaml');
const brief = readYaml(briefPath);

brief.status[channel] = 'drafting';
brief.meta = { ...(brief.meta ?? {}), updatedAt: nowKstIso() };
brief.feedback = brief.feedback ?? {};
brief.feedback[channel] = (brief.feedback[channel] ?? []).concat([{ at: nowKstIso(), reason: reason ?? '(이유 없음)' }]);
writeYaml(briefPath, brief);

ui.ok(`[${channel}] rejected. 피드백 기록됨.`);
ui.dim(`재생성: node bin/generate.mjs ${slug} --channel=${channel}`);
