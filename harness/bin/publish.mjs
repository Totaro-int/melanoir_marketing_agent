#!/usr/bin/env node
// Publish an approved draft to its channel.
//   node bin/publish.mjs <slug> --channel=<ch> [--dry-run]
//
// Default safety: if PUBLISHER_DRY_RUN ∈ {1,true,yes} OR --dry-run is passed, no network call is made.
// Even without dry-run, refuses to publish unless brief.status[<ch>] === 'approved'.

import { resolve } from 'node:path';
import { readYaml, writeYaml, findCampaignDir, latestDraftYaml, nowKstIso, ui } from './_lib.mjs';
import { getAdapter, isDryRun } from '../src/publisher/registry.mjs';
import { load as loadCreds } from '../src/publisher/credentials.mjs';

const argv = process.argv.slice(2);
const slug = argv.find((a) => !a.startsWith('--'));
const channel = argv.find((a) => a.startsWith('--channel='))?.split('=')[1];
const flagDryRun = argv.includes('--dry-run');

if (!slug || !channel) { ui.err('사용법: publish.mjs <slug> --channel=<ch> [--dry-run]'); process.exit(2); }

const dir = findCampaignDir(slug);
const briefPath = resolve(dir, 'brief.yaml');
const brief = readYaml(briefPath);
const draftPath = latestDraftYaml(resolve(dir, channel));

if (!draftPath) { ui.err(`draft 없음: ${resolve(dir, channel)}/`); process.exit(2); }
const draft = readYaml(draftPath);

if (brief.status[channel] !== 'approved') {
  ui.err(`status가 approved 아님: ${brief.status[channel]} — /sns-approve 먼저`);
  process.exit(1);
}

const { dry, source } = isDryRun({ flagDryRun });
const adapter = getAdapter(channel);
const credentials = loadCreds(channel);

if (dry) {
  ui.warn(`DRY RUN (source: ${source}) — 실제 호출 없음 (auth/${channel}.json: ${credentials ? '있음' : '없음'})`);
  const payload = adapter.buildPayload({ draft });
  console.log();
  console.log(JSON.stringify(payload, null, 2));
  console.log();
  saveResult(dir, channel, brief, briefPath, {
    ok: true,
    dryRun: true,
    externalId: null,
    url: null,
    payload,
    publishedAt: nowKstIso(),
  }, /* failed */ false, /* dry */ true);
  ui.ok(`[${channel}] dry-run 완료 — result.json 저장됨 (status 유지: approved)`);
  process.exit(0);
}

if (!credentials) {
  ui.err(`auth/${channel}.json 없음 — node bin/auth.mjs add ${channel}  먼저`);
  process.exit(2);
}

const hc = await adapter.healthcheck(credentials);
if (!hc.ok) { ui.err(`자격증명 헬스체크 실패: ${hc.reason}`); process.exit(1); }

try {
  const result = await adapter.publish({ draft, credentials });
  saveResult(dir, channel, brief, briefPath, {
    ...result,
    dryRun: false,
    publishedAt: nowKstIso(),
  });
  ui.ok(`[${channel}] 발행 완료${result.url ? ' → ' + result.url : ''}`);
} catch (e) {
  ui.err(`[${channel}] 발행 실패: ${e.message}`);
  saveResult(dir, channel, brief, briefPath, {
    ok: false,
    error: e.message,
    response: e.response ?? null,
    publishedAt: nowKstIso(),
  }, /* failed */ true);
  process.exit(1);
}

function saveResult(dir, channel, brief, briefPath, result, failed = false, dry = false) {
  writeYaml(resolve(dir, channel, 'result.json'), result);
  if (!dry) brief.status[channel] = failed ? 'failed' : 'published';
  brief.meta = { ...(brief.meta ?? {}), updatedAt: nowKstIso() };
  writeYaml(briefPath, brief);
}
