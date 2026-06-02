#!/usr/bin/env node
// morning-routine.mjs — 하루 시작 시 명령어 1개로 발행 직전까지 자동.
//
// 사용자 궁극 목표 (WORKORDER P0-E):
//   컴퓨터 켜고 `npm run morning` → Chrome 탭 N개 발행 직전 상태 → [공유] 클릭만.
//
// 흐름:
//   1. 환경 검증 (Chrome 9222 / 대시보드 7777) — 안 떠 있으면 자동 시작
//   2. 오늘 작업 list 추출
//      · posts/campaigns/*/brief.yaml 중 status 에 'pending' 또는 'approved' 인 채널
//      · --slug=X 로 특정 캠페인만 지정 가능
//   3. 각 캠페인-채널 순차 처리:
//      · draft yaml 없으면 generate + finalize (카피 + 이미지 자동 생성)
//      · brand-guardian 자동 검수 (block 있으면 SKIP + 보고)
//      · browser-publish --pre-publish (모달 + paste + 첨부까지, gate 에서 멈춤)
//   4. Chrome 탭 N개 살아있는 상태로 사용자에게 인계
//
// Usage:
//   node harness/bin/morning-routine.mjs                  # 모든 pending 채널
//   node harness/bin/morning-routine.mjs --slug=X         # 특정 캠페인만
//   node harness/bin/morning-routine.mjs --channel=naver-blog
//   node harness/bin/morning-routine.mjs --max=3          # 최대 3개 채널까지만
//   node harness/bin/morning-routine.mjs --dry-run        # 시뮬레이션 (Chrome 모달 안 엶)
//   node harness/bin/morning-routine.mjs --skip-generate  # generate/finalize 스킵 (이미 draft 있다고 가정)

import { resolve } from 'node:path';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import YAML from 'yaml';
import { ROOT, ui } from './_lib.mjs';

const argv = process.argv.slice(2);
const slugFilter   = argv.find((a) => a.startsWith('--slug='))?.split('=')[1];
const channelFilter = argv.find((a) => a.startsWith('--channel='))?.split('=')[1];
const maxChannels  = Number(argv.find((a) => a.startsWith('--max='))?.split('=')[1] || '5');
const dryRun       = argv.includes('--dry-run');
const skipGenerate = argv.includes('--skip-generate');

const NODE = process.execPath;

// ─── 1. 환경 검증 ─────────────────────────────────────────
async function ensureEnvironment() {
  ui.step(1, 4, '환경 검증 — Chrome 9222 / 대시보드 7777');

  // Chrome 9222 alive?
  let chromeAlive = false;
  try {
    const r = await fetch('http://localhost:9222/json/version', { signal: AbortSignal.timeout(2000) });
    chromeAlive = r.ok;
  } catch {}
  if (chromeAlive) {
    ui.ok('  Chrome 9222 alive');
  } else {
    ui.warn('  Chrome 9222 미연결 — 자동 시작 시도');
    if (dryRun) {
      ui.dim('  --dry-run — Chrome 시작 skip');
    } else {
      // 대시보드 API 통해 Chrome 시작 (가장 안전 — OS별 자동 감지 + cookie 보존)
      try {
        const r = await fetch('http://localhost:7777/api/chrome/start', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
          signal: AbortSignal.timeout(25_000),
        });
        const data = await r.json();
        if (data.ok) {
          ui.ok(`  Chrome 시작됨 (${data.browser || 'OK'})`);
        } else {
          throw new Error(data.error || 'unknown');
        }
      } catch (e) {
        ui.err(`  Chrome 시작 실패: ${e.message}`);
        ui.dim('  대시보드가 안 떠 있을 수도 — 먼저 scripts/start-demo.ps1 실행 또는 node harness/bin/dashboard.mjs');
        process.exit(2);
      }
    }
  }

  // 대시보드 alive?
  let dashAlive = false;
  try {
    const r = await fetch('http://localhost:7777/api/today', { signal: AbortSignal.timeout(2000) });
    dashAlive = r.ok;
  } catch {}
  if (dashAlive) {
    ui.ok('  대시보드 7777 alive');
  } else {
    ui.warn('  대시보드 7777 미연결 — 백그라운드 spawn');
    if (!dryRun) {
      const child = spawn(NODE, [resolve(ROOT, 'harness/bin/dashboard.mjs')], {
        detached: true, stdio: 'ignore', cwd: ROOT,
      });
      child.unref();
      // alive polling 최대 10초
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const r = await fetch('http://localhost:7777/api/today', { signal: AbortSignal.timeout(1500) });
          if (r.ok) { ui.ok('  대시보드 시작됨'); dashAlive = true; break; }
        } catch {}
      }
      if (!dashAlive) ui.warn('  대시보드 10초 안에 안 뜸 — 계속 진행');
    }
  }
}

// ─── 2. 오늘 작업 list ────────────────────────────────────
function collectWork() {
  ui.step(2, 4, '오늘 작업 list 추출');
  const campDir = resolve(ROOT, 'posts/campaigns');
  if (!existsSync(campDir)) {
    ui.warn('  posts/campaigns/ 없음 — 새 캠페인 만들고 다시 실행');
    return [];
  }
  const work = [];
  for (const slug of readdirSync(campDir).sort().reverse()) {  // 최신부터
    if (slugFilter && slug !== slugFilter) continue;
    const briefPath = resolve(campDir, slug, 'brief.yaml');
    if (!existsSync(briefPath)) continue;
    let brief;
    try { brief = YAML.parse(readFileSync(briefPath, 'utf8')) || {}; }
    catch (e) { ui.warn(`  ${slug}/brief.yaml 파싱 실패: ${e.message}`); continue; }
    const status = brief.status || {};
    for (const [ch, st] of Object.entries(status)) {
      if (channelFilter && ch !== channelFilter) continue;
      // pending / approved / failed 인 채널 작업 대상
      if (['pending', 'approved', 'failed'].includes(st)) {
        work.push({ slug, channel: ch, status: st, topic: brief.topic || slug });
        if (work.length >= maxChannels) break;
      }
    }
    if (work.length >= maxChannels) break;
  }
  if (work.length === 0) {
    ui.info('  오늘 작업 없음 — 모든 캠페인이 published 또는 brief.status 미설정');
  } else {
    ui.ok(`  ${work.length}건 작업 (max=${maxChannels})`);
    for (const w of work) ui.dim(`    · ${w.slug}/${w.channel} [${w.status}]`);
  }
  return work;
}

// ─── 3. 각 캠페인-채널 처리 ───────────────────────────────
async function processWorkItem(item, idx, total) {
  const tag = `[${idx + 1}/${total}] ${item.slug}/${item.channel}`;
  ui.info(`\n━━━ ${tag} ━━━`);

  const channelDir = resolve(ROOT, 'posts/campaigns', item.slug, item.channel);

  // 3-1. draft yaml 있는지
  const hasDraft = existsSync(channelDir) &&
    readdirSync(channelDir).some((f) => /^\d{8}-\d{6}\.yaml$/.test(f));

  if (!hasDraft && !skipGenerate) {
    ui.step(3, 4, `${tag} draft 없음 — generate + finalize`);
    if (dryRun) {
      ui.dim('  --dry-run — generate skip');
    } else {
      // generate.mjs <slug> --channel=<ch>
      const r = spawnSync(NODE, [
        resolve(ROOT, 'harness/bin/generate.mjs'),
        item.slug, `--channel=${item.channel}`,
      ], { cwd: ROOT, stdio: 'inherit' });
      if (r.status !== 0) {
        ui.err(`  generate 실패 — ${tag} SKIP`);
        return { ...item, result: 'generate-failed' };
      }
      // generate-finalize 가 자동으로 진행되는지 확인 (현재 구조)
      // 만약 별도라면: generate-finalize.mjs <slug> --channel=<ch>
      const finalPath = resolve(ROOT, 'harness/bin/generate-finalize.mjs');
      if (existsSync(finalPath)) {
        const r2 = spawnSync(NODE, [finalPath, item.slug, `--channel=${item.channel}`], {
          cwd: ROOT, stdio: 'inherit',
        });
        if (r2.status !== 0) ui.warn(`  finalize 실패 — 계속 진행`);
      }
    }
  } else if (hasDraft) {
    ui.dim(`  ${tag} draft 이미 있음 — generate skip`);
  } else if (skipGenerate) {
    ui.warn(`  ${tag} draft 없는데 --skip-generate — SKIP`);
    return { ...item, result: 'no-draft' };
  }

  // 3-2. brand-guardian 검수 결과 — draft.yaml 의 guardian.severity 확인
  const draftYaml = readdirSync(channelDir)
    .filter((f) => /^\d{8}-\d{6}\.yaml$/.test(f))
    .sort()
    .reverse()[0];
  if (!draftYaml) {
    ui.warn(`  ${tag} draft 못 찾음 — SKIP`);
    return { ...item, result: 'no-draft' };
  }
  try {
    const draft = YAML.parse(readFileSync(resolve(channelDir, draftYaml), 'utf8')) || {};
    const severity = draft.guardian?.severity;
    if (severity === 'block') {
      const blocks = draft.guardian?.findings?.filter((f) => f.severity === 'block') || [];
      ui.err(`  ${tag} guardian block (${blocks.length}건):`);
      for (const b of blocks.slice(0, 3)) ui.dim(`    · [${b.code}] ${b.detail || ''}`);
      ui.warn(`  ${tag} SKIP — 카피 수정 후 재실행 필요`);
      return { ...item, result: 'guardian-block', findings: blocks };
    }
    if (severity === 'warn') {
      const warns = draft.guardian?.findings?.filter((f) => f.severity === 'warn') || [];
      ui.warn(`  ${tag} guardian warn ${warns.length}건 — 계속 진행 (block 아님)`);
    }
  } catch (e) {
    ui.warn(`  ${tag} draft 파싱 실패: ${e.message}`);
  }

  // 3-3. browser-publish --pre-publish
  ui.step(4, 4, `${tag} browser-publish --pre-publish`);
  if (dryRun) {
    ui.dim('  --dry-run — Chrome 모달 안 엶 (시뮬레이션만)');
    return { ...item, result: 'simulated' };
  }
  const args = [
    resolve(ROOT, 'harness/bin/browser-publish.mjs'),
    item.slug, `--channel=${item.channel}`,
    '--attach', '--pre-publish',
  ];
  const r = spawnSync(NODE, args, { cwd: ROOT, stdio: 'inherit', timeout: 180_000 });
  if (r.status !== 0) {
    ui.err(`  ${tag} browser-publish 실패`);
    return { ...item, result: 'browser-publish-failed' };
  }
  ui.ok(`  ${tag} pre-publish 완료 — Chrome 탭에서 [공유] 클릭`);
  return { ...item, result: 'pre-published' };
}

// ─── 4. 대시보드 알림 ─────────────────────────────────────
async function notifyDashboard(results) {
  const ready = results.filter((r) => r.result === 'pre-published');
  const blocked = results.filter((r) => r.result === 'guardian-block');
  const failed = results.filter((r) => !['pre-published', 'simulated'].includes(r.result));

  ui.info('\n━━━ 🌅 Morning routine 완료 ━━━');
  ui.ok(`  발행 대기 ${ready.length}개 (Chrome 탭 확인)`);
  if (blocked.length) ui.warn(`  guardian block ${blocked.length}개 (카피 수정 필요)`);
  if (failed.length - blocked.length > 0) ui.err(`  실패 ${failed.length - blocked.length}개`);
  for (const r of ready) ui.dim(`    ✓ ${r.slug}/${r.channel}`);
  for (const r of blocked) ui.dim(`    ✗ ${r.slug}/${r.channel} (block)`);
  for (const r of failed.filter((f) => f.result !== 'guardian-block')) {
    ui.dim(`    ! ${r.slug}/${r.channel} (${r.result})`);
  }

  // 대시보드에 알림 (선택 — dashboard.mjs 가 notification endpoint 가지면 POST)
  // 현재는 client polling 의 _publishTasks 로 자동 노출됨. 별도 호출 X.
}

// ─── main ─────────────────────────────────────────────────
try {
  ui.info('🌅 Morning routine 시작' + (dryRun ? ' (--dry-run)' : ''));
  if (slugFilter) ui.dim(`  slug=${slugFilter}`);
  if (channelFilter) ui.dim(`  channel=${channelFilter}`);

  await ensureEnvironment();
  const work = collectWork();
  if (!work.length) {
    ui.info('처리할 작업 없음. 종료.');
    process.exit(0);
  }

  const results = [];
  for (let i = 0; i < work.length; i++) {
    const r = await processWorkItem(work[i], i, work.length);
    results.push(r);
  }
  await notifyDashboard(results);
  ui.ok('\n사용자 검토 → 각 Chrome 탭에서 [공유] 클릭하시면 됩니다.');
} catch (e) {
  ui.err(`morning-routine 실패: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
}
