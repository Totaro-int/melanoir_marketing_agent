#!/usr/bin/env node
// Card quality evaluator — creates evalSpec.json for the card-evaluator agent.
//   node bin/evaluate.mjs <slug> [--channel=threads]
//   Reads: latest draft yaml + slide-spec.json
//   Writes: posts/campaigns/<slug>/<ch>/evalSpec.json

import { resolve } from 'node:path';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { readYaml, findCampaignDir, latestDraftYaml, nowKstIso, ui } from './_lib.mjs';

const argv = process.argv.slice(2);
const slug = argv.find((a) => !a.startsWith('--'));
const flags = Object.fromEntries(
  argv.filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

if (!slug) { ui.err('사용법: evaluate.mjs <slug> [--channel=...]'); process.exit(2); }

let dir, brief;
try {
  dir   = findCampaignDir(slug);
  brief = readYaml(resolve(dir, 'brief.yaml'));
} catch (e) {
  ui.err(e.message); process.exit(2);
}
if (!brief.channels?.length) { ui.err('[brief.yaml] channels 필드 없음'); process.exit(2); }

const channels = flags.channel ? [flags.channel] : brief.channels;

let allGood = true;

for (const ch of channels) {
  const channelDir  = resolve(dir, ch);
  const draftPath   = latestDraftYaml(channelDir);
  const specPath    = resolve(channelDir, 'slide-spec.json');

  if (!draftPath) { ui.warn(`[${ch}] draft 없음 — generate.mjs 를 먼저 실행하세요.`); allGood = false; continue; }
  if (!existsSync(specPath)) { ui.warn(`[${ch}] slide-spec.json 없음.`); allGood = false; continue; }

  let draft, spec;
  try {
    draft = readYaml(draftPath);
    spec  = JSON.parse(readFileSync(specPath, 'utf8'));
  } catch (e) {
    ui.warn(`[${ch}] 파일 파싱 실패 — ${e.message}`); allGood = false; continue;
  }

  // draft.assets = PNG 경로 배열 (card1, card2, card3 순)
  const assets    = draft.assets ?? [];
  const draftCards = draft.cards ?? [{ role: 'single', text: draft.text }];

  const evalCards = (spec.cards ?? []).map((c) => {
    const idx     = c.index - 1; // 0-based array index derived from card.index (1-based)
    const raw     = assets[idx] ? resolve(assets[idx]) : null;
    const pngPath = raw?.startsWith(dir + '/') ? raw : null;
    const text    = draftCards[idx]?.text ?? draft.text ?? '';
    if (!text) ui.warn(`[${ch}] card${c.index} postCopy 없음 — copyVisual 채점이 부정확할 수 있습니다.`);
    return { index: c.index, role: c.role, pngPath, postCopy: text };
  }).filter((c) => c.pngPath && existsSync(c.pngPath));

  if (evalCards.length === 0) {
    ui.warn(`[${ch}] PNG 없음 — generate.mjs --finalize 를 먼저 실행하세요.`);
    allGood = false;
    continue;
  }

  const evalSpecPath = resolve(channelDir, 'evalSpec.json');
  const evalOutPath  = resolve(channelDir, 'eval.json');

  const evalSpec = {
    slug,
    channel:   ch,
    ts:        spec.ts,
    createdAt: nowKstIso(),
    passThreshold: 7,
    designRef: spec.imageContext?.designRef?.brand ?? null,
    brandColors: spec.imageContext?.visual?.colors ?? {},
    cards:     evalCards,
    outputPath: evalOutPath,
  };

  writeFileSync(evalSpecPath, JSON.stringify(evalSpec, null, 2), 'utf8');
  ui.ok(`[${ch}] evalSpec.json → ${evalSpecPath}`);
  ui.dim(`  평가 카드: ${evalCards.length}장  |  합격 기준: ${evalSpec.passThreshold}/10`);
  console.log();
  console.log(`  ➜ card-evaluator 에이전트를 인라인으로 실행하세요:`);
  console.log(`    harness/agents/card-evaluator.md 를 읽고 ${evalSpecPath} 를 처리`);
  console.log();
}

process.exit(allGood ? 0 : 1);
