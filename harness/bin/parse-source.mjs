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

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, basename, dirname, extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { ROOT, ui } from './_lib.mjs';

const argv = process.argv.slice(2);
const srcPath = argv.find((a) => !a.startsWith('--'));
const asJson = argv.includes('--json');
const applySlug = argv.find((a) => a.startsWith('--apply='))?.split('=')[1];
const useLlm = argv.includes('--llm');
const skipImages = argv.includes('--no-images');

if (!srcPath) {
  ui.err('사용법: parse-source.mjs <src-path> [--json] [--apply=<slug>] [--llm] [--no-images]');
  ui.err('  src-path: .md / .markdown / .txt / .pdf');
  process.exit(2);
}

if (!existsSync(srcPath)) {
  ui.err(`파일 없음: ${srcPath}`);
  process.exit(2);
}

// .pdf 면 parse-pdf.mjs 로 md 변환 후 진행
let mdPath = srcPath;
let pdfMeta = null;
if (/\.pdf$/i.test(srcPath)) {
  ui.dim(`PDF 인식 → parse-pdf.mjs 호출`);
  const r = spawnSync(process.execPath, [resolve(ROOT, 'harness/bin/parse-pdf.mjs'), srcPath, '--json'], {
    encoding: 'utf8', maxBuffer: 50 * 1024 * 1024,
  });
  if (r.status !== 0) {
    ui.err(`parse-pdf 실패: ${r.stderr || r.stdout}`);
    process.exit(2);
  }
  let pdfResult;
  try { pdfResult = JSON.parse(r.stdout); }
  catch (e) {
    ui.err(`parse-pdf 출력 파싱 실패: ${e.message}`);
    process.exit(2);
  }
  pdfMeta = { title: pdfResult.title, pageCount: pdfResult.pageCount, author: pdfResult.author };
  // PDF 의 md 를 같은 디렉토리에 저장 (재실행 캐싱 + 사용자가 확인 가능)
  mdPath = srcPath.replace(/\.pdf$/i, '.pdf.md');
  writeFileSync(mdPath, pdfResult.md, 'utf8');
  ui.dim(`PDF → md 저장: ${basename(mdPath)} (${pdfResult.pageCount} pages)`);
}

const raw = readFileSync(mdPath, 'utf8');
const parsed = parseMarkdown(raw, mdPath);
if (pdfMeta) parsed._meta.pdf = pdfMeta;

// 이미지 자동 다운로드 (Phase 2.4)
if (!skipImages) {
  const downloaded = await downloadImages(raw, mdPath);
  if (downloaded.length) {
    parsed.sourceMaterials.images = [
      ...(parsed.sourceMaterials.images || []),
      ...downloaded,
    ];
    ui.dim(`이미지 자동 다운로드: ${downloaded.length}장`);
  }
}

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

// ─── 이미지 자동 다운로드 (Phase 2.4) ──────────────────────
async function downloadImages(raw, mdSrcPath) {
  // ![alt](url) 패턴 추출. data: / file: 제외, http(s) 만
  const re = /!\[([^\]]*)\]\((https?:\/\/[^\s)"]+)\)/g;
  const matches = [...raw.matchAll(re)];
  if (!matches.length) return [];

  // 저장 디렉토리 — md 와 같은 디렉토리에 _assets/<md-basename>/
  const baseName = basename(mdSrcPath).replace(/\.(md|markdown|txt|pdf\.md)$/i, '');
  const assetsDir = resolve(dirname(mdSrcPath), '_assets', baseName);
  mkdirSync(assetsDir, { recursive: true });

  const seen = new Set();
  const downloaded = [];
  let i = 0;
  for (const [, alt, url] of matches) {
    if (seen.has(url)) continue;
    seen.add(url);
    i++;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!r.ok) {
        ui.warn(`  이미지 다운로드 실패 (HTTP ${r.status}): ${url.slice(0, 60)}`);
        continue;
      }
      const contentType = r.headers.get('content-type') || '';
      // 확장자 — content-type → URL → fallback
      let ext = '';
      if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';
      else if (contentType.includes('png')) ext = '.png';
      else if (contentType.includes('webp')) ext = '.webp';
      else if (contentType.includes('gif')) ext = '.gif';
      else if (contentType.includes('svg')) ext = '.svg';
      else {
        const urlExt = url.match(/\.(jpe?g|png|webp|gif|svg)(?:\?|$)/i)?.[0]?.split('?')[0];
        ext = urlExt || '.bin';
      }
      const safeAlt = (alt || `img${i}`).replace(/[^\w가-힣\- ]/g, '_').slice(0, 40) || `img${i}`;
      const fileName = `${String(i).padStart(2, '0')}-${safeAlt}${ext}`;
      const outPath = resolve(assetsDir, fileName);
      const buf = Buffer.from(await r.arrayBuffer());
      writeFileSync(outPath, buf);
      downloaded.push({
        path: outPath.replace(/\\/g, '/'),
        alt: alt || null,
        src: url,
        size: buf.length,
      });
    } catch (e) {
      ui.warn(`  이미지 다운로드 에러: ${e.message} — ${url.slice(0, 60)}`);
    }
  }
  return downloaded;
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
