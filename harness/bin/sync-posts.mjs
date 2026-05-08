#!/usr/bin/env node
// Sync per-channel symlinks: posts/by-channel/<채널>/<슬롯-topic-슬러그>/<캠페인-slug> → ../../../campaigns/<slug>/<ch>.
// 슬롯과 매칭 안 된 캠페인은 by-channel/<채널>/_ungrouped/<슬러그> 로 들어감.
//
// 매칭 우선순위:
//   1) brief.slotTopic 명시값
//   2) brief.topic ↔ slot.topic 정규화 일치 (legacy)
//   3) _ungrouped
//
// Usage:
//   node harness/bin/sync-posts.mjs            # 한 번 동기화
//   node harness/bin/sync-posts.mjs --prune    # dangling symlink + 빈 슬롯 폴더 정리

import {
  existsSync, mkdirSync, readdirSync, statSync, symlinkSync,
  unlinkSync, lstatSync, readlinkSync, rmdirSync,
} from 'node:fs';
import { resolve, relative } from 'node:path';
import { PATHS, readYaml, slugify, ui } from './_lib.mjs';

const UNGROUPED = '_ungrouped';
const SKIP_DIRS = new Set(['assets', 'drafts']);

const argv = process.argv.slice(2);
const prune = argv.includes('--prune');

mkdirSync(PATHS.campaignsDir, { recursive: true });
mkdirSync(PATHS.postsByChannelDir, { recursive: true });

// 1) 슬롯 topic 정규화 → slug 맵
const slotIndex = loadSlotIndex();

// 2) 캠페인 순회 — 캠페인별 그룹 폴더(slot-slug 또는 _ungrouped) 결정
const campaigns = readdirSync(PATHS.campaignsDir)
  .map((n) => ({ slug: n, dir: resolve(PATHS.campaignsDir, n) }))
  .filter((c) => safeIsDir(c.dir));

// 3) 다시 빌드하기 전에 모든 기존 symlink 제거 (멱등 + 그룹 이동 자동 반영)
//    슬롯 추가/삭제·brief.slotTopic 변경 시 캠페인이 정확히 한 곳에만 존재하도록 보장.
let wiped = 0;
for (const ch of safeReaddir(PATHS.postsByChannelDir)) {
  const chDir = resolve(PATHS.postsByChannelDir, ch);
  if (!safeIsDir(chDir)) continue;
  for (const a of safeReaddir(chDir)) {
    const aPath = resolve(chDir, a);
    if (isSymlink(aPath)) { try { unlinkSync(aPath); wiped++; } catch (e) { ui.warn(`symlink 삭제 실패 [${ch}/${a}]: ${e.message}`); } continue; }
    if (!safeIsDir(aPath)) continue;
    for (const b of safeReaddir(aPath)) {
      const bPath = resolve(aPath, b);
      if (isSymlink(bPath)) { try { unlinkSync(bPath); wiped++; } catch (e) { ui.warn(`symlink 삭제 실패 [${ch}/${a}/${b}]: ${e.message}`); } }
    }
  }
}

let added = 0;
for (const { slug, dir } of campaigns) {
  const brief = safeReadBrief(dir);
  const groupSlug = resolveGroup(brief, slotIndex);

  for (const entry of safeReaddir(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const chDir = resolve(dir, entry);
    if (!safeIsDir(chDir)) continue;

    const groupDir = resolve(PATHS.postsByChannelDir, entry, groupSlug);
    mkdirSync(groupDir, { recursive: true });

    const linkPath = resolve(groupDir, slug);
    const relTarget = relative(groupDir, chDir);

    if (existsSync(linkPath) || isSymlink(linkPath)) {
      try {
        const cur = readlinkSync(linkPath);
        if (cur === relTarget) { continue; }
        unlinkSync(linkPath);
      } catch {
        try { unlinkSync(linkPath); } catch {}
      }
    }

    try { symlinkSync(relTarget, linkPath); added++; }
    catch (e) { ui.warn(`symlink 실패 [${entry}/${groupSlug}/${slug}]: ${e.message}`); }
  }
}

// 4) prune — dangling symlink + 빈 슬롯 폴더 + 사라진 슬롯 폴더 정리
let pruned = 0, emptied = 0;
if (prune) {
  const validGroupSlugs = new Set([UNGROUPED, ...slotIndex.values()]);
  for (const ch of safeReaddir(PATHS.postsByChannelDir)) {
    const chDir = resolve(PATHS.postsByChannelDir, ch);
    if (!safeIsDir(chDir)) continue;
    for (const group of safeReaddir(chDir)) {
      const groupDir = resolve(chDir, group);
      if (!safeIsDir(groupDir)) continue;
      // 사라진 슬롯 폴더면 안의 모든 symlink 정리하고 폴더 자체 삭제 시도
      if (!validGroupSlugs.has(group)) {
        for (const n of safeReaddir(groupDir)) {
          const p = resolve(groupDir, n);
          if (isSymlink(p)) { try { unlinkSync(p); pruned++; } catch {} }
        }
        try { rmdirSync(groupDir); emptied++; } catch {}
        continue;
      }
      // 유효 슬롯 폴더: dangling symlink 제거 + 비었으면 폴더 삭제
      for (const n of safeReaddir(groupDir)) {
        const link = resolve(groupDir, n);
        if (!isSymlink(link)) continue;
        try {
          const target = readlinkSync(link);
          if (!existsSync(resolve(groupDir, target))) { unlinkSync(link); pruned++; }
        } catch {}
      }
      if (safeReaddir(groupDir).length === 0) {
        try { rmdirSync(groupDir); emptied++; } catch {}
      }
    }
  }
}

const parts = [`linked=${added}`];
if (wiped) parts.push(`rebuilt=${wiped}`);
if (prune) parts.push(`emptied=${emptied}`);
ui.ok(`posts/by-channel sync — ${parts.join(' ')}`);

// ───── helpers ─────

function loadSlotIndex() {
  // topic 정규화 키 → topic-slug
  const map = new Map();
  const slotsPath = resolve(PATHS.campaignsDir, '..', 'slots.yaml');
  if (!existsSync(slotsPath)) return map;
  let data;
  try { data = readYaml(slotsPath); } catch { return map; }
  const slots = Array.isArray(data?.slots) ? data.slots : [];
  for (const s of slots) {
    if (!s?.topic) continue;
    const key = normaliseTopic(s.topic);
    const slug = slugify(s.topic);
    if (!key || !slug) continue;
    map.set(key, slug);
  }
  return map;
}

function resolveGroup(brief, slotIndex) {
  // ① brief.slotTopic — 현재 살아있는 슬롯과 매칭될 때만 그 슬롯 폴더로
  if (brief?.slotTopic) {
    const matched = slotIndex.get(normaliseTopic(brief.slotTopic));
    if (matched) return matched;
  }
  // ② brief.topic ↔ slot.topic 정규화 매칭 (legacy/소급)
  if (brief?.topic) {
    const matched = slotIndex.get(normaliseTopic(brief.topic));
    if (matched) return matched;
  }
  // ③ 슬롯이 없거나 삭제됨 → _ungrouped (브리프의 slotTopic 메타는 보존)
  return UNGROUPED;
}

function safeReadBrief(campaignDir) {
  const p = resolve(campaignDir, 'brief.yaml');
  if (!existsSync(p)) return null;
  try { return readYaml(p); } catch { return null; }
}

function normaliseTopic(s) { return (s ?? '').toString().trim().toLowerCase(); }
function safeIsDir(p) { try { return statSync(p).isDirectory(); } catch { return false; } }
function isSymlink(p) { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } }
function safeReaddir(p) { try { return readdirSync(p); } catch { return []; } }
