#!/usr/bin/env node
// Approve a channel draft for publishing.
//   node bin/approve.mjs <slug> --channel=<ch>

import { resolve } from 'node:path';
import { readYaml, writeYaml, findCampaignDir, latestDraftYaml, nowKstIso, ui } from './_lib.mjs';

const argv = process.argv.slice(2);
const slug = argv.find((a) => !a.startsWith('--'));
const channel = argv.find((a) => a.startsWith('--channel='))?.split('=')[1];

if (!slug || !channel) {
  ui.err('사용법: approve.mjs <slug> --channel=<ch>');
  process.exit(2);
}

const dir = findCampaignDir(slug);
const briefPath = resolve(dir, 'brief.yaml');
const brief = readYaml(briefPath);
const draftPath = latestDraftYaml(resolve(dir, channel));

if (!draftPath) { ui.err(`draft 없음: ${resolve(dir, channel)}/`); process.exit(2); }
const draft = readYaml(draftPath);
if (!draft.guardian.ok) {
  ui.err(`가디언 차단됨 (${draft.guardian.summary.blocks}건). 재생성 필요.`);
  process.exit(1);
}
if (brief.status[channel] !== 'preview') {
  ui.warn(`현재 상태가 preview 아님: ${brief.status[channel]} — 그래도 승인합니다.`);
}

brief.status[channel] = 'approved';
brief.meta = { ...(brief.meta ?? {}), updatedAt: nowKstIso() };
writeYaml(briefPath, brief);
ui.ok(`[${channel}] approved.  다음: /sns-publish ${slug} --channel=${channel}  (Phase 4)`);
