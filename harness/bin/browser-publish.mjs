#!/usr/bin/env node
// Browser-driven publish — drives a Playwright Chromium with the user's persistent
// profile to compose a post on threads.net / linkedin.com, attach images, then
// stop right before "Post" so the user confirms (or auto-clicks if --auto-click).
//
//   node bin/browser-publish.mjs <slug> --channel=<ch> [--dry-run] [--auto-click]
//
// First run: the persistent context (auth/browser-profile/) is empty, so the user
// must log into the SNS once. Subsequent runs reuse the cookies.
//
// Safety:
//   · headless 강제 false. 사용자가 보면서 게이트 통과시켜야 함.
//   · brief.status[<ch>] !== 'approved' 면 거부 (publish.mjs 와 동일).
//   · --dry-run 이면 컴포저까지만 채우고 게시 직전에 멈춤. 결과는 dryRun=true 로 저장.
//   · 셀렉터 실패 시 30초 사용자 수동 개입 대기 후 재시도.
//
// 지원 채널: threads, linkedin (사용자 비전 1차 채널).
// 다른 채널은 unsupported 로 에러.

import { resolve, basename } from 'node:path';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import {
  readYaml, writeYaml, findCampaignDir, latestDraftYaml,
  nowKstIso, ui, promptLine, ROOT,
} from './_lib.mjs';

const SUPPORTED = new Set(['threads', 'linkedin']);
const PROFILE_DIR = resolve(ROOT, 'auth/browser-profile');
const SELECTOR_TIMEOUT = 30_000;

const argv = process.argv.slice(2);
const slug = argv.find((a) => !a.startsWith('--'));
const channel = argv.find((a) => a.startsWith('--channel='))?.split('=')[1];
const dryRun = argv.includes('--dry-run');
const autoClick = argv.includes('--auto-click');

if (!slug || !channel) {
  ui.err('사용법: browser-publish.mjs <slug> --channel=<ch> [--dry-run] [--auto-click]');
  process.exit(2);
}

if (!SUPPORTED.has(channel)) {
  ui.err(`browser-publish 미지원 채널: ${channel} (지원: ${[...SUPPORTED].join(', ')})`);
  process.exit(2);
}

const dir = findCampaignDir(slug);
const briefPath = resolve(dir, 'brief.yaml');
const brief = readYaml(briefPath);
const draftPath = latestDraftYaml(resolve(dir, channel));
if (!draftPath) {
  ui.err(`draft 없음: ${resolve(dir, channel)}/`);
  process.exit(2);
}
const draft = readYaml(draftPath);

if (brief.status?.[channel] !== 'approved' && !dryRun) {
  ui.err(`status 가 approved 가 아님: ${brief.status?.[channel]} — /sns-approve 먼저`);
  process.exit(1);
}

const cardPaths = collectCardPaths(draftPath, dir, channel);

ui.info(`[${channel}] browser-publish 시작${dryRun ? ' (dry-run)' : ''}`);
ui.dim(`  draft: ${basename(draftPath)}`);
ui.dim(`  카드: ${cardPaths.length}장`);

mkdirSync(PROFILE_DIR, { recursive: true });

const { chromium } = await import('playwright');
const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  viewport: { width: 1280, height: 900 },
  args: ['--disable-blink-features=AutomationControlled'],
});

const page = context.pages()[0] ?? (await context.newPage());

let result;
try {
  if (channel === 'threads') {
    result = await publishThreads(page, draft, cardPaths, { dryRun, autoClick });
  } else if (channel === 'linkedin') {
    result = await publishLinkedin(page, draft, cardPaths, { dryRun, autoClick });
  }
  // gate() 에서 사용자가 N 을 누른 경우 publish 함수가 cancelled=true 로 반환.
  // 이 케이스는 brief.status 를 건드리지 않고 (approved 그대로 유지) result.json 만 기록.
  const cancelled = result?.cancelled === true;
  saveResult(dir, channel, brief, briefPath, {
    ok: !cancelled,
    via: 'browser',
    dryRun,
    cancelled,
    url: result?.url ?? null,
    publishedAt: nowKstIso(),
  }, /* failed */ false, /* skipStatusPatch */ dryRun || cancelled);
  if (cancelled) {
    ui.warn(`[${channel}] 사용자 취소 — status 'approved' 유지`);
  } else {
    ui.ok(`[${channel}] ${dryRun ? 'dry-run 완료' : '발행 완료'}${result?.url ? ' → ' + result.url : ''}`);
  }
} catch (e) {
  ui.err(`[${channel}] 실패: ${e.message}`);
  saveResult(dir, channel, brief, briefPath, {
    ok: false,
    via: 'browser',
    dryRun,
    error: e.message,
    publishedAt: nowKstIso(),
  }, /* failed */ true);
  await context.close();
  process.exit(1);
}

await promptLine('브라우저를 닫을까요? Enter 로 닫기', { optional: true });
await context.close();

// ────────────────────────────────────────────────────────────────────────────

// Draft 파일명 (YYYYMMDD-HHmmss.yaml) 의 timestamp 와 매칭되는 card{N}-<ts>.png 를 모은다.
// thumb / variant 파일은 제외 (card{N}-{thumb|v1|v2|v3}-<ts>.png).
function collectCardPaths(draftPath, campaignDir, channel) {
  const channelDir = resolve(campaignDir, channel);
  if (!existsSync(channelDir)) return [];
  const ts = basename(draftPath).replace(/\.yaml$/, ''); // "20260505-193459"
  const re = new RegExp(`^card([1-9])-${ts}\\.png$`);
  const matches = [];
  for (const f of readdirSync(channelDir)) {
    const m = f.match(re);
    if (m) matches.push({ idx: Number(m[1]), path: resolve(channelDir, f) });
  }
  return matches.sort((a, b) => a.idx - b.idx).map((m) => m.path);
}

function saveResult(campaignDir, channel, brief, briefPath, result, failed, skipStatusPatch) {
  writeYaml(resolve(campaignDir, channel, 'result.json'), result);
  if (!skipStatusPatch) brief.status[channel] = failed ? 'failed' : 'published';
  brief.meta = { ...(brief.meta ?? {}), updatedAt: nowKstIso() };
  writeYaml(briefPath, brief);
}

async function gate(page, label) {
  await page.bringToFront();
  ui.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  ui.warn(`  🛑 게시 직전 — ${label}`);
  ui.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (autoClick) {
    ui.warn('  --auto-click 지정 — 5초 카운트다운 (Ctrl+C 로 중단)');
    for (let i = 5; i > 0; i--) {
      process.stdout.write(`\r  ⏳ ${i} 초 후 자동 게시...`);
      await new Promise((r) => setTimeout(r, 1000));
    }
    process.stdout.write('\r' + ' '.repeat(40) + '\r');
    return 'Y';
  }
  if (dryRun) {
    ui.info('  --dry-run — 게시 클릭 없이 종료');
    return 'N';
  }
  const ans = (await promptLine('  [Y] 게시 / [N] 취소', { optional: false })).toUpperCase();
  return ans === 'Y' ? 'Y' : 'N';
}

async function pasteText(page, locator, text) {
  await locator.click();
  // 빠르고 한글 안전: clipboard 경유 paste.
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  const isMac = process.platform === 'darwin';
  await page.keyboard.press(isMac ? 'Meta+V' : 'Control+V');
}

// ────────────────────────────────────────────── Threads ──────────────────

async function publishThreads(page, draft, cardPaths, opts) {
  ui.step(1, 5, 'threads.net 이동');
  await page.goto('https://www.threads.net/', { waitUntil: 'domcontentloaded' });

  // 로그인 미완료 체크 — "Log in" 텍스트 보이면 사용자 로그인 대기
  await ensureLoggedIn(page, 'threads');

  ui.step(2, 5, '컴포저 열기');
  // "What's new?" 또는 "Start a thread..." placeholder 클릭
  const composer = page.getByRole('textbox').first();
  await composer.waitFor({ timeout: SELECTOR_TIMEOUT });
  await composer.click();
  await page.waitForTimeout(500);

  ui.step(3, 5, '카피 입력');
  await page.evaluate((t) => navigator.clipboard.writeText(t), draft.text);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
  await page.waitForTimeout(500);

  if (cardPaths.length) {
    ui.step(4, 5, `이미지 ${cardPaths.length}장 첨부`);
    const fileInput = page.locator('input[type="file"][accept*="image"]').first();
    await fileInput.setInputFiles(cardPaths);
    await page.waitForTimeout(2000); // 업로드 대기
  } else {
    ui.step(4, 5, '이미지 없음 — 텍스트만');
  }

  ui.step(5, 5, '게시 직전 멈춤');
  const decision = await gate(page, 'Threads 게시');
  if (decision !== 'Y') return { url: null, cancelled: !opts.dryRun };

  // "Post" 버튼 클릭
  const postBtn = page.getByRole('button', { name: /^Post$|^게시$/i }).last();
  await postBtn.click();
  await page.waitForTimeout(3000);

  return { url: page.url() };
}

// ────────────────────────────────────────────── LinkedIn ─────────────────

async function publishLinkedin(page, draft, cardPaths, opts) {
  ui.step(1, 6, 'linkedin.com 이동');
  await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });

  await ensureLoggedIn(page, 'linkedin');

  ui.step(2, 6, '"Start a post" 클릭');
  const startBtn = page.locator('button:has-text("Start a post"), button:has-text("게시물 작성")').first();
  await startBtn.waitFor({ timeout: SELECTOR_TIMEOUT });
  await startBtn.click();

  ui.step(3, 6, '컴포저 열림 대기');
  // 모달 뜨는 데 시간 걸림
  const editor = page.locator('div.ql-editor[contenteditable="true"]').first();
  await editor.waitFor({ timeout: SELECTOR_TIMEOUT });
  await page.waitForTimeout(500);

  ui.step(4, 6, '카피 입력');
  await editor.click();
  await page.evaluate((t) => navigator.clipboard.writeText(t), draft.text);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
  await page.waitForTimeout(500);

  if (cardPaths.length) {
    ui.step(5, 6, `이미지 ${cardPaths.length}장 첨부`);
    // 사진 추가 버튼
    const addPhoto = page.locator(
      'button[aria-label*="Add a photo"], button[aria-label*="사진 추가"]',
    ).first();
    await addPhoto.click();
    const fileInput = page.locator('input[type="file"][accept*="image"]').first();
    await fileInput.setInputFiles(cardPaths);
    await page.waitForTimeout(3000);
    // "Done" 또는 "다음" 버튼이 모달에 뜸
    const done = page.locator('button:has-text("Done"), button:has-text("다음"), button:has-text("완료")').first();
    if (await done.isVisible().catch(() => false)) {
      await done.click();
      await page.waitForTimeout(1500);
    }
  } else {
    ui.step(5, 6, '이미지 없음 — 텍스트만');
  }

  ui.step(6, 6, '게시 직전 멈춤');
  const decision = await gate(page, 'LinkedIn 게시');
  if (decision !== 'Y') return { url: null, cancelled: !opts.dryRun };

  // 컴포저의 최종 "Post" 버튼 — aria-label 또는 footer 영역
  const postBtn = page.locator(
    'button.share-actions__primary-action, button[aria-label*="Post"], button:has-text("게시")',
  ).first();
  await postBtn.click();
  await page.waitForTimeout(3000);

  return { url: page.url() };
}

// ────────────────────────────────────────────── helpers ──────────────────

async function ensureLoggedIn(page, channel) {
  await page.waitForTimeout(1500);
  // DOM 기반 — Log in / Sign in / 로그인 버튼이 실제로 클릭 가능한 상태인지 확인.
  // SPA 가 늦게 렌더링해 4000자 슬라이스에서 빠지는 케이스를 방지.
  const signInBtn = page.getByRole('button', { name: /log in|sign in|로그인/i }).first();
  const signInLink = page.getByRole('link', { name: /log in|sign in|로그인/i }).first();
  const isVisible =
    (await signInBtn.isVisible().catch(() => false)) ||
    (await signInLink.isVisible().catch(() => false));
  if (isVisible) {
    ui.warn(`[${channel}] 로그인 필요 — 브라우저에서 직접 로그인하세요. 완료 후 Enter.`);
    await promptLine('  로그인 완료', { optional: true });
  }
}
