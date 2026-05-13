// generate.mjs 에서 분리됨
import { resolve } from 'node:path';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  loadChannelDocs, nowKstIso, nowKstFilename, ui,
} from './_lib.mjs';
import { loadPrefs } from '../src/preferences.mjs';
import {
  loadKeywordsMap, loadDesignRef,
  buildLearnedPrefsForCopy, buildLearnedPrefsForImage,
  imagesFor, roleFor, logSettledErrors,
} from './generate-helpers.mjs';
import { writeYaml } from './_lib.mjs';

// ── inhouse-slides 전용 spec 작성 ────────────────────────────────────────

export async function writeInhouseSpecs({ slug, dir, briefPath, brief, profile, channels, flags, withImages = false }) {
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

export async function writeCopySpecs({ slug, dir, briefPath, brief, profile, channels, flags }) {
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

