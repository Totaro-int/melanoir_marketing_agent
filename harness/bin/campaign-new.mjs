#!/usr/bin/env node
// Create a new campaign skeleton: campaigns/<date>-<slug>/{brief.yaml, <channel>/}.
// Usage:
//   node bin/campaign-new.mjs "<topic>" [--channels=threads,linkedin] [--goal=awareness] [--cadence=single]
//                                       [--slot-topic="<원본 슬롯 topic>"]   # by-channel 그루핑 키

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';
import {
  PATHS, readYaml, slugify, todayKst, nowKstIso, activeChannels, enabledChannels, ui,
} from './_lib.mjs';
import { validateChannels } from '../src/publisher/registry.mjs';

const argv = process.argv.slice(2);
if (!argv.length || argv[0].startsWith('--')) {
  ui.err('사용법: campaign-new.mjs "<주제>" [--channels=...] [--goal=...] [--cadence=...] [--blogMode=...] [--stealth]');
  ui.err('  blog 채널 포함 시 blogMode (default/rcon/ai-briefing/home-plate/insight-edge)');
  ui.err('  미지정 시 goal → mode 자동 매핑 (launch→ai-briefing, awareness→home-plate, traffic→rcon, lead→insight-edge, education→default)');
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

const { unknown, notEnabled } = validateChannels(channels, { enabled });
if (unknown.length) {
  ui.err(`등록되지 않은 채널: ${unknown.join(', ')}`);
  process.exit(2);
}
if (notEnabled.length) {
  ui.warn(`onboard 에 없는 채널 사용: ${notEnabled.join(', ')} (이 캠페인 한정. 영구 추가는 /sns-onboard update channels)`);
}

const goal = flags.goal ?? (profile.campaigns?.defaultGoals?.[0] ?? 'awareness');
const cadence = flags.cadence ?? 'single';

// blog 채널이 포함된 경우 — blogMode 결정 (CLI flag 우선, 없으면 goal → 자동 매핑)
//   기존 SEO  → default (C-Rank/D.I.A.+)        : goal=education
//   최신 SEO  → rcon (네이버 DAN25)              : goal=traffic
//   AI 검색   → ai-briefing (AEO/Cue:)           : goal=launch
//   홈피드 추천 → home-plate                    : goal=awareness
//   결핍 공략 → insight-edge                    : goal=lead
const VALID_BLOG_MODES = new Set(['default', 'rcon', 'ai-briefing', 'home-plate', 'insight-edge']);
const GOAL_TO_BLOG_MODE = {
  launch: 'ai-briefing',
  awareness: 'home-plate',
  traffic: 'rcon',
  lead: 'insight-edge',
  education: 'default',
};
const hasBlogChannel = channels.some((c) => ['naver-blog', 'tistory', 'brunch'].includes(c));
let blogMode = null;
if (hasBlogChannel) {
  blogMode = flags.blogMode ?? GOAL_TO_BLOG_MODE[goal] ?? 'default';
  if (!VALID_BLOG_MODES.has(blogMode)) {
    ui.err(`잘못된 blogMode: ${blogMode} (가능: ${[...VALID_BLOG_MODES].join(', ')})`);
    process.exit(2);
  }
}
const stealthMode = flags.stealth === true || flags.stealth === 'true';

const slug = `${todayKst()}-${slugify(topic)}`;
const dir = resolve(PATHS.campaignsDir, slug);

if (existsSync(dir)) {
  ui.err(`이미 존재합니다: ${dir}`);
  process.exit(2);
}

// 3) Build brief.
const slotTopic = flags['slot-topic']
  ? String(flags['slot-topic']).trim() || null
  : null;

const brief = {
  version: 1,
  slug,
  topic,
  slotTopic,
  goal,
  channels,
  cadence,
  ...(blogMode ? { blogMode } : {}),       // 5 모드 (default/rcon/ai-briefing/home-plate/insight-edge)
  ...(stealthMode ? { stealthMode: true } : {}), // AI 탐지 회피 옵션
  keyMessage: flags.keyMessage ?? null,
  contentPoints: flags.contentPoints
    ? String(flags.contentPoints).split('|').map(s => s.trim()).filter(Boolean)
    : [],
  angle: flags.angle ?? null,
  notes: flags.notes ?? null,
  sourceMaterials: parseSourceMaterials(flags),
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

function parseSourceMaterials(flags) {
  const images = flags.sourceImages
    ? String(flags.sourceImages).split('|').map((p) => p.trim()).filter(Boolean)
    : [];
  const texts = flags.sourceTexts
    ? String(flags.sourceTexts).split('|').map((p) => p.trim()).filter(Boolean)
    : [];
  const designRef = flags.designRef ? String(flags.designRef).toLowerCase().trim() : null;
  if (!images.length && !texts.length && !designRef) return null;
  return { images, texts, ...(designRef ? { designRef } : {}) };
}

// 4) Report.
ui.ok(`캠페인 생성: ${slug}`);
ui.info(`디렉터리: ${dir}`);
ui.info(`채널: ${channels.join(', ')}  ·  목표: ${goal}  ·  cadence: ${cadence}`);
console.log();
ui.dim('다음:');
ui.dim('  · /sns-status            진행 보드 보기');
ui.dim('  · /sns-preview ' + slug + '   (Phase 3 활성화 후)');
