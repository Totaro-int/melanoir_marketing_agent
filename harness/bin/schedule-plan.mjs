#!/usr/bin/env node
// Plan N campaigns over a period, each with a `schedule[ch]` time and (default) autoPublish=true.
//
// Usage:
//   node bin/schedule-plan.mjs --topic "<seed topic>" \
//                              --channels=threads,linkedin \
//                              --period=week|month \
//                              --frequency=N        # 기간 내 게시 횟수
//                              [--start=YYYY-MM-DD] # 기본: 오늘
//                              [--time=09:00]       # KST 발행 시각
//                              [--cadence=single]   # 채널별 카드 수
//                              [--no-auto-publish]  # 알림만, 수동 발행
//                              [--no-generate]      # brief만 만들고 generate 스킵 (사람이 나중에)
//                              [--titles="t1|t2|t3"] # 매 회 다른 주제 (없으면 seed 반복)
//
// 결과: campaigns/<date>-<slug>/ 폴더가 N개 생성됨.
// publishAt 도달 시 bin/queue-tick.mjs 가 자동 발행 시도 (autoPublish=true 인 경우).

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { PATHS, nowKstIso, ui } from './_lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const flags = parseFlags(process.argv.slice(2));

if (!flags.topic || !flags.channels || !flags.period || !flags.frequency) {
  ui.err('사용법: schedule-plan.mjs --topic "<주제>" --channels=threads --period=week|month --frequency=N [--titles="t1|t2|..."] [--start=YYYY-MM-DD] [--time=09:00] [--cadence=single] [--no-auto-publish] [--no-generate]');
  process.exit(2);
}

if (!existsSync(PATHS.profile)) {
  ui.err('company-profile.yaml 없음 — 먼저 /sns-onboard');
  process.exit(2);
}

const channels = String(flags.channels).split(',').map((s) => s.trim()).filter(Boolean);
const period = flags.period === 'month' ? 30 : 7; // days
const freq = Math.max(1, parseInt(flags.frequency, 10) || 1);
const cadence = flags.cadence ?? 'single';
const goal = flags.goal ?? 'awareness';
const autoPublish = !flags['no-auto-publish'];
const skipGenerate = flags['no-generate'];

// Distribute N posts evenly across `period` days starting at `start` at `time` KST.
const start = flags.start ? new Date(flags.start + 'T00:00:00+09:00') : new Date();
const [hh, mm] = (flags.time ?? '09:00').split(':').map((n) => parseInt(n, 10));
const stepDays = period / freq;

const titles = flags.titles
  ? String(flags.titles).split('|').map((s) => s.trim()).filter(Boolean)
  : [];

const planned = [];
for (let i = 0; i < freq; i++) {
  const offsetMs = Math.round(i * stepDays * 24 * 60 * 60 * 1000);
  const at = new Date(start.getTime() + offsetMs);
  // pin to KST hh:mm
  const kst = new Date(at.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCHours(hh, mm, 0, 0);
  const publishAt = kst.toISOString().replace('Z', '+09:00');

  const itemTopic = titles[i] ?? `${flags.topic} #${i + 1}`;

  // 1) campaign-new (slug은 campaign-new가 결정 — 오늘 날짜 기준)
  const created = spawnSync(process.execPath, [
    resolve(here, 'campaign-new.mjs'),
    itemTopic,
    `--channels=${channels.join(',')}`,
    `--goal=${goal}`,
    `--cadence=${cadence}`,
  ], { encoding: 'utf8' });
  if (created.status !== 0) {
    process.stderr.write(created.stderr ?? '');
    ui.err(`[${i + 1}/${freq}] 생성 실패: ${itemTopic}`);
    continue;
  }
  const m = created.stdout.match(/캠페인 생성:\s*(\S+)/);
  if (!m) { ui.warn(`[${i + 1}/${freq}] slug 파싱 실패 — 스킵`); continue; }
  const slug = m[1];
  const dir = resolve(PATHS.campaignsDir, slug);

  // 2) brief.yaml에 schedule + autoPublish 추가
  const briefPath = resolve(dir, 'brief.yaml');
  const brief = YAML.parse(readFileSync(briefPath, 'utf8'));
  brief.schedule = Object.fromEntries(channels.map((c) => [c, publishAt]));
  brief.autoPublish = autoPublish;
  brief.status = Object.fromEntries(channels.map((c) => [c, 'scheduled']));
  brief.meta = { ...(brief.meta ?? {}), updatedAt: nowKstIso() };
  writeFileSync(briefPath, YAML.stringify(brief, { lineWidth: 100 }), 'utf8');

  planned.push({ slug, publishAt, topic: itemTopic });
  ui.ok(`[${i + 1}/${freq}] 예약됨: ${slug}  → ${publishAt}`);
}

if (!planned.length) {
  ui.warn('예약된 항목 없음.');
  process.exit(0);
}

// 3) optional pre-generate (사람이 미리 검토할 수 있게 draft 만들어둠)
//    generate.mjs 가 status를 preview로 덮어쓰므로, 이후 다시 scheduled로 복원.
if (!skipGenerate) {
  ui.info(`pre-generate 시작 (${planned.length}건 × ${channels.length}채널)...`);
  for (const { slug } of planned) {
    for (const ch of channels) {
      const r = spawnSync(process.execPath, [
        resolve(here, 'generate.mjs'), slug, `--channel=${ch}`,
      ], { encoding: 'utf8' });
      if (r.status !== 0) ui.warn(`[${slug}/${ch}] generate 실패 — 나중에 수동`);
    }
    // 복원: status=scheduled (queue-tick 이 이걸 보고 자동 승인+발행)
    const bp = resolve(PATHS.campaignsDir, slug, 'brief.yaml');
    const b = YAML.parse(readFileSync(bp, 'utf8'));
    b.status = Object.fromEntries(channels.map((c) => [c, 'scheduled']));
    b.meta = { ...(b.meta ?? {}), updatedAt: nowKstIso() };
    writeFileSync(bp, YAML.stringify(b, { lineWidth: 100 }), 'utf8');
  }
  ui.ok('pre-generate 완료. 각 캠페인은 status=scheduled 이지만 draft가 준비됨.');
  ui.dim('  → /sns-preview <slug> 로 확인 (수정하고 싶으면 /sns-reject + /sns-generate)');
  ui.dim('  → publishAt 도달 시 워커가 자동 승인+발행 (가드 통과시).');
} else {
  ui.info('--no-generate 지정됨. 각 캠페인 draft는 /sns-generate 로 직접 만드세요.');
}

console.log();
ui.ok(`스케줄 ${planned.length}건 생성 완료. autoPublish=${autoPublish}`);
ui.dim('워커 한 번 돌리기:   node bin/queue-tick.mjs --dry-run');
ui.dim('자동 실행 설치:     node bin/install-cron.mjs install');

function parseFlags(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > -1) out[a.slice(2, eq)] = a.slice(eq + 1);
    else {
      const next = args[i + 1];
      if (next && !next.startsWith('--')) { out[a.slice(2)] = next; i++; }
      else out[a.slice(2)] = true;
    }
  }
  return out;
}
