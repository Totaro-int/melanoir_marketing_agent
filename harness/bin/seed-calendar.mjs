#!/usr/bin/env node
// seed-calendar.mjs — 브랜드 DNA (company-profile.yaml) + 주제 목록 → 캘린더 N일치 캠페인 생성.
//
// 어느 회사든 재사용: company-profile.yaml 의 브랜드명·해시태그·채널·톤을 읽어
// 각 캠페인에 자동 주입. 주제(topics)만 회사별로 갈아끼우면 된다.
//
// Usage:
//   node harness/bin/seed-calendar.mjs --topics topics.txt [옵션]
//   node harness/bin/seed-calendar.mjs --topics topics.txt --start 2026-06-15 \
//        --channels naver-blog,instagram,threads,linkedin --status approved
//
// 옵션:
//   --topics <file>    주제 파일 (한 줄 = 한 캠페인). 형식:
//                        "글 제목"                  → 슬러그 자동
//                        "slug-key : 글 제목"        → 슬러그 명시
//   --start <YYYY-MM-DD>  시작일 (기본: 오늘)
//   --channels a,b,c   채널 (기본: company-profile.channels.enabled 중 지원 채널)
//   --status <st>      drafting | approved (기본: approved — morning routine 이 바로 처리)
//   --cadence single   채널별 카드 수
//   --dry-run          생성 안 하고 계획만 출력
//
// 결과: posts/campaigns/<YYYY-MM-DD>-<slug>/ 폴더가 주제 수만큼 생성.
//   - brief.yaml (campaign-new 와 동일 schema)
//   - <channel>/<ts>.yaml (브랜드 해시태그 주입된 draft skeleton)
//
// 이미지/카피는 비어있는 skeleton — image-director / copywriter 가 채우거나,
// 디자인 carousel 은 별도 생성. seed-calendar 는 "캘린더 뼈대" 를 만든다.

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';
import { PATHS, readYaml, slugify, nowKstIso, ui } from './_lib.mjs';

// browser-publish 가 실제 발행 함수를 가진 채널만 (정직: 안 되는 채널 캘린더에 안 넣음)
const PUBLISHABLE = new Set(['naver-blog', 'tistory', 'brunch', 'instagram', 'threads', 'linkedin']);

const argv = process.argv.slice(2);
function flag(name, def) {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return def;
  if (hit === `--${name}`) {
    // boolean 또는 다음 토큰
    const idx = argv.indexOf(hit);
    const next = argv[idx + 1];
    if (next && !next.startsWith('--')) return next;
    return true;
  }
  return hit.split('=').slice(1).join('=');
}

const topicsFile = flag('topics');
const startStr = flag('start');
const channelsArg = flag('channels');
const status = flag('status', 'approved');
const cadence = flag('cadence', 'single');
const dryRun = argv.includes('--dry-run');

if (!topicsFile) {
  ui.err('사용법: seed-calendar.mjs --topics <file> [--start YYYY-MM-DD] [--channels a,b,c] [--status approved|drafting] [--dry-run]');
  ui.err('  주제 파일 형식: 한 줄에 "글 제목" 또는 "slug-key : 글 제목"');
  process.exit(2);
}
if (!existsSync(topicsFile)) {
  ui.err(`주제 파일 없음: ${topicsFile}`);
  process.exit(2);
}

// 1. 브랜드 DNA 로드
const profile = readYaml(PATHS.profile)
  || readYaml(resolve(process.cwd(), 'company-profile.yaml'))
  || {};
const brandName = profile.brand?.name || profile.brand?.korName || null;
const alwaysTags = profile.hashtags?.always || [];
const poolTags = (profile.hashtags?.pool || []).slice(0, 3);
const brandTags = [...new Set([...alwaysTags, ...poolTags])].slice(0, 5);
const tonePreset = profile.tone?.preset || null;

// 2. 채널 결정 — 인자 우선, 없으면 profile.channels.enabled ∩ PUBLISHABLE
let channels;
if (channelsArg && typeof channelsArg === 'string') {
  channels = channelsArg.split(',').map((s) => s.trim()).filter(Boolean);
} else {
  const enabled = profile.channels?.enabled || [];
  channels = enabled.filter((c) => PUBLISHABLE.has(c));
  if (!channels.length) channels = ['naver-blog', 'instagram', 'threads', 'linkedin'];
}
const unsupported = channels.filter((c) => !PUBLISHABLE.has(c));
if (unsupported.length) {
  ui.warn(`발행 함수 없는 채널 제외: ${unsupported.join(', ')}`);
  channels = channels.filter((c) => PUBLISHABLE.has(c));
}

// 3. 주제 파싱
const topics = readFileSync(topicsFile, 'utf8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((line) => {
    const m = line.match(/^([^:]+?)\s*:\s*(.+)$/);
    if (m && /^[\w가-힣%.\- ]+$/.test(m[1]) && m[1].length < 40) {
      return { slugKey: slugify(m[1].trim()), topic: m[2].trim() };
    }
    return { slugKey: slugify(line).slice(0, 40), topic: line };
  });

if (!topics.length) {
  ui.err('주제 파일에 유효한 주제가 없음');
  process.exit(2);
}

// 4. 시작일
const start = startStr ? new Date(startStr + 'T00:00:00') : new Date();
if (isNaN(start.getTime())) { ui.err(`잘못된 시작일: ${startStr}`); process.exit(2); }

ui.info(`📅 캘린더 시드 — ${topics.length}개 캠페인`);
ui.dim(`  브랜드: ${brandName || '(company-profile 없음)'}`);
ui.dim(`  채널: ${channels.join(', ')}`);
ui.dim(`  해시태그: ${brandTags.join(' ') || '(없음)'}`);
ui.dim(`  톤: ${tonePreset || '(미설정)'}`);
ui.dim(`  status: ${status}`);
ui.dim(`  시작: ${startStr || new Date().toISOString().slice(0, 10)}`);
if (dryRun) ui.warn('  --dry-run — 실제 생성 안 함');

// 5. 생성
let created = 0;
for (let i = 0; i < topics.length; i++) {
  const d = new Date(start);
  d.setDate(d.getDate() + i);
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const ts = `${dateStr.replace(/-/g, '')}-090000`;
  const isoDate = `${dateStr}T09:00:00.000+09:00`;
  const { slugKey, topic } = topics[i];
  const slug = `${dateStr}-${slugKey}`;
  const dir = resolve(PATHS.campaignsDir, slug);

  if (existsSync(dir)) {
    ui.dim(`  skip (이미 있음): ${slug}`);
    continue;
  }
  if (dryRun) {
    ui.dim(`  [plan] ${dateStr} · ${topic.slice(0, 45)}`);
    created++;
    continue;
  }

  // brief.yaml — campaign-new schema 일치
  const brief = {
    version: 1, slug, topic, slotTopic: null,
    goal: profile.campaigns?.defaultGoals?.[0] || 'education',
    channels, cadence,
    keyMessage: null, contentPoints: [], angle: null, notes: null,
    sourceMaterials: null,
    constraints: { maxLengthOverride: null, mustInclude: [], mustExclude: [] },
    status: Object.fromEntries(channels.map((c) => [c, status])),
    meta: { createdAt: isoDate, updatedAt: isoDate, profileBrand: brandName },
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'brief.yaml'), YAML.stringify(brief, { lineWidth: 100 }), 'utf8');

  // 채널별 draft skeleton (브랜드 해시태그 주입)
  const tagLine = brandTags.length ? '\n\n' + brandTags.join(' ') : '';
  for (const ch of channels) {
    const chDir = resolve(dir, ch);
    mkdirSync(chDir, { recursive: true });
    const draft = {
      version: 1, slug, channel: ch, generatedAt: isoDate,
      provider: { provider: 'seed-calendar', model: 'skeleton' },
      image: { provider: 'seed-calendar', model: 'skeleton' },
      text: `${topic}${tagLine}`,
      hashtags: brandTags,
      assets: [],
      assetUrls: [],
      guardian: { ok: true, severity: 'ok', findings: [], summary: { blocks: 0, warns: 0, info: 0 } },
    };
    writeFileSync(resolve(chDir, `${ts}.yaml`), YAML.stringify(draft, { lineWidth: 100 }), 'utf8');
  }
  created++;
}

ui.ok(`\n캘린더 시드 완료: ${created}개 캠페인`);
if (!dryRun && created > 0) {
  const last = new Date(start);
  last.setDate(last.getDate() + topics.length - 1);
  ui.dim(`  ${start.toISOString().slice(0, 10)} ~ ${last.toISOString().slice(0, 10)}`);
  ui.dim('  다음: 카피/이미지 채우기 (copywriter + image-director) 또는 morning routine');
  ui.dim('  대시보드 캘린더: http://localhost:7777');
}
