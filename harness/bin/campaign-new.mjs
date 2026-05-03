#!/usr/bin/env node
// Create a new campaign skeleton: campaigns/<date>-<slug>/{brief.yaml, <channel>/}.
// Usage:
//   node bin/campaign-new.mjs "<topic>" [--channels=threads,linkedin] [--goal=awareness] [--cadence=single]

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';
import {
  PATHS, readYaml, slugify, todayKst, nowKstIso, activeChannels, enabledChannels, ui, checkForUpdates,
} from './_lib.mjs';
import { knownChannels } from '../src/publisher/registry.mjs';

checkForUpdates();

const argv = process.argv.slice(2);
if (!argv.length || argv[0].startsWith('--')) {
  ui.err('사용법: campaign-new.mjs "<주제>" [--channels=...] [--goal=...] [--cadence=...]');
  process.exit(2);
}

const topic = argv[0];
const flags = Object.fromEntries(
  argv.slice(1)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v ?? true];
    })
);

// 1) Profile must exist.
if (!existsSync(PATHS.profile)) {
  ui.err('company-profile.yaml 이 없습니다. 먼저 /sns-onboard 를 실행하세요.');
  process.exit(2);
}

let profile;
try {
  profile = readYaml(PATHS.profile);
} catch (e) {
  ui.err(`프로필 로드 실패: ${e.message}`);
  process.exit(2);
}

// 2) Resolve channels.
//    우선순위: --channels 플래그 > profile.channels.enabled > plugin.json activeChannels().
const enabled = enabledChannels(profile);
const channels = (
  flags.channels
    ? String(flags.channels).split(',').map((s) => s.trim()).filter(Boolean)
    : (enabled.length ? enabled : activeChannels())
);
if (!channels.length) {
  ui.err('활성 채널 없음. /sns-onboard 또는 /sns-onboard update channels 로 채널 선택, 또는 --channels= 플래그 사용.');
  process.exit(2);
}

// 알 수 없는 채널 (registry 미등록) 차단 — 오타·미구현 채널 사고 방지.
const known = new Set(knownChannels());
const unknown = channels.filter((c) => !known.has(c));
if (unknown.length) {
  ui.err(`등록되지 않은 채널: ${unknown.join(', ')}. 사용 가능: ${[...known].join(', ')}`);
  process.exit(2);
}

// profile 의 enabled 와 충돌하면 경고만 (사용자가 일회성 override 가능).
if (enabled.length) {
  const notEnabled = channels.filter((c) => !enabled.includes(c));
  if (notEnabled.length) {
    ui.warn(`onboard 에 없는 채널 사용: ${notEnabled.join(', ')} (이 캠페인 한정. 영구 추가는 /sns-onboard update channels)`);
  }
}

const goal = flags.goal ?? (profile.campaigns?.defaultGoals?.[0] ?? 'awareness');
const cadence = flags.cadence ?? 'single';

const slug = `${todayKst()}-${slugify(topic)}`;
const dir = resolve(PATHS.campaignsDir, slug);

if (existsSync(dir)) {
  ui.err(`이미 존재합니다: ${dir}`);
  process.exit(2);
}

// 3) Build brief.
const brief = {
  version: 1,
  slug,
  topic,
  goal,
  channels,
  cadence,
  constraints: { maxLengthOverride: null, mustInclude: [], mustExclude: [] },
  status: Object.fromEntries(channels.map((c) => [c, 'drafting'])),
  meta: {
    createdAt: nowKstIso(),
    updatedAt: nowKstIso(),
    profileBrand: profile.brand?.name ?? null,
  },
};

mkdirSync(dir, { recursive: true });
writeFileSync(
  resolve(dir, 'brief.yaml'),
  YAML.stringify(brief, { lineWidth: 100 }),
  'utf8'
);

for (const ch of channels) {
  mkdirSync(resolve(dir, ch), { recursive: true });
  writeFileSync(
    resolve(dir, ch, 'README.md'),
    `# ${slug} / ${ch}\n\n` +
      `Phase 3 활성화 시 \`copywriter\` / \`image-director\` 가 이 디렉터리에 draft.md 와 assets/ 를 생성합니다.\n` +
      `현재는 자동 생성이 꺼져 있으므로 \`harness/channels/${ch}/strategy.md\` 와 \`templates/post.md\` 를 참고해 수동으로 작성하세요.\n`,
    'utf8'
  );
}

// 채널별 view 동기화 (posts/by-channel/<ch>/<slug> symlink). 실패해도 전체 흐름은 통과.
import('./sync-posts.mjs').catch((e) => ui.warn(`sync-posts 실패 (무시): ${e.message}`));

// 4) Report.
ui.ok(`캠페인 생성: ${slug}`);
ui.info(`디렉터리: ${dir}`);
ui.info(`채널: ${channels.join(', ')}  ·  목표: ${goal}  ·  cadence: ${cadence}`);
console.log();
ui.dim('다음:');
ui.dim('  · /sns-status            진행 보드 보기');
ui.dim('  · /sns-preview ' + slug + '   (Phase 3 활성화 후)');
