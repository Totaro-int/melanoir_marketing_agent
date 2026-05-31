// Shared helpers for marketing_ai CLI scripts.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import pc from 'picocolors';

// Layout (Phase 8.1):
//   <PROJECT_ROOT>/
//     ├── harness/                ← 코드·스키마·예시·문서  (이 파일: harness/bin/_lib.mjs)
//     │   ├── bin/  src/  schemas/  examples/  channels/  commands/  skills/  agents/ ...
//     ├── posts/                                   ← 사람이 보는 결과물
//     │   ├── slots.yaml                           ← 반복용 캠페인 슬롯 (최대 5개)
//     │   ├── campaigns/<slug>/                    ← 캠페인 원본 (brief.yaml + per-channel drafts/assets)
//     │   └── by-channel/<ch>/<슬롯-slug>/<slug>/  ← 채널별·슬롯별 한눈에 보기 (campaigns 로 향한 symlink)
//     │                                              매칭 안 된 캠페인은 by-channel/<ch>/_ungrouped/ 로
//     ├── auth/                   ← 자격증명 (gitignored)
//     ├── out/                    ← 런타임 로그·이미지 (gitignored)
//     └── package.json, plugin.json, .env.local, company-profile.yaml, README.md ...
export const HARNESS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = resolve(HARNESS_ROOT, '..');

// Auto-load .env.local once at module init (KEY=VALUE per line, # comments).
// 우선순위:
//   1. .env.local 의 실제 값이 placeholder 아닌 경우 → 시스템 env 덮어씀 (사용자 직접 명시한 키 우선)
//   2. 시스템 env 가 placeholder ("your-...", "<...>" 등) 인 경우 → .env.local 가 덮어씀
//   3. 그 외 (시스템 env 가 진짜 값) → 시스템 env 유지
// 시스템에 placeholder 가 박혀있으면 .env.local 무시되는 사고 (어제 fal 401) 방지.
function isPlaceholder(v) {
  if (!v) return true;
  const s = String(v).trim();
  return /^(your-|<|placeholder|example|todo|change-?me)/i.test(s) || s === '';
}
(() => {
  const envFile = resolve(ROOT, '.env.local');
  if (!existsSync(envFile)) return;
  // 인라인 # 주석도 안전하게 끊음 (FAL_IMAGE_MODEL=fal-ai/fast-sdxl  # comment 같은 case)
  // 단 #! 같은 escape 없으니 단순 split.
  for (const raw of readFileSync(envFile, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, k, vRaw] = m;
    // 인라인 # 주석 제거 (단 quote 안의 # 는 보존 — 단순 처리)
    let v = vRaw;
    if (!/^["']/.test(v)) {
      const hashIdx = v.indexOf(' #');
      if (hashIdx >= 0) v = v.slice(0, hashIdx);
    }
    v = v.trim().replace(/^["']|["']$/g, '');
    // .env.local 의 값이 placeholder 면 무시
    if (isPlaceholder(v)) continue;
    // 시스템 env 에 진짜 값이 있으면 유지, placeholder 면 덮어쓰기
    if (k in process.env && !isPlaceholder(process.env[k])) continue;
    process.env[k] = v;
  }
})();

export const PATHS = {
  // harness 내부 (코드와 함께 이동)
  schema:              resolve(HARNESS_ROOT, 'schemas/company-profile.schema.yaml'),
  campaignBriefSchema: resolve(HARNESS_ROOT, 'schemas/campaign-brief.schema.yaml'),
  example:             resolve(HARNESS_ROOT, 'examples/company-profile.example.yaml'),
  channelsDir:         resolve(HARNESS_ROOT, 'channels'),
  // PROJECT_ROOT (사용자 데이터 + 매니페스트)
  profile:             resolve(ROOT, 'company-profile.yaml'),
  campaignsDir:        resolve(ROOT, 'posts/campaigns'),
  postsByChannelDir:   resolve(ROOT, 'posts/by-channel'),
  pluginManifest:      resolve(ROOT, '.claude-plugin/plugin.json'),
  channelsManifest:    resolve(HARNESS_ROOT, 'channels.json'),
};

export function readYaml(path) {
  if (!existsSync(path)) {
    const err = new Error(`File not found: ${path}`);
    err.code = 'ENOENT_YAML';
    throw err;
  }
  return YAML.parse(readFileSync(path, 'utf8'));
}

export function writeYaml(path, data) {
  writeFileSync(path, YAML.stringify(data, { lineWidth: 100 }), 'utf8');
}

export function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
}

export function readText(path) {
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8');
}

export function loadChannelDocs(channel) {
  const dir = resolve(PATHS.channelsDir, channel);
  return {
    strategy:  readText(resolve(dir, 'strategy.md')),
    checklist: readText(resolve(dir, 'checklist.md')),
    templates: readText(resolve(dir, 'templates/post.md')),
  };
}

export function findCampaignDir(slug) {
  const dir = resolve(PATHS.campaignsDir, slug);
  if (!existsSync(dir)) {
    const err = new Error(`Campaign not found: ${slug}`);
    err.code = 'ENOENT_CAMPAIGN';
    throw err;
  }
  return dir;
}

export function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function listChannels() {
  // 채널 메타는 Claude Code plugin.json schema 와 충돌해서 별도 파일에 둠.
  try { return loadJson(PATHS.channelsManifest); }
  catch { return []; }
}

export function activeChannels() {
  return listChannels()
    .filter((c) => c.status === 'reference' || c.status === 'active')
    .map((c) => c.id);
}

// /sns-onboard 단계에서 사용자가 고른 채널. 없으면 빈 배열 — 호출부가 fallback 결정.
export function enabledChannels(profile) {
  const arr = profile?.channels?.enabled;
  if (!Array.isArray(arr)) return [];
  return arr.filter((c) => typeof c === 'string' && c.length > 0);
}

export function slugify(text) {
  // Keep Korean characters; collapse whitespace and forbidden filename chars.
  // 유니코드 dash 류 (em-, en-, figure-, minus, hyphen 등) → ASCII '-' 통일.
  return text
    .normalize('NFKC')
    .trim()
    .replace(/[‐-―−﹘﹣－]/g, '-') // dash family → ASCII '-'
    .replace(/[\s_]+/g, '-')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/-+/g, '-')                                       // 연속 dash 1개로
    .replace(/^-+|-+$/g, '')                                   // 양 끝 dash 제거
    .slice(0, 80);
}

export function todayKst() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export function nowKstIso() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().replace('Z', '+09:00');
}

// Returns a filesystem-safe KST timestamp: YYYYMMDD-HHmmss
export function nowKstFilename() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const iso = kst.toISOString(); // "2026-05-03T07:03:52.975Z"
  return iso.slice(0, 10).replace(/-/g, '') + '-' + iso.slice(11, 19).replace(/:/g, '');
}

// Returns the path to the most recently generated draft yaml in a channel dir.
// Filename format: YYYYMMDD-HHmmss.yaml (lexicographic sort = chronological).
export function latestDraftYaml(channelDir) {
  if (!existsSync(channelDir)) return null;
  const files = readdirSync(channelDir)
    .filter((f) => /^\d{8}-\d{6}\.yaml$/.test(f))
    .sort();
  if (!files.length) return null;
  return resolve(channelDir, files[files.length - 1]);
}


// 대화형 한 줄 입력. secret=true 면 [비공개] 레이블 표시 (echo 는 그대로 — Claude Code 터미널 특성).
// optional=true 면 빈 입력 허용. 필수 항목은 빈 값 입력 시 재질문.
export async function promptLine(label, { secret = false, optional = false, hint } = {}) {
  const { createInterface } = await import('node:readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  if (hint) process.stdout.write(`  💡 ${hint}\n`);
  const displayLabel = `  ${label}${optional ? ' (선택 — Enter 건너뜀)' : ''}${secret ? ' [비공개]' : ''}: `;
  return new Promise((resolve) => {
    const ask = () => {
      rl.question(displayLabel, (answer) => {
        const v = answer.trim();
        if (!v && !optional) {
          process.stdout.write('  ⚠️  필수 항목입니다.\n');
          ask();
        } else {
          rl.close();
          resolve(v);
        }
      });
    };
    ask();
  });
}

export const ui = {
  ok: (msg) => console.log(pc.green('✅ ') + msg),
  warn: (msg) => console.log(pc.yellow('⚠️  ') + msg),
  err: (msg) => console.error(pc.red('❌ ') + msg),
  info: (msg) => console.log(pc.cyan('ℹ️  ') + msg),
  dim: (msg) => console.log(pc.dim(msg)),
  step: (i, n, msg) => console.log(pc.dim(`[${i}/${n}]`) + ' ' + msg),
};

export const SPINNER_FRAMES = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];

export class Spinner {
  constructor() {
    this._label = '';
    this._frame = 0;
    this._timer = null;
  }

  start(label = '') {
    this._label = label;
    this._frame = 0;
    process.stdout.write('\x1b[?25l');
    this._timer = setInterval(() => this._tick(), 80);
    this._tick();
    return this;
  }

  update(label) {
    this._label = label;
  }

  stop(finalMsg = '') {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    process.stdout.write('\r\x1b[K\x1b[?25h');
    if (finalMsg) process.stdout.write(finalMsg + '\n');
    return this;
  }

  _tick() {
    const f = SPINNER_FRAMES[this._frame % SPINNER_FRAMES.length];
    process.stdout.write(`\r${pc.cyan(f)} ${this._label}`);
    this._frame++;
  }
}

// 자동 업데이트 알림 — 30분 throttle, 네트워크 실패 시 silent skip.
// 우회: MARKETING_AGENT_SKIP_UPDATE_CHECK ∈ {1,true,yes,on} (isDryRun 패턴과 일관).
// feature 브랜치에 있어도 default branch (main/master) 기준으로 비교.
export function checkForUpdates() {
  const skip = (process.env.MARKETING_AGENT_SKIP_UPDATE_CHECK ?? '').toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(skip)) return;

  const cacheDir = resolve(ROOT, 'out');
  const cacheFile = resolve(cacheDir, '.update-check');
  const now = Date.now();
  const minIntervalMs = 30 * 60 * 1000;

  try {
    const last = parseInt(readFileSync(cacheFile, 'utf8'), 10);
    if (Number.isFinite(last) && (now - last) < minIntervalMs) return;
  } catch { /* no cache yet */ }

  const git = (args, opts = {}) =>
    spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', timeout: 5000, ...opts });

  // git repo 인지 먼저. zip 다운로드 사용자는 .git 없을 수 있음.
  if (git(['rev-parse', '--git-dir'], { stdio: 'ignore' }).status !== 0) return;

  // origin 의 default branch 결정 (HEAD symbolic-ref → main → master 순).
  let defaultBranch = '';
  const sym = git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (sym.status === 0) defaultBranch = (sym.stdout?.trim() || '').replace(/^origin\//, '');
  if (!defaultBranch) {
    if (git(['rev-parse', '--verify', 'origin/main'], { stdio: 'ignore' }).status === 0) defaultBranch = 'main';
    else if (git(['rev-parse', '--verify', 'origin/master'], { stdio: 'ignore' }).status === 0) defaultBranch = 'master';
    else defaultBranch = 'main';
  }

  const fetchRes = git(['fetch', 'origin', defaultBranch, '--quiet'], { stdio: 'ignore' });

  // 캐시는 fetch 시도 후 무조건 갱신 (네트워크 실패 시에도 30분간 retry 안 함).
  try { mkdirSync(cacheDir, { recursive: true }); writeFileSync(cacheFile, String(now)); } catch {}

  if (fetchRes.status !== 0) return; // offline / private auth 실패 등 silent

  const behindStr = git(['rev-list', '--count', `HEAD..origin/${defaultBranch}`]).stdout?.trim();
  const behind = parseInt(behindStr || '0', 10);
  if (!Number.isFinite(behind) || behind <= 0) return;

  const lastCommit = git(['log', `HEAD..origin/${defaultBranch}`, '--oneline', '-1']).stdout?.trim();
  console.log();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(pc.yellow('🔄 marketing_agent 업데이트가 있습니다'));
  console.log(`   ${behind}개 새 커밋  |  최신: ${lastCommit ?? ''}`);
  console.log(`   업데이트 명령: git -C "${ROOT}" pull origin ${defaultBranch}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();
  console.log('[MARKETING_AGENT_UPDATE_AVAILABLE]');
  console.log(`BEHIND=${behind} BRANCH=${defaultBranch} ROOT=${ROOT}`);
  console.log();
  console.log('업데이트 후 다시 실행하거나, 건너뛰려면:');
  console.log(`  MARKETING_AGENT_SKIP_UPDATE_CHECK=1 node bin/run.mjs ...`);
  console.log();
  process.exit(10);
}
