#!/usr/bin/env node
// scripts/start-demo.ps1 가 호출. Chrome 9222 에 대시보드 탭 띄움.
import { chromium } from 'playwright';

try {
  const b = await chromium.connectOverCDP('http://localhost:9222', { timeout: 10000 });
  const ctx = b.contexts()[0];
  let page = ctx.pages().find((p) => p.url().includes('localhost:7777'));
  if (page) {
    await page.bringToFront();
    console.log('existing tab activated');
  } else {
    page = await ctx.newPage();
    await page.goto('http://localhost:7777/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    console.log('new tab opened');
  }
  await b.close();
  process.exit(0);
} catch (e) {
  console.error('failed:', e.message);
  process.exit(1);
}
