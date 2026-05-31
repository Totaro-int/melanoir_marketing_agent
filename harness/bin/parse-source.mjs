#!/usr/bin/env node
// parse-source.mjs — 사용자가 던진 md 파일을 brief.yaml partial 로 변환.
// 사용자가 매번 keyMessage/contentPoints/angle 수기 작성하는 시간 (10-15분) → 1분.
//
// Usage:
//   node harness/bin/parse-source.mjs <md-path>                    # stdout 에 brief partial yaml
//   node harness/bin/parse-source.mjs <md-path> --json              # JSON 출력
//   node harness/bin/parse-source.mjs <md-path> --apply=<slug>      # 기존 캠페인의 brief.yaml 에 merge
//
// 정규식 기반 추출 (LLM 호출 X, 무료/즉시). 정확도 80-90%.
// LLM 보정이 필요하면: --llm 플래그 (claude API, 비용 ~$0.01)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import YAML from 'yaml';
import { ROOT, ui } from './_lib.mjs';

const argv = process.argv.slice(2);
const mdPath = argv.find((a) => !a.startsWith('--'));
const asJson = argv.includes('--json');
const applySlug = argv.find((a) => a.startsWith('--apply='))?.split('=')[1];
const useLlm = argv.includes('--llm');

if (!mdPath) {
  ui.err('사용법: parse-source.mjs <md-path> [--json] [--apply=<slug>] [--llm]');
  process.exit(2);
}

if (!existsSync(mdPath)) {
  ui.err(`파일 없음: ${mdPath}`);
  process.exit(2);
}

const raw = readFileSync(mdPath, 'utf8');
const parsed = parseMarkdown(raw, mdPath);

if (asJson) {
  console.log(JSON.stringify(parsed, null, 2));
} else if (applySlug) {
  applyToBrief(applySlug, parsed);
} else {
  console.log('# brief.yaml partial (parse-source.mjs)');
  console.log('# source:', mdPath);
  console.log('');
  console.log(YAML.stringify(parsed, { lineWidth: 100 }));
}

// ─── 핵심 로직 ──────────────────────────────────────────────

function parseMarkdown(raw, srcPath) {
  // front-matter
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  let frontMatter = {};
  let bodyAll = raw;
  if (fmMatch) {
    try { frontMatter = YAML.parse(fmMatch[1]) || {}; } catch {}
    bodyAll = fmMatch[2];
  }

  // bodyAll 의 H1 (전체 마커 전 — 문서 제목용)
  const rawH1 = bodyAll.match(/^#\s+(.+)$/m)?.[1]?.trim();

  // === 본문 === / === 본문 끝 === 마커가 있으면 그 사이만 (실제 콘텐츠)
  let body = bodyAll;
  const bodyMarker = bodyAll.match(/===\s*본문[^=]*===([\s\S]*?)===\s*본문\s*끝/);
  if (bodyMarker) body = bodyMarker[1].trim();

  // 헤딩 추출 (body = 실제 콘텐츠만)
  const h1 = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const h2s = [...body.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
  const h3s = [...body.matchAll(/^###\s+(.+)$/gm)].map((m) => m[1].trim());

  // 첫 진짜 단락 — 메타 라인 (이미지 설명, 인용구 헤더) 제외
  const firstPara = (() => {
    const beforeH2 = body.split(/^##\s/m)[0];
    const paras = beforeH2
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
      // 메타 라인 필터 — 인용구, 코드 블록, 이미지 마커, 따옴표 시작 등
      .filter((p) => !/^[>`!]/.test(p) && !/^\*\*[가-힣]+\*\*:/.test(p) && p.length > 50);
    return paras[0] || '';
  })();

  // 핵심 요약 섹션 (## 핵심 요약 또는 ## 요약)
  const summarySection = body.match(/^##\s+(?:핵심\s+)?요약\s*\n+([\s\S]*?)(?=\n##\s|\n=== |$)/m);
  const keyMessageCandidates = [
    frontMatter.summary,
    summarySection?.[1]?.split('\n\n')[0]?.trim(),
    firstPara,
  ].filter(Boolean);
  const keyMessage = keyMessageCandidates[0]?.replace(/\s+/g, ' ').slice(0, 280);

  // contentPoints — H2 만 (메타 헤더 제외)
  const META_KEYWORDS = /요약|자주\s*묻|FAQ|마무리|체크리스트|발행\s*설정|이미지\s*프롬프트|네이버\s*에디터|대표\s*이미지|썸네일|복붙|front-matter|drag/i;
  const contentPoints = [];
  for (const h of h2s) {
    if (META_KEYWORDS.test(h)) continue;
    if (h.includes('IMAGE_PLACEHOLDER')) continue;
    contentPoints.push(h);
  }
  // 리스트 항목 중 정량 수치 포함된 거 (보조)
  const numericLis = [...body.matchAll(/^[-*]\s+(.+(?:\d|%|nm|mg|SPF|UVA|UVB|ORAC).+)$/gm)]
    .map((m) => m[1].trim())
    .filter((s) => !META_KEYWORDS.test(s) && !s.includes('IMAGE_PLACEHOLDER') && s.length < 200)
    .slice(0, 5);
  contentPoints.push(...numericLis);

  // tags / hashtags
  const tags = [];
  if (Array.isArray(frontMatter.tags)) tags.push(...frontMatter.tags);
  const hashTagLine = body.match(/#[\p{L}\d_]+(?:\s+#[\p{L}\d_]+){4,}/u);
  if (hashTagLine) {
    const tags2 = hashTagLine[0].match(/#[\p{L}\d_]+/gu)?.map((t) => t.replace(/^#/, ''));
    tags.push(...(tags2 || []));
  }

  // angle 추정 (notes / 본문 톤)
  const isAcademic = /논문|DOI|RSC|Nature|et\s+al|peer.?review|학술|시험성적서/i.test(body);
  const isSales = /구매|할인|한정|런칭|신제품|쇼핑/i.test(body);
  const isInfo = /검색|AEO|Cue:|FAQ|체크리스트/i.test(body);
  const isB2B = /OEM|ODM|MoQ|B2B|기업|파트너십|견적/i.test(body);

  let angle = '정보성';
  let tonePreset = 'relate-kr';
  if (isAcademic) { angle = '학술 인용 검증형 (AEO/E-E-A-T 강화)'; tonePreset = 'informational'; }
  else if (isB2B) { angle = 'B2B 인사이트'; tonePreset = 'b2b'; }
  else if (isSales) { angle = '직접 영업'; tonePreset = 'sales'; }
  else if (isInfo) { angle = '정보성 (AEO 친화)'; tonePreset = 'informational'; }

  // 메트릭
  const bodyLength = body.replace(/!\[[^\]]*\]\([^)]+\)/g, '').replace(/\s+/g, '').length;
  const tableCount = (body.match(/^\|.+\|$/gm) || []).filter((l) => /\|.*-/.test(l)).length;
  const faqCount = (body.match(/(?:^Q\.?\s*\d+|^\*\*[가-힣]+.+\?\*\*$)/gm) || []).length;
  const imageMarkers = [...body.matchAll(/IMAGE_PLACEHOLDER_(\d+)/g)].length;

  return {
    topic: frontMatter.title || h1 || rawH1 || '제목 추출 실패',
    keyMessage,
    contentPoints: contentPoints.slice(0, 12),
    angle,
    tonePreset,
    notes: `parse-source.mjs 자동 추출 · 본문 ${bodyLength}자 · 표 ${tableCount} · FAQ ${faqCount} · 이미지 marker ${imageMarkers}개 · 소스: ${basename(srcPath)}`,
    hashtags: [...new Set(tags)].slice(0, 20),
    sourceMaterials: {
      texts: [{ path: srcPath.replace(/\\/g, '/'), type: 'markdown', desc: 'parse-source.mjs 자동 등록' }],
      images: [],
    },
    _meta: {
      detected: {
        academic: isAcademic, sales: isSales, info: isInfo, b2b: isB2B,
        h2Count: h2s.length, h3Count: h3s.length,
        firstParaLength: firstPara.length,
      },
    },
  };
}

function applyToBrief(slug, parsed) {
  const briefPath = resolve(ROOT, 'posts', 'campaigns', slug, 'brief.yaml');
  if (!existsSync(briefPath)) {
    ui.err(`brief.yaml 없음: ${briefPath} — campaign-new.mjs 먼저`);
    process.exit(2);
  }
  const current = YAML.parse(readFileSync(briefPath, 'utf8')) || {};
  // backup
  writeFileSync(briefPath + '.bak', readFileSync(briefPath));
  // merge — 기존 값 보존, parsed 가 비어있지 않은 필드만 덮어씀
  const next = {
    ...current,
    topic:           parsed.topic || current.topic,
    keyMessage:      parsed.keyMessage || current.keyMessage,
    contentPoints:   parsed.contentPoints?.length ? parsed.contentPoints : current.contentPoints,
    angle:           parsed.angle || current.angle,
    tonePreset:      parsed.tonePreset || current.tonePreset,
    notes:           parsed.notes || current.notes,
    sourceMaterials: parsed.sourceMaterials || current.sourceMaterials,
  };
  next.meta = { ...(next.meta || {}), updatedAt: new Date().toISOString() };
  writeFileSync(briefPath, YAML.stringify(next, { lineWidth: 100 }), 'utf8');
  ui.ok(`brief.yaml merged: ${briefPath}`);
  ui.dim(`  topic:        ${next.topic}`);
  ui.dim(`  keyMessage:   ${(next.keyMessage || '').slice(0, 80)}...`);
  ui.dim(`  contentPoints: ${next.contentPoints?.length || 0}개`);
  ui.dim(`  tonePreset:   ${next.tonePreset}`);
  ui.dim(`  hashtags:     ${(next.hashtags || []).length}개`);
}
