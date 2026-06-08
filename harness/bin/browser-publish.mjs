#!/usr/bin/env node
// Browser-driven publish — drives a Playwright Chromium with the user's persistent
// profile to compose a post on threads.net / linkedin.com, attach images, then
// stop right before "Post" so the user confirms (or auto-clicks if --auto-click).
//
//   node bin/browser-publish.mjs <slug> --channel=<ch> [--dry-run | --pre-publish | --auto-click]
//
// First run: the persistent context (auth/browser-profile/) is empty, so the user
// must log into the SNS once. Subsequent runs reuse the cookies.
//
// Safety:
//   · headless 강제 false. 사용자가 보면서 게이트 통과시켜야 함.
//   · brief.status[<ch>] !== 'approved' 면 거부 (publish.mjs 와 동일).
//   · --dry-run    : 모달 열기 전에 종료. 가장 안전. 결과는 dryRun=true 로 저장.
//   · --pre-publish: 모달 + 카피 paste + 이미지 첨부 완료까지. gate()에서 멈춤 (게시 클릭 X).
//                   Chrome 탭 살려두고 disconnect — 사용자가 직접 [공유] 클릭.
//                   morning-routine 의 핵심 모드.
//   · --auto-click : gate()에서 자동 5초 카운트다운 후 [공유] 클릭. 진짜 LIVE 발행.
//   · 셀렉터 실패 시 30초 사용자 수동 개입 대기 후 재시도.
//
// 지원 채널: threads, linkedin (사용자 비전 1차 채널).
// 다른 채널은 unsupported 로 에러.

import { resolve, basename } from 'node:path';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import {
  readYaml, writeYaml, writeJson, findCampaignDir, latestDraftYaml,
  nowKstIso, ui, promptLine, ROOT,
} from './_lib.mjs';

const SUPPORTED = new Set(['threads', 'linkedin', 'instagram', 'naver-blog', 'tistory', 'brunch']);
const PROFILE_DIR = resolve(ROOT, 'auth/browser-profile');
const SELECTOR_TIMEOUT = 30_000;

const argv = process.argv.slice(2);
const slug = argv.find((a) => !a.startsWith('--'));
const channel = argv.find((a) => a.startsWith('--channel='))?.split('=')[1];
const dryRun = argv.includes('--dry-run');
const prePublish = argv.includes('--pre-publish');
const autoClick = argv.includes('--auto-click');

// 우선순위: dryRun > prePublish > autoClick > 수동 prompt
// dryRun 일 때는 prePublish 무시 (안전)
const effectivePrePublish = prePublish && !dryRun;
const attach = argv.includes('--attach') || argv.find((a) => a.startsWith('--attach='));
const attachUrl = (typeof attach === 'string' ? attach.split('=')[1] : null) || 'http://localhost:9222';

if (!slug || !channel) {
  ui.err('사용법: browser-publish.mjs <slug> --channel=<ch> [--dry-run] [--auto-click] [--attach[=URL]]');
  ui.err('  --attach: 사용자 Chrome (--remote-debugging-port=9222 모드) 에 attach (default URL: http://localhost:9222)');
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

const { chromium } = await import('playwright');

let context, browser;
if (attach) {
  ui.info(`[${channel}] 사용자 Chrome 에 attach: ${attachUrl}`);
  ui.dim('  (Chrome 을 --remote-debugging-port=9222 모드로 미리 실행해두어야 합니다)');
  try {
    browser = await chromium.connectOverCDP(attachUrl);
  } catch (e) {
    ui.err(`Chrome attach 실패: ${e.message}`);
    ui.err('  Chrome 을 다음 명령으로 재실행하세요:');
    ui.err('    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\\Users\\WIN10\\AppData\\Local\\Google\\Chrome\\User Data"');
    process.exit(1);
  }
  // 첫 번째 컨텍스트 사용 (사용자 기존 세션)
  context = browser.contexts()[0] ?? await browser.newContext();
} else {
  mkdirSync(PROFILE_DIR, { recursive: true });
  context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
}

// attach 모드 + pre-publish 일 때는 항상 새 탭 — 사용자 기존 탭 보존.
// 그 외 (--auto-click LIVE) 또는 launch 모드에서도 새 탭 안전 (기존 탭 덮어쓰기 방지).
// 예외: 페이지가 하나도 없으면 새 페이지 (Chrome 빈 상태).
const shouldOpenNewTab = attach || effectivePrePublish;
let page;
if (shouldOpenNewTab) {
  page = await context.newPage();
  ui.dim(`  새 탭 열림 (기존 탭 ${context.pages().length - 1}개 보존)`);
} else {
  page = context.pages()[0] ?? (await context.newPage());
}

let result;
try {
  if (channel === 'threads') {
    result = await publishThreads(page, draft, cardPaths, { dryRun, autoClick, prePublish: effectivePrePublish });
  } else if (channel === 'linkedin') {
    result = await publishLinkedin(page, draft, cardPaths, { dryRun, autoClick, prePublish: effectivePrePublish });
  } else if (channel === 'naver-blog') {
    result = await publishNaverBlog(page, draft, cardPaths, { dryRun, autoClick, prePublish: effectivePrePublish });
  } else if (channel === 'tistory') {
    result = await publishTistory(page, draft, cardPaths, { dryRun, autoClick, prePublish: effectivePrePublish });
  } else if (channel === 'brunch') {
    result = await publishBrunch(page, draft, cardPaths, { dryRun, autoClick, prePublish: effectivePrePublish });
  } else if (channel === 'instagram') {
    result = await publishInstagram(page, draft, cardPaths, { dryRun, autoClick, prePublish: effectivePrePublish });
  }
  // gate() 결과 분기
  const cancelled = result?.cancelled === true;
  const isPrePublished = result?.prePublished === true;
  saveResult(dir, channel, brief, briefPath, {
    ok: !cancelled,
    via: 'browser',
    dryRun,
    prePublished: isPrePublished || undefined,  // pre-publish 모드 — 사용자 손에 넘김
    cancelled,
    url: result?.url ?? null,
    publishedAt: nowKstIso(),
  }, /* failed */ false, /* skipStatusPatch */ dryRun || cancelled || isPrePublished);
  if (cancelled) {
    ui.warn(`[${channel}] 사용자 취소 — status 'approved' 유지`);
  } else if (isPrePublished) {
    ui.ok(`[${channel}] pre-publish 완료 — Chrome 탭에서 [공유] 클릭`);
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

if (attach) {
  ui.info('attach 모드 — 사용자 Chrome 은 닫지 않습니다 (Playwright 연결만 해제)');
  if (browser) await browser.close().catch(() => {});
} else {
  await promptLine('브라우저를 닫을까요? Enter 로 닫기', { optional: true });
  await context.close();
}

// ────────────────────────────────────────────────────────────────────────────

// Draft 파일명 (YYYYMMDD-HHmmss.yaml) 의 timestamp 와 매칭되는 card{N}-<ts>.png 를 모은다.
// thumb / variant 파일은 제외 (card{N}-{thumb|v1|v2|v3}-<ts>.png).
function collectCardPaths(draftPath, campaignDir, channel) {
  const channelDir = resolve(campaignDir, channel);
  if (!existsSync(channelDir)) return [];

  // Blog 매체: card{N}-{ts}.png 패턴 대신 img{N}*.jpg/png 인라인 이미지 수집.
  // 우선순위: img{N}_v3 > img{N}_v2 > img{N} (재생성 버전이 있으면 그것 우선).
  if (channel === 'naver-blog' || channel === 'tistory' || channel === 'brunch') {
    const candidates = readdirSync(channelDir).filter((f) => /^img\d+(_v\d+)?\.(jpg|jpeg|png)$/i.test(f));
    const byIdx = new Map();
    for (const f of candidates) {
      const m = f.match(/^img(\d+)(?:_v(\d+))?\.(?:jpg|jpeg|png)$/i);
      if (!m) continue;
      const idx = Number(m[1]);
      const v = m[2] ? Number(m[2]) : 0;
      const cur = byIdx.get(idx);
      if (!cur || v > cur.v) byIdx.set(idx, { v, path: resolve(channelDir, f) });
    }
    return [...byIdx.entries()].sort((a, b) => a[0] - b[0]).map(([, val]) => val.path);
  }

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
  writeJson(resolve(campaignDir, channel, 'result.json'), result);
  if (!skipStatusPatch) brief.status[channel] = failed ? 'failed' : 'published';
  brief.meta = { ...(brief.meta ?? {}), updatedAt: nowKstIso() };
  writeYaml(briefPath, brief);
}

// 여러 셀렉터 후보 중 가장 먼저 visible 한 거 — selector drift 대응
async function waitForFirst(page, selectors, timeoutMs = 15000) {
  const start = Date.now();
  const POLL = 250;
  while (Date.now() - start < timeoutMs) {
    for (const sel of selectors) {
      try {
        const loc = page.locator(sel).first();
        const visible = await loc.isVisible({ timeout: 100 }).catch(() => false);
        if (visible) {
          ui.dim(`  match: ${sel}`);
          return loc;
        }
      } catch {}
    }
    await page.waitForTimeout(POLL);
  }
  throw new Error(`waitForFirst timeout — none of ${selectors.length} selectors visible: ${selectors.join(' | ').slice(0, 200)}`);
}

async function gate(page, label) {
  await page.bringToFront();
  ui.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  ui.warn(`  🛑 게시 직전 — ${label}`);
  ui.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  // dry-run safety — pre-publish/auto-click 보다 우선. 절대 게시 안 함.
  if (dryRun) {
    ui.info('  --dry-run — 게시 클릭 없이 종료 (다른 모드보다 우선)');
    return 'N';
  }
  // pre-publish — 사용자가 직접 [공유] 클릭하도록 Chrome 탭 살려두고 disconnect
  if (effectivePrePublish) {
    ui.info('  --pre-publish — 모달 + 카피 + 이미지 다 채워짐. Chrome 탭에서 사용자가 직접 [공유] 클릭하세요.');
    ui.dim('  ★ Chrome 탭 유지 (Playwright disconnect 만) ★');
    return 'PRE_PUBLISH';
  }
  if (autoClick) {
    ui.warn('  --auto-click 지정 — 5초 카운트다운 (Ctrl+C 로 중단)');
    for (let i = 5; i > 0; i--) {
      process.stdout.write(`\r  ⏳ ${i} 초 후 자동 게시...`);
      await new Promise((r) => setTimeout(r, 1000));
    }
    process.stdout.write('\r' + ' '.repeat(40) + '\r');
    return 'Y';
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
  // 클립보드 권한 (threads.com / .net 둘 다)
  for (const origin of ['https://www.threads.com', 'https://www.threads.net']) {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin }).catch(() => {});
  }

  ui.step(1, 5, 'threads 이동');
  await page.goto('https://www.threads.com/', { waitUntil: 'domcontentloaded' });
  await page.bringToFront();
  await ensureLoggedIn(page, 'threads');

  ui.step(2, 5, '만들기/Create 버튼 클릭 → 컴포저 열기');
  // Threads 는 visible textbox 가 없음 — "만들기" 또는 "Create" 버튼 먼저 클릭해야 모달 뜸
  const createSels = [
    'svg[aria-label="만들기"]',
    'svg[aria-label="Create"]',
    'svg[aria-label="새로운 스레드"]',
    'svg[aria-label="New thread"]',
    'svg[aria-label*="post"]',
  ];
  let createClicked = false;
  for (const sel of createSels) {
    const cand = page.locator(sel).first();
    if (await cand.isVisible().catch(() => false)) {
      // svg 의 closest clickable ancestor (a/div[role=button]/button)
      await cand.click({ force: true }).catch(() => {});
      createClicked = true;
      ui.dim(`  Create click: ${sel}`);
      break;
    }
  }
  if (!createClicked) {
    ui.warn('  Create 버튼 못 찾음 — 수동 클릭 후 Enter');
    await promptLine('  컴포저 모달 열림 후 Enter', { optional: true });
  }
  await page.waitForTimeout(1500);

  // 컴포저 모달 안 textbox 대기 — visibility 체크 우회 (attached 만)
  // Threads 2026 UI: 모달 떴는데 textbox 자체는 hidden 으로 nested. waitForFirst 의 visibility 체크 우회.
  const composerSelectors = [
    'div[data-lexical-editor="true"][contenteditable="true"]',
    '[role="textbox"][contenteditable="true"][aria-placeholder*="새로운 소식" i]',
    '[role="textbox"][contenteditable="true"][aria-label*="텍스트 필드" i]',
    '[role="textbox"][contenteditable="true"]',
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
  ];
  let composer = null;
  for (const sel of composerSelectors) {
    const loc = page.locator(sel).first();
    try {
      await loc.waitFor({ state: 'attached', timeout: 4000 });
      composer = loc;
      ui.dim(`  composer attached: ${sel}`);
      break;
    } catch {}
  }
  if (!composer) {
    ui.warn('  composer 셀렉터 다 fail — 모달 placeholder 영역 click 으로 활성화 시도');
    await page.click('[aria-label*="새로운 소식" i], [aria-placeholder*="새로운 소식" i]', { force: true, timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    composer = page.locator(composerSelectors.join(', ')).first();
  }
  // hidden 일 수도 — 강제 click + focus (visibility 무시)
  await composer.click({ force: true }).catch(() => {});
  await composer.focus({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(500);

  ui.step(3, 5, '카피 입력 — clipboard paste + keyboard.type fallback');
  // 1차 — clipboard paste
  let pasteOk = false;
  try {
    await page.evaluate((t) => navigator.clipboard.writeText(t), draft.text);
    await page.waitForTimeout(150);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
    await page.waitForTimeout(800);
    // 검증 — composer 안에 내용이 들어갔는지
    const got = await composer.evaluate((el) => (el.innerText || el.textContent || '').slice(0, 50)).catch(() => '');
    if (got && got.trim().length > 0) pasteOk = true;
  } catch (e) {
    ui.dim(`  clipboard paste 실패: ${e.message.slice(0, 50)}`);
  }
  // 2차 — keyboard.type (focus 가 살아있으면 textbox 에 직접 입력)
  if (!pasteOk) {
    ui.dim('  paste 미반영 → keyboard.type fallback');
    await page.keyboard.type(draft.text, { delay: 5 });
    await page.waitForTimeout(800);
  }
  // 3차 검증 — keyboard.type 후에도 비어있으면 Lexical beforeinput 강제 (Threads UI 2026)
  const verify = await composer.evaluate((el) => (el.innerText || el.textContent || '').trim()).catch(() => '');
  if (verify.length === 0) {
    ui.warn('  paste + keyboard 둘 다 미반영 → Lexical beforeinput dispatch 강제');
    await page.evaluate((txt) => {
      const candidates = [...document.querySelectorAll('[contenteditable="true"], [role="textbox"]')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 200 && r.height > 30 && el.offsetWidth > 0;
        })
        .sort((a, b) => {
          const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
          return rb.width * rb.height - ra.width * ra.height;
        });
      if (!candidates.length) return false;
      const el = candidates[0];
      el.focus(); el.click();
      // Lexical editor 가 beforeinput 으로 입력 받음
      const evt = new InputEvent('beforeinput', { inputType: 'insertText', data: txt, bubbles: true, cancelable: true });
      el.dispatchEvent(evt);
      // fallback: execCommand
      document.execCommand('insertText', false, txt);
      return true;
    }, draft.text);
    await page.waitForTimeout(800);
    const verify2 = await composer.evaluate((el) => (el.innerText || el.textContent || '').trim()).catch(() => '');
    if (verify2.length === 0) {
      throw new Error('Threads paste 모든 방법 실패 — UI 셀렉터 또는 모달 상태 확인 필요');
    }
    ui.dim('  Lexical beforeinput 성공');
  } else {
    ui.dim(`  paste OK (${verify.length}자)`);
  }

  if (cardPaths.length) {
    ui.step(4, 5, `이미지 ${cardPaths.length}장 첨부`);
    const fileInput = page.locator('input[type="file"][accept*="image"]').first();
    if (await fileInput.count()) {
      await fileInput.setInputFiles(cardPaths).catch((e) => ui.warn(`  setInputFiles 실패: ${e.message}`));
      await page.waitForTimeout(2500);
    } else {
      ui.warn('  file input 없음 — 첨부 버튼 클릭 필요할 수 있음');
    }
  } else {
    ui.step(4, 5, '이미지 없음 — 텍스트만');
  }

  ui.step(5, 5, '게시 직전 멈춤');
  const decision = await gate(page, 'Threads 게시');
  if (decision === 'PRE_PUBLISH') return { url: null, prePublished: true, cancelled: false };
  if (decision !== 'Y') return { url: null, cancelled: !opts.dryRun };

  const postBtn = page.getByRole('button', { name: /^Post$|^게시$/i }).last();
  await postBtn.click();
  await page.waitForTimeout(3000);

  return { url: page.url() };
}

// ────────────────────────────────────────────── LinkedIn ─────────────────

async function publishLinkedin(page, draft, cardPaths, opts) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'https://www.linkedin.com',
  }).catch(() => {});

  ui.step(1, 6, 'linkedin.com 이동');
  await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });
  await page.bringToFront();
  await ensureLoggedIn(page, 'linkedin');

  ui.step(2, 6, 'Start a post 클릭 (한국어 "글쓰기")');
  // LinkedIn 의 share trigger 는 button / a / div 다 가능 — 광범위 매칭
  const startBtn = page.locator(
    'button:has-text("Start a post"), button:has-text("글쓰기"), button:has-text("게시물 작성"), ' +
    'a:has-text("글쓰기"), a:has-text("Start a post"), ' +
    '[role="button"]:has-text("글쓰기"), [role="button"]:has-text("Start a post"), ' +
    'button[aria-label*="Start a post"], button[aria-label*="글쓰기"]'
  ).first();
  await startBtn.waitFor({ timeout: SELECTOR_TIMEOUT });
  await startBtn.click({ force: true });

  ui.step(3, 6, '컴포저 열림 대기 (selector fallback chain)');
  const editor = await waitForFirst(page, [
    'div.ql-editor[contenteditable="true"]',                    // 기존 Quill (2024-)
    '[role="textbox"][contenteditable="true"][aria-label*="텍스트 편집기" i]',
    '[role="textbox"][contenteditable="true"][aria-label*="Text editor" i]',
    '.share-creation-state__text-editor [contenteditable="true"]',
    '.editor-content [contenteditable="true"]',
    '[data-test-id*="editor"] [contenteditable="true"]',
    'div[contenteditable="true"][role="textbox"]',
    'div.share-box-feed-entry__top-bar ~ * [contenteditable="true"]',
  ], SELECTOR_TIMEOUT);
  await page.waitForTimeout(800);

  ui.step(4, 6, '카피 입력');
  await editor.click();
  await page.waitForTimeout(200);
  await page.evaluate((t) => navigator.clipboard.writeText(t), draft.text);
  await page.waitForTimeout(150);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
  await page.waitForTimeout(800);

  if (cardPaths.length) {
    ui.step(5, 6, `이미지 ${cardPaths.length}장 첨부`);
    const addPhoto = page.locator(
      'button[aria-label*="Add a photo"], button[aria-label*="Add media"], button[aria-label*="사진 추가"], button[aria-label*="미디어"]',
    ).first();
    if (await addPhoto.isVisible().catch(() => false)) {
      await addPhoto.click();
      await page.waitForTimeout(800);
      const fileInput = page.locator('input[type="file"][accept*="image"]').first();
      if (await fileInput.count()) {
        await fileInput.setInputFiles(cardPaths).catch((e) => ui.warn(`  setInputFiles 실패: ${e.message}`));
        await page.waitForTimeout(3000);
        const done = page.locator(
          'button:has-text("Done"), button:has-text("다음"), button:has-text("완료"), button:has-text("Next")',
        ).first();
        if (await done.isVisible().catch(() => false)) {
          await done.click();
          await page.waitForTimeout(1500);
        }
      }
    } else {
      ui.warn('  사진 추가 버튼 못 찾음');
    }
  } else {
    ui.step(5, 6, '이미지 없음 — 텍스트만');
  }

  ui.step(6, 6, '게시 직전 멈춤');
  const decision = await gate(page, 'LinkedIn 게시');
  if (decision === 'PRE_PUBLISH') return { url: null, prePublished: true, cancelled: false };
  if (decision !== 'Y') return { url: null, cancelled: !opts.dryRun };

  const postBtn = page.locator(
    'button.share-actions__primary-action, button[aria-label*="Post"], button:has-text("게시"):not(:has-text("작성")), button:has-text("Post"):not(:has-text("Start"))',
  ).first();
  await postBtn.click();
  await page.waitForTimeout(3000);

  return { url: page.url() };
}

// ────────────────────────────────────────────── Naver Blog ──────────────
//
// 자동화 전략 — 진짜 정답: window.SmartEditor 의 programmatic API 직접 호출.
// (시행착오: _research/naver-seo-tool/ANALYSIS.md, 그리고 실제 라이브 SmartEditor 의
//  window.SmartEditor.getEditor('blogpc001') 인스턴스 발견)
//
// 합성 click + clipboard paste 는 focus chain 문제로 실패. 진짜 API:
//
//   editor.setDocumentTitle(title)                    — 제목 set
//   editor.setDocumentData({ document: {...} })       — 전체 문서 (title+body+image) set
//   editor.execCommand('insertImagesByFile', { ... }) — 이미지 삽입
//   editor.focusTitle() / focusFirstText()            — 포커스
//   SmartEditor.COMMAND.COMMON.{INSERT,PREPEND,APPEND,DELETE}_COMPONENTS — 컴포넌트 조작
//   SmartEditor.COMMAND.IMAGE.{INSERT_IMAGES,INSERT_IMAGE_FILES,INSERT_IMAGE_URLS}
//
// 이미지 첨부는 file input + setInputFiles 가 가장 안정적 (CDN 업로드까지 SmartEditor 자체 처리).
// 업로드 후 "사진 첨부 방식" 팝업 → "개별사진" 자동 선택.

async function publishNaverBlog(page, draft, cardPaths, opts) {
  ui.step(1, 7, 'blogId 감지 + 글쓰기 페이지 이동');

  // 클립보드 권한 — navigator.clipboard.* 사용 위해 필요
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'https://blog.naver.com',
  }).catch(() => {});

  // 로그인 대기 — MyBlog.naver 는 미로그인 시 로그인 페이지로 갔다가, 로그인하면 본인 블로그로 redirect.
  // 창에서 사용자가 로그인할 때까지 URL 폴링 (재navigation 없이 — 비번 입력 방해 X). 최대 ~5분.
  ui.warn('  ▶ 뜬 Chromium 창에서 네이버 로그인 하세요. 로그인하면 자동으로 진행됩니다 (최대 5분 대기).');
  await page.goto('https://blog.naver.com/MyBlog.naver', { waitUntil: 'domcontentloaded' }).catch(() => {});
  let blogId = null;
  for (let i = 0; i < 150; i++) {
    const m = page.url().match(/blog\.naver\.com\/([^/?#]+)/);
    if (m && m[1] !== 'MyBlog.naver') {
      blogId = m[1];
      break;
    }
    await page.waitForTimeout(2000);
  }
  if (!blogId) {
    throw new Error(`blogId 감지 실패 — 로그인 시간 초과 (현재 URL: ${page.url()})`);
  }
  ui.dim(`  blogId: ${blogId}`);

  // 글쓰기 진입 — <blogId>?Redirect=Write 패턴 (PostWriteForm 직접 접근은 "유효하지 않은 요청" 에러)
  await page.goto(`https://blog.naver.com/${blogId}?Redirect=Write`, { waitUntil: 'domcontentloaded' });

  ui.step(2, 7, 'PostWriteForm + SmartEditor 로드 대기 + 다이얼로그 dismiss');
  // PostWriteForm iframe 등장 + .se-title-text 렌더링 대기 (최대 15초)
  let editorReady = false;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(500);
    const f = page.frames().find((x) => x.url().includes('PostWriteForm'));
    if (f) {
      const ready = await f.evaluate(() => document.querySelectorAll('.se-title-text').length).catch(() => 0);
      if (ready > 0) { editorReady = true; break; }
    }
  }
  if (!editorReady) ui.warn('  SmartEditor 로드 미확인 — 그래도 진행');

  // 임시저장 복원 다이얼로그 / 작성 도움말 / 동의 알림 dismiss (frame 안에 있음)
  const fInit = page.frames().find((x) => x.url().includes('PostWriteForm'));
  if (fInit) {
    await dismissNaverDialogs(fInit, page, /* layoutPopup */ false);
  }

  // 자주 뜨는 dialog 처리 (임시저장 복원 / 작성 도움말 / 동의 알림)
  for (const sel of [
    'button:has-text("취소")',
    'button:has-text("아니요")',
    'button:has-text("닫기")',
    'button[aria-label="닫기"]',
    '.se-popup-button-cancel',
  ]) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(400);
    }
  }

  // PostWriteForm iframe 재귀 탐색 (URL 매칭 + .se-title-text 존재 확인)
  const pwfFrame = await findPostWriteFrame(page);
  if (!pwfFrame) {
    ui.warn('  PostWriteForm iframe 못 찾음 — 사용자가 글쓰기 페이지 진입한 뒤 Enter');
    await promptLine('  글쓰기 페이지 진입 완료', { optional: true });
    const retry = await findPostWriteFrame(page);
    if (!retry) throw new Error('PostWriteForm iframe 탐색 실패');
  }
  const frame = pwfFrame ?? (await findPostWriteFrame(page));
  ui.dim(`  PostWriteForm frame: ${frame.url().slice(0, 80)}...`);

  // SmartEditor 인스턴스 사용 가능할 때까지 대기 (최대 15초)
  let editorAvailable = false;
  for (let i = 0; i < 30; i++) {
    editorAvailable = await frame.evaluate(() => {
      const e = window.SmartEditor?.getEditor?.('blogpc001') || window.SmartEditor?._editors?.blogpc001;
      return !!(e && typeof e.setDocumentTitle === 'function');
    }).catch(() => false);
    if (editorAvailable) break;
    await page.waitForTimeout(500);
  }
  if (!editorAvailable) ui.warn('  SmartEditor.getEditor() 사용 불가 — 그래도 진행');

  const parsed = parseDraftMarkdown(draft.text);

  ui.step(3, 7, '제목 set + 본문 segment paste (text → image → text → ...)');
  // 정답 흐름 (네이버 SEO 도우미 v6.0.8 paste-title-then-body + paste-remaining-segments):
  //   1. setDocumentTitle(title) — 제목 set (API)
  //   2. focusFirstText() — 본문 포커스
  //   3. body markdown 을 이미지 placeholder 위치에서 split → segments
  //   4. for each segment:
  //      - text → markdown→HTML → clipboard.write({html,text}) → Ctrl+V
  //      - image → file 읽기 → JPG/PNG → canvas → clipboard.write({image/png}) → Ctrl+V
  //      - segment 사이 Enter

  // 제목 set (API)
  await frame.evaluate((title) => {
    const e = window.SmartEditor?.getEditor?.('blogpc001') || window.SmartEditor?._editors?.blogpc001;
    e?.setDocumentTitle?.(title);
  }, parsed.title || '');
  await page.waitForTimeout(500);

  // 본문 포커스 (API)
  await frame.evaluate(() => {
    const e = window.SmartEditor?.getEditor?.('blogpc001') || window.SmartEditor?._editors?.blogpc001;
    e?.focusFirstText?.();
  });
  await page.waitForTimeout(800);

  // body 를 이미지 marker 기준으로 segments 분할 (image idx 1..N 이 cardPaths 의 N 번째 파일과 매핑)
  const segments = splitBodyByImageMarkers(parsed.body, cardPaths);
  ui.dim(`  segments: ${segments.length} (text:${segments.filter((s) => s.type === 'text').length} / image:${segments.filter((s) => s.type === 'image').length})`);

  await page.bringToFront();
  let pastedImages = 0;
  for (const [idx, seg] of segments.entries()) {
    if (seg.type === 'text') {
      const html = markdownToNaverHtml(seg.content);
      if (!html.trim()) continue;
      await page.evaluate(async ({ html, text }) => {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        })]);
      }, { html, text: html.replace(/<[^>]+>/g, ' ') });
      await page.waitForTimeout(150);
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
      await page.waitForTimeout(800);
    } else if (seg.type === 'image') {
      // 이미지 paste 전 Enter (텍스트 끝에 이미지 inline)
      await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      // 파일 → base64 → page 안에서 canvas 로 PNG 변환 → clipboard
      const imgBuffer = readFileSync(seg.path);
      const b64 = imgBuffer.toString('base64');
      const r = await page.evaluate(async ({ b64 }) => {
        try {
          const binary = atob(b64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const jpgBlob = new Blob([bytes], { type: 'image/jpeg' });
          const url = URL.createObjectURL(jpgBlob);
          const img = new Image();
          await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
          const canvas = document.createElement('canvas');
          canvas.width = img.width; canvas.height = img.height;
          canvas.getContext('2d').drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          const pngBlob = await new Promise((rs) => canvas.toBlob(rs, 'image/png'));
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
          return `png ${pngBlob.size}b`;
        } catch (e) { return 'err: ' + e.message; }
      }, { b64 });
      await page.waitForTimeout(200);
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
      // CDN 업로드 + 렌더링 대기
      await page.waitForTimeout(2000);
      pastedImages++;
      ui.dim(`  segment ${idx + 1}/${segments.length} → image ${pastedImages}/${cardPaths.length} (${r})`);
    }
  }

  // 검증 — paste 후 components 카운트
  const counts = await frame.evaluate(() => {
    const e = window.SmartEditor?.getEditor?.('blogpc001') || window.SmartEditor?._editors?.blogpc001;
    if (!e) return 'no editor';
    const d = e.getDocumentData();
    const counts = {};
    for (const c of d.document.components) counts[c['@ctype']] = (counts[c['@ctype']] || 0) + 1;
    return JSON.stringify(counts);
  });
  ui.dim(`  최종 components: ${counts}`);
  await page.waitForTimeout(500);

  // 전체 가운데 정렬 (감성 블로그 스타일 — 레퍼런스 기준). 전체 선택 → 가운데정렬 버튼.
  // 버튼 못 찾으면 좌측정렬 그대로 유지 (발행엔 지장 없음 — graceful).
  ui.dim('  전체 가운데 정렬 시도');
  await page.bringToFront();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.waitForTimeout(400);
  let centered = false;
  for (const sel of [
    '[data-name="align-center"]',
    'button[data-log*="alc"]',
    'button[aria-label*="가운데"]',
    'button[title*="가운데"]',
    '.se-toolbar-icon-align-center',
    'button.se-toolbar-option-align-center-button',
  ]) {
    const b = frame.locator(sel).first();
    if (await b.isVisible().catch(() => false)) {
      await b.click({ force: true }).catch(() => {});
      centered = true;
      ui.dim(`  가운데 정렬 적용: ${sel}`);
      break;
    }
  }
  if (!centered) {
    ui.warn('  가운데정렬 버튼 못 찾음 — 좌측정렬 유지 (툴바 셀렉터 확인 필요)');
  }
  await page.keyboard.press('ArrowRight').catch(() => {}); // 선택 해제
  await page.waitForTimeout(300);

  ui.step(4, 7, '이미지는 segment paste 단계에서 본문 흐름 따라 inline 삽입 완료');
  // (이전: 별도 일괄 첨부 단계 — segment paste 로 인라인 처리되어 불필요)
  ui.dim(`  inline images: ${pastedImages}/${cardPaths.length}`);

  ui.step(5, 7, '캡션 자동 입력 (선택)');
  // segment paste 가 끝난 후 — 이미지 alt 텍스트 자동 입력
  // (commercial tool 도 paste-remaining-segments 후 별도 caption 처리)
  // 일단은 skip — Naver 가 자동으로 alt 처리하기도 함

  // dry-run safety — 발행 모달 자체를 안 엶. 사용자가 모달에서 실수로 누를 위험 차단.
  if (opts.dryRun) {
    ui.step(6, 7, 'dry-run — 발행 모달 열기 skip (실제 발행 안전 차단)');
    ui.step(7, 7, 'dry-run 통과 — 본문/이미지 paste 까지 검증 완료');
    ui.dim('  실제 발행하려면 --dry-run 빼고 다시 실행하세요');
    return { url: null, dryRun: true, cancelled: false };
  }

  ui.step(6, 7, '발행 모달 열기 (publish_btn) + 태그 입력');
  // 발행 모달 열기 직전 — 임시저장 다이얼로그가 다시 떠 있을 수 있어 한번 더 dismiss
  await dismissNaverDialogs(frame, page, /* layoutPopup */ false);
  await page.waitForTimeout(500);

  // 발행 버튼 = publish_btn__m9KHH (top-right 영역, data-click-area="tpb.publish")
  // 모달 열기 전용 — 이걸 눌러야 publish_layer 가 뜸
  const publishBtnSelectors = [
    '[data-click-area="tpb.publish"]',  // 가장 안정적 (CSS-module hash 안 바뀜)
    '.publish_btn__m9KHH',
    'button.publish_btn',
  ];
  let pubClicked = false;
  for (const sel of publishBtnSelectors) {
    const cand = frame.locator(sel).first();
    if (await cand.isVisible().catch(() => false)) {
      await cand.click({ force: true }).catch(() => {});
      pubClicked = true;
      ui.dim(`  발행 모달 열기 click: ${sel}`);
      break;
    }
  }
  if (pubClicked) {
    await page.waitForTimeout(2000); // 모달 열림 + 태그 영역 렌더링 대기
    if ((parsed.tags ?? []).length) {
      const tagInput = frame.locator('#tag-input, input.tag_input__rvUB5, input[placeholder*="태그 입력"]').first();
      if (await tagInput.isVisible().catch(() => false)) {
        let added = 0;
        for (const tag of parsed.tags) {
          // # 제거 (Naver 가 자동으로 태그로 변환)
          const cleanTag = tag.replace(/^#/, '').trim();
          if (!cleanTag) continue;
          await tagInput.click({ force: true }).catch(() => {});
          await tagInput.fill(cleanTag).catch(() => {});
          await page.keyboard.press('Enter');
          await page.waitForTimeout(150);
          added++;
        }
        ui.dim(`  태그 ${added}개 입력`);
      } else {
        ui.warn('  태그 input 셀렉터 못 찾음');
      }
    }
  } else {
    ui.warn('  발행 버튼 selector 실패 — 사용자가 직접 클릭 후 태그 입력');
    await promptLine('  발행 옵션 모달 + 태그 입력 완료', { optional: true });
  }

  ui.step(7, 7, '최종 발행 직전 멈춤');
  const decision = await gate(page, '네이버 블로그 발행');
  if (decision === 'PRE_PUBLISH') return { url: null, prePublished: true, cancelled: false };
  if (decision !== 'Y') return { url: null, cancelled: !opts.dryRun };

  // 최종 발행 버튼 — layer_btn_area__UzyKH > btn_area__fO7mp > button.confirm_btn__WEaBq
  // data-testid="seOnePublishBtn", data-click-area="tpb*i.publish"
  const finalBtnSelectors = [
    '[data-testid="seOnePublishBtn"]',                  // 가장 안정적
    '[data-click-area="tpb*i.publish"]',                // alt 안정적
    'button.confirm_btn__WEaBq',                        // CSS-module hash (변경 가능)
    '.layer_btn_area__UzyKH button.confirm_btn__WEaBq', // 위치 한정
  ];
  let finalClicked = false;
  for (const sel of finalBtnSelectors) {
    const cands = await frame.locator(sel).all();
    for (const c of cands) {
      if (await c.isVisible().catch(() => false)) {
        await c.click({ force: true }).catch(() => {});
        finalClicked = true;
        ui.dim(`  최종 발행 click: ${sel}`);
        break;
      }
    }
    if (finalClicked) break;
  }
  if (finalClicked) {
    // 발행 처리 + 게시글 페이지 redirect 대기 (최대 15초)
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(500);
      const url = page.url();
      // /supperted/<숫자> 형태로 redirect 되면 발행 성공
      if (/blog\.naver\.com\/[^/]+\/\d+/.test(url) && !url.includes('PostWriteForm')) {
        ui.dim(`  발행 후 redirect URL: ${url}`);
        break;
      }
    }
  } else {
    ui.warn('  최종 발행 버튼 selector 실패 — 사용자가 직접 클릭');
    await promptLine('  발행 완료', { optional: true });
  }

  return { url: page.url() };
}

// ────────────────────────────────────────────── Tistory ─────────────────
//
// Tistory 에디터 (검증 완료 — 2026-05-10):
//   - 본인 블로그 자동 감지: tistory.com 메인 우상단 "내 블로그" 링크 → 호스트 추출
//   - 글쓰기 URL: https://<blogname>.tistory.com/manage/newpost
//   - 에디터: 기본모드 (TinyMCE WYSIWYG, iframe id=editor-tistory_ifr)
//     → window.tinymce.editors[0].setContent(html) API 직접 호출이 가장 안정적
//   - 제목: #post-title-inp (textarea)
//   - 발행 모달 트리거: #publish-layer-btn ("완료" 버튼)
//   - 발행 모달 (ReactModal):
//     · 공개 라디오: #open20 / 보호 #open15 / 비공개 #open0
//     · 태그: #tagText (modal 안)
//     · 최종 발행: #publish-btn (텍스트는 라디오에 따라 동적)

async function publishTistory(page, draft, cardPaths, opts) {
  ui.step(1, 6, 'Tistory 본인 블로그 감지 + 글쓰기 페이지 이동');

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'https://www.tistory.com',
  }).catch(() => {});

  await page.goto('https://www.tistory.com/', { waitUntil: 'domcontentloaded' });
  await ensureLoggedIn(page, 'tistory');
  await page.waitForTimeout(1500);

  // 본인 블로그 호스트 자동 감지 — 우상단 "내 블로그" 링크 또는 글쓰기 링크
  const blogName = await page.evaluate(() => {
    // priority 1: "내 블로그" 또는 "글쓰기" 텍스트 가진 링크
    for (const a of document.querySelectorAll('a')) {
      const txt = (a.innerText || '').trim();
      if (txt === '내 블로그' || txt === '글쓰기' || txt === '쓰기') {
        const m = (a.href || '').match(/https?:\/\/([^.]+)\.tistory\.com/);
        if (m && m[1] !== 'www' && m[1] !== 'notice' && m[1] !== 'help') return m[1];
      }
    }
    // priority 2: 어떤 my-tistory 호스트든
    for (const a of document.querySelectorAll('a[href*=".tistory.com"]')) {
      const m = a.href.match(/https?:\/\/([^.]+)\.tistory\.com/);
      if (m && !['www', 'notice', 'help'].includes(m[1])) return m[1];
    }
    return null;
  });
  if (!blogName) {
    throw new Error('Tistory 본인 블로그 감지 실패 — 본인 블로그 개설 후 다시 시도');
  }
  ui.dim(`  blog: ${blogName}.tistory.com`);
  await page.goto(`https://${blogName}.tistory.com/manage/newpost`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // 임시저장 복원 dialog dismiss (네이버처럼 자동 복원할 수 있음)
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button, a')) {
      const t = (b.innerText || '').trim();
      if (t === '취소' || t === '아니요') b.click?.();
    }
  }).catch(() => {});
  await page.waitForTimeout(500);

  const parsed = parseDraftMarkdown(draft.text);

  ui.step(2, 6, '제목 입력 (selector fallback)');
  let titleField = null;
  try {
    titleField = await waitForFirst(page, [
      '#post-title-inp',                            // 옛날 textarea
      'input[placeholder*="제목"]',
      'textarea[placeholder*="제목"]',
      '[data-testid*="title"] input',
      '[aria-label*="제목" i]',
      'header input[type="text"]',
    ], 12_000);
    await titleField.fill(parsed.title || '');
  } catch (e) {
    ui.warn(`  제목 fill 실패 — selector drift: ${e.message.slice(0, 80)}`);
  }
  await page.waitForTimeout(300);

  ui.step(3, 6, '본문 입력 (TinyMCE → contenteditable fallback)');
  // markdown → HTML 변환
  const bodyHtml = markdownToTistoryHtml(parsed.body);
  let setBodyResult = await page.evaluate((html) => {
    if (window.tinymce?.editors?.length) {
      window.tinymce.editors[0].setContent(html);
      return 'tinymce';
    }
    return null;
  }, bodyHtml);
  // tinymce 없으면 contenteditable fallback
  if (!setBodyResult) {
    try {
      const bodyEd = await waitForFirst(page, [
        'iframe[id*="ifr"]',                  // TinyMCE 5 iframe
        '.tox-edit-area iframe',
        '[contenteditable="true"][role="textbox"]',
        '[contenteditable="true"]:not([aria-label*="제목" i])',
      ], 10_000);
      // iframe 이면 frameContent
      const tagName = await bodyEd.evaluate((el) => el.tagName.toLowerCase());
      if (tagName === 'iframe') {
        const frame = page.frameLocator('iframe').first();
        await frame.locator('body').first().evaluate((el, h) => { el.innerHTML = h; }, bodyHtml);
        setBodyResult = 'iframe-body';
      } else {
        await bodyEd.click();
        await page.waitForTimeout(150);
        // paste via clipboard (markdown HTML)
        await page.evaluate((html) => navigator.clipboard.writeText(html), bodyHtml);
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
        setBodyResult = 'contenteditable-paste';
      }
    } catch (e) {
      ui.warn(`  본문 fallback 도 실패: ${e.message.slice(0, 80)}`);
      setBodyResult = 'fail';
    }
  }
  ui.dim(`  본문 → ${setBodyResult}`);
  await page.waitForTimeout(800);

  if (cardPaths.length) {
    ui.step(4, 6, `이미지 ${cardPaths.length}장 첨부 (selector fallback)`);
    try {
      // 1차: 직접 input[type=file] 시도 (가장 안정 — Tistory CDN 업로드)
      const directInput = page.locator('input[type="file"][accept*="image"]').first();
      const hasDirect = await directInput.count();
      if (hasDirect) {
        await directInput.setInputFiles(cardPaths);
        ui.dim(`  ${cardPaths.length}장 direct input setFiles 완료`);
      } else {
        // 2차: 첨부 dropdown 클릭 → 사진 → filechooser
        const attachTrigger = await waitForFirst(page, [
          '#mceu_0-open',                                  // 옛날 TinyMCE 4
          '[aria-label*="첨부" i]',
          'button:has-text("첨부")',
          '[data-testid*="attach"]',
          '.tox-toolbar button[title*="첨부" i]',
        ], 6000);
        await attachTrigger.click({ force: true });
        await page.waitForTimeout(500);
        const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 10_000 });
        const photoOpt = await waitForFirst(page, [
          '#attach-image',
          'a:has-text("사진")', 'button:has-text("사진")',
          '[role="menuitem"]:has-text("사진")',
        ], 5000);
        await photoOpt.click({ force: true });
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(cardPaths);
        ui.dim(`  ${cardPaths.length}장 dropdown setFiles 완료`);
      }
      await page.waitForTimeout(1500 * cardPaths.length + 2000);
    } catch (e) {
      ui.warn(`  사진 첨부 실패 (${e.message.slice(0, 100)}) — 수동 첨부`);
      await promptLine(`  이미지 ${cardPaths.length}장 수동 첨부 후 Enter`, { optional: true });
    }
  } else {
    ui.step(4, 6, '이미지 없음');
  }

  // dry-run safety — 발행 모달 자체를 안 엶
  if (opts.dryRun) {
    ui.step(5, 6, 'dry-run — 발행 모달 열기 skip (실제 발행 안전 차단)');
    ui.step(6, 6, 'dry-run 통과 — 본문/이미지 paste 까지 검증 완료');
    ui.dim('  실제 발행하려면 --dry-run 빼고 다시 실행하세요');
    return { url: null, dryRun: true, cancelled: false };
  }

  ui.step(5, 6, '발행 모달 열기 (#publish-layer-btn) + 공개 라디오 + 태그');
  await page.click('#publish-layer-btn').catch((e) => {
    ui.warn(`  완료 버튼 click 실패: ${e.message}`);
  });
  await page.waitForTimeout(2000);

  // 공개 라디오 (#open20)
  await page.click('#open20').catch(() => {});
  await page.waitForTimeout(300);

  // 태그 입력
  if ((parsed.tags ?? []).length) {
    const tagInput = page.locator('#tagText').first();
    if (await tagInput.isVisible().catch(() => false)) {
      let added = 0;
      for (const tag of parsed.tags.slice(0, 10)) { // Tistory 태그 한도 10
        const cleanTag = tag.replace(/^#/, '').trim();
        if (!cleanTag) continue;
        await tagInput.click({ force: true }).catch(() => {});
        await tagInput.fill(cleanTag).catch(() => {});
        await page.keyboard.press('Enter');
        await page.waitForTimeout(150);
        added++;
      }
      ui.dim(`  태그 ${added}개 (Tistory 한도 10)`);
    } else {
      ui.warn('  #tagText 안 보임');
    }
  }

  ui.step(6, 6, '최종 발행 직전 멈춤');
  const decision = await gate(page, 'Tistory 발행');
  if (decision === 'PRE_PUBLISH') return { url: null, prePublished: true, cancelled: false };
  if (decision !== 'Y') return { url: null, cancelled: !opts.dryRun };

  await page.click('#publish-btn').catch((e) => {
    ui.warn(`  최종 발행 버튼 click 실패: ${e.message}`);
  });
  await page.waitForTimeout(5000);

  return { url: page.url() };
}

// body markdown 을 image marker 위치에서 split — text/image segments 배열 반환.
// markdown 의 ![alt](IMAGE_PLACEHOLDER_N) 또는 ![alt](url) 마커가 cardPaths 의 N 번째 파일로 매핑.
function splitBodyByImageMarkers(body, cardPaths) {
  const segments = [];
  const re = /!\[([^\]]*)\]\(([^)]+?)(?:\s+"[^"]*")?\)/g;
  let lastIdx = 0;
  let imgCount = 0;
  let m;
  while ((m = re.exec(body)) !== null) {
    // text segment 직전까지
    if (m.index > lastIdx) {
      const text = body.slice(lastIdx, m.index).trim();
      if (text) segments.push({ type: 'text', content: text });
    }
    // image segment — cardPaths 순서대로 매핑
    if (imgCount < cardPaths.length) {
      segments.push({ type: 'image', path: cardPaths[imgCount], alt: m[1] || '' });
      imgCount++;
    }
    lastIdx = re.lastIndex;
  }
  // 마지막 image marker 이후 남은 text
  if (lastIdx < body.length) {
    const tail = body.slice(lastIdx).trim();
    if (tail) segments.push({ type: 'text', content: tail });
  }
  // image marker 가 없는 경우 (또는 cardPaths 가 marker 보다 많은 경우) — 본문 끝에 잔여 이미지 append
  for (; imgCount < cardPaths.length; imgCount++) {
    segments.push({ type: 'image', path: cardPaths[imgCount], alt: '' });
  }
  return segments;
}

// markdown → Naver SmartEditor 호환 rich HTML.
// SmartEditor 의 paste handler 가 다음을 자동 변환:
//   <h2>, <h3> → text + 굵은 큰 폰트
//   <blockquote> → quotation component
//   <table> → table component
//   <p>, <strong>, <em> → text 단락 + inline 스타일
function markdownToNaverHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) { i++; continue; }

    // image placeholder — 별도 첨부, 본문에서 제거
    if (/^!\[.*\]\([^)]+\)/.test(line)) { i++; continue; }
    // ## H2
    if (/^##\s+/.test(line) && !/^###/.test(line)) {
      out.push(`<h2>${escapeHtml(line.replace(/^##\s+/, ''))}</h2>`);
      i++; continue;
    }
    // ### H3
    if (/^###\s+/.test(line) && !/^####/.test(line)) {
      out.push(`<h3>${escapeHtml(line.replace(/^###\s+/, ''))}</h3>`);
      i++; continue;
    }
    // #### H4
    if (/^####\s+/.test(line)) {
      out.push(`<h4>${escapeHtml(line.replace(/^####\s+/, ''))}</h4>`);
      i++; continue;
    }
    // > quote
    if (/^>\s+/.test(line)) {
      out.push(`<blockquote>${inlineMd(line.replace(/^>\s+/, ''))}</blockquote>`);
      i++; continue;
    }
    // --- hr
    if (/^---+$/.test(line)) {
      out.push('<hr/>');
      i++; continue;
    }
    // | table |
    if (/^\|.+\|$/.test(line)) {
      const tableLines = [];
      while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) {
        tableLines.push(lines[i].trim());
        i++;
      }
      const rows = [];
      let isFirstRowHeader = false;
      for (let r = 0; r < tableLines.length; r++) {
        if (/^\|[-:|\s]+\|$/.test(tableLines[r])) {
          // separator → 직전 row 가 thead
          if (rows.length > 0) isFirstRowHeader = true;
          continue;
        }
        const cells = tableLines[r].slice(1, -1).split('|').map((c) => c.trim());
        rows.push(cells);
      }
      if (rows.length) {
        out.push('<table>');
        if (isFirstRowHeader) {
          out.push('<thead><tr>' + rows[0].map((c) => `<th>${escapeHtml(c)}</th>`).join('') + '</tr></thead>');
          out.push('<tbody>');
          for (let r = 1; r < rows.length; r++) {
            out.push('<tr>' + rows[r].map((c) => `<td>${inlineMd(c)}</td>`).join('') + '</tr>');
          }
          out.push('</tbody>');
        } else {
          out.push('<tbody>');
          for (const row of rows) {
            out.push('<tr>' + row.map((c) => `<td>${inlineMd(c)}</td>`).join('') + '</tr>');
          }
          out.push('</tbody>');
        }
        out.push('</table>');
      }
      continue;
    }
    // · · · (middot) 한 줄 → 네이버 구분선 <hr/>
    if (line.replace(/\s/g, '').length >= 2 && /^[·•・]+$/.test(line.replace(/\s/g, ''))) {
      out.push('<hr/>');
      i++;
      continue;
    }
    // - / * 불릿 리스트 → <ul><li> (연속 라인 묶음)
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i++;
      }
      out.push('<ul>' + items.map((it) => `<li>${inlineMd(it)}</li>`).join('') + '</ul>');
      continue;
    }
    // 일반 단락
    out.push(`<p>${inlineMd(line)}</p>`);
    i++;
  }
  return out.join('\n');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// inline markdown — bold/italic/code 만 변환, HTML 이스케이프 후 적용
function inlineMd(s) {
  let out = escapeHtml(s);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  return out;
}

// markdown → Tistory TinyMCE 호환 HTML (간단 변환)
function markdownToTistoryHtml(md) {
  const lines = md.split('\n');
  const out = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { out.push(''); continue; }
    if (/^### /.test(trimmed)) out.push(`<h3>${trimmed.replace(/^### /, '')}</h3>`);
    else if (/^## /.test(trimmed)) out.push(`<h2>${trimmed.replace(/^## /, '')}</h2>`);
    else if (/^# /.test(trimmed)) out.push(`<h2>${trimmed.replace(/^# /, '')}</h2>`); // H1 → H2 (Tistory 권장)
    else if (/^> /.test(trimmed)) out.push(`<blockquote><p>${trimmed.replace(/^> /, '')}</p></blockquote>`);
    else if (/^!\[.*\]\(.*\)/.test(trimmed)) {
      const m = trimmed.match(/!\[([^\]]*)\]\(([^)]+?)(?:\s+"[^"]*")?\)/);
      if (m) out.push(`<p><img src="${m[2]}" alt="${m[1]}"/></p>`);
    } else {
      // bold/italic 처리 + 단락
      let html = trimmed
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
      out.push(`<p>${html}</p>`);
    }
  }
  return out.filter((s, i, a) => !(s === '' && a[i - 1] === '')).join('\n');
}

// ────────────────────────────────────────────── Instagram ──────────────
//
// Instagram 자동화 (web 컴포저):
//   1. instagram.com 메인 → 좌측 sidebar "+" Create 버튼
//   2. file picker (filechooser) → 1~10장 carousel
//   3. 모달 다음 (Next) 클릭 — crop / filter 단계 skip
//   4. 캡션 textarea → text 입력 (해시태그 인라인)
//   5. Share 클릭 → 발행
// 셀렉터는 Instagram React 빈번한 변경 → 다중 fallback 필수.

async function publishInstagram(page, draft, cardPaths, opts) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'https://www.instagram.com',
  }).catch(() => {});

  ui.step(1, 6, 'instagram.com 이동');
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
  await page.bringToFront();
  await ensureLoggedIn(page, 'instagram');
  await page.waitForTimeout(1500);

  if (!cardPaths.length) {
    ui.warn('  Instagram 은 이미지 필수 — cardPaths 비어있음');
    throw new Error('Instagram requires at least 1 image');
  }

  // dry-run 안전망 — 만들기 모달 열기 전 멈춤 (사용자가 dry-run 누른 의도 존중)
  if (opts.dryRun) {
    ui.info('  --dry-run — 만들기 모달 열기 전 종료 (이미지 ' + cardPaths.length + '장 준비됨)');
    return { url: null, dryRun: true, cancelled: false, imageCount: cardPaths.length };
  }

  ui.step(2, 6, 'Create 버튼 → 만들기 → 게시물 sub-menu');
  // Instagram 흐름: 사이드바 "만들기" (= aria-label 은 "새로운 게시물") 클릭
  //   → popover 열림 [게시물 / 릴스 / 라이브 방송 / 광고]
  //   → "게시물" 클릭 → 업로드 모달
  const createSels = [
    'svg[aria-label="만들기"]',          // 사용자 시각 라벨
    'svg[aria-label="Create"]',
    'svg[aria-label="새로운 게시물"]',    // aria-label (일부 버전)
    'svg[aria-label="New post"]',
    'svg[aria-label*="post"]',
  ];
  let createClicked = false;
  for (const sel of createSels) {
    const cand = page.locator(sel).first();
    if (await cand.isVisible().catch(() => false)) {
      // Instagram 의 svg 부모가 클릭 가능한 div/a 임 — closest 로 클릭 가능 ancestor 찾기
      await cand.click({ force: true }).catch(() => {});
      createClicked = true;
      ui.dim(`  Create click: ${sel}`);
      break;
    }
  }
  if (!createClicked) {
    ui.warn('  Create 버튼 못 찾음 — 사용자가 + 클릭 후 Enter');
    await promptLine('  Create 모달 열림 후 Enter', { optional: true });
  }
  await page.waitForTimeout(1500);

  // "게시물" 옵션 클릭 (Reels / Live 와 분기) — 한국어 UI 의 sub-menu
  // span / div / a 다 가능 — 광범위 검색
  const postClicked = await page.evaluate(() => {
    for (const el of document.querySelectorAll('span, div, a, [role="link"], [role="menuitem"]')) {
      const txt = (el.innerText || el.textContent || '').trim();
      if (txt === '게시물' || txt === 'Post') {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // closest clickable
        let cur = el;
        for (let i = 0; i < 5 && cur; i++) {
          if (cur.tagName === 'A' || cur.tagName === 'BUTTON' ||
              cur.getAttribute('role') === 'button' || cur.getAttribute('role') === 'link' ||
              cur.getAttribute('role') === 'menuitem' || cur.onclick) {
            cur.click();
            return 'clicked: ' + cur.tagName + ' "' + txt + '"';
          }
          cur = cur.parentElement;
        }
        // fallback: click element directly
        el.click();
        return 'clicked direct: ' + el.tagName;
      }
    }
    return 'not-found';
  });
  ui.dim(`  게시물 옵션: ${postClicked}`);
  await page.waitForTimeout(2000);

  // filechooser 등장 대기 + setFiles
  // Instagram 은 "Select from computer" 버튼을 클릭하면 filechooser 가 뜸
  ui.step(3, 6, `이미지 ${cardPaths.length}장 업로드`);
  try {
    const selectBtn = page.locator(
      'button:has-text("Select from computer"), button:has-text("컴퓨터에서 선택"), ' +
      'button:has-text("내 컴퓨터"), button:has-text("컴퓨터에서 사진"), ' +
      'button:has-text("기기에서 선택"), [role="button"]:has-text("컴퓨터에서 선택")',
    ).first();
    if (await selectBtn.isVisible().catch(() => false)) {
      const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 10_000 });
      await selectBtn.click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(cardPaths);
      ui.dim(`  ${cardPaths.length}장 setFiles 완료`);
    } else {
      // 직접 input[type=file] 시도
      const fileInput = page.locator('input[type="file"][accept*="image"]').first();
      if (await fileInput.count()) {
        await fileInput.setInputFiles(cardPaths);
      } else {
        throw new Error('No file input');
      }
    }
    // 업로드 + 썸네일 렌더링 대기
    await page.waitForTimeout(2500 + 500 * cardPaths.length);
  } catch (e) {
    ui.warn(`  파일 업로드 실패 (${e.message}) — 수동 첨부`);
    await promptLine('  이미지 업로드 후 Enter', { optional: true });
  }

  ui.step(4, 6, '편집/필터 단계 skip — Next 2번');
  // Instagram 은 보통 Next 두 번 (crop → filter → 정보)
  for (let i = 0; i < 2; i++) {
    const nextBtn = page.locator(
      'div[role="button"]:has-text("Next"), button:has-text("Next"), div[role="button"]:has-text("다음"), button:has-text("다음")',
    ).first();
    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(1500);
      ui.dim(`  Next ${i + 1}/2 click`);
    } else {
      break;
    }
  }

  ui.step(5, 6, '캡션 입력 (해시태그 포함)');
  // 캡션 영역 — contenteditable 또는 textarea
  const captionSels = [
    'textarea[aria-label*="caption"]',
    'textarea[aria-label*="문구"]',
    'div[contenteditable="true"][aria-label*="caption"]',
    'div[contenteditable="true"][aria-label*="문구"]',
    'div[contenteditable="true"][role="textbox"]',
  ];
  let captionField = null;
  for (const sel of captionSels) {
    const cand = page.locator(sel).first();
    if (await cand.isVisible().catch(() => false)) {
      captionField = cand;
      break;
    }
  }
  if (captionField) {
    await captionField.click();
    await page.waitForTimeout(300);
    await page.evaluate((t) => navigator.clipboard.writeText(t), draft.text);
    await page.waitForTimeout(150);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
    await page.waitForTimeout(800);
    ui.dim('  캡션 paste 완료');
  } else {
    ui.warn('  캡션 셀렉터 못 찾음 — 수동 입력');
    await promptLine('  캡션 입력 후 Enter', { optional: true });
  }

  ui.step(6, 6, '게시 직전 멈춤');
  const decision = await gate(page, 'Instagram 게시');
  if (decision === 'PRE_PUBLISH') return { url: null, prePublished: true, cancelled: false };
  if (decision !== 'Y') return { url: null, cancelled: !opts.dryRun };

  // Share 버튼
  const shareBtn = page.locator(
    'div[role="button"]:has-text("Share"), button:has-text("Share"), div[role="button"]:has-text("공유"), button:has-text("공유")',
  ).first();
  if (await shareBtn.isVisible().catch(() => false)) {
    await shareBtn.click();
    await page.waitForTimeout(5000);
  } else {
    ui.warn('  Share 버튼 못 찾음 — 사용자가 직접 클릭');
    await promptLine('  공유 완료', { optional: true });
  }

  return { url: page.url() };
}

// ────────────────────────────────────────────── Brunch ──────────────────
//
// Brunch 에디터 (검증 완료 — 2026-05-10):
//   - URL 패턴: brunch.co.kr/@<author>/write
//   - author handle 자동 감지: brunch.co.kr 메인의 프로필 링크 (예: @c9d7a6c213414db)
//   - 제목: h1.cover_title (contenteditable)
//   - 부제목: .cover_sub_title (선택)
//   - 본문: .wrap_body.text_align_left (contenteditable, 큰 영역)
//   - 이미지 file inputs:
//     · #f-file-upload-image-0 (multiple, 본문 이미지)
//     · #f-file-upload-image-1 (single, 커버)
//     · #f-file-upload-image-2 (multiple, 그룹 이미지)
//   - 저장 (draft): button.article_save_draft
//   - 작가신청 (irreversible): button.btn_request
//   - **발행** 버튼은 작가 승인된 계정만 표시 (우리 기본 흐름은 draft 저장만)

async function publishBrunch(page, draft, cardPaths, opts) {
  ui.step(1, 6, 'Brunch author handle 감지 + 글쓰기 페이지 진입');

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'https://brunch.co.kr',
  }).catch(() => {});

  // 메인에서 본인 author handle 감지
  await page.goto('https://brunch.co.kr/', { waitUntil: 'domcontentloaded' });
  await ensureLoggedIn(page, 'brunch');
  await page.waitForTimeout(1500);

  // 본인 author handle 감지 — 본인 프로필 사이드바(.wrap_side_profile)에서만 추출
  // (메인 피드에 다른 작가들의 brunch.co.kr/@xxx 가 잔뜩 보이므로 좁혀야 함)
  const authorHandle = await page.evaluate(() => {
    // 1순위: 본인 사이드바 영역 — brunch 메인의 우측 본인 프로필 박스
    const sideSelectors = [
      '.wrap_side_profile',
      '#wrap_my',
      '.wrap_my',
      '[class*="profile_my"]',
      '[class*="my_profile"]',
    ];
    for (const sel of sideSelectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const text = el.innerText || '';
      const m = text.match(/brunch\.co\.kr\/@([a-zA-Z0-9_-]+)/);
      if (m) return m[1];
    }

    // 2순위: 메뉴의 "내 브런치" 링크 — 본인 페이지로 이동하므로 안전
    for (const a of document.querySelectorAll('a')) {
      const txt = (a.innerText || '').trim();
      if (txt === '내 브런치') {
        // 클릭하지 않고 href 추출 — 단 visible 텍스트로 본인 long-id 보강 우선
        const href = a.href || a.getAttribute('href') || '';
        const m = href.match(/@@?([a-zA-Z0-9_-]+)/);
        if (m && m[1] !== 'brunch') return m[1];
      }
    }
    return null;
  });
  // 1차 후보 handle 시도
  let handleCandidate = authorHandle;
  if (handleCandidate) ui.dim(`  1차 후보: @${handleCandidate}`);

  // /write 진입 (1차 후보로) — 에러면 fallback
  if (handleCandidate) {
    await page.goto(`https://brunch.co.kr/@${handleCandidate}/write`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
  }

  // /write 페이지 정상 로드 검증 (h1.cover_title 존재)
  const writeOk = await page.evaluate(() => !!document.querySelector('h1.cover_title'));
  if (!writeOk) {
    ui.warn('  1차 handle 로 /write 진입 실패 — "내 브런치" 클릭 fallback');
    // "내 브런치" 클릭하여 본인 페이지로 이동, URL 에서 handle 재추출
    await page.goto('https://brunch.co.kr/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const myBrunchLink = page.locator('a:has-text("내 브런치")').first();
    if (await myBrunchLink.isVisible().catch(() => false)) {
      await myBrunchLink.click();
      await page.waitForTimeout(2500);
      const m = page.url().match(/brunch\.co\.kr\/@@?([a-zA-Z0-9_-]+)/);
      if (m) {
        handleCandidate = m[1];
        ui.dim(`  2차 후보 (URL 기반): @${handleCandidate}`);
        await page.goto(`https://brunch.co.kr/@${handleCandidate}/write`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
      }
    }
  }

  // 최종 검증
  const finalWriteOk = await page.evaluate(() => !!document.querySelector('h1.cover_title'));
  if (!finalWriteOk) {
    throw new Error(`Brunch /write 진입 실패 — 작가 신청 미완료이거나 handle 추출 실패: ${page.url()}`);
  }
  ui.dim(`  write URL OK: ${page.url()}`);
  const finalHandle = handleCandidate;

  // 작가 승인 여부 확인 (button.btn_request 보이면 미승인)
  const isApproved = await page.evaluate(() => {
    return !document.querySelector('button.btn_request');
  });
  if (!isApproved) {
    ui.warn('  Brunch 작가 미승인 계정 — "발행" 대신 "draft 저장"만 가능');
    ui.warn('  글 완성 후 사용자가 직접 "작가신청" 버튼 클릭 (irreversible)');
  }

  const parsed = parseDraftMarkdown(draft.text);
  const bodyTextOnly = stripMarkdownImages(parsed.body);

  ui.step(2, 6, '제목 입력 (h1.cover_title)');
  const titleResult = await page.evaluate((title) => {
    const el = document.querySelector('h1.cover_title');
    if (!el) return 'no h1.cover_title';
    el.focus();
    el.textContent = title;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: title }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return 'set: h1.cover_title';
  }, parsed.title || '');
  ui.dim(`  제목 → ${titleResult}`);
  await page.waitForTimeout(500);

  ui.step(3, 6, '본문 입력 (.wrap_body)');
  // Brunch 본문은 contenteditable 의 paragraphs — execCommand('insertHTML') 가 잘 됨
  const bodyResult = await page.evaluate((body) => {
    const el = document.querySelector('.wrap_body.text_align_left, .wrap_body');
    if (!el) return 'no .wrap_body';
    el.focus();
    document.execCommand('selectAll', false, null);
    // markdown 단락 → HTML <p> 변환 (Brunch 가 paragraph 단위 처리)
    const html = body.split(/\n+/).filter(Boolean).map((p) => `<p>${p.replace(/</g, '&lt;')}</p>`).join('');
    document.execCommand('insertHTML', false, html);
    return 'set via insertHTML: ' + body.length + ' chars';
  }, bodyTextOnly);
  ui.dim(`  본문 → ${bodyResult}`);
  await page.waitForTimeout(800);

  if (cardPaths.length) {
    ui.step(4, 6, `이미지 ${cardPaths.length}장 첨부 (#f-file-upload-image-0)`);
    const fileInput = page.locator('#f-file-upload-image-0').first();
    if (await fileInput.count()) {
      await fileInput.setInputFiles(cardPaths, { timeout: 15_000 }).catch((e) => {
        ui.warn(`  setInputFiles 실패: ${e.message}`);
      });
      await page.waitForTimeout(1500 * cardPaths.length + 2000);
    } else {
      ui.warn('  #f-file-upload-image-0 못 찾음');
    }
  } else {
    ui.step(4, 6, '이미지 없음');
  }

  // dry-run safety — Draft 저장도 skip (Brunch 는 draft 저장 → 작가신청 단계로 갈 위험)
  if (opts.dryRun) {
    ui.step(5, 6, 'dry-run — Draft 저장 skip');
    ui.step(6, 6, 'dry-run 통과 — 본문/이미지 paste 까지 검증 완료');
    ui.dim('  실제 발행하려면 --dry-run 빼고 다시 실행하세요');
    return { url: null, dryRun: true, cancelled: false };
  }

  ui.step(5, 6, 'Draft 저장 (button.article_save_draft)');
  // 작가 승인 여부 무관 — 일단 draft 저장
  await page.click('button.article_save_draft').catch((e) => {
    ui.warn(`  저장 버튼 click 실패: ${e.message}`);
  });
  await page.waitForTimeout(1500);

  ui.step(6, 6, '최종 단계 — 발행 (작가 승인) / 작가신청 (미승인) / 그냥 종료');
  const decision = await gate(page, isApproved ? 'Brunch 발행' : 'Brunch — draft 저장만 (작가신청은 수동)');
  if (decision === 'PRE_PUBLISH') return { url: page.url(), prePublished: true, cancelled: false };
  if (decision !== 'Y') return { url: page.url(), cancelled: !opts.dryRun };

  if (isApproved) {
    // 작가 승인된 경우 — 발행 버튼 (정확한 셀렉터는 승인 계정에서 probe 필요)
    const publishBtn = page.locator(
      'button:has-text("발행"), button.btn_publish, button.article_publish'
    ).first();
    if (await publishBtn.isVisible().catch(() => false)) {
      await publishBtn.click({ force: true }).catch(() => {});
      await page.waitForTimeout(2500);
      // 매거진 + 태그 옵션 모달 (probe 후 보강 필요)
      if ((parsed.tags ?? []).length) {
        ui.dim(`  태그/매거진 모달은 작가 승인 계정에서 추가 probe 필요`);
      }
      // 최종 발행 버튼
      const finalBtn = page.locator('button:has-text("발행하기")').first();
      if (await finalBtn.isVisible().catch(() => false)) {
        await finalBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(4000);
      }
    } else {
      ui.warn('  발행 버튼 못 찾음 — 사용자가 직접 발행');
      await promptLine('  발행 완료', { optional: true });
    }
  } else {
    ui.info('  작가 미승인 — draft 저장 완료. brunch.co.kr/@' + finalHandle + ' 에서 직접 "작가신청" 클릭하세요.');
  }

  return { url: page.url() };
}

// ─── 다이얼로그 dismiss — 임시저장 복원 / 사진 첨부 방식 / 알림 모달 ─────
async function dismissNaverDialogs(frame, page, layoutPopup) {
  // 사진 첨부 방식 팝업 — "개별사진" 선택 (button 이 아니라 a/li/div 일 수 있음)
  if (layoutPopup) {
    for (let i = 0; i < 6; i++) {
      const found = await frame.evaluate(() => {
        const popup = document.querySelector('.se-popup-image-type, .se-popup-container');
        if (!popup) return null;
        const candidates = popup.querySelectorAll('*');
        for (const el of candidates) {
          const txt = (el.innerText || el.textContent || '').trim();
          if (txt === '개별사진') {
            const r = el.getBoundingClientRect();
            ['mousedown', 'mouseup', 'click'].forEach((type) => {
              el.dispatchEvent(new MouseEvent(type, {
                bubbles: true, cancelable: true, view: window,
                clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
              }));
            });
            return 'individual';
          }
        }
        return 'no-individual-found';
      }).catch(() => null);
      if (found === 'individual') {
        ui.dim(`  사진 첨부 방식 팝업 → 개별사진 선택`);
        await page.waitForTimeout(1500);
        return;
      }
      await page.waitForTimeout(500);
    }
    ui.warn('  개별사진 버튼 못 찾음 (이미지 첨부 실패 가능)');
    return;
  }

  // 임시저장 복원 / 도움말 / 동의 알림 — POLLING 방식 (최대 5초)
  // 다이얼로그가 page load 직후 0.5~2초 사이에 뜨므로 polling 으로 잡아야 함.
  for (let i = 0; i < 10; i++) {
    const dismissed = await frame.evaluate(() => {
      // 1) "이어서 작성" 임시저장 복원 다이얼로그 정확 매칭
      const restorePopup = document.querySelector('.se-popup-alert-confirm');
      if (restorePopup) {
        const text = (restorePopup.innerText || '').trim();
        if (text.includes('이어서 작성') || text.includes('작성 중인 글')) {
          // "취소" 버튼 클릭 → 임시저장 복원 안 함 (새로 시작)
          const cancelBtn = restorePopup.querySelector('.se-popup-button-cancel');
          if (cancelBtn) {
            const r = cancelBtn.getBoundingClientRect();
            ['mousedown', 'mouseup', 'click'].forEach((type) => {
              cancelBtn.dispatchEvent(new MouseEvent(type, {
                bubbles: true, cancelable: true, view: window,
                clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
              }));
            });
            cancelBtn.click?.();
            return 'restore-dialog-cancelled';
          }
        }
      }
      // 2) 일반 "취소" 셀렉터 (다른 알림류)
      for (const sel of ['.se-popup-button-cancel', '.__close', '.btn_close']) {
        for (const b of document.querySelectorAll(sel)) {
          const r = b.getBoundingClientRect();
          if (r.width === 0) continue;
          b.click?.();
          return 'generic-cancel: ' + sel;
        }
      }
      return null;
    }).catch(() => null);
    if (dismissed) {
      ui.dim(`  다이얼로그 dismiss → ${dismissed}`);
      await page.waitForTimeout(800);
      // 한 번 dismiss 후 또 다른 다이얼로그가 떠 있을 수 있으므로 polling 계속
    }
    await page.waitForTimeout(500);
  }
}

// ─── PostWriteForm iframe 재귀 탐색 ───────────────────────────────────────
// 주의: Naver 는 PostWriteForm URL 의 iframe 을 2개 만든다 (parent + actual editor).
// 둘 다 같은 URL 이라 단순 find() 는 빈 parent 를 반환할 수 있다 → 실제 .se-title-text
// 가 존재하는 frame 을 골라야 한다.
async function findPostWriteFrame(page) {
  for (let i = 0; i < 30; i++) {
    const candidates = page.frames().filter((f) => (f.url() || '').includes('PostWriteForm'));
    for (const f of candidates) {
      const hasEditor = await f.evaluate(
        () => document.querySelectorAll('.se-title-text').length > 0
      ).catch(() => false);
      if (hasEditor) return f;
    }
    await page.waitForTimeout(500);
  }
  // fallback: 마지막 PWF frame (보통 active editor 가 마지막)
  const all = page.frames().filter((f) => (f.url() || '').includes('PostWriteForm'));
  return all.length > 0 ? all[all.length - 1] : null;
}

// ─── 이미지 첨부 — image button 클릭 → file input emerge → setInputFiles ──
// 검증: 클릭 전 file input 0개 → 클릭 후 3개 emerge (accept=jpg,gif,png,bmp,heic,heif,webp; multiple)
async function attachNaverImages(frame, page, cardPaths) {
  // 툴바의 사진 버튼 클릭 — file input 이 이때 DOM 에 동적 생성됨
  const photoBtnSels = [
    '.se-image-toolbar-button',                 // 검증된 1순위
    '.se-insert-menu-button-image',
    '.se-floating-category-button-photo',
    'button[aria-label*="사진"]',
    'button[aria-label*="이미지"]',
  ];
  let clicked = false;
  for (const sel of photoBtnSels) {
    const ok = await frame.evaluate((s) => {
      const b = document.querySelector(s);
      if (!b) return false;
      const r = b.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      b.click();
      return true;
    }, sel);
    if (ok) { clicked = true; ui.dim(`  사진 버튼 click: ${sel}`); break; }
  }
  if (!clicked) ui.warn('  사진 버튼 못 찾음');

  // file input emerge 대기 (최대 5초)
  let fileInputCount = 0;
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(500);
    fileInputCount = await frame.evaluate(() => document.querySelectorAll('input[type="file"]').length);
    if (fileInputCount > 0) break;
  }
  ui.dim(`  file input ${fileInputCount}개 감지`);

  if (fileInputCount === 0) {
    ui.warn('  file input 미감지 — 수동 첨부 모드');
    await promptLine(`  이미지 ${cardPaths.length}장 수동 첨부 후 Enter`, { optional: true });
    return;
  }

  // setInputFiles — 첫 번째 input[type=file] 사용
  try {
    const fileInput = frame.locator('input[type="file"]').first();
    await fileInput.setInputFiles(cardPaths, { timeout: 15_000 });
    // CDN 업로드 대기 — 1.5초/장 + buffer
    await page.waitForTimeout(1500 * cardPaths.length + 2000);
  } catch (e) {
    ui.warn(`  setInputFiles 실패 (${e.message}) — 수동 첨부 모드로 fallback`);
    await promptLine(`  이미지 ${cardPaths.length}장 수동 첨부 후 Enter`, { optional: true });
  }
}

// ─── 캡션 자동 입력 — 4-strategy DOM scan + native setter ───────────────
async function fillNaverCaptions(frame, page, captions) {
  // SmartEditor 이미지 렌더링 + CDN 업로드 완료 대기 (최대 12초 폴링)
  for (let attempt = 0; attempt < 12; attempt++) {
    await page.waitForTimeout(1000);
    const result = await frame.evaluate((capList) => {
      // Strategy 1: input placeholder 에 "사진 설명" 포함
      let els = Array.from(document.querySelectorAll('input'))
        .filter((el) => (el.placeholder || '').includes('사진 설명'));

      // Strategy 2: .se-image-caption 내부 contenteditable
      if (els.length === 0) {
        els = Array.from(document.querySelectorAll(
          '.se-image-caption [contenteditable], .se-image-caption p, .se-image-caption div'
        )).filter((el) => el.isContentEditable || el.getAttribute('contenteditable') === 'true');
      }

      // Strategy 3: contenteditable 중 className 에 caption/placeholder/description 포함
      if (els.length === 0) {
        els = Array.from(document.querySelectorAll('[contenteditable]'))
          .filter((el) => {
            const cls = el.className || '';
            return cls.includes('caption') || cls.includes('se-placeholder')
                || cls.includes('description') || cls.includes('desc');
          });
      }

      // Strategy 4: 이미지 컴포넌트 내부 첫 contenteditable
      if (els.length === 0) {
        const imgComps = document.querySelectorAll(
          '.se-component.se-image, [data-se-type="image"], .se-image'
        );
        els = Array.from(imgComps).map((c) => c.querySelector('[contenteditable]')).filter(Boolean);
      }

      if (els.length === 0) return 'not-found';

      let filled = 0;
      els.forEach((el, i) => {
        const text = capList[i] || '';
        if (!text) return;

        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          // React-controlled input 우회: native setter 직접 호출
          const proto = el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          if (setter) setter.call(el, text);
          else el.value = text;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          // contenteditable: focus → selectAll → insertText
          el.focus();
          document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, text);
          el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
        }
        filled++;
      });
      return 'filled:' + filled + '/' + els.length;
    }, captions);
    if (!result.startsWith('not-found')) {
      ui.dim(`  caption → ${result}`);
      return;
    }
  }
  ui.warn('  캡션 입력 실패 — 사용자가 직접 입력하세요');
}

// 본문 markdown 의 ![alt](url) 에서 alt 텍스트만 순서대로 추출 — 캡션 자동 입력용.
function extractImageCaptions(md) {
  const caps = [];
  const re = /!\[([^\]]*)\]\([^)]+\)/g;
  let m;
  while ((m = re.exec(md)) !== null) caps.push(m[1] || '');
  return caps;
}

function parseDraftMarkdown(text) {
  if (text?.startsWith('---\n')) {
    const end = text.indexOf('\n---\n', 4);
    if (end > 0) {
      const head = text.slice(4, end);
      const body = text.slice(end + 5).trimStart();
      const meta = parseFrontmatter(head);
      return { title: meta.title ?? '', body, tags: meta.tags ?? [] };
    }
  }
  const [first, ...rest] = (text ?? '').split('\n');
  return { title: first.replace(/^#+\s*/, '').trim(), body: rest.join('\n').trimStart(), tags: [] };
}

function parseFrontmatter(yaml) {
  const out = {};
  for (const raw of yaml.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.+)$/);
    if (!m) continue;
    const [, key, val] = m;
    if (val.startsWith('[') && val.endsWith(']')) {
      out[key] = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      out[key] = val.replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

function stripMarkdownImages(md) {
  // ![alt](url "title") 또는 ![alt](url) 라인 제거 (별도 첨부하므로)
  let out = md.replace(/!\[[^\]]*\]\([^)]+\)\s*\n?/g, '');
  // Naver 는 markdown 안 받음 → ##/###, **bold**, [link](url) 마크 제거 (텍스트만 보존)
  out = out.replace(/^#{1,6}\s+/gm, '');                 // # H1, ## H2 ...
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');           // **bold** → bold
  out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1'); // *italic* → italic
  out = out.replace(/`([^`\n]+)`/g, '$1');               // `code` → code
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)'); // [text](url) → text (url)
  out = out.replace(/^>\s+/gm, '');                      // > blockquote
  out = out.replace(/^[-*+]\s+/gm, '· ');                // - list → · list
  out = out.replace(/\n{3,}/g, '\n\n');                  // 빈 줄 정리
  return out.trim();
}

// ────────────────────────────────────────────── helpers ──────────────────

async function ensureLoggedIn(page, channel) {
  await page.waitForTimeout(1500);

  // 채널별 LOGGED-IN 인디케이터 — 이게 보이면 로그인 됐다고 확신 (false positive 방지)
  const LOGGED_IN_INDICATORS = {
    'naver-blog': '#gnb_my_lnk_layer, #gnb_my_lnk, .MyView-module__my_login',
    'tistory': 'a[href*=".tistory.com/manage"], a:has-text("내 블로그"), a:has-text("글쓰기")',
    'brunch': 'a[href*="brunch.co.kr/@"], .btn_user, .user_profile',
    'linkedin': 'img.global-nav__me-photo, .global-nav__primary-link-me, button[aria-label*="Start a post"], button[aria-label*="게시물"]',
    'threads': '[aria-label*="Profile"], [aria-label*="프로필"], [aria-label*="Create"], [aria-label*="새 게시물"]',
    'instagram': 'svg[aria-label*="New post"], svg[aria-label*="Home"], svg[aria-label*="홈"], a[href*="/accounts/edit/"]',
  };

  const indicator = LOGGED_IN_INDICATORS[channel];
  if (indicator) {
    const loggedIn = await page.locator(indicator).first().isVisible().catch(() => false);
    if (loggedIn) return; // 로그인 확실 — 더 묻지 않음
  }

  // 로그인 indicator 못 찾으면 로그인 버튼 체크 (legacy fallback)
  const signInBtn = page.getByRole('button', { name: /^log in$|^sign in$|^로그인$/i }).first();
  const signInLink = page.getByRole('link', { name: /^log in$|^sign in$|^로그인$/i }).first();
  const isVisible =
    (await signInBtn.isVisible().catch(() => false)) ||
    (await signInLink.isVisible().catch(() => false));
  if (isVisible) {
    ui.warn(`[${channel}] 로그인 필요 — 브라우저에서 직접 로그인하세요. 완료 후 Enter.`);
    await promptLine('  로그인 완료', { optional: true });
  }
}
