#!/usr/bin/env node
// 쿠키 스냅샷/복원 — "한번 로그인하면 계속 유지".
// 라이브 Chrome(9222)의 로그인 쿠키를 auth/cookies/<channel>.json 에 떠두고(save),
// 시작 시 라이브 프로필에 없는 쿠키만 복원(restore)해 강제종료·프로필 손상에도 로그인 유지.
//
// 안전 원칙: restore 는 라이브에 이미 있는 쿠키(=현재 로그인)를 절대 덮어쓰지 않는다.
//            없을 때만 추가 → 최악의 경우에도 현재 상태보다 나빠지지 않음.
//
// Usage:
//   node harness/bin/cookie-store.mjs save     [--channel=naver-blog]
//   node harness/bin/cookie-store.mjs restore   [--channel=naver-blog]
//   node harness/bin/cookie-store.mjs status
//
// 네이버 한계: 서버가 세션을 만료시키면 복원해도 무효 — 재로그인 불가피(morning preflight 가 자동 처리).

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, ui } from './_lib.mjs';

const COOKIE_DIR = resolve(ROOT, 'auth/cookies');
const PORT = Number(process.argv.find((a) => a.startsWith('--port='))?.split('=')[1] || 9222);

// 채널별 쿠키 도메인 — 단일 로그인쿠키만으론 세션이 부족해 도메인 전체를 저장.
const CHANNEL_DOMAINS = {
  'naver-blog': ['naver.com'],
  'instagram':  ['instagram.com'],
  'threads':    ['threads.net', 'threads.com', 'instagram.com'],
  'linkedin':   ['linkedin.com'],
  'tistory':    ['tistory.com', 'kakao.com', 'daum.net'],
  'brunch':     ['kakao.com', 'brunch.co.kr', 'daum.net'],
  'facebook':   ['facebook.com'],
  'x':          ['x.com', 'twitter.com'],
};

const argv = process.argv.slice(2);
const cmd = argv[0];
const channelArg = argv.find((a) => a.startsWith('--channel='))?.split('=')[1];

function matchesChannel(cookie, channel) {
  const domains = CHANNEL_DOMAINS[channel] || [];
  const d = (cookie.domain || '').replace(/^\./, '');
  return domains.some((dom) => d === dom || d.endsWith('.' + dom));
}

async function withCtx(fn) {
  let browser = null;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.connectOverCDP(`http://localhost:${PORT}`, { timeout: 8000 });
    const ctx = browser.contexts()[0];
    if (!ctx) throw new Error('Chrome 9222 context 없음 (start-demo 먼저 실행)');
    return await fn(ctx);
  } finally {
    try { await browser?.close(); } catch { /* attach 모드 — disconnect 만 */ }
  }
}

async function save(channels) {
  mkdirSync(COOKIE_DIR, { recursive: true });
  await withCtx(async (ctx) => {
    const cookies = await ctx.cookies();
    for (const ch of channels) {
      const chCookies = cookies.filter((c) => matchesChannel(c, ch));
      if (!chCookies.length) { ui.dim(`  [${ch}] 저장할 쿠키 없음 (로그인 안 됨) — skip`); continue; }
      const file = resolve(COOKIE_DIR, `${ch}.json`);
      writeFileSync(file, JSON.stringify({ channel: ch, savedAt: new Date().toISOString(), cookies: chCookies }, null, 2), 'utf8');
      try { chmodSync(file, 0o600); } catch { /* windows */ }
      ui.ok(`  [${ch}] 쿠키 ${chCookies.length}개 스냅샷 저장`);
    }
  });
}

async function restore(channels) {
  if (!existsSync(COOKIE_DIR)) { ui.dim('  스냅샷 디렉토리 없음 — restore 할 것 없음'); return; }
  await withCtx(async (ctx) => {
    const live = await ctx.cookies();
    const liveKey = new Set(live.map((c) => c.name + '@' + c.domain));
    const now = Date.now() / 1000;
    for (const ch of channels) {
      const file = resolve(COOKIE_DIR, `${ch}.json`);
      if (!existsSync(file)) continue;
      let snap;
      try { snap = JSON.parse(readFileSync(file, 'utf8')); } catch { ui.warn(`  [${ch}] 스냅샷 파싱 실패 — skip`); continue; }
      const toAdd = [];
      for (const c of snap.cookies || []) {
        if (liveKey.has(c.name + '@' + c.domain)) continue;            // 현재 로그인 절대 안 건드림
        if (c.expires && c.expires > 0 && c.expires < now) continue;   // 이미 만료된 영구쿠키 무의미
        const cookie = { ...c };
        if (!cookie.expires || cookie.expires <= 0) cookie.expires = now + 30 * 24 * 3600; // 세션쿠키 → 30일 지속
        toAdd.push(cookie);
      }
      if (!toAdd.length) { ui.dim(`  [${ch}] 복원 불필요 (이미 로그인됨 또는 스냅샷 만료)`); continue; }
      try { await ctx.addCookies(toAdd); ui.ok(`  [${ch}] 쿠키 ${toAdd.length}개 복원`); }
      catch (e) { ui.warn(`  [${ch}] 복원 실패: ${e.message}`); }
    }
  });
}

function status() {
  if (!existsSync(COOKIE_DIR)) { ui.info('스냅샷 없음 (auth/cookies/ 비어있음)'); return; }
  const files = readdirSync(COOKIE_DIR).filter((f) => f.endsWith('.json'));
  if (!files.length) { ui.info('스냅샷 없음'); return; }
  ui.info('저장된 쿠키 스냅샷:');
  for (const f of files) {
    try {
      const s = JSON.parse(readFileSync(resolve(COOKIE_DIR, f), 'utf8'));
      ui.ok(`  ${s.channel}: ${(s.cookies || []).length}개 · savedAt ${s.savedAt}`);
    } catch { ui.warn(`  ${f}: 파싱 실패`); }
  }
}

const channels = channelArg ? [channelArg] : Object.keys(CHANNEL_DOMAINS);

try {
  if (cmd === 'save') await save(channels);
  else if (cmd === 'restore') await restore(channels);
  else if (cmd === 'status') status();
  else { ui.err('usage: cookie-store.mjs save|restore|status [--channel=X]'); process.exit(2); }
} catch (e) {
  // 훅에서 호출되므로 절대 host 를 죽이지 않는다 — 경고만.
  ui.warn(`cookie-store ${cmd} 실패 (계속 진행): ${e.message}`);
  process.exit(0);
}
process.exit(0);
