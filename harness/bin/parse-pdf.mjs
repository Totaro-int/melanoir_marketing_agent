#!/usr/bin/env node
// parse-pdf.mjs — PDF → md 변환. parse-source.mjs 가 .pdf 만나면 호출.
//
// Usage:
//   node harness/bin/parse-pdf.mjs <pdf-path>                 # md 본문을 stdout
//   node harness/bin/parse-pdf.mjs <pdf-path> --out=<md-path> # 파일로 저장
//   node harness/bin/parse-pdf.mjs <pdf-path> --json          # 메타 + 본문 JSON
//
// 텍스트 위주. 이미지/표는 placeholder 로 마킹.
// 페이지별 spacing 보존. 첫 페이지 제목 자동 추출.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { ui } from './_lib.mjs';

const argv = process.argv.slice(2);
const pdfPath = argv.find((a) => !a.startsWith('--'));
const outPath = argv.find((a) => a.startsWith('--out='))?.split('=')[1];
const asJson = argv.includes('--json');

if (!pdfPath) {
  ui.err('사용법: parse-pdf.mjs <pdf-path> [--out=<md-path>] [--json]');
  process.exit(2);
}
if (!existsSync(pdfPath)) {
  ui.err(`파일 없음: ${pdfPath}`);
  process.exit(2);
}

// pdfjs-dist 동적 import (legacy build — Node 환경)
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

const buf = readFileSync(pdfPath);
// pdfjs 가 자체 보유한 Uint8Array 가 아니라 Buffer 가 오면 변환
const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

const loadingTask = pdfjs.getDocument({
  data,
  // worker 비활성 (Node 에서는 main thread 만)
  useSystemFonts: false,
  disableFontFace: true,
  isEvalSupported: false,
  // verbosity ERRORS only
  verbosity: 0,
});

const pdf = await loadingTask.promise;
const pageCount = pdf.numPages;
const meta = await pdf.getMetadata().catch(() => null);

const pages = [];
let title = meta?.info?.Title?.trim() || '';

for (let p = 1; p <= pageCount; p++) {
  const page = await pdf.getPage(p);
  const content = await page.getTextContent();
  // textContent.items: [{str, transform, ...}]
  // y 좌표 기준으로 라인 그룹화 (PDF 는 단어/문자 단위로 옴)
  const lines = [];
  let curY = null;
  let curLine = [];
  for (const it of content.items) {
    if (!it.str) continue;
    const y = Math.round(it.transform[5]);  // 같은 y → 같은 라인
    if (curY === null || Math.abs(curY - y) <= 2) {
      curLine.push(it.str);
      curY = y;
    } else {
      if (curLine.length) lines.push(curLine.join(' ').replace(/\s+/g, ' ').trim());
      curLine = [it.str];
      curY = y;
    }
  }
  if (curLine.length) lines.push(curLine.join(' ').replace(/\s+/g, ' ').trim());
  pages.push(lines.filter(Boolean));

  // 첫 페이지 첫 라인을 title 로 (메타에 없을 때만)
  if (p === 1 && !title && lines[0]) {
    title = lines[0].slice(0, 120);
  }
}

await pdf.cleanup();
await pdf.destroy();

// md 조립 — 페이지 구분, 빈 줄 정리
const mdLines = [];
mdLines.push('---');
mdLines.push(`title: ${escapeFm(title || basename(pdfPath))}`);
if (meta?.info?.Author) mdLines.push(`author: ${escapeFm(meta.info.Author)}`);
if (meta?.info?.Subject) mdLines.push(`subject: ${escapeFm(meta.info.Subject)}`);
if (meta?.info?.CreationDate) mdLines.push(`creationDate: "${meta.info.CreationDate}"`);
mdLines.push(`source: ${basename(pdfPath)}`);
mdLines.push(`pageCount: ${pageCount}`);
mdLines.push('---');
mdLines.push('');
mdLines.push(`# ${title || basename(pdfPath, '.pdf')}`);
mdLines.push('');

for (let i = 0; i < pages.length; i++) {
  const pageLines = pages[i];
  if (i > 0) mdLines.push(`\n## 페이지 ${i + 1}\n`);
  for (const line of pageLines) {
    // 너무 짧은 라인 (1-2자) skip
    if (line.length < 2) continue;
    // 헤딩 추정 — 짧고 끝에 마침표 없는 라인
    mdLines.push(line);
  }
}

const mdOut = mdLines.join('\n').replace(/\n{3,}/g, '\n\n');

if (asJson) {
  console.log(JSON.stringify({
    title, pageCount, author: meta?.info?.Author,
    subject: meta?.info?.Subject,
    pages: pages.map((lns) => lns.join('\n')),
    md: mdOut,
  }, null, 2));
} else if (outPath) {
  writeFileSync(outPath, mdOut, 'utf8');
  ui.ok(`PDF → md 저장: ${outPath}`);
  ui.dim(`  ${pageCount} pages · 제목: ${title || '(없음)'}`);
} else {
  console.log(mdOut);
}

function escapeFm(s) {
  return String(s).replace(/"/g, '\\"').replace(/\n/g, ' ').trim();
}
