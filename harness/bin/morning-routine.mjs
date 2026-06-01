#!/usr/bin/env node
// Morning routine — 명령어 1개로 발행 직전까지.
//
//   node bin/morning-routine.mjs              # 실제 실행 (Chrome 탭 발행 준비)
//   node bin/morning-routine.mjs --dry-run    # 시뮬레이션 (Chrome 탭 안 열림)
//   npm run morning
//
// 흐름:
//   1. 환경 검증 (doctor 간략 버전)
//   2. 오늘 캠페인 목록 추출 (slots.yaml nextRun + campaigns/ pending 상태)
//   3. 채널별 카피 + 이미지 생성 → brand-guardian 검수 → block 시 1회 재생성
//   4. browser-publish --pre-publish (모달+카피+이미지 채움, Chrome 탭 유지)
//   5. 대시보드 알림

import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { PATHS, ROOT, HARNESS_ROOT, readYaml, nowKstIso, ui } from './_lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const attachUrl = argv.find((a) => a.startsWith('--attach='))?.split('=')[1] || 'http://localhost:9222';

// ─── 유틸 ──────────────────────────────────────────────────────────────────

function run(script, args = [], opts = {}) {
  const result = spawnSync(process.execPath, [resolve(HERE, script), ...args], {
    encoding: 'utf8',
    stdio: opts.silent ? 'pipe' : 'inherit',
    env: { ...process.env, MARKETING_AGENT_SKIP_UPDATE_CHECK: '1' },
    timeout: opts.timeout ?? 120_000,
  });
  return result;
}

function runJson(script, args = []) {
  const result = spawnSync(process.execPath, [resolve(HERE, script), ...args, '--json'], {
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, MARKETING_AGENT_SKIP_UPDATE_CHECK: '1' },
    timeout: 60_000,
  });
  try { return JSON.parse(result.stdout || '{}'); } catch { return {}; }
}

function todayKst() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 10);
}

// ─── 1. 환경 검증 ──────────────────────────────────────────────────────────

ui.info('🌅 Morning routine 시작' + (dryRun ? ' (--dry-run)' : ''));
ui.info('');

// company-profile.yaml 존재 확인
if (!existsSync(PATHS.profile)) {
  ui.err('company-profile.yaml 없음 — /sns-onboard 실행 필요');
  process.exit(1);
}

// node_modules 확인
if (!existsSync(resolve(ROOT, 'node_modules'))) {
  ui.err('node_modules 없음 — npm install 실행 필요');
  process.exit(1);
}

// .env.local 확인
if (!existsSync(resolve(ROOT, '.env.local'))) {
  ui.warn('.env.local 없음 — 이미지 생성 실패 가능 (copy만 진행)');
}

// Chrome 9222 alive 확인 (선택적 — pre-publish 필요 시)
let chromeAlive = false;
if (!dryRun) {
  try {
    const r = spawnSync('curl', ['-sf', '--max-time', '3', `${attachUrl}/json/version`], {
      encoding: 'utf8', stdio: 'pipe', timeout: 5000,
    });
    chromeAlive = r.status === 0 && r.stdout.includes('webSocketDebuggerUrl');
  } catch {}

  if (!chromeAlive) {
    ui.warn(`Chrome 9222 미응답 (${attachUrl}) — browser-publish 단계를 건너뜁니다.`);
    ui.warn('  Chrome 을 --remote-debugging-port=9222 모드로 먼저 실행하세요.');
    ui.warn('  예) /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222');
  }
}

// ─── 2. 오늘 캠페인 추출 ───────────────────────────────────────────────────

const today = todayKst();
ui.info(`📅 날짜: ${today}`);

// 2-A: slots.yaml — nextRun 이 오늘인 슬롯
const SLOTS_PATH = resolve(PATHS.campaignsDir, '..', 'slots.yaml');
const slotsRaw = existsSync(SLOTS_PATH) ? (() => {
  try { return YAML.parse(readFileSync(SLOTS_PATH, 'utf8')); } catch { return null; }
})() : null;
const slots = Array.isArray(slotsRaw?.slots) ? slotsRaw.slots : [];
const todaySlots = slots.filter((s) => s.nextRun?.startsWith(today));

// 2-B: campaigns/ — pending 상태 채널이 있는 캠페인
const campaignQueue = []; // { slug, channel }
if (existsSync(PATHS.campaignsDir)) {
  const dirs = readdirSync(PATHS.campaignsDir)
    .filter((n) => {
      try { return statSync(resolve(PATHS.campaignsDir, n)).isDirectory(); } catch { return false; }
    });
  for (const slug of dirs) {
    const briefPath = resolve(PATHS.campaignsDir, slug, 'brief.yaml');
    if (!existsSync(briefPath)) continue;
    let brief;
    try { brief = YAML.parse(readFileSync(briefPath, 'utf8')); } catch { continue; }
    const channels = brief.channels ?? [];
    for (const ch of channels) {
      const status = brief.status?.[ch];
      if (status === 'pending' || status === 'drafting') {
        campaignQueue.push({ slug, channel: ch, brief });
      }
    }
  }
}

// 2-C: todaySlots에서 lastSlugs 기반 채널 추가
for (const slot of todaySlots) {
  const channels = slot.channels ?? [];
  const slugsFromSlot = slot.lastSlugs ?? [];
  for (const slug of slugsFromSlot) {
    const briefPath = resolve(PATHS.campaignsDir, slug, 'brief.yaml');
    if (!existsSync(briefPath)) continue;
    let brief;
    try { brief = YAML.parse(readFileSync(briefPath, 'utf8')); } catch { continue; }
    for (const ch of channels) {
      const status = brief.status?.[ch];
      if (!['published', 'failed', 'blocked'].includes(status)) {
        if (!campaignQueue.find((q) => q.slug === slug && q.channel === ch)) {
          campaignQueue.push({ slug, channel: ch, brief });
        }
      }
    }
  }
}

if (campaignQueue.length === 0) {
  ui.warn('오늘 발행할 캠페인이 없습니다.');
  ui.info('  새 캠페인: /sns-start 로 생성하거나 slots.yaml 에 nextRun 을 오늘로 설정하세요.');
  process.exit(0);
}

ui.info(`🎯 발행 대기 ${campaignQueue.length}개:`);
for (const { slug, channel } of campaignQueue) {
  ui.info(`   • ${slug} [${channel}]`);
}
ui.info('');

// ─── 3. 채널별 처리 ────────────────────────────────────────────────────────

const prepared = [];   // { slug, channel, status, report? }
const skipped  = [];   // { slug, channel, reason }

for (const { slug, channel, brief } of campaignQueue) {
  ui.info(`━━━ ${slug} [${channel}] ━━━`);

  // 3-1. 카피 + 이미지 생성
  ui.info('  📝 카피 + 이미지 생성 중...');
  if (!dryRun) {
    const gen = run('generate.mjs', [slug, `--channel=${channel}`]);
    if (gen.status !== 0) {
      ui.warn(`  생성 실패 — SKIP (generate.mjs exit ${gen.status})`);
      skipped.push({ slug, channel, reason: `generate 실패 (exit ${gen.status})` });
      continue;
    }
  } else {
    ui.dim('  [dry-run] generate.mjs 스킵');
  }

  // 3-2. brand-guardian 검수 (inspect-guidelines — deterministic)
  ui.info('  🔍 가이드라인 검수 중...');
  let report = null;
  if (!dryRun) {
    report = runJson('inspect-guidelines.mjs', [slug, `--channel=${channel}`]);

    if (report?.ok === false) {
      const codes = (report.blocking ?? []).join(', ') || '미준수';
      ui.warn(`  block 발견: ${codes} — 재생성 시도 (1회)`);

      // 3-2-1. 1회 재생성 (피드백 없이 단순 재생성)
      const regen = run('generate.mjs', [slug, `--channel=${channel}`]);
      if (regen.status !== 0) {
        ui.warn(`  재생성 실패 — SKIP`);
        skipped.push({ slug, channel, reason: `재생성 실패, 원인: ${codes}` });
        continue;
      }

      // 3-2-2. 재검수
      report = runJson('inspect-guidelines.mjs', [slug, `--channel=${channel}`]);
      if (report?.ok === false) {
        const remaining = (report.blocking ?? []).join(', ') || '미준수';
        ui.warn(`  재검수 후 block 잔존: ${remaining} — SKIP`);
        skipped.push({ slug, channel, reason: `block 잔존 (${remaining})` });
        continue;
      }
    }
    ui.ok('  검수 통과');
  } else {
    ui.dim('  [dry-run] inspect-guidelines.mjs 스킵');
  }

  // 3-3. browser-publish --pre-publish (모달+카피+이미지 채움, 탭 유지)
  if (!dryRun && chromeAlive) {
    ui.info(`  🌐 Chrome 탭 발행 준비 중 [${channel}]...`);
    const pub = run('browser-publish.mjs', [
      slug, `--channel=${channel}`, '--attach', `--attach=${attachUrl}`, '--pre-publish',
    ]);
    if (pub.status !== 0) {
      ui.warn(`  browser-publish 실패 (exit ${pub.status}) — 수동 발행 필요`);
      skipped.push({ slug, channel, reason: `browser-publish 실패` });
      continue;
    }
    ui.ok(`  Chrome 탭 준비 완료 — [공유] 클릭만 하면 됩니다`);
    prepared.push({ slug, channel, status: 'ready', report });
  } else if (dryRun) {
    ui.dim('  [dry-run] browser-publish 스킵');
    prepared.push({ slug, channel, status: 'dry-run', report });
  } else {
    // Chrome 없이 — 준비는 됐지만 탭 안 열림
    ui.warn(`  Chrome 미응답 — 카피/이미지 생성 완료, 수동 발행 필요`);
    prepared.push({ slug, channel, status: 'ready-no-chrome', report });
  }

  ui.info('');
}

// ─── 4. 요약 + 대시보드 알림 ──────────────────────────────────────────────

const readyCount = prepared.filter((p) => p.status === 'ready').length;
const skipCount  = skipped.length;
const dryCount   = prepared.filter((p) => p.status === 'dry-run').length;

ui.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
if (dryRun) {
  ui.ok(`Morning routine 완료 (dry-run) — ${dryCount}개 처리 예정`);
} else {
  ui.ok(`Morning routine 완료 — 발행 대기 ${readyCount}개${skipCount ? `, SKIP ${skipCount}개` : ''}`);
}

if (prepared.length) {
  ui.info('');
  ui.info('📋 발행 대기 목록:');
  for (const { slug, channel, status } of prepared) {
    const icon = status === 'ready' ? '✅' : status === 'dry-run' ? '🔵' : '⚠️';
    ui.info(`   ${icon} ${slug} [${channel}]`);
  }
}

if (skipped.length) {
  ui.info('');
  ui.info('⏭️  SKIP 목록:');
  for (const { slug, channel, reason } of skipped) {
    ui.warn(`   • ${slug} [${channel}] — ${reason}`);
  }
}

if (!dryRun && readyCount > 0) {
  ui.info('');
  ui.info('👉 Chrome 탭에서 각 채널 확인 후 [공유] / [게시] 클릭');

  // 대시보드 알림 (dashboard가 떠 있으면 POST, 없으면 무시)
  try {
    const { default: http } = await import('node:http');
    await new Promise((resolve) => {
      const body = JSON.stringify({
        title: `🌅 Morning routine 완료`,
        message: `발행 대기 ${readyCount}개 · Chrome 탭 확인${skipCount ? ` · SKIP ${skipCount}개` : ''}`,
        ts: nowKstIso(),
      });
      const req = http.request(
        { hostname: 'localhost', port: 7777, path: '/api/morning-notify', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
        () => resolve()
      );
      req.on('error', () => resolve()); // 대시보드 없으면 무시
      req.setTimeout(2000, () => { req.destroy(); resolve(); });
      req.write(body);
      req.end();
    });
  } catch {}
}
