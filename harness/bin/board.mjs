#!/usr/bin/env node
// Kanban-style status board for marketing campaigns.
//   node bin/board.mjs                    # all active campaigns (most recent first)
//   node bin/board.mjs <slug>             # one campaign
//   node bin/board.mjs --watch            # redraw on filesystem change (Ctrl-C to exit)
//   node bin/board.mjs <slug> --watch
//
// Zero deps beyond picocolors. Ink/React was deliberately skipped — revisit if we add
// inputs (approve/reject inline) to the board.

import { readdirSync, statSync, watch } from 'node:fs';
import { resolve } from 'node:path';
import pc from 'picocolors';
import { PATHS, readYaml, ui, checkForUpdates } from './_lib.mjs';
import { visibleWidth as wcwidth, stripAnsi } from '../src/util/width.mjs';

checkForUpdates();

const W = 78; // box width

const ICONS = {
  drafting: '⏳', preview: '👀', approved: '📤',
  scheduled: '📅', published: '✅', failed: '❌', skipped: '⏭',
  needs_attention: '🔔',
  unknown: '·',
};

const argv = process.argv.slice(2);
const watchMode = argv.includes('--watch');
const slug = argv.find((a) => !a.startsWith('--'));

if (watchMode) startWatch();
else { render(); process.exit(0); }

function startWatch() {
  hideCursor();
  process.on('SIGINT', () => { showCursor(); process.exit(0); });
  process.on('exit', showCursor);

  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; render(); }, 120);
  };

  render();
  try {
    watch(PATHS.campaignsDir, { recursive: true }, schedule);
  } catch {
    // recursive may be unsupported on some platforms — fall back to polling.
    setInterval(schedule, 1000);
  }
}

// ---------- render ----------

function render() {
  clearScreen();
  const campaigns = listCampaigns();
  if (slug) {
    const one = campaigns.find((c) => c.slug === slug);
    if (!one) { console.error(`캠페인 없음: ${slug}`); return; }
    drawCampaign(one);
    return;
  }
  if (!campaigns.length) {
    console.log(pc.dim('(아직 캠페인이 없습니다 — /sns-campaign-new "<주제>")'));
    return;
  }
  console.log(pc.bold(pc.cyan('📣 marketing_agent — campaign board')) + pc.dim(`  (${campaigns.length})`));
  console.log();
  for (const c of campaigns.slice(0, 5)) drawCampaign(c);
  if (watchMode) console.log(pc.dim(`watching ${PATHS.campaignsDir}  ·  Ctrl-C to exit`));
}

function drawCampaign(c) {
  const totals = countByStatus(c.brief.status);
  const header = ` 📣 ${c.slug} ` + pc.dim(`· ${c.brief.topic}`);
  const sub = pc.dim(`    goal: ${c.brief.goal}  ·  cadence: ${c.brief.cadence}  ·  ${summary(totals)}`);
  console.log(border('top', headerWidth(c)));
  console.log(`│${pad(header, headerWidth(c) - 2)}│`);
  console.log(`│${pad(sub, headerWidth(c) - 2)}│`);
  console.log(border('mid', headerWidth(c)));
  for (const ch of c.brief.channels) {
    const status = c.brief.status?.[ch] ?? 'unknown';
    const result = c.results?.[ch];
    const sched = c.brief.schedule?.[ch];
    const reason = c.brief.attentionReason?.[ch];
    const tail =
        result?.url   ? pc.dim(' ' + truncate(result.url, 40))
      : reason        ? pc.red(' ' + truncate(reason, 40))
      : result?.error ? pc.red(' ' + truncate(result.error, 40))
      : sched         ? pc.magenta(' @ ' + sched.slice(5, 16).replace('T', ' '))
      : '';
    const line = `  ${icon(status)}  ${pc.bold(ch.padEnd(10))}${color(status)(status.padEnd(16))}${tail}`;
    console.log(`│${pad(line, headerWidth(c) - 2)}│`);
  }
  console.log(border('bot', headerWidth(c)));
  console.log();
}

// ---------- helpers ----------

function listCampaigns() {
  let dirs = [];
  try { dirs = readdirSync(PATHS.campaignsDir, { withFileTypes: true }); }
  catch { return []; }
  const items = [];
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const briefPath = resolve(PATHS.campaignsDir, d.name, 'brief.yaml');
    let brief;
    try { brief = readYaml(briefPath); } catch { continue; }
    const results = {};
    for (const ch of brief.channels ?? []) {
      const rPath = resolve(PATHS.campaignsDir, d.name, ch, 'result.json');
      try { results[ch] = readYaml(rPath); } catch {}
    }
    let mtime = 0;
    try { mtime = statSync(briefPath).mtimeMs; } catch {}
    items.push({ slug: d.name, brief, results, mtime });
  }
  items.sort((a, b) => b.mtime - a.mtime);
  return items;
}

function countByStatus(status = {}) {
  const o = { drafting: 0, preview: 0, approved: 0, scheduled: 0, published: 0, failed: 0, needs_attention: 0, skipped: 0 };
  for (const v of Object.values(status)) if (v in o) o[v]++;
  o.total = Object.values(status).length;
  return o;
}

function summary(t) {
  const parts = [];
  if (t.published)       parts.push(pc.green(`✅ ${t.published} published`));
  if (t.approved)        parts.push(pc.cyan(`📤 ${t.approved} approved`));
  if (t.scheduled)       parts.push(pc.magenta(`📅 ${t.scheduled} scheduled`));
  if (t.needs_attention) parts.push(pc.red(`🔔 ${t.needs_attention} needs_attention`));
  if (t.preview)         parts.push(pc.yellow(`👀 ${t.preview} preview`));
  if (t.drafting)        parts.push(pc.dim(`⏳ ${t.drafting} drafting`));
  if (t.failed)          parts.push(pc.red(`❌ ${t.failed} failed`));
  return parts.length ? parts.join(' · ') : pc.dim('no channels');
}

function icon(s) { return ICONS[s] ?? ICONS.unknown; }
function color(s) {
  return s === 'published'        ? pc.green
       : s === 'failed'           ? pc.red
       : s === 'needs_attention'  ? pc.red
       : s === 'approved'         ? pc.cyan
       : s === 'scheduled'        ? pc.magenta
       : s === 'preview'          ? pc.yellow
       : s === 'drafting'         ? pc.dim
       : (x) => x;
}

function headerWidth() { return W; }

function border(kind, w) {
  const ch = { top: ['┌', '┐'], mid: ['├', '┤'], bot: ['└', '┘'] }[kind];
  return pc.dim(ch[0] + '─'.repeat(w - 2) + ch[1]);
}

function pad(s, w) {
  // Pad based on visible width (strip ANSI), so colored text aligns inside boxes.
  const visible = stripAnsi(s);
  const cellLen = wcwidth(visible);
  if (cellLen >= w) return truncateWide(s, w);
  return s + ' '.repeat(w - cellLen);
}

function truncate(s, n) {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

function truncateWide(s, w) {
  // Naive: just trim characters until visible width fits. Good enough for now.
  let out = s;
  while (wcwidth(stripAnsi(out)) > w) out = out.slice(0, -1);
  return out;
}

function clearScreen() { if (watchMode) process.stdout.write('\x1b[2J\x1b[H'); }
function hideCursor() { process.stdout.write('\x1b[?25l'); }
function showCursor() { process.stdout.write('\x1b[?25h'); }
