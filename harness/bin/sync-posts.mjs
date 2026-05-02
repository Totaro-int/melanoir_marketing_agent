#!/usr/bin/env node
// Sync per-channel symlinks under posts/by-channel/<ch>/<slug> → ../../campaigns/<slug>/<ch>.
// 사람이 채널별로 결과물을 한눈에 보고 싶을 때 쓰는 뷰. 캠페인이 추가/삭제되면 자동 갱신.
//
// Usage:
//   node harness/bin/sync-posts.mjs            # 한 번 동기화
//   node harness/bin/sync-posts.mjs --prune    # 사라진 캠페인의 dangling symlink 도 정리

import { existsSync, mkdirSync, readdirSync, statSync, symlinkSync, unlinkSync, lstatSync, readlinkSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { PATHS, ui } from './_lib.mjs';

const argv = process.argv.slice(2);
const prune = argv.includes('--prune');

mkdirSync(PATHS.campaignsDir, { recursive: true });
mkdirSync(PATHS.postsByChannelDir, { recursive: true });

const campaigns = readdirSync(PATHS.campaignsDir)
  .map((n) => ({ slug: n, dir: resolve(PATHS.campaignsDir, n) }))
  .filter((c) => safeIsDir(c.dir));

let added = 0, kept = 0;
for (const { slug, dir } of campaigns) {
  for (const ch of readdirSync(dir)) {
    const chDir = resolve(dir, ch);
    if (!safeIsDir(chDir)) continue;
    if (ch === 'assets' || ch === 'drafts') continue; // 캠페인 공통 폴더 제외
    const targetParent = resolve(PATHS.postsByChannelDir, ch);
    mkdirSync(targetParent, { recursive: true });
    const linkPath = resolve(targetParent, slug);
    const relTarget = relative(targetParent, chDir);
    if (existsSync(linkPath) || isSymlink(linkPath)) {
      // 이미 있는 경우: 대상이 같으면 skip, 다르면 다시 만들기.
      try {
        const cur = readlinkSync(linkPath);
        if (cur === relTarget) { kept++; continue; }
        unlinkSync(linkPath);
      } catch { try { unlinkSync(linkPath); } catch {} }
    }
    try { symlinkSync(relTarget, linkPath); added++; }
    catch (e) { ui.warn(`symlink 실패 [${ch}/${slug}]: ${e.message}`); }
  }
}

let pruned = 0;
if (prune && existsSync(PATHS.postsByChannelDir)) {
  for (const ch of readdirSync(PATHS.postsByChannelDir)) {
    const chDir = resolve(PATHS.postsByChannelDir, ch);
    if (!safeIsDir(chDir)) continue;
    for (const name of readdirSync(chDir)) {
      const link = resolve(chDir, name);
      if (!isSymlink(link)) continue;
      try {
        const target = readlinkSync(link);
        const abs = resolve(chDir, target);
        if (!existsSync(abs)) { unlinkSync(link); pruned++; }
      } catch {}
    }
  }
}

ui.ok(`posts/by-channel sync — added=${added} kept=${kept}${prune ? ` pruned=${pruned}` : ''}`);

function safeIsDir(p) { try { return statSync(p).isDirectory(); } catch { return false; } }
function isSymlink(p) { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } }
