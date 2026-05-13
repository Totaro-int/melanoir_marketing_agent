#!/usr/bin/env node
// Generate copy + card image for one or more channels of a campaign.
//   node bin/generate.mjs <slug> [--channel=threads] [--provider=mock]
//   node bin/generate.mjs <slug> --all   # all channels in brief
//   node bin/generate.mjs <slug> --channel=threads --card=2   # 시리즈 2번 카드만 재생성

import { resolve } from 'node:path';
import {
  PATHS, readYaml, findCampaignDir, ui,
} from './_lib.mjs';
import { getProvider } from '../src/content-engine/registry.mjs';
import { validateChannels } from '../src/publisher/registry.mjs';
import { writeInhouseSpecs, writeCopySpecs } from './generate-spec.mjs';
import {
  finalizeRegularChannels, finalizeInhouseSlides,
  selectVariant, injectRegenFeedback,
} from './generate-finalize.mjs';

const argv = process.argv.slice(2);
const slug = argv.find((a) => !a.startsWith('--'));
const flags = Object.fromEntries(
  argv.filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

if (!slug) {
  ui.err('사용법: generate.mjs <slug> [--channel=...] [--provider=...] [--all]');
  process.exit(2);
}

// --card=<n> : 시리즈에서 n번째 카드(1-based)만 재생성. --channel= 단일 채널 강제.
const cardN = flags.card ? parseInt(flags.card, 10) : null;
if (cardN !== null && isNaN(cardN)) {
  ui.err('--card 값이 유효하지 않습니다. 예: --card=2');
  process.exit(2);
}
if (cardN !== null && flags.all) {
  ui.err('--card 와 --all 은 함께 사용할 수 없습니다.');
  process.exit(2);
}
if (cardN !== null && !flags.channel) {
  ui.err('--card 사용 시 --channel= 을 반드시 지정해야 합니다.');
  process.exit(2);
}

const dir = findCampaignDir(slug);
const briefPath = resolve(dir, 'brief.yaml');
const brief = readYaml(briefPath);
const profile = readYaml(PATHS.profile);

const channels = flags.all
  ? brief.channels
  : (flags.channel ? [flags.channel] : brief.channels);

// --channel= 으로 직접 지정한 경우만 검증 (brief 의 채널은 campaign-new 에서 이미 검증됨).
if (flags.channel) {
  const { unknown } = validateChannels(channels);
  if (unknown.length) {
    ui.err(`등록되지 않은 채널: ${unknown.join(', ')}`);
    process.exit(2);
  }
  const notInBrief = channels.filter((c) => !brief.channels.includes(c));
  if (notInBrief.length) {
    ui.warn(`brief 에 없는 채널: ${notInBrief.join(', ')} (brief.channels: ${brief.channels.join(', ')})`);
  }
}

const provider = getProvider(flags.provider);
const withImages =
  flags['with-images'] === true || flags['with-images'] === 'true' ||
  (process.env.SLIDE_IMAGES ?? '').toLowerCase() === 'true';

// ── 라우팅 ──────────────────────────────────────────────────────────────────

// F: --regen — eval.json 피드백을 slide-spec에 주입 (image-director 재실행 전에)
if (flags.regen) {
  await injectRegenFeedback({ slug, dir, brief, channels });
  process.exit(0);
}

// C: --select-variant=N — 선택된 hook 변형을 canonical card1 슬롯에 적용
if (flags['select-variant']) {
  const variantIdx = parseInt(flags['select-variant'], 10);
  if (isNaN(variantIdx) || variantIdx < 1) {
    ui.err('--select-variant 값이 유효하지 않습니다. 예: --select-variant=2');
    process.exit(2);
  }
  if (!flags.channel) {
    ui.err('--select-variant 사용 시 --channel= 을 반드시 지정해야 합니다.');
    process.exit(2);
  }
  await selectVariant({ slug, dir, briefPath, brief, profile, channel: flags.channel, variantIdx });
  process.exit(0);
}

if (flags.finalize) {
  if (provider.id === 'inhouse-slides') {
    await finalizeInhouseSlides({ slug, dir, briefPath, brief, profile, channels });
  } else {
    await finalizeRegularChannels({ slug, dir, briefPath, brief, profile, channels, provider, flags });
  }
  process.exit(0);
}

if (provider.id === 'inhouse-slides') {
  if (brief.cadence === 'thread') {
    ui.err('inhouse-slides 프로바이더는 thread cadence를 지원하지 않습니다. brief.cadence를 single/series-3/series-5 로 변경하거나 다른 프로바이더를 사용하세요.');
    process.exit(2);
  }
  await writeInhouseSpecs({ slug, dir, briefPath, brief, profile, channels, flags, withImages });
  process.exit(0);
}

await writeCopySpecs({ slug, dir, briefPath, brief, profile, channels, flags });
process.exit(0);
