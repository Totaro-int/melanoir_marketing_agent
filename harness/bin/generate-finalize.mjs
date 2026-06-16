// generate.mjs 에서 분리됨
import { resolve } from 'node:path';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  readYaml, writeYaml, nowKstIso, nowKstFilename, ui, latestDraftYaml, Spinner,
} from './_lib.mjs';
import { inspect, inspectVisualText } from '../src/content-engine/brand-guardian.mjs';
import {
  mergeHashtags, extractHashtags, logSettledErrors,
  renderDraftMd, CHANNEL_URLS, openInChrome, roleFor,
  imagesFor,
} from './generate-helpers.mjs';

// ── 일반 채널 finalize ────────────────────────────────────────────────────

export async function finalizeRegularChannels({ slug, dir, briefPath, brief, profile, channels, provider, flags }) {
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
      const report          = inspect({ channel, text: merged.text, hashtags: merged.hashtags, profile, brief, sourceMaterials: brief.sourceMaterials });

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
    const report  = inspect({ channel, text: merged.text, hashtags: merged.hashtags, profile, brief, sourceMaterials: brief.sourceMaterials });

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
  const succeededChannels3 = channels.filter((_, i) => _s3[i]?.status === 'fulfilled');
  openInChrome([
    ..._s3.filter((r) => r.status === 'fulfilled' && Array.isArray(r.value)).flatMap((r) => r.value),
    ...succeededChannels3.map((ch) => CHANNEL_URLS[ch]).filter(Boolean),
  ]);
  console.log();
  ui.dim(`다음: node bin/preview.mjs ${slug}`);
}

// ── inhouse-slides finalize ───────────────────────────────────────────────

export async function finalizeInhouseSlides({ slug, dir, briefPath, brief, profile, channels }) {
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
    const report = inspect({ channel, text: finalText, hashtags: allHashtags, profile, brief, sourceMaterials: brief.sourceMaterials });
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
  const succeededChannels4 = channels.filter((_, i) => _s4[i]?.status === 'fulfilled');
  openInChrome([
    ..._s4.filter((r) => r.status === 'fulfilled' && Array.isArray(r.value)).flatMap((r) => r.value),
    ...succeededChannels4.map((ch) => CHANNEL_URLS[ch]).filter(Boolean),
  ]);
  console.log();
  ui.dim(`다음: node bin/preview.mjs ${slug}`);
}

// ── blog finalize (kind: blog — naver-blog / tistory / brunch) ─────────────
// image-director(Blog Mode)가 쓴 agent-output.json 을 읽어 발행 직전 draft 로 조립한다.
//   1. 본문(cards[0].text) 의 IMAGE_PLACEHOLDER_N 을 imageSlots[].url 로 (재)치환
//   2. url 없는(이미지 미생성) 슬롯의 깨진 ![..](IMAGE_PLACEHOLDER_N) 줄 정리
//   3. assetUrls = 슬롯 url 순서대로, guardian 본문 검사 → draft.yaml + .md
// 카드 경로(finalizeInhouseSlides)와 달리 Playwright 캡처 없음 — 본문 markdown 발행형.
export async function finalizeBlog({ slug, dir, briefPath, brief, profile, channels }) {
  const _sb = await Promise.allSettled(channels.map(async (channel) => {
    ui.info(`[${channel}] blog finalize 중...`);

    const channelDir = resolve(dir, channel);
    const outputPath = resolve(channelDir, 'agent-output.json');

    if (!existsSync(outputPath)) {
      ui.err(`[${channel}] agent-output.json 없음 — image-director(Blog Mode)가 아직 처리하지 않았습니다.`);
      ui.dim('  순서: generate(copy-spec) → copywriter → image-director(Blog Mode) → --finalize');
      return;
    }

    const agentOutput = JSON.parse(readFileSync(outputPath, 'utf8'));
    const card0 = (agentOutput.cards ?? [])[0] ?? {};
    let body    = card0.text ?? '';
    const slots = card0.imageSlots ?? agentOutput.imageSlots ?? [];

    // 1. placeholder → url (재)치환 + url 순서 수집
    const urls = [];
    let missing = 0;
    for (const slot of slots) {
      const ph  = slot.placeholder || `IMAGE_PLACEHOLDER_${slot.index}`;
      const url = slot.url || slot.assetUrl || null;
      if (url) {
        urls.push(url);
        body = body.split(ph).join(url);
      } else {
        missing++;
      }
    }

    // 2. 미치환 placeholder(이미지 못 만든 슬롯) 가 본문에 남았으면 그 이미지 줄만 제거
    const leftover = (body.match(/IMAGE_PLACEHOLDER_\d+/g) || []).length;
    if (leftover) {
      body = body
        .replace(/^\s*!\[[^\]]*\]\(\s*IMAGE_PLACEHOLDER_\d+[^)]*\)\s*$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trimEnd();
    }

    // 3. hashtags = profile.always + 본문 frontmatter tags + agent hashtags
    const fmTags = (body.match(/^tags:\s*\[([^\]]*)\]/m)?.[1] ?? '')
      .split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    const hashtags = [...new Set([
      ...(profile?.hashtags?.always ?? []),
      ...(card0.hashtags ?? []),
      ...fmTags,
    ])];

    // 본문 텍스트 guardian (카드 비주얼 가드 아님 — 광고법/금기어 본문 검사)
    const report = inspect({ channel, text: body, hashtags, profile, brief, sourceMaterials: brief.sourceMaterials });

    const ts = nowKstFilename();
    const imageProvider = agentOutput.meta?.imageProvider || agentOutput.imageProvider || 'fal-ai/nano-banana-2';
    const draft = {
      version:     1,
      slug,
      channel,
      generatedAt: nowKstIso(),
      provider:    { provider: 'copywriter', model: 'claude-subagent' },
      image:       { provider: 'fal', model: imageProvider },
      text:        body,
      hashtags,
      assets:      [],            // 인라인 url 우선 — 로컬 png 첨부는 발행 어댑터가 처리
      assetUrls:   urls,          // 섹션 인라인 이미지 url (본문 등장 순서)
      imageSlots:  slots,         // 발행 시 인라인 위치 매핑용 (position/alt 보존)
      guardian:    report,
    };

    writeYaml(resolve(channelDir, `${ts}.yaml`), draft);
    writeFileSync(resolve(channelDir, `${ts}.md`), renderDraftMd(draft), 'utf8');

    brief.status[channel] = report.ok ? 'preview' : 'drafting';

    if (missing || leftover) {
      ui.warn(`[${channel}] 이미지 미생성 슬롯 ${missing + leftover}개 — placeholder 정리됨 (FAL_KEY/모델 권한 확인).`);
    }
    if (report.ok) ui.ok(`[${channel}] blog preview 준비됨 — 인라인 이미지 ${urls.length}장, warns: ${report.summary.warns}`);
    else           ui.err(`[${channel}] 가디언 차단 (${report.summary.blocks}건). 본문 검토 후 재생성.`);
    return urls;
  }));
  logSettledErrors(_sb, channels);

  brief.meta = { ...(brief.meta ?? {}), updatedAt: nowKstIso() };
  writeYaml(briefPath, brief);
  console.log();
  ui.dim(`다음: node bin/preview.mjs ${slug}`);
}

// ── --select-variant=N 처리 ───────────────────────────────────────────────

export async function selectVariant({ slug, dir, briefPath, brief, profile, channel, variantIdx }) {
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

// ── --regen: eval.json 피드백 → slide-spec.json 주입 ─────────────────────

export function injectRegenFeedback({ slug, dir, brief, channels }) {
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

// ── imagePromptFor ────────────────────────────────────────────────────────

export function imagePromptFor(channel, brief, profile, role = 'single', n = 1, total = 1) {
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
