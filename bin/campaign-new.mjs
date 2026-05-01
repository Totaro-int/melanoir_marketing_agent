#!/usr/bin/env node
// Create a new campaign skeleton: campaigns/<date>-<slug>/{brief.yaml, <channel>/}.
// Usage:
//   node bin/campaign-new.mjs "<topic>" [--channels=threads,linkedin] [--goal=awareness] [--cadence=single]

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';
import {
  PATHS, readYaml, slugify, todayKst, nowKstIso, activeChannels, ui,
} from './_lib.mjs';

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
  ui.err('company-profile.yaml 이 없습니다. 먼저 /onboard 를 실행하세요.');
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
const channels = (
  flags.channels
    ? String(flags.channels).split(',').map((s) => s.trim()).filter(Boolean)
    : activeChannels()
);
if (!channels.length) {
  ui.err('활성화된 채널이 없습니다. plugin.json 의 channels[] 또는 --channels 플래그를 확인하세요.');
  process.exit(2);
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
      `현재는 자동 생성이 꺼져 있으므로 \`channels/${ch}/strategy.md\` 와 \`templates/post.md\` 를 참고해 수동으로 작성하세요.\n`,
    'utf8'
  );
}

// 4) Report.
ui.ok(`캠페인 생성: ${slug}`);
ui.info(`디렉터리: ${dir}`);
ui.info(`채널: ${channels.join(', ')}  ·  목표: ${goal}  ·  cadence: ${cadence}`);
console.log();
ui.dim('다음:');
ui.dim('  · /status            진행 보드 보기');
ui.dim('  · /preview ' + slug + '   (Phase 3 활성화 후)');
