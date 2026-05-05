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

const htmlPath = flags.html;
const outPath  = flags.out;
const width    = parseInt(flags.width  ?? '1080', 10);
const height   = parseInt(flags.height ?? '1080', 10);

if (!htmlPath || !outPath) {
  console.error('사용법: screenshot.mjs --html=<html-file> --out=<png-path> [--width=1080] [--height=1080]');
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
await browser.close();

console.log(`screenshot saved: ${outPath}`);
