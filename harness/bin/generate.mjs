#!/usr/bin/env node
// Generate copy + card image for one or more channels of a campaign.
//   node bin/generate.mjs <slug> [--channel=threads] [--provider=mock]
//   node bin/generate.mjs <slug> --all   # all channels in brief

import { resolve } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  PATHS, readYaml, writeYaml, loadChannelDocs, findCampaignDir, nowKstIso, nowKstFilename, ui,
} from './_lib.mjs';
import { getProvider } from '../src/content-engine/registry.mjs';
import { inspect } from '../src/content-engine/brand-guardian.mjs';

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

const dir = findCampaignDir(slug);
const briefPath = resolve(dir, 'brief.yaml');
const brief = readYaml(briefPath);
const profile = readYaml(PATHS.profile);

const channels = flags.all
  ? brief.channels
  : (flags.channel ? [flags.channel] : brief.channels);

const provider = getProvider(flags.provider);
ui.info(`provider: ${provider.id}  ·  channels: ${channels.join(', ')}`);
console.log();

for (const channel of channels) {
  ui.step(channels.indexOf(channel) + 1, channels.length, `[${channel}] generating...`);

  const channelDocs = loadChannelDocs(channel);
  const copy = await provider.generateCopy({ brief, profile, channel, channelDocs });
  const merged = mergeHashtags(copy.text, copy.hashtags, profile);

  const aspect = channel === 'linkedin' ? 'square' : 'portrait';
  const cardCount = imagesFor(brief.cadence, flags.images);

  // Generate one image per card so each carries its own role (hook → body → cta).
  // We collect into a single ImageResult-shape object so downstream code stays unchanged.
  const image = { paths: [], urls: [], meta: null };
  for (let i = 0; i < cardCount; i++) {
    const role = roleFor(i, cardCount);
    const r = await provider.generateImage({
      prompt: imagePromptFor(channel, brief, profile, role, i + 1, cardCount),
      visual: profile.visual ?? {},
      aspect,
      count: 1,
    });
    image.paths.push(...(r.paths ?? []));
    image.urls.push(...(r.urls ?? []));
    image.meta = r.meta; // last call's meta is fine for the draft summary
  }

  // Brand guardian.
  const report = inspect({ channel, text: merged.text, hashtags: merged.hashtags, profile });

  // Persist draft.
  const channelDir = resolve(dir, channel);
  mkdirSync(channelDir, { recursive: true });
  const ts = nowKstFilename();
  const draft = {
    version: 1,
    slug,
    channel,
    generatedAt: nowKstIso(),
    provider: copy.meta,
    image: image.meta,
    text: merged.text,
    hashtags: merged.hashtags,
    assets: image.paths,
    assetUrls: image.urls ?? [],
    guardian: report,
  };
  writeYaml(resolve(channelDir, `${ts}.yaml`), draft);
  writeFileSync(resolve(channelDir, `${ts}.md`), renderDraftMd(draft), 'utf8');

  // Update status: blocked drafts go back to drafting; otherwise -> preview.
  brief.status[channel] = report.ok ? 'preview' : 'drafting';
  brief.meta = { ...(brief.meta ?? {}), updatedAt: nowKstIso() };

  if (report.ok) ui.ok(`[${channel}] preview 준비됨 (warns: ${report.summary.warns})`);
  else ui.err(`[${channel}] 가디언 차단 (${report.summary.blocks}건). draft.md 검토 후 재생성 필요.`);
}

writeYaml(briefPath, brief);
console.log();
ui.dim(`다음: /sns-preview ${slug}   또는   node bin/preview.mjs ${slug}`);

// ---- helpers ----

function mergeHashtags(text, fromProvider, profile) {
  const fromText = (text.match(/#[^\s#]+/g) ?? []);
  const set = new Set([...fromText, ...fromProvider, ...(profile?.hashtags?.always ?? [])]);
  // Strip existing tags from end of text and re-append unique sorted line.
  const stripped = text.replace(/(\n+#[^\s#]+(\s+#[^\s#]+)*\s*)$/u, '').trimEnd();
  const tagsLine = Array.from(set).join(' ');
  const finalText = tagsLine ? `${stripped}\n\n${tagsLine}` : stripped;
  return { text: finalText, hashtags: Array.from(set) };
}

function imagesFor(cadence, override) {
  if (override) {
    const n = parseInt(override, 10);
    return Number.isFinite(n) && n >= 0 && n <= 10 ? n : 1;
  }
  switch (cadence) {
    case 'series-3': return 3;
    case 'series-5': return 5;
    case 'thread':   return 0; // text series — copywriter handles continuation
    case 'single':
    default:         return 1;
  }
}

function roleFor(index, total) {
  if (total <= 1) return 'single';
  if (index === 0) return 'hook';
  if (index === total - 1) return 'cta';
  return 'body';
}

function imagePromptFor(channel, brief, profile, role = 'single', n = 1, total = 1) {
  const brand = profile?.brand?.name ?? '브랜드';
  const palette = profile?.visual?.colors
    ? `palette ${Object.values(profile.visual.colors).filter(Boolean).join(', ')}`
    : '';
  const roleHint = {
    single: 'single hero card with the headline as the focal point',
    hook:   `card ${n}/${total} — the HOOK: oversized headline, attention grab, minimal supporting copy area`,
    body:   `card ${n}/${total} — a BODY card: data/insight layout with room for one statistic or one short paragraph`,
    cta:    `card ${n}/${total} — the CTA card: closing message, clear visual call-to-action area, brand colors stronger`,
  }[role] ?? 'single hero card';
  return [
    `Card visual for SNS post on ${channel}.`,
    `Brand: ${brand}.`,
    `Topic: ${brief.topic}.`,
    `Role: ${roleHint}.`,
    `Style: minimal, modern editorial, large serif headline, plenty of negative space.`,
    palette,
    `No real logos, no gibberish text, no faces. Korean-friendly typography.`,
  ].filter(Boolean).join(' ');
}

function renderDraftMd(d) {
  const findings = d.guardian.findings.length
    ? d.guardian.findings.map((f) => `- **${f.severity}** \`${f.code}\`${f.detail ? ` — ${f.detail}` : ''}`).join('\n')
    : '_(없음)_';
  return [
    `# ${d.slug} / ${d.channel}`,
    ``,
    `> generated ${d.generatedAt} · provider \`${d.provider.provider}\` (${d.provider.model}) · image \`${d.image.provider}\` (${d.image.model})`,
    ``,
    `## Copy`,
    ``,
    '```',
    d.text,
    '```',
    ``,
    `## Hashtags`,
    ``,
    d.hashtags.length ? d.hashtags.join(' ') : '_(없음)_',
    ``,
    `## Assets`,
    ``,
    d.assets.length ? d.assets.map((p) => `- \`${p}\``).join('\n') : '_(없음)_',
    ``,
    `## Brand Guardian`,
    ``,
    `severity: **${d.guardian.severity}** · blocks ${d.guardian.summary.blocks} · warns ${d.guardian.summary.warns}`,
    ``,
    findings,
    ``,
  ].join('\n');
}
