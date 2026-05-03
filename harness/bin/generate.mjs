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
import { validateChannels } from '../src/publisher/registry.mjs';

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
  const colors    = profile?.visual?.colors ?? {};
  const font      = profile?.visual?.fontFamily ?? '';
  const imgStyle  = profile?.imageStyle ?? {};
  const industry  = profile?.industry ?? '';
  const audiences = profile?.targetAudience ?? [];

  // ── 색상 ──────────────────────────────────────────────────────────────
  const hasColors = colors.primary || colors.accent || colors.background;
  let colorDesc;
  if (imgStyle.colorMood && hasColors) {
    const { primary = '#333', accent = '#666', background = '#fff' } = colors;
    colorDesc = {
      brand_only:    `Strict brand palette: background ${background}, dominant ${primary}, accent ${accent}. Exact hex values.`,
      cool:          `Cool palette — blues and grays. Accent: ${accent}.`,
      warm:          `Warm palette — creams and ambers. Accent: ${accent}.`,
      neutral:       `Monochrome — blacks, whites, grays. Accent pop: ${accent}.`,
      high_contrast: `High contrast black and white. Single accent: ${accent}.`,
    }[imgStyle.colorMood] ?? `Palette: background ${background}, primary ${primary}, accent ${accent}.`;
  } else if (hasColors) {
    const { primary, accent, background } = colors;
    colorDesc = [
      background ? `Background: ${background}.` : '',
      primary    ? `Primary: ${primary}.` : '',
      accent     ? `Accent: ${accent}.` : '',
    ].filter(Boolean).join(' ') + ' Use exact hex values.';
  } else {
    // 브랜드 색상 미설정 — 업종/오디언스 기반으로 AI에게 판단 위임
    const industryColorHint = {
      fintech:    'Professional fintech palette — deep navy or slate, clean white space, one sharp accent.',
      ecommerce:  'Vibrant ecommerce palette — warm energetic tones, clear contrast.',
      healthcare: 'Calm healthcare palette — soft blues and greens, high readability.',
      education:  'Approachable education palette — bright but not harsh, friendly warmth.',
      saas:       'Modern SaaS palette — clean neutrals, one strong brand accent.',
    }[industry?.toLowerCase()] ?? 'Choose a professional, high-contrast palette appropriate for Korean SNS.';
    colorDesc = industryColorHint;
  }

  // ── 스타일 방향 ────────────────────────────────────────────────────────
  const aestheticMap = {
    minimal_editorial: 'minimal editorial — generous white space, restrained palette, quiet authority',
    bold_graphic:      'bold graphic design — strong color blocks, oversized type, high visual energy',
    warm_lifestyle:    'warm lifestyle aesthetic — soft light, organic textures, approachable feel',
    dark_luxury:       'dark luxury — deep blacks, refined gold or silver accents, premium atmosphere',
    playful_bright:    'playful and bright — vivid colors, rounded forms, energetic and friendly',
    swiss_type:        'Swiss International Typographic Style — grid-based, clean serif/sans, typography as hero',
  };
  const aestheticDesc = imgStyle.aesthetic === 'custom'
    ? (imgStyle.customAesthetic ?? 'modern editorial')
    : (aestheticMap[imgStyle.aesthetic] ?? 'modern editorial — purposeful composition, strong visual hierarchy');

  // ── 이미지 성격 (abstract / concrete) ─────────────────────────────────
  const abstractDesc = imgStyle.preferAbstract === false
    ? `Concrete imagery: real objects, spaces, or scenes that represent "${brief.topic}". Situational, relatable.`
    : `Abstract composition centered on typography and geometric shapes that evoke "${brief.topic}". No literal depiction.`;

  // ── 레퍼런스 브랜드 ────────────────────────────────────────────────────
  const refsDesc = imgStyle.referencesBrands?.length
    ? `Visual spirit of: ${imgStyle.referencesBrands.join(', ')} — aesthetic reference only, no copying.`
    : '';

  // ── 오디언스 ────────────────────────────────────────────────────────────
  const audienceHint = audiences.length
    ? `Target audience: ${audiences.map((a) => a.segment ?? a.name).filter(Boolean).join(', ')}.`
    : '';

  // ── 회피 요소 ──────────────────────────────────────────────────────────
  const userAvoid = imgStyle.avoidElements?.join(', ') ?? '';
  const avoidDesc = [
    'Human faces, real people, real logos, brand names as readable text, illegible text, watermarks.',
    userAvoid ? `Also avoid: ${userAvoid}.` : '',
  ].filter(Boolean).join(' ');

  // ── 채널·역할 ──────────────────────────────────────────────────────────
  const channelNote = channel === 'linkedin'
    ? 'Professional B2B context — clean, credible, boardroom-ready.'
    : 'Korean SNS card — scroll-stopping, immediate visual hook.';

  const roleComposition = {
    single: 'Full-bleed hero. One dominant focal element, 60%+ negative space.',
    hook:   `HOOK card ${n}/${total}. Single bold keyword or number dominates 70% of frame. Maximum immediate impact.`,
    body:   `BODY card ${n}/${total}. Structured layout with visual space for one key insight or statistic.`,
    cta:    `CTA card ${n}/${total}. Stronger brand color presence than other cards. Clear action zone at bottom third.`,
  }[role] ?? 'Hero card. Strong single focal point.';

  // ── 폰트 힌트 ─────────────────────────────────────────────────────────
  const fontNote = font ? `Typography feel: ${font}.` : 'Typography: clean, modern, Korean-friendly.';

  return [
    `SNS card visual. ${channelNote}`,
    `TOPIC: ${brief.topic}`,
    audienceHint,
    '',
    `STYLE: ${aestheticDesc}`,
    `${fontNote} Large-scale composition.`,
    '',
    `COMPOSITION: ${roleComposition}`,
    '',
    `COLOR: ${colorDesc}`,
    '',
    `IMAGERY: ${abstractDesc}`,
    refsDesc,
    '',
    'QUALITY: Sharp edges, high contrast, print-ready. No lens blur. No gradients unless intentional.',
    `AVOID: ${avoidDesc}`,
  ].filter(Boolean).join('\n');
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
