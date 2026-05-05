#!/usr/bin/env node
// Playwright screenshot helper — renders an HTML file to PNG.
// Usage: node bin/screenshot.mjs --html=<path> --out=<png-path> [--width=1080] [--height=1080]

import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const argv = process.argv.slice(2);
const flags = Object.fromEntries(
  argv.filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const htmlPath        = flags.html;
const outPath         = flags.out;
const width           = parseInt(flags.width  ?? '1080', 10);
const height          = parseInt(flags.height ?? '1080', 10);
const measureSelector = flags['measure-selector'] ?? null; // e.g. '[data-hero]'

if (!htmlPath || !outPath) {
  console.error('사용법: screenshot.mjs --html=<html-file> --out=<png-path> [--width=1080] [--height=1080] [--measure-selector=<css>]');
  process.exit(2);
}

const htmlContent = readFileSync(resolve(htmlPath), 'utf8');
mkdirSync(dirname(resolve(outPath)), { recursive: true });

const browser = await chromium.launch();
const page    = await browser.newPage();
await page.setViewportSize({ width, height });
await page.setContent(htmlContent, { waitUntil: 'networkidle', timeout: 30_000 });
await page.screenshot({
  path: resolve(outPath),
  type: 'png',
  clip: { x: 0, y: 0, width, height },
});

// D: Hero 면적 측정 — --measure-selector 있을 때 요소 bounding box 계산
if (measureSelector) {
  try {
    const box = await page.locator(measureSelector).first().boundingBox();
    if (box) {
      const ratio = (box.width * box.height) / (width * height);
      const warn  = ratio < 0.25 || ratio > 0.55;
      // JSON을 마지막 줄로 출력 — generate.mjs 가 파싱
      process.stdout.write(`\n{"heroRatio":${ratio.toFixed(3)},"warn":${warn},"selector":"${measureSelector}"}\n`);
    }
  } catch {
    // 선택자가 없으면 측정 스킵
  }
}

await browser.close();

console.log(`screenshot saved: ${outPath}`);
