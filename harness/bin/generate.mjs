#!/usr/bin/env node
// Generate copy + card image for one or more channels of a campaign.
//   node bin/generate.mjs <slug> [--channel=threads] [--provider=mock]
//   node bin/generate.mjs <slug> --all   # all channels in brief
//   node bin/generate.mjs <slug> --channel=threads --card=2   # 시리즈 2번 카드만 재생성

import { resolve } from 'node:path';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import {
  PATHS, HARNESS_ROOT, readYaml, writeYaml, loadChannelDocs, findCampaignDir, nowKstIso, nowKstFilename, ui, latestDraftYaml, Spinner,
} from './_lib.mjs';
import { getProvider } from '../src/content-engine/registry.mjs';
import { inspect, inspectVisualText } from '../src/content-engine/brand-guardian.mjs';
import { validateChannels } from '../src/publisher/registry.mjs';
import { loadPrefs, renderGuide } from '../src/preferences.mjs';

// B2B/SaaS 카테고리별 디자인 레퍼런스 풀 — 함수보다 먼저 선언해야 TDZ 오류 없음
const DESIGN_REF_POOLS = {
  saas:       ['stripe', 'linear.app', 'vercel', 'supabase', 'notion', 'airtable', 'cal', 'resend'],
  ai:         ['claude', 'x.ai', 'mistral.ai', 'cohere', 'cursor', 'warp', 'elevenlabs'],
  enterprise: ['ibm', 'hashicorp', 'mongodb', 'clickhouse', 'intercom', 'zapier', 'sentry'],
  fintech:    ['stripe', 'wise', 'revolut', 'coinbase', 'mastercard'],
  editorial:  ['wired', 'theverge', 'figma', 'framer', 'miro', 'webflow'],
  premium:    ['apple', 'tesla', 'ferrari', 'spacex', 'nvidia'],
  default:    ['stripe', 'linear.app', 'vercel', 'notion', 'cursor', 'figma', 'supabase', 'wired', 'ibm', 'wise'],
};

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

// ---- helpers ----

function sanitizeKeywordItem(v) {
  if (typeof v !== 'string') return null;
  const trimmed = v.replace(/[\r\n\t]/g, ' ').trim();
  return trimmed.length > 0 && trimmed.length <= 80 ? trimmed : null;
}

function sanitizeChannelKeywords(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const sanitize = (arr) =>
    Array.isArray(arr) ? arr.map(sanitizeKeywordItem).filter(Boolean) : [];
  return {
    keywords: sanitize(raw.keywords),
    hashtags: sanitize(raw.hashtags),
    angle:    typeof raw.angle === 'string' ? raw.angle.replace(/[\r\n]/g, ' ').trim().slice(0, 120) : null,
    watchOut: sanitize(raw.watchOut),
  };
}

function loadKeywordsMap(dir, slug) {
  const p = resolve(dir, 'keywords.json');
  if (!existsSync(p)) return null;
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8'));
    if (parsed.slug && parsed.slug !== slug) {
      ui.warn(`keywords.json slug 불일치 (${parsed.slug} ≠ ${slug}) — 키워드 무시`);
      return null;
    }
    const channels = parsed.channels ?? {};
    return Object.fromEntries(
      Object.entries(channels).map(([ch, v]) => [ch, sanitizeChannelKeywords(v)])
    );
  } catch {
    ui.warn('keywords.json 파싱 실패 — 키워드 없이 진행');
    return null;
  }
}

function autoPickDesignRef(profile) {
  const industry = (profile?.industry ?? '').toLowerCase();
  const name     = (profile?.brand?.name ?? '').toLowerCase();

  let pool = DESIGN_REF_POOLS.default;
  if (/ai|llm|gpt/.test(industry + name))             pool = DESIGN_REF_POOLS.ai;
  else if (/fin|payment|결제|금융/.test(industry))     pool = DESIGN_REF_POOLS.fintech;
  else if (/enterprise|기업|erp/.test(industry))       pool = DESIGN_REF_POOLS.enterprise;
  else if (/premium|luxury|프리미엄/.test(industry))   pool = DESIGN_REF_POOLS.premium;
  else if (/media|editorial|잡지|미디어/.test(industry)) pool = DESIGN_REF_POOLS.editorial;
  else if (/saas|b2b|software/.test(industry))         pool = DESIGN_REF_POOLS.saas;

  // 캠페인 실행마다 다른 ref — 존재하지 않는 항목은 건너뛰고 다음 후보 시도
  const startIdx = Math.floor(Date.now() / 1000) % pool.length;
  for (let offset = 0; offset < pool.length; offset++) {
    const brand = pool[(startIdx + offset) % pool.length];
    const p     = resolve(HARNESS_ROOT, 'design-refs', brand, 'DESIGN.md');
    if (existsSync(p)) {
      ui.info(`🎨 auto design-ref: ${brand} (pool: ${pool.length}개 중 선택)`);
      return { brand, path: p };
    }
  }
  ui.warn('auto design-ref: 풀 내 모든 레퍼런스 없음 — _default 폴백');
  return null;
}

function loadDesignRef(brief, profile) {
  const brand = brief.sourceMaterials?.designRef;
  if (brand) {
    const p = resolve(HARNESS_ROOT, 'design-refs', brand, 'DESIGN.md');
    if (!existsSync(p)) {
      ui.warn(`design-refs/${brand}/DESIGN.md 없음 — 자동 선택 시도`);
    } else {
      return { brand, path: p };
    }
  }
  // designRef 미지정이면 업종/브랜드 기반으로 자동 선택
  const auto = autoPickDesignRef(profile);
  if (auto) return auto;

  // 최종 폴백: _default
  const defaultPath = resolve(HARNESS_ROOT, 'design-refs', '_default', 'DESIGN.md');
  if (existsSync(defaultPath)) {
    return { brand: '_default', path: defaultPath };
  }
  return null;
}

// ── 학습된 사용자 선호 → spec 주입용 ────────────────────────────────────
// approve/reject 시 누적된 posts/preferences.yaml 을 카피/이미지 spec 에 형태별로 부착.
// 신뢰도 낮으면 (sampleCount < 3) 빈 객체를 반환해 spec 을 깨끗하게 유지.

function buildLearnedPrefsForCopy(prefs, channel) {
  if (!prefs?.sampleCount || prefs.sampleCount < 3) return null;
  const ch = prefs.channels?.[channel];
  return {
    guide: renderGuide(prefs, { channel }),
    sampleCount: prefs.sampleCount,
    confidence: prefs.sampleCount < 5 ? 'initial' : prefs.sampleCount < 10 ? 'building' : 'strong',
    targets: (ch && ch.sampleCount >= 3) ? {
      avgLength: Math.round(ch.avgLength),
      avgEmojis: round1(ch.avgEmojis),
      avgHashtags: round1(ch.avgHashtags),
    } : null,
    tone: prefs.global?.tone ?? null,
    recentRejectReasons: ch?.recentRejectReasons?.slice(-3) ?? [],
  };
}

function buildLearnedPrefsForImage(prefs, channel) {
  if (!prefs?.sampleCount || prefs.sampleCount < 3) return null;
  // designRef 빈도 상위 3개만 — image-director 가 시각 톤 결정에 활용
  const topRefs = Object.entries(prefs.designRefs ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([brand, count]) => ({ brand, count }));
  if (!topRefs.length) return null;
  return {
    sampleCount: prefs.sampleCount,
    preferredDesignRefs: topRefs,
    guide: `[학습된 시각 선호] 자주 승인된 designRef: ${topRefs.map((r) => `${r.brand}(${r.count})`).join(', ')} — 새 designRef 미지정 시 우선 후보.`,
  };
}

function round1(n) { return Math.round((n ?? 0) * 10) / 10; }

// ── inhouse-slides 전용 헬퍼 ────────────────────────────────────────────

async function writeInhouseSpecs({ slug, dir, briefPath, brief, profile, channels, flags, withImages = false }) {
  const tmpSlideDir = resolve(tmpdir(), 'marketing-agent-slides');
  mkdirSync(tmpSlideDir, { recursive: true });

  const keywordsMap = loadKeywordsMap(dir, slug);
  const designRef   = loadDesignRef(brief, profile);
  const prefs       = loadPrefs();

  const _s1 = await Promise.allSettled(channels.map(async (channel) => {
    ui.info(`[${channel}] slide-spec 작성 중...`);

    const channelDocs = loadChannelDocs(channel);
    const cardCount   = imagesFor(brief.cadence, flags.images) || 1;
    const aspect      = channel === 'linkedin' ? 'square' : 'portrait';
    const dimMap      = { portrait: { width: 1080, height: 1350 }, square: { width: 1080, height: 1080 } };
    const dim         = dimMap[aspect] ?? dimMap.portrait;
    const ts          = nowKstFilename();

    const hookVariants = flags.variants ? Math.min(parseInt(flags.variants, 10) || 1, 5) : 3;

    const cards = Array.from({ length: cardCount }, (_, i) => ({
      index:        i + 1,
      total:        cardCount,
      role:         roleFor(i, cardCount),
      htmlPath:     resolve(tmpSlideDir, `${slug}-${channel}-card${i + 1}-${ts}.html`),
      // hook 카드(index 1)에만 variants 정보 포함
      ...(i === 0 && hookVariants > 1 ? { hookVariants } : {}),
    }));

    // sourceTexts: 파일이면 읽고, 인라인이면 그대로
    const resolvedTexts = (brief.sourceMaterials?.texts ?? []).map((t) => {
      try { if (existsSync(t)) return readFileSync(t, 'utf8').slice(0, 1000); } catch { /* ignore */ }
      return t;
    });

    const channelKeywords = keywordsMap?.[channel] ?? null;

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
        suggestedKeywords: channelKeywords,
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
        generateImages: withImages,
        sourceMaterials: {
          images: (brief.sourceMaterials?.images ?? []).filter(existsSync),
        },
        designRef: designRef ?? null,
        learnedPreferences: buildLearnedPrefsForImage(prefs, channel),
      },
      learnedPreferences: buildLearnedPrefsForCopy(prefs, channel),
      outputDir: resolve(dir, channel),
    };

    const channelDir = resolve(dir, channel);
    mkdirSync(channelDir, { recursive: true });
    writeFileSync(resolve(channelDir, 'slide-spec.json'), JSON.stringify(spec, null, 2), 'utf8');

    brief.status[channel] = 'drafting';
    ui.ok(`[${channel}] slide-spec.json 저장 완료 → ${resolve(channelDir, 'slide-spec.json')}`);
  }));
  logSettledErrors(_s1, channels);

  brief.meta = { ...(brief.meta ?? {}), updatedAt: nowKstIso() };
  writeYaml(briefPath, brief);

  console.log();
  ui.info('⚡ inhouse-slides: image-director 에이전트가 각 채널의 slide-spec.json 을 처리해야 합니다.');
  // Resolve hookVariants from brief (fallback to 1) so the message is optional and never throws.
  const hookVariants = brief.hookVariants ?? brief.hook_variants ?? 1;
  if (hookVariants > 1) {
    ui.info(`📌 hook 카드 ${hookVariants}종 변형 생성 예정 — finalize 전 --select-variant=N 으로 원하는 안 선택 가능 (미선택 시 V1 기본 적용)`);
  }
  if (withImages) {
    ui.info('🖼  SLIDE_IMAGES=true: image-director가 카드별 AI 배경 이미지를 생성합니다 (FAL_KEY 필요).');
  }
  ui.dim(`처리 완료 후 실행: node harness/bin/generate.mjs ${slug} --finalize`);
}

async function writeCopySpecs({ slug, dir, briefPath, brief, profile, channels, flags }) {
  const cardN = flags.card ? parseInt(flags.card, 10) : null;
  const keywordsMap = loadKeywordsMap(dir, slug);
  const designRef   = loadDesignRef(brief, profile);
  const prefs       = loadPrefs();

  const _s2 = await Promise.allSettled(channels.map(async (channel) => {
    ui.info(`[${channel}] copy-spec 작성 중...`);

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

    const channelKeywords = keywordsMap?.[channel] ?? null;

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
        suggestedKeywords: channelKeywords,
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
      designRef: designRef ?? null,
      learnedPreferences: buildLearnedPrefsForCopy(prefs, channel),
      outputDir:  channelDir,
      outputPath,
      partial: cardN !== null
        ? { cardIndex: cardN, cardTotal: cardCount, role: roleFor(cardN - 1, cardCount) }
        : null,
    };

    writeFileSync(resolve(channelDir, 'copy-spec.json'), JSON.stringify(spec, null, 2), 'utf8');
    brief.status[channel] = 'drafting';
    ui.ok(`[${channel}] copy-spec.json → ${resolve(channelDir, 'copy-spec.json')}`);
  }));
  logSettledErrors(_s2, channels);

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

  const _s3 = await Promise.allSettled(channels.map(async (channel) => {
    ui.info(`[${channel}] finalize 중...`);

    const channelDir = resolve(dir, channel);
    const specPath   = resolve(channelDir, 'copy-spec.json');
    const outputPath = resolve(channelDir, 'copy-output.json');

    if (!existsSync(specPath)) {
      ui.err(`[${channel}] copy-spec.json 없음 — 먼저 generate.mjs 를 (--finalize 없이) 실행하세요.`);
      return;
    }
    if (!existsSync(outputPath)) {
      ui.err(`[${channel}] copy-output.json 없음 — copywriter 에이전트가 아직 처리하지 않았습니다.`);
      return;
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
        return;
      }
      const existing  = readYaml(latestPath);
      const { cardIndex: cIdx, cardTotal, role } = spec.partial;
      const cardIdx   = cIdx - 1;
      const newCard   = (output.cards ?? [{ text: output.text ?? '', hashtags: output.hashtags ?? [] }])[0];

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
      return;
    }

    // ── FULL: 처음부터 draft 조립 ─────────────────────────────────────────
    const cardCount = spec.cards.length;
    const image = { paths: [], urls: [], meta: null };
    const cards = [];

    // output.cards 없으면 flat 포맷(output.text/hashtags) → cards 배열로 정규화
    const outputCards = output.cards ?? [{ index: 1, text: output.text ?? '', hashtags: output.hashtags ?? [] }];

    for (let i = 0; i < cardCount; i++) {
      const role    = spec.cards[i].role;
      const outCard = outputCards.find((c) => c.index === i + 1) ?? outputCards[i];
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
    return image.paths ?? [];
  }));
  logSettledErrors(_s3, channels);

  brief.meta = { ...(brief.meta ?? {}), updatedAt: nowKstIso() };
  writeYaml(briefPath, brief);
  openInChrome(_s3.filter((r) => r.status === 'fulfilled' && Array.isArray(r.value)).flatMap((r) => r.value));
  console.log();
  ui.dim(`다음: node bin/preview.mjs ${slug}`);
}

async function finalizeInhouseSlides({ slug, dir, briefPath, brief, profile, channels }) {
  const screenshotBin = resolve(process.cwd(), 'harness/bin/screenshot.mjs');

  const _s4 = await Promise.allSettled(channels.map(async (channel) => {
    ui.info(`[${channel}] 슬라이드 완성 중...`);

    const channelDir  = resolve(dir, channel);
    const specPath    = resolve(channelDir, 'slide-spec.json');
    const outputPath  = resolve(channelDir, 'agent-output.json');

    if (!existsSync(specPath)) {
      ui.err(`[${channel}] slide-spec.json 없음 — 먼저 generate.mjs (--finalize 없이) 실행하세요.`);
      return;
    }
    if (!existsSync(outputPath)) {
      ui.err(`[${channel}] agent-output.json 없음 — image-director 에이전트가 아직 처리하지 않았습니다.`);
      return;
    }

    const spec        = JSON.parse(readFileSync(specPath, 'utf8'));
    const agentOutput = JSON.parse(readFileSync(outputPath, 'utf8'));
    const outputCards = agentOutput.cards ?? [];
    // regen 실행 후 finalize 시 새 타임스탬프 사용 — 원본 draft 덮어쓰기 방지
    const isRegen     = !!spec.regenerationFeedback;
    const ts          = isRegen ? nowKstFilename() : spec.ts;

    // F: regen 경로에서 agent가 피드백을 실제로 반영했는지 확인
    if (isRegen && !agentOutput.regenAddressed) {
      ui.warn(`[${channel}] image-director agent-output.json 에 regenAddressed: true 가 없습니다.`);
      ui.dim('  agent 가 regen 피드백을 반영했는지 확인하세요. 계속 진행하려면 agent-output.json 에 "regenAddressed": true 를 추가하세요.');
      process.exit(1);
    }

    // C: hook-variants.json 이 있으면 변형 PNG 먼저 캡처
    const variantsPath = resolve(channelDir, 'hook-variants.json');
    if (existsSync(variantsPath)) {
      const hv = JSON.parse(readFileSync(variantsPath, 'utf8'));
      let changed = false;
      for (const v of hv.variants ?? []) {
        if (!v.pngPath && existsSync(v.htmlPath)) {
          const pngOut = v.htmlPath.replace(/\.html$/, '.png');
          try {
            execFileSync('node', [
              screenshotBin,
              `--html=${v.htmlPath}`,
              `--out=${pngOut}`,
              `--width=${spec.dimensions.width}`,
              `--height=${spec.dimensions.height}`,
            ], { stdio: 'pipe' });
            const persistPng = resolve(channelDir, `card1-v${v.index}-${spec.ts}.png`);
            writeFileSync(persistPng, readFileSync(pngOut));
            v.pngPath = persistPng;
            changed = true;
            ui.dim(`  variant ${v.index} 캡처 → ${persistPng}`);
          } catch (e) {
            ui.warn(`  variant ${v.index} 캡처 실패: ${e.message}`);
          }
        }
      }
      if (changed) writeFileSync(variantsPath, JSON.stringify(hv, null, 2), 'utf8');
    }

    // 카드별 Playwright 캡쳐
    const pngPaths = [];
    const visualFindings = []; // B: 비주얼 가드 findings
    let   heroMeasurement = null; // D: hero 면적 측정 결과
    let   thumbPath = null;       // E: 썸네일 경로

    const captureSpinner = new Spinner();
    for (const card of spec.cards) {
      if (!existsSync(card.htmlPath)) {
        ui.err(`[${channel}] HTML 파일 없음: ${card.htmlPath}`);
        continue;
      }
      const tmpPngPath     = card.htmlPath.replace(/\.html$/, '.png');
      const persistPngPath = resolve(channelDir, `card${card.index}-${ts}.png`);

      // D: hook 카드(첫 번째)에서 hero 면적 측정
      const isHookCard = card.index === 1;
      let stdoutBuf = '';
      captureSpinner.start(`[${channel}] card${card.index}/${spec.cards.length} 캡처 중...`);
      try {
        if (isHookCard) {
          try {
            stdoutBuf = execFileSync('node', [
              screenshotBin,
              `--html=${card.htmlPath}`,
              `--out=${tmpPngPath}`,
              `--width=${spec.dimensions.width}`,
              `--height=${spec.dimensions.height}`,
              '--measure-selector=[data-hero]',
            ]).toString();
          } catch (e) {
            stdoutBuf = e.stdout?.toString() ?? '';
          }
          // JSON 라인 파싱
          const jsonLine = stdoutBuf.split('\n').reverse().find((l) => l.trim().startsWith('{'));
          if (jsonLine) {
            try { heroMeasurement = JSON.parse(jsonLine.trim()); } catch { /* ignore */ }
          }
          if (heroMeasurement?.warn) {
            visualFindings.push({
              severity: 'warn',
              code: 'hero.area_ratio',
              detail: `[data-hero] 면적 ${(heroMeasurement.heroRatio * 100).toFixed(1)}% — 권장 25~55%`,
            });
          }
        } else {
          execFileSync('node', [
            screenshotBin,
            `--html=${card.htmlPath}`,
            `--out=${tmpPngPath}`,
            `--width=${spec.dimensions.width}`,
            `--height=${spec.dimensions.height}`,
          ]);
        }
      } finally {
        captureSpinner.stop(`✅ [${channel}] card${card.index} 캡처 완료`);
      }

      // 캠페인 디렉터리에 복사해서 영구 보존
      writeFileSync(persistPngPath, readFileSync(tmpPngPath));
      pngPaths.push(persistPngPath);

      // B: 카드 HTML 비주얼 텍스트 가드
      const htmlContent = readFileSync(card.htmlPath, 'utf8');
      const { findings: vf } = inspectVisualText({ htmlContent, profile });
      visualFindings.push(...vf.map((f) => ({ ...f, detail: `card${card.index}: ${f.detail}` })));

      // E: 썸네일 — hook 카드 상단 1:1 크롭 (Threads 피드 노출 시뮬레이션)
      if (isHookCard) {
        const thumbSide = spec.dimensions.width; // 1080
        const thumbPersist = resolve(channelDir, `card1-thumb-${ts}.png`);
        try {
          execFileSync('node', [
            screenshotBin,
            `--html=${card.htmlPath}`,
            `--out=${thumbPersist}`,
            `--width=${thumbSide}`,
            `--height=${thumbSide}`,
          ], { stdio: 'pipe' });
          thumbPath = thumbPersist;
        } catch { /* 썸네일 실패는 non-fatal */ }
      }
    }

    // draft 조립
    const primaryCard  = outputCards[0] ?? { text: '', hashtags: [] };
    const allHashtags  = [...new Set([
      ...(primaryCard.text.match(/#[^\s#]+/g) ?? []),
      ...(primaryCard.hashtags ?? []),
      ...(profile?.hashtags?.always ?? []),
    ])];
    const strippedText = primaryCard.text.replace(/(\n+#[^\s#]+(\s+#[^\s#]+)*\s*)$/u, '').trimEnd();
    const finalText    = allHashtags.length ? `${strippedText}\n\n${allHashtags.join(' ')}` : strippedText;

    // B: 비주얼 가드 findings 를 postCopy guardian report 에 병합
    const report = inspect({ channel, text: finalText, hashtags: allHashtags, profile });
    if (visualFindings.length) {
      report.findings.push(...visualFindings);
      report.summary.warns += visualFindings.filter((f) => f.severity === 'warn').length;
      if (report.severity === 'ok' && visualFindings.some((f) => f.severity === 'warn')) {
        report.severity = 'warn';
      }
    }

    // D: hero 측정 결과 report에 포함
    if (heroMeasurement) report.heroMeasurement = heroMeasurement;

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
      thumbnail:   thumbPath ?? undefined,   // E: 피드 썸네일 시뮬레이션 (card1 1:1 크롭)
      assetUrls:   [],
      guardian:    report,
    };

    writeYaml(resolve(channelDir, `${ts}.yaml`), draft);
    writeFileSync(resolve(channelDir, `${ts}.md`), renderDraftMd(draft), 'utf8');

    // F: regen 완료 후 regenerationFeedback 필드 제거 — 이후 --finalize 가 새 ts 를 계속 쓰는 것 방지
    if (isRegen) {
      const cleanSpec = { ...spec };
      delete cleanSpec.regenerationFeedback;
      writeFileSync(specPath, JSON.stringify(cleanSpec, null, 2), 'utf8');
    }

    brief.status[channel] = report.ok ? 'preview' : 'drafting';
    brief.meta = { ...(brief.meta ?? {}), updatedAt: nowKstIso() };

    if (report.ok) ui.ok(`[${channel}] preview 준비됨 (warns: ${report.summary.warns})`);
    else           ui.err(`[${channel}] 가디언 차단 (${report.summary.blocks}건). draft.md 검토 후 재생성.`);

    // D: hero 면적 경고 출력
    if (heroMeasurement?.warn) {
      ui.dim(`  ⚠ hero 면적 ${(heroMeasurement.heroRatio * 100).toFixed(1)}% — 25~55% 권장. [data-hero] 요소를 더 크게 조정 필요.`);
    }
    // E: 썸네일 경로 출력
    if (thumbPath) {
      ui.dim(`  🖼 피드 썸네일: ${thumbPath}`);
    }
    return pngPaths;
  }));
  logSettledErrors(_s4, channels);

  writeYaml(briefPath, brief);
  openInChrome(_s4.filter((r) => r.status === 'fulfilled' && Array.isArray(r.value)).flatMap((r) => r.value));
  console.log();
  ui.dim(`다음: node bin/preview.mjs ${slug}`);
}

// Promise.allSettled 결과에서 rejected 항목만 ui.warn 으로 출력.
// 개별 채널 실패가 다른 채널 결과와 writeYaml 을 막지 않도록 allSettled 를 사용.
function logSettledErrors(results, channels) {
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      ui.warn(`[${channels[i]}] 예기치 않은 오류: ${r.reason?.message ?? r.reason}`);
    }
  });
}

function extractHashtags(text) {
  return Array.from(new Set((text.match(/#[^\s#]+/g) ?? [])));
}

// C: --select-variant=N 처리 — 선택된 변형을 canonical card1 슬롯에 복사 후 재캡처
async function selectVariant({ slug, dir, briefPath, brief, profile, channel, variantIdx }) {
  const screenshotBin = resolve(process.cwd(), 'harness/bin/screenshot.mjs');
  const channelDir    = resolve(dir, channel);
  const variantsPath  = resolve(channelDir, 'hook-variants.json');
  const specPath      = resolve(channelDir, 'slide-spec.json');

  if (!existsSync(variantsPath)) {
    ui.err(`hook-variants.json 없음 — ${channel} 채널에 variants 가 생성되지 않았습니다.`);
    process.exit(2);
  }
  if (!existsSync(specPath)) {
    ui.err('slide-spec.json 없음 — generate.mjs 를 먼저 실행하세요.');
    process.exit(2);
  }

  const hv   = JSON.parse(readFileSync(variantsPath, 'utf8'));
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const chosen = (hv.variants ?? []).find((v) => v.index === variantIdx);

  if (!chosen) {
    ui.err(`variant ${variantIdx} 를 찾을 수 없습니다. 유효한 인덱스: ${(hv.variants ?? []).map((v) => v.index).join(', ')}`);
    process.exit(2);
  }
  if (!existsSync(chosen.htmlPath)) {
    ui.err(`선택된 variant HTML 파일 없음: ${chosen.htmlPath}`);
    process.exit(2);
  }

  // canonical card1 htmlPath 에 선택된 HTML 복사
  const canonicalHtmlPath = spec.cards[0].htmlPath;
  writeFileSync(canonicalHtmlPath, readFileSync(chosen.htmlPath));
  ui.ok(`variant ${variantIdx} (${chosen.label}) → ${canonicalHtmlPath} 에 적용`);

  // 재캡처
  const ts          = spec.ts;
  const persistPng  = resolve(channelDir, `card1-${ts}.png`);
  execFileSync('node', [
    screenshotBin,
    `--html=${canonicalHtmlPath}`,
    `--out=${persistPng}`,
    `--width=${spec.dimensions.width}`,
    `--height=${spec.dimensions.height}`,
    '--measure-selector=[data-hero]',
  ], { stdio: 'inherit' });

  hv.selectedVariant = variantIdx;
  writeFileSync(variantsPath, JSON.stringify(hv, null, 2), 'utf8');

  ui.ok(`card1 PNG 업데이트 완료 → ${persistPng}`);
  ui.dim('다음: node harness/bin/generate.mjs <slug> --finalize (이미 finalize 됐으면 preview 만 재실행)');
}

// F: eval.json 피드백을 slide-spec.json 의 regenerationFeedback 필드에 주입
function injectRegenFeedback({ slug, dir, brief, channels }) {
  let hadError = false;

  for (const channel of channels) {
    const channelDir = resolve(dir, channel);
    const evalPath   = resolve(channelDir, 'eval.json');
    const specPath   = resolve(channelDir, 'slide-spec.json');

    if (!existsSync(evalPath)) {
      ui.err(`[${channel}] eval.json 없음 — evaluate.mjs 와 card-evaluator 를 먼저 실행하세요.`);
      hadError = true;
      continue;
    }
    if (!existsSync(specPath)) {
      ui.err(`[${channel}] slide-spec.json 없음 — generate.mjs 를 먼저 실행하세요.`);
      hadError = true;
      continue;
    }

    let evalData, spec;
    try {
      evalData = JSON.parse(readFileSync(evalPath, 'utf8'));
      spec     = JSON.parse(readFileSync(specPath, 'utf8'));
    } catch (e) {
      ui.err(`[${channel}] JSON 파싱 실패 — ${e.message}`);
      hadError = true;
      continue;
    }

    // 이미 regen 피드백이 주입된 spec 이면 경고만 — 다른 채널은 계속 처리
    if (spec.regenerationFeedback) {
      ui.warn(`[${channel}] slide-spec.json 에 이미 regenerationFeedback 이 있습니다. --regen 을 두 번 실행하지 마세요.`);
      ui.dim('  재평가 후 다시 regen 하려면: evaluate.mjs 실행 → card-evaluator → generate.mjs --regen');
      continue;
    }

    const failedCards = (evalData.cards ?? []).filter((c) => !c.pass);
    if (failedCards.length === 0) {
      ui.ok(`[${channel}] 모든 카드 합격 — 재생성 불필요`);
      continue;
    }

    spec.regenerationFeedback = {
      evaluatedAt: evalData.evaluatedAt ?? null,
      overallScore: evalData.overallScore ?? null,
      cards: failedCards.map((c) => ({
        index:    c.index,
        role:     c.role,
        score:    c.score,
        feedback: c.feedback ?? [],
        breakdown: Object.fromEntries(
          Object.entries(c.breakdown ?? {})
            .filter(([, v]) => v.score === 0 && v.note)
            .map(([k, v]) => [k, v.note])
        ),
      })),
    };

    writeFileSync(specPath, JSON.stringify(spec, null, 2), 'utf8');
    ui.ok(`[${channel}] regenerationFeedback → slide-spec.json 에 주입 완료 (실패 카드: ${failedCards.map((c) => c.index).join(', ')})`);

    console.log();
    ui.info('이제 image-director 에이전트를 다시 인라인으로 실행하세요:');
    ui.dim(`  harness/agents/image-director.md 를 읽고 ${specPath} 를 처리`);
    ui.dim(`  이후: node harness/bin/generate.mjs ${slug} --channel=${channel} --finalize`);
  }

  if (hadError) process.exit(1);
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
    swiss_type:        'Swiss International style — clean grid-based composition, geometric precision, high contrast shapes',
  };
  const aestheticDesc = imgStyle.aesthetic === 'custom'
    ? (imgStyle.customAesthetic ?? 'modern editorial')
    : (aestheticMap[imgStyle.aesthetic] ?? 'modern editorial — purposeful composition, strong visual hierarchy');

  // ── 이미지 성격 (abstract / concrete) ─────────────────────────────────
  // IMPORTANT: Never ask image models to render text/typography — Korean characters will be garbled.
  // All text overlay is handled at the post-processing / inhouse-slides layer.
  const abstractDesc = imgStyle.preferAbstract === false
    ? `Concrete imagery: real objects, spaces, textures, or scenes that evoke the feeling of "${brief.topic}". No text, no letters, no characters of any kind.`
    : `Abstract visual composition using color, shape, light, and depth to evoke the mood of "${brief.topic}". Pure visual — absolutely no text, letters, numbers, or typographic elements anywhere in the image.`;

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
    'ANY text, letters, numbers, characters, glyphs, words, or typography of any language. Human faces, real people, real logos, watermarks.',
    userAvoid ? `Also avoid: ${userAvoid}.` : '',
  ].filter(Boolean).join(' ');

  // ── 채널·역할 ──────────────────────────────────────────────────────────
  const channelNote = channel === 'linkedin'
    ? 'Professional B2B context — clean, credible, boardroom-ready.'
    : 'Korean SNS card — scroll-stopping, immediate visual hook.';

  const roleComposition = {
    single: 'Full-bleed hero. One dominant focal element, 60%+ negative space.',
    hook:   `HOOK card ${n}/${total}. Single dominant visual element filling 70% of frame. Maximum immediate visual impact. Pure imagery, no text.`,
    body:   `BODY card ${n}/${total}. Structured layout with visual space for one key insight or statistic.`,
    cta:    `CTA card ${n}/${total}. Stronger brand color presence than other cards. Clear action zone at bottom third.`,
  }[role] ?? 'Hero card. Strong single focal point.';

  return [
    'PURELY VISUAL IMAGE. ABSOLUTELY NO TEXT, LETTERS, WORDS, OR CHARACTERS OF ANY LANGUAGE ANYWHERE IN THE IMAGE.',
    `SNS card visual. ${channelNote}`,
    `TOPIC: ${brief.topic}`,
    audienceHint,
    '',
    `STYLE: ${aestheticDesc}`,
    'Large-scale composition.',
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

function openInChrome(paths) {
  const local = (paths ?? []).filter((p) => p && existsSync(p));
  if (!local.length) return;
  try {
    const { platform } = process;
    if (platform === 'darwin') {
      spawnSync('open', ['-a', 'Google Chrome', ...local], { stdio: 'ignore' });
    } else if (platform === 'linux') {
      for (const p of local) spawnSync('xdg-open', [p], { stdio: 'ignore' });
    } else if (platform === 'win32') {
      spawnSync('cmd', ['/c', 'start', '', ...local], { stdio: 'ignore' });
    }
    ui.dim(`  브라우저 오픈: ${local.length}개 파일`);
  } catch {}
}

function renderDraftMd(d) {
  const findings = d.guardian.findings.length
    ? d.guardian.findings.map((f) => `- **${f.severity}** \`${f.code}\`${f.detail ? ` — ${f.detail}` : ''}`).join('\n')
    : '_(없음)_';
  return [
    `# ${d.slug} / ${d.channel}`,
    ``,
    `> generated ${d.generatedAt} · provider \`${d.provider?.provider ?? 'unknown'}\` (${d.provider?.model ?? '-'}) · image \`${d.image?.provider ?? 'unknown'}\` (${d.image?.model ?? '-'})`,
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

