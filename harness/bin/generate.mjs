#!/usr/bin/env node
// Generate copy + card image for one or more channels of a campaign.
//   node bin/generate.mjs <slug> [--channel=threads] [--provider=mock]
//   node bin/generate.mjs <slug> --all   # all channels in brief
//   node bin/generate.mjs <slug> --channel=threads --card=2   # 시리즈 2번 카드만 재생성

import { resolve } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  PATHS, readYaml, writeYaml, loadChannelDocs, findCampaignDir, nowKstIso, nowKstFilename, ui, latestDraftYaml,
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
ui.info(`provider: ${provider.id}  ·  channels: ${channels.join(', ')}`);
console.log();

for (const channel of channels) {
  ui.step(channels.indexOf(channel) + 1, channels.length, `[${channel}] generating...`);

  const channelDocs = loadChannelDocs(channel);

  // --card=<n> 부분 재생성: 기존 draft 로드 → 해당 카드만 교체
  if (cardN !== null) {
    const latestPath = latestDraftYaml(resolve(dir, channel));
    if (!latestPath) {
      ui.err(`[${channel}] 기존 draft 없음 — 먼저 전체 생성을 실행하세요.`);
      process.exit(2);
    }
    const existing = readYaml(latestPath);
    if (!existing.cards?.length) {
      ui.err(`[${channel}] 시리즈 draft가 아닙니다. --card 는 series-3/5 캠페인에서만 사용 가능합니다.`);
      process.exit(2);
    }
    const totalCards = existing.cards.length;
    if (cardN < 1 || cardN > totalCards) {
      ui.err(`--card=${cardN} 범위 초과. 이 시리즈는 ${totalCards}장입니다. (1~${totalCards})`);
      process.exit(2);
    }
    const cardIdx = cardN - 1;
    const role = roleFor(cardIdx, totalCards);
    ui.step(1, 1, `[${channel}] 카드 ${cardN}/${totalCards} (${role}) 재생성...`);

    const aspect = channel === 'linkedin' ? 'square' : 'portrait';

    // 카피 재생성
    const newCopy = await provider.generateCopy({
      brief, profile, channel, channelDocs,
      cardRole: role, cardIndex: cardN, cardTotal: totalCards,
    });

    // 이미지 재생성
    const newImg = await provider.generateImage({
      prompt: imagePromptFor(channel, brief, profile, role, cardN, totalCards),
      visual: profile.visual ?? {},
      aspect,
      count: 1,
    });

    // 기존 cards 배열 복사 후 해당 카드만 교체
    const updatedCards = existing.cards.map((c, i) =>
      i === cardIdx ? { role, text: newCopy.text } : c
    );

    // 기존 assets 배열 복사 후 해당 슬롯만 교체
    const updatedPaths = [...(existing.assets ?? [])];
    const updatedUrls  = [...(existing.assetUrls ?? [])];
    if (newImg.paths[0]) updatedPaths[cardIdx] = newImg.paths[0];
    if (newImg.urls?.[0]) updatedUrls[cardIdx]  = newImg.urls[0];

    // 대표 텍스트(첫 카드) 갱신 — 재생성 카드가 0번이면 provider의 hashtags 우선 사용
    const primaryText = updatedCards[0]?.text ?? existing.text;
    const primaryHashtags = cardIdx === 0 ? (newCopy.hashtags ?? extractHashtags(primaryText)) : extractHashtags(primaryText);
    const mergedPrimary = mergeHashtags(primaryText, primaryHashtags, profile);

    const report = inspect({ channel, text: mergedPrimary.text, hashtags: mergedPrimary.hashtags, profile });

    const channelDir = resolve(dir, channel);
    const ts = nowKstFilename();
    const draft = {
      ...existing,
      generatedAt: nowKstIso(),
      provider: newCopy.meta,
      image: newImg.meta,
      text: mergedPrimary.text,
      hashtags: mergedPrimary.hashtags,
      cards: updatedCards,
      assets: updatedPaths,
      assetUrls: updatedUrls,
      guardian: report,
    };
    writeYaml(resolve(channelDir, `${ts}.yaml`), draft);
    writeFileSync(resolve(channelDir, `${ts}.md`), renderDraftMd(draft), 'utf8');

    brief.status[channel] = report.ok ? 'preview' : 'drafting';
    brief.meta = { ...(brief.meta ?? {}), updatedAt: nowKstIso() };

    if (report.ok) ui.ok(`[${channel}] 카드 ${cardN} 재생성 완료`);
    else ui.err(`[${channel}] 가디언 차단 — draft.md 확인 후 재시도`);

    writeYaml(briefPath, brief);
    console.log();
    ui.dim(`다음: node bin/preview.mjs ${slug} --channel=${channel}`);
    process.exit(0);
  }

  const aspect = channel === 'linkedin' ? 'square' : 'portrait';
  const cardCount = imagesFor(brief.cadence, flags.images);

  // 시리즈(cardCount > 1)는 카드별로 카피 생성, 단일은 1회 호출
  const cards = [];
  if (cardCount > 1) {
    for (let i = 0; i < cardCount; i++) {
      const role = roleFor(i, cardCount);
      const cardCopy = await provider.generateCopy({
        brief, profile, channel, channelDocs,
        cardRole: role, cardIndex: i + 1, cardTotal: cardCount,
      });
      cards.push({ role, text: cardCopy.text, hashtags: cardCopy.hashtags, meta: cardCopy.meta });
    }
  } else {
    const singleCopy = await provider.generateCopy({ brief, profile, channel, channelDocs });
    cards.push({ role: 'single', text: singleCopy.text, hashtags: singleCopy.hashtags, meta: singleCopy.meta });
  }

  // 대표 텍스트 = 첫 카드 (preview, guardian, 하위 호환용)
  const primaryCard = cards[0];
  const merged = mergeHashtags(primaryCard.text, primaryCard.hashtags, profile);

  // 이미지 생성 (카드별 1장)
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
    image.meta = r.meta;
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
    provider: cards[0].meta,
    image: image.meta,
    text: merged.text,
    hashtags: merged.hashtags,
    cards: cards.length > 1 ? cards.map((c) => ({ role: c.role, text: c.text })) : undefined,
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

function extractHashtags(text) {
  return Array.from(new Set((text.match(/#[^\s#]+/g) ?? [])));
}

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
