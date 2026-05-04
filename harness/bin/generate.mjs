#!/usr/bin/env node
// Generate copy + card image for one or more channels of a campaign.
//   node bin/generate.mjs <slug> [--channel=threads] [--provider=mock]
//   node bin/generate.mjs <slug> --all   # all channels in brief
//   node bin/generate.mjs <slug> --channel=threads --card=2   # 시리즈 2번 카드만 재생성

import { resolve } from 'node:path';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
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

// ── 라우팅 ──────────────────────────────────────────────────────────────────
if (flags.finalize) {
  if (provider.id === 'inhouse-slides') {
    await finalizeInhouseSlides({ slug, dir, briefPath, brief, profile, channels });
  } else {
    await finalizeRegularChannels({ slug, dir, briefPath, brief, profile, channels, provider, flags });
  }
  process.exit(0);
}

if (provider.id === 'inhouse-slides') {
  await writeInhouseSpecs({ slug, dir, briefPath, brief, profile, channels, flags });
  process.exit(0);
}

await writeCopySpecs({ slug, dir, briefPath, brief, profile, channels, flags });
process.exit(0);

// ---- helpers ----

// ── inhouse-slides 전용 헬퍼 ────────────────────────────────────────────

async function writeInhouseSpecs({ slug, dir, briefPath, brief, profile, channels, flags }) {
  const tmpSlideDir = resolve(tmpdir(), 'marketing-agent-slides');
  mkdirSync(tmpSlideDir, { recursive: true });

  for (const channel of channels) {
    ui.step(channels.indexOf(channel) + 1, channels.length, `[${channel}] slide-spec 작성...`);

    const channelDocs = loadChannelDocs(channel);
    const cardCount   = imagesFor(brief.cadence, flags.images) || 1;
    const aspect      = channel === 'linkedin' ? 'square' : 'portrait';
    const dimMap      = { portrait: { width: 1080, height: 1350 }, square: { width: 1080, height: 1080 } };
    const dim         = dimMap[aspect] ?? dimMap.portrait;
    const ts          = nowKstFilename();

    const cards = Array.from({ length: cardCount }, (_, i) => ({
      index:    i + 1,
      total:    cardCount,
      role:     roleFor(i, cardCount),
      htmlPath: resolve(tmpSlideDir, `${slug}-${channel}-card${i + 1}-${ts}.html`),
    }));

    // sourceTexts: 파일이면 읽고, 인라인이면 그대로
    const resolvedTexts = (brief.sourceMaterials?.texts ?? []).map((t) => {
      try { if (existsSync(t)) return readFileSync(t, 'utf8').slice(0, 1000); } catch { /* 무시 */ }
      return t;
    });

    const spec = {
      slug,
      channel,
      ts,
      aspect,
      dimensions: dim,
      cards,
      copyContext: {
        topic:          brief.topic,
        goal:           brief.goal,
        cadence:        brief.cadence,
        keyMessage:     brief.keyMessage  ?? null,
        contentPoints:  [...(brief.contentPoints ?? []), ...resolvedTexts],
        angle:          brief.angle ?? null,
        profile: {
          brand:          profile.brand          ?? {},
          tone:           profile.tone           ?? {},
          writing:        profile.writing        ?? {},
          targetAudience: profile.targetAudience ?? [],
          banned:         profile.banned         ?? {},
          hashtags:       profile.hashtags       ?? {},
        },
        channelStrategy:  channelDocs?.strategy  ?? '',
        channelTemplates: channelDocs?.templates ?? '',
      },
      imageContext: {
        topic:     brief.topic,
        brandName: profile.brand?.name ?? '',
        visual:    profile.visual     ?? {},
        imageStyle: profile.imageStyle ?? {},
        sourceMaterials: {
          images: (brief.sourceMaterials?.images ?? []).filter(existsSync),
        },
      },
      outputDir: resolve(dir, channel),
    };

    const channelDir = resolve(dir, channel);
    mkdirSync(channelDir, { recursive: true });
    writeFileSync(resolve(channelDir, 'slide-spec.json'), JSON.stringify(spec, null, 2), 'utf8');

    brief.status[channel] = 'drafting';
    ui.ok(`[${channel}] slide-spec.json 저장 완료 → ${resolve(channelDir, 'slide-spec.json')}`);
  }

  brief.meta = { ...(brief.meta ?? {}), updatedAt: nowKstIso() };
  writeYaml(briefPath, brief);

  console.log();
  ui.info('⚡ inhouse-slides: image-director 에이전트가 각 채널의 slide-spec.json 을 처리해야 합니다.');
  ui.dim(`처리 완료 후 실행: node harness/bin/generate.mjs ${slug} --finalize`);
}

async function writeCopySpecs({ slug, dir, briefPath, brief, profile, channels, flags }) {
  const cardN = flags.card ? parseInt(flags.card, 10) : null;

  for (const channel of channels) {
    ui.step(channels.indexOf(channel) + 1, channels.length, `[${channel}] copy-spec 작성...`);

    const channelDocs = loadChannelDocs(channel);
    const cardCount   = imagesFor(brief.cadence, flags.images) || 1;
    const aspect      = channel === 'linkedin' ? 'square' : 'portrait';
    const ts          = nowKstFilename();

    const allCards = Array.from({ length: cardCount }, (_, i) => ({
      index: i + 1,
      total: cardCount,
      role:  roleFor(i, cardCount),
    }));

    const cards = cardN !== null ? [allCards[cardN - 1]] : allCards;

    const resolvedTexts = (brief.sourceMaterials?.texts ?? []).map((t) => {
      try { if (existsSync(t)) return readFileSync(t, 'utf8').slice(0, 1000); } catch { /* ignore */ }
      return t;
    });

    const channelDir = resolve(dir, channel);
    mkdirSync(channelDir, { recursive: true });
    const outputPath = resolve(channelDir, 'copy-output.json');

    const spec = {
      version: 1,
      slug,
      channel,
      ts,
      aspect,
      cards,
      copyContext: {
        topic:          brief.topic,
        goal:           brief.goal,
        cadence:        brief.cadence,
        keyMessage:     brief.keyMessage  ?? null,
        contentPoints:  [...(brief.contentPoints ?? []), ...resolvedTexts],
        angle:          brief.angle ?? null,
        notes:          brief.notes ?? null,
        profile: {
          brand:          profile.brand          ?? {},
          tone:           profile.tone           ?? {},
          writing:        profile.writing        ?? {},
          targetAudience: profile.targetAudience ?? [],
          banned:         profile.banned         ?? {},
          hashtags:       profile.hashtags       ?? {},
        },
        channelStrategy:  channelDocs?.strategy  ?? '',
        channelTemplates: channelDocs?.templates ?? '',
      },
      outputDir:  channelDir,
      outputPath,
      partial: cardN !== null
        ? { cardIndex: cardN, cardTotal: cardCount, role: roleFor(cardN - 1, cardCount) }
        : null,
    };

    writeFileSync(resolve(channelDir, 'copy-spec.json'), JSON.stringify(spec, null, 2), 'utf8');
    brief.status[channel] = 'drafting';
    ui.ok(`[${channel}] copy-spec.json → ${resolve(channelDir, 'copy-spec.json')}`);
  }

  brief.meta = { ...(brief.meta ?? {}), updatedAt: nowKstIso() };
  writeYaml(briefPath, brief);

  console.log();
  ui.info('⚡ copywriter 에이전트가 각 채널의 copy-spec.json 을 처리해야 합니다.');
  const finFlag  = channels.length === 1 ? ` --channel=${channels[0]}` : '';
  const cardFlag = cardN ? ` --card=${cardN}` : '';
  ui.dim(`처리 완료 후 실행: node harness/bin/generate.mjs ${slug}${finFlag}${cardFlag} --finalize`);
}

async function finalizeRegularChannels({ slug, dir, briefPath, brief, profile, channels, provider, flags }) {
  const cardN = flags.card ? parseInt(flags.card, 10) : null;

  for (const channel of channels) {
    ui.step(channels.indexOf(channel) + 1, channels.length, `[${channel}] finalize...`);

    const channelDir = resolve(dir, channel);
    const specPath   = resolve(channelDir, 'copy-spec.json');
    const outputPath = resolve(channelDir, 'copy-output.json');

    if (!existsSync(specPath)) {
      ui.err(`[${channel}] copy-spec.json 없음 — 먼저 generate.mjs 를 (--finalize 없이) 실행하세요.`);
      continue;
    }
    if (!existsSync(outputPath)) {
      ui.err(`[${channel}] copy-output.json 없음 — copywriter 에이전트가 아직 처리하지 않았습니다.`);
      continue;
    }

    const spec   = JSON.parse(readFileSync(specPath, 'utf8'));
    const output = JSON.parse(readFileSync(outputPath, 'utf8'));
    const ts     = spec.ts;
    const aspect = spec.aspect;

    // ── PARTIAL: 기존 draft의 한 카드만 교체 ─────────────────────────────
    if (spec.partial) {
      const latestPath = latestDraftYaml(channelDir);
      if (!latestPath) {
        ui.err(`[${channel}] partial finalize 인데 기존 draft 없음.`);
        continue;
      }
      const existing  = readYaml(latestPath);
      const { cardIndex: cIdx, cardTotal, role } = spec.partial;
      const cardIdx   = cIdx - 1;
      const newCard   = output.cards[0];

      const newImg = await provider.generateImage({
        prompt:          imagePromptFor(channel, brief, profile, role, cIdx, cardTotal),
        visual:          profile.visual ?? {},
        aspect,
        count:           1,
        cardText:        newCard.text,
        role,
        cardIndex:       cIdx,
        cardTotal,
        topic:           brief.topic,
        sourceMaterials: brief.sourceMaterials ?? null,
      });

      const updatedCards = (existing.cards ?? []).map((c, i) =>
        i === cardIdx ? { role, text: newCard.text } : c
      );
      const updatedPaths = [...(existing.assets ?? [])];
      const updatedUrls  = [...(existing.assetUrls ?? [])];
      if (newImg.paths[0]) updatedPaths[cardIdx] = newImg.paths[0];
      if (newImg.urls?.[0]) updatedUrls[cardIdx]  = newImg.urls[0];

      const primaryText     = updatedCards[0]?.text ?? existing.text;
      const primaryHashtags = cardIdx === 0 ? (newCard.hashtags ?? []) : extractHashtags(primaryText);
      const merged          = mergeHashtags(primaryText, primaryHashtags, profile);
      const report          = inspect({ channel, text: merged.text, hashtags: merged.hashtags, profile });

      const newTs = nowKstFilename();
      const draft = {
        ...existing,
        generatedAt: nowKstIso(),
        provider:    { provider: output.meta?.provider ?? 'claude-subagent', model: output.meta?.agent ?? 'copywriter' },
        image:       newImg.meta,
        text:        merged.text,
        hashtags:    merged.hashtags,
        cards:       updatedCards,
        assets:      updatedPaths,
        assetUrls:   updatedUrls,
        guardian:    report,
      };
      writeYaml(resolve(channelDir, `${newTs}.yaml`), draft);
      writeFileSync(resolve(channelDir, `${newTs}.md`), renderDraftMd(draft), 'utf8');
      brief.status[channel] = report.ok ? 'preview' : 'drafting';

      if (report.ok) ui.ok(`[${channel}] 카드 ${cIdx} 재생성 완료`);
      else           ui.err(`[${channel}] 가디언 차단`);
      continue;
    }

    // ── FULL: 처음부터 draft 조립 ─────────────────────────────────────────
    const cardCount = spec.cards.length;
    const image = { paths: [], urls: [], meta: null };
    const cards = [];

    for (let i = 0; i < cardCount; i++) {
      const role    = spec.cards[i].role;
      const outCard = output.cards.find((c) => c.index === i + 1) ?? output.cards[i];
      cards.push({ role, text: outCard.text, hashtags: outCard.hashtags ?? [] });

      const r = await provider.generateImage({
        prompt:          imagePromptFor(channel, brief, profile, role, i + 1, cardCount),
        visual:          profile.visual ?? {},
        aspect,
        count:           1,
        cardText:        outCard.text,
        role,
        cardIndex:       i + 1,
        cardTotal:       cardCount,
        topic:           brief.topic,
        sourceMaterials: brief.sourceMaterials ?? null,
      });
      image.paths.push(...(r.paths ?? []));
      image.urls.push(...(r.urls ?? []));
      image.meta = r.meta;
    }

    const primary = cards[0];
    const merged  = mergeHashtags(primary.text, primary.hashtags ?? [], profile);
    const report  = inspect({ channel, text: merged.text, hashtags: merged.hashtags, profile });

    const draft = {
      version:     1,
      slug,
      channel,
      generatedAt: nowKstIso(),
      provider:    { provider: output.meta?.provider ?? 'claude-subagent', model: output.meta?.agent ?? 'copywriter' },
      image:       image.meta,
      text:        merged.text,
      hashtags:    merged.hashtags,
      cards:       cards.length > 1 ? cards.map((c) => ({ role: c.role, text: c.text })) : undefined,
      assets:      image.paths,
      assetUrls:   image.urls ?? [],
      guardian:    report,
    };
    writeYaml(resolve(channelDir, `${ts}.yaml`), draft);
    writeFileSync(resolve(channelDir, `${ts}.md`), renderDraftMd(draft), 'utf8');
    brief.status[channel] = report.ok ? 'preview' : 'drafting';

    if (report.ok) ui.ok(`[${channel}] preview 준비됨 (warns: ${report.summary?.warns ?? 0})`);
    else           ui.err(`[${channel}] 가디언 차단 (${report.summary?.blocks ?? '?'}건)`);
  }

  brief.meta = { ...(brief.meta ?? {}), updatedAt: nowKstIso() };
  writeYaml(briefPath, brief);
  console.log();
  ui.dim(`다음: node bin/preview.mjs ${slug}`);
}

async function finalizeInhouseSlides({ slug, dir, briefPath, brief, profile, channels }) {
  const screenshotBin = resolve(process.cwd(), 'harness/bin/screenshot.mjs');

  for (const channel of channels) {
    ui.step(channels.indexOf(channel) + 1, channels.length, `[${channel}] 슬라이드 완성...`);

    const channelDir  = resolve(dir, channel);
    const specPath    = resolve(channelDir, 'slide-spec.json');
    const outputPath  = resolve(channelDir, 'agent-output.json');

    if (!existsSync(specPath)) {
      ui.err(`[${channel}] slide-spec.json 없음 — 먼저 generate.mjs (--finalize 없이) 실행하세요.`);
      continue;
    }
    if (!existsSync(outputPath)) {
      ui.err(`[${channel}] agent-output.json 없음 — image-director 에이전트가 아직 처리하지 않았습니다.`);
      continue;
    }

    const spec        = JSON.parse(readFileSync(specPath, 'utf8'));
    const agentOutput = JSON.parse(readFileSync(outputPath, 'utf8'));
    const outputCards = agentOutput.cards ?? [];

    // 카드별 Playwright 캡쳐
    const pngPaths = [];
    for (const card of spec.cards) {
      if (!existsSync(card.htmlPath)) {
        ui.err(`[${channel}] HTML 파일 없음: ${card.htmlPath}`);
        continue;
      }
      const pngPath = card.htmlPath.replace(/\.html$/, '.png');
      execFileSync('node', [
        screenshotBin,
        `--html=${card.htmlPath}`,
        `--out=${pngPath}`,
        `--width=${spec.dimensions.width}`,
        `--height=${spec.dimensions.height}`,
      ], { stdio: 'inherit' });
      pngPaths.push(pngPath);
    }

    // draft 조립
    const ts           = spec.ts;
    const primaryCard  = outputCards[0] ?? { text: '', hashtags: [] };
    const allHashtags  = [...new Set([
      ...(primaryCard.text.match(/#[^\s#]+/g) ?? []),
      ...(primaryCard.hashtags ?? []),
      ...(profile?.hashtags?.always ?? []),
    ])];
    const strippedText = primaryCard.text.replace(/(\n+#[^\s#]+(\s+#[^\s#]+)*\s*)$/u, '').trimEnd();
    const finalText    = allHashtags.length ? `${strippedText}\n\n${allHashtags.join(' ')}` : strippedText;

    const report = inspect({ channel, text: finalText, hashtags: allHashtags, profile });

    const draft = {
      version:     1,
      slug,
      channel,
      generatedAt: nowKstIso(),
      provider:    { provider: 'inhouse-slides', model: 'claude-agent' },
      image:       { provider: 'inhouse-slides', model: 'playwright-screenshot' },
      text:        finalText,
      hashtags:    allHashtags,
      cards:       outputCards.length > 1 ? outputCards.map((c) => ({ role: c.role, text: c.text })) : undefined,
      assets:      pngPaths,
      assetUrls:   [],
      guardian:    report,
    };

    writeYaml(resolve(channelDir, `${ts}.yaml`), draft);
    writeFileSync(resolve(channelDir, `${ts}.md`), renderDraftMd(draft), 'utf8');

    brief.status[channel] = report.ok ? 'preview' : 'drafting';
    brief.meta = { ...(brief.meta ?? {}), updatedAt: nowKstIso() };

    if (report.ok) ui.ok(`[${channel}] preview 준비됨 (warns: ${report.summary.warns})`);
    else           ui.err(`[${channel}] 가디언 차단 (${report.summary.blocks}건). draft.md 검토 후 재생성.`);
  }

  writeYaml(briefPath, brief);
  console.log();
  ui.dim(`다음: node bin/preview.mjs ${slug}`);
}

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
