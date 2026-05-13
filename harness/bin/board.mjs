#!/usr/bin/env node
// Kanban-style status board for marketing campaigns.
//   node bin/board.mjs                    # all active campaigns (most recent first)
//   node bin/board.mjs <slug>             # one campaign
//   node bin/board.mjs --watch            # redraw on filesystem change (Ctrl-C to exit)
//   node bin/board.mjs <slug> --watch
//
// Zero deps beyond picocolors. Ink/React was deliberately skipped — revisit if we add
// inputs (approve/reject inline) to the board.

import { readdirSync, readFileSync, existsSync, statSync, watch } from 'node:fs';
import { resolve } from 'node:path';
import pc from 'picocolors';
import YAML from 'yaml';
import { PATHS, readYaml, ui, checkForUpdates, SPINNER_FRAMES as TICK_FRAMES } from './_lib.mjs';

function readJsonOrYaml(path) {
  if (!existsSync(path)) return null;
  try {
    const txt = readFileSync(path, 'utf8').trim();
    if (!txt) return null;
    if (txt.startsWith('{') || txt.startsWith('[')) {
      try { return JSON.parse(txt); } catch { /* fall through */ }
    }
    return YAML.parse(txt);
  } catch { return null; }
}
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

// ---------- animation state ----------

let prevRawLines  = [];
let prevStatuses  = {};   // "slug::ch" → status string
let changedKeys   = new Set();
let tickFrame     = 0;
let tickTimerId   = null;
let footerLineIdx = -1;   // row index of the watch footer line (0-based)

if (watchMode) startWatch();
else { render(); process.exit(0); }

function startWatch() {
  hideCursor();
  process.on('SIGINT', () => { if (tickTimerId) { clearInterval(tickTimerId); tickTimerId = null; } showCursor(); process.exit(0); });
  process.on('exit', showCursor);

  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; render(); }, 120);
  };

  render();

  // Heartbeat tick — animates the footer spinner independently of data changes
  tickTimerId = setInterval(() => {
    tickFrame = (tickFrame + 1) % TICK_FRAMES.length;
    if (footerLineIdx >= 0) {
      const tick = pc.dim(TICK_FRAMES[tickFrame]);
      const watchLabel = pc.dim(`watching  ·  Ctrl-C to exit  `) + tick;
      process.stdout.write(`\x1b[${footerLineIdx + 1};1H\x1b[2K${watchLabel}`);
    }
  }, 100);

  try {
    watch(PATHS.campaignsDir, { recursive: true }, schedule);
  } catch {
    setInterval(schedule, 1000);
  }
}

// ---------- render ----------

function render() {
  footerLineIdx = -1;
  const campaigns = listCampaigns();

  // Detect status changes since last render
  const nextStatuses = {};
  changedKeys = new Set();
  for (const c of campaigns) {
    for (const ch of c.brief.channels ?? []) {
      const key = `${c.slug}::${ch}`;
      const status = c.brief.status?.[ch] ?? 'unknown';
      nextStatuses[key] = status;
      if (prevStatuses[key] !== undefined && prevStatuses[key] !== status) {
        changedKeys.add(key);
      }
    }
  }
  prevStatuses = nextStatuses;

  const rawLines = buildLines(campaigns);

  if (watchMode && prevRawLines.length > 0) {
    diffRender(prevRawLines, rawLines);
  } else {
    if (watchMode) process.stdout.write('\x1b[2J\x1b[H');
    for (const line of rawLines) process.stdout.write(line + '\n');
  }
  prevRawLines = rawLines;
}

function buildLines(campaigns) {
  const lines = [];
  const emit = (s = '') => lines.push(s);

  if (slug) {
    const one = campaigns.find((c) => c.slug === slug);
    if (!one) { emit(pc.red(`캠페인 없음: ${slug}`)); return lines; }
    drawCampaign(one, emit);
    return lines;
  }
  if (!campaigns.length) {
    emit(pc.dim('(아직 캠페인이 없습니다 — /sns-campaign-new "<주제>")'));
    return lines;
  }
  emit(pc.bold(pc.cyan('📣 marketing_agent — campaign board')) + pc.dim(`  (${campaigns.length})`));
  const recentSlugs = campaigns.slice(0, 5).map((c) => c.slug);
  emit(pc.dim('recent: ') + recentSlugs.join(pc.dim(' · ')));
  emit();
  for (const c of campaigns.slice(0, 5)) drawCampaign(c, emit);

  if (watchMode) {
    footerLineIdx = lines.length;
    const tick = pc.dim(TICK_FRAMES[tickFrame]);
    emit(pc.dim(`watching  ·  Ctrl-C to exit  `) + tick);
  }
  return lines;
}

function drawCampaign(c, emit) {
  const totals = countByStatus(c.brief.status);
  const header = ` 📣 ${c.slug} ` + pc.dim(`· ${c.brief.topic}`);
  const sub = pc.dim(`    goal: ${c.brief.goal}  ·  cadence: ${c.brief.cadence}  ·  ${summary(totals)}`);
  emit(border('top', W));
  emit(`│${pad(header, W - 2)}│`);
  emit(`│${pad(sub,    W - 2)}│`);
  emit(border('mid', W));
  for (const ch of c.brief.channels) {
    const status  = c.brief.status?.[ch] ?? 'unknown';
    const result  = c.results?.[ch];
    const sched   = c.brief.schedule?.[ch];
    const reason  = c.brief.attentionReason?.[ch];
    const key     = `${c.slug}::${ch}`;
    const changed = changedKeys.has(key);
    const tail =
        result?.url   ? pc.dim(' ' + truncate(result.url, 40))
      : reason        ? pc.red(' ' + truncate(reason, 40))
      : result?.error ? pc.red(' ' + truncate(result.error, 40))
      : sched         ? pc.magenta(' @ ' + sched.slice(5, 16).replace('T', ' '))
      : '';
    const statusLabel = changed
      ? pc.bold(pc.white('⚡ ' + status.padEnd(14)))
      : color(status)(status.padEnd(16));
    const line = `  ${icon(status)}  ${pc.bold(ch.padEnd(10))}${statusLabel}${tail}`;
    emit(`│${pad(line, W - 2)}│`);
  }
  emit(border('bot', W));
  emit();
}

// ---------- diff renderer ----------

function diffRender(prev, next) {
  // Move cursor to top-left without clearing; update only changed lines
  process.stdout.write('\x1b[H');
  const len = Math.max(prev.length, next.length);
  for (let i = 0; i < len; i++) {
    const p = stripAnsi(prev[i] ?? '');
    const n = stripAnsi(next[i] ?? '');
    if (p !== n) {
      // Position cursor at row i+1, column 1, clear line, write new content
      process.stdout.write(`\x1b[${i + 1};1H\x1b[2K${next[i] ?? ''}`);
    }
  }
  // Clear leftover lines if new content is shorter
  for (let i = next.length; i < prev.length; i++) {
    process.stdout.write(`\x1b[${i + 1};1H\x1b[2K`);
  }
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
      results[ch] = readJsonOrYaml(rPath);
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

function hideCursor() { process.stdout.write('\x1b[?25l'); }
function showCursor() { process.stdout.write('\x1b[?25h'); }
