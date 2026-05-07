#!/usr/bin/env node
// Worker: scan all campaigns, publish anything where:
//   - brief.schedule[ch] <= now
//   - brief.status[ch] in {scheduled, approved}
//   - brief.autoPublish === true (false면 알림만)
//
// 자동 발행 실패 → status=needs_attention + attentionReason[ch]=<reason>.
// 사람이 /sns-preview 확인 후 /sns-approve & /sns-publish 수동.
//
// Usage:
//   node bin/queue-tick.mjs              # 실제 처리
//   node bin/queue-tick.mjs --dry-run    # 무엇이 발행될지 시뮬레이션
//   node bin/queue-tick.mjs --json       # JSON 결과 (cron 로깅용)

import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { PATHS, nowKstIso, ui, checkForUpdates } from './_lib.mjs';

checkForUpdates();

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const jsonOut = argv.includes('--json');

const log = (...args) => { if (!jsonOut) console.log(...args); };

if (!existsSync(PATHS.campaignsDir)) {
  out({ ok: true, message: 'campaigns/ 없음', processed: [] });
  process.exit(0);
}

const now = new Date();
const results = [];

const slugs = readdirSync(PATHS.campaignsDir)
  .filter((n) => statSync(resolve(PATHS.campaignsDir, n)).isDirectory());

for (const slug of slugs) {
  const briefPath = resolve(PATHS.campaignsDir, slug, 'brief.yaml');
  if (!existsSync(briefPath)) continue;

  let brief;
  try { brief = YAML.parse(readFileSync(briefPath, 'utf8')); }
  catch (e) { results.push({ slug, error: `brief 파싱 실패: ${e.message}` }); continue; }

  if (!brief.schedule) continue;
  const channels = brief.channels ?? [];
  let mutated = false;

  for (const ch of channels) {
    const at = brief.schedule?.[ch];
    if (!at) continue;
    if (new Date(at) > now) continue; // not yet

    const status = brief.status?.[ch];
    if (status === 'published' || status === 'needs_attention' || status === 'failed') continue;
    if (status !== 'scheduled' && status !== 'approved') continue;

    const auto = brief.autoPublish !== false; // default true

    if (!auto) {
      results.push({ slug, channel: ch, action: 'notify-only', dueAt: at, currentStatus: status });
      log(`🔔 ${slug} [${ch}] due — 자동발행 꺼짐, /sns-publish 수동`);
      continue;
    }

    // 가이드라인 재검수 — 사용자가 슬롯/브리프에 정의한 가이드라인 대비 draft 정합성.
    // deterministic 만 실행 (LLM 의미론 검증은 사람이 /sns-edit 에서 명시적 트리거).
    // 실패 시 자동 발행 차단 → needs_attention.
    if (status === 'scheduled' || status === 'approved') {
      if (dryRun) {
        results.push({ slug, channel: ch, action: 'would-inspect-guidelines', dueAt: at });
      } else {
        const ig = spawnSync(process.execPath, [
          resolve(here, 'inspect-guidelines.mjs'), slug, `--channel=${ch}`, '--json',
        ], { encoding: 'utf8', env: { ...process.env, MARKETING_AGENT_SKIP_UPDATE_CHECK: '1' } });
        let report = null;
        try { report = JSON.parse(ig.stdout || '{}'); } catch {}
        if (!report || report.ok !== true) {
          const codes = (report?.blocking ?? []).join(', ') || (report?.error ?? 'inspect 실패');
          // brief가 inspect-guidelines 실행으로 갱신됐을 수 있어 reload.
          try { brief = YAML.parse(readFileSync(briefPath, 'utf8')); } catch {}
          markAttention(brief, ch, `가이드라인 미준수: ${codes}`);
          mutated = true;
          results.push({ slug, channel: ch, action: 'attention', reason: `guidelines: ${codes}` });
          log(`⚠️  ${slug} [${ch}] 가이드라인 미준수 → needs_attention (${codes})`);
          continue;
        }
        // 통과 — brief 가 inspect 로 갱신됐으므로 reload (다음 채널 처리 위해).
        try { brief = YAML.parse(readFileSync(briefPath, 'utf8')); } catch {}
      }
    }

    // auto-publish path: status가 scheduled면 먼저 approved로 올려야 publish가 받음.
    // 단, 가드 통과 여부는 approve.mjs 가 검사. 실패하면 needs_attention.
    if (status === 'scheduled') {
      if (dryRun) {
        results.push({ slug, channel: ch, action: 'would-approve+publish', dueAt: at });
        log(`🟡 dry: ${slug} [${ch}] → approve + publish`);
        continue;
      }
      const ar = spawnSync(process.execPath, [
        resolve(here, 'approve.mjs'), slug, `--channel=${ch}`,
      ], { encoding: 'utf8', env: { ...process.env, MARKETING_AGENT_SKIP_UPDATE_CHECK: '1' } });
      if (ar.status !== 0) {
        const reason = (ar.stderr || ar.stdout || 'approve 실패').trim().split('\n').pop();
        markAttention(brief, ch, `자동 승인 실패: ${reason}`);
        mutated = true;
        results.push({ slug, channel: ch, action: 'attention', reason });
        log(`⚠️  ${slug} [${ch}] 자동 승인 실패 → needs_attention`);
        continue;
      }
      // refresh brief (approve mutated it)
      brief = YAML.parse(readFileSync(briefPath, 'utf8'));
    }

    if (dryRun) {
      results.push({ slug, channel: ch, action: 'would-publish', dueAt: at });
      log(`🟢 dry: ${slug} [${ch}] → publish`);
      continue;
    }

    const pr = spawnSync(process.execPath, [
      resolve(here, 'publish.mjs'), slug, `--channel=${ch}`,
    ], { encoding: 'utf8', env: { ...process.env, MARKETING_AGENT_SKIP_UPDATE_CHECK: '1' } });
    if (pr.status !== 0) {
      const reason = (pr.stderr || pr.stdout || 'publish 실패').trim().split('\n').pop();
      // refresh brief (publish may have set failed)
      try { brief = YAML.parse(readFileSync(briefPath, 'utf8')); } catch {}
      markAttention(brief, ch, `자동 발행 실패: ${reason}`);
      mutated = true;
      results.push({ slug, channel: ch, action: 'attention', reason });
      log(`❌ ${slug} [${ch}] 발행 실패 → needs_attention`);
    } else {
      results.push({ slug, channel: ch, action: 'published', dueAt: at });
      log(`✅ ${slug} [${ch}] 발행 완료`);
      // publish.mjs가 디스크의 brief.yaml을 갱신했으므로 다음 채널 처리 전에 reload.
      // 안 하면 다음 채널의 markAttention 경로에서 stale brief를 write back 해서
      // 방금 published 된 채널 상태를 approved 로 되돌림 → 중복 발행 위험.
      try { brief = YAML.parse(readFileSync(briefPath, 'utf8')); } catch {}
    }
  }

  if (mutated) writeFileSync(briefPath, YAML.stringify(brief, { lineWidth: 100 }), 'utf8');
}

out({ ok: true, ranAt: nowKstIso(), dryRun, processed: results });

function markAttention(brief, ch, reason) {
  brief.status = { ...(brief.status ?? {}), [ch]: 'needs_attention' };
  brief.attentionReason = { ...(brief.attentionReason ?? {}), [ch]: reason };
  brief.meta = { ...(brief.meta ?? {}), updatedAt: nowKstIso() };
}

function out(obj) {
  if (jsonOut) console.log(JSON.stringify(obj, null, 2));
  else {
    const counts = obj.processed.reduce((acc, r) => {
      acc[r.action] = (acc[r.action] ?? 0) + 1; return acc;
    }, {});
    const summary = Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('  ');
    if (!obj.processed.length) ui.dim('처리할 항목 없음.');
    else ui.ok(`tick 완료${dryRun ? ' (dry-run)' : ''}  ${summary}`);
  }
}
