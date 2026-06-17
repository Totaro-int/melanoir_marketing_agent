#!/usr/bin/env node
// self-check.mjs — 자가 점검·자동 수정. 납품/운영 전 "명령 1개로 안심".
//
// doctor 가 못 잡는 부류(보안·git 위생·일관성)를 점검하고, 안전한 건 자동으로 고친다.
// 이번 납품에서 실제로 터졌던 사고들을 그대로 검사:
//   - .gitignore 갭 → 민감파일(브랜드 프로필 등)이 공개 레포에 커밋되는 사고
//   - 이미 추적 중인 민감파일
//   - PUBLIC 레포에 민감내용
//   - Playwright Chromium 미설치(fresh 머신 발행 실패)
//   - 프로필/채널/예시 일관성
//
// Usage:
//   node harness/bin/self-check.mjs            # 점검만(읽기 전용) + 고칠 명령 안내
//   node harness/bin/self-check.mjs --fix      # 안전한 자동 수정 적용
//   node harness/bin/self-check.mjs --json     # JSON (자동화/대시보드용)
//   node harness/bin/self-check.mjs --quick    # 네트워크/무거운 검사 생략(gh·playwright)
//
// exit: 0 = 정상/경고만,  2 = 미수정 치명(CRITICAL) 존재

import { existsSync, readFileSync, appendFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import pc from 'picocolors';
import { ROOT, HARNESS_ROOT, PATHS, ui, readYaml, enabledChannels } from './_lib.mjs';

const FIX = process.argv.includes('--fix');
const JSON_OUT = process.argv.includes('--json');
const QUICK = process.argv.includes('--quick');

const out = [];
// sev: 'ok' | 'warn' | 'critical'   action: null | 'fixed' | 'manual'
function rec(area, sev, msg, { action = null, cmd = null } = {}) {
  out.push({ area, sev, msg, action, cmd });
}
function git(args, opts = {}) { return spawnSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', ...opts }); }
const inRepo = git(['rev-parse', '--is-inside-work-tree']).status === 0;

// ─────────────────────────────────────────── 1) 보안 · git 위생 ──────────────
if (!inRepo) {
  rec('git', 'warn', 'git 레포가 아님 — git 위생 검사 생략');
} else {
  // 1a) .gitignore 가 민감 경로를 실제로 무시하는지 (git check-ignore 로 정확히 — 패턴/네거션 반영)
  const MUST_IGNORE = [
    { probe: 'company-profile.yaml',            rules: ['company-profile.yaml'] },
    { probe: 'company-profile.local.yaml',      rules: ['*.local.yaml'] },
    { probe: '.env',                            rules: ['.env'] },
    { probe: '.env.local',                      rules: ['.env.*', '!.env.example'] },
    { probe: 'auth/cookies/probe.json',         rules: ['auth/'] },
    { probe: 'posts/sources/_probe.md',         rules: ['posts/sources/*', '!posts/sources/README.md'] },
    { probe: 'posts/insight-photos/_probe.jpg', rules: ['posts/insight-photos/*', '!posts/insight-photos/.gitkeep'] },
    { probe: 'out/_probe.png',                  rules: ['out/'] },
    { probe: 'node_modules/_probe',             rules: ['node_modules/'] },
  ];
  const isIgnored = (p) => git(['check-ignore', '-q', p]).status === 0;
  const toAdd = [];
  for (const m of MUST_IGNORE) {
    if (!isIgnored(m.probe)) {
      for (const r of m.rules) if (!toAdd.includes(r)) toAdd.push(r);
    }
  }
  // 네거션 sanity — 커밋돼야 할 placeholder 가 실수로 무시되면 경고(자동수정 X)
  for (const keep of ['.env.example', 'posts/sources/README.md', 'posts/insight-photos/.gitkeep', 'harness/examples/auth/x.example.json']) {
    if (isIgnored(keep)) rec('git', 'warn', `과보호: ${keep} 가 무시됨 — .gitignore 네거션(!${keep}) 확인 필요`);
  }
  if (toAdd.length) {
    if (FIX) {
      const block = `\n# self-check 자동 보강 (민감 경로 보호)\n${toAdd.join('\n')}\n`;
      appendFileSync(resolve(ROOT, '.gitignore'), block);
      rec('git', 'critical', `.gitignore 누락 보호 줄 ${toAdd.length}개 추가: ${toAdd.join(' ')}`, { action: 'fixed' });
    } else {
      rec('git', 'critical', `.gitignore 가 민감 경로를 안 막음: ${toAdd.join(' ')}`, { action: 'manual', cmd: 'npm run self-check:fix' });
    }
  } else {
    rec('git', 'ok', '.gitignore 민감 경로 보호 정상');
  }

  // 1b) 이미 추적 중인 민감파일 (= 커밋돼 노출)
  const tracked = (git(['ls-files']).stdout || '').split(/\r?\n/).filter(Boolean);
  const isSensitive = (f) => {
    if (/^harness\/examples\//.test(f)) return false;       // 예시 placeholder
    if (f === '.env.example') return false;
    if (/(^|\/)company-profile\.ya?ml$/.test(f)) return true;
    if (/\.local\.ya?ml$/.test(f)) return true;
    if (/(^|\/)\.env$/.test(f) || /(^|\/)\.env\.(local|production|development)$/.test(f)) return true;
    if (/^auth\//.test(f)) return true;
    if (/\.bak\.(ya?ml|json)$/.test(f)) return true;
    if (/(^|\/)cookies?\.json$/.test(f)) return true;
    return false;
  };
  const leaked = tracked.filter(isSensitive);
  if (leaked.length) {
    if (FIX) {
      for (const f of leaked) git(['rm', '--cached', '--', f]);
      rec('git', 'critical', `추적된 민감파일 ${leaked.length}개 추적 해제(로컬 보존): ${leaked.join(', ')}`, { action: 'fixed' });
      rec('git', 'warn', '⚠ 기존 클론은 pull 시 이 파일들이 삭제됨 — pull 전 백업 또는 재생성. 과거 커밋 히스토리엔 남음(완전제거=히스토리 재작성).');
    } else {
      rec('git', 'critical', `추적된 민감파일 노출: ${leaked.join(', ')}`, { action: 'manual', cmd: `git rm --cached ${leaked.join(' ')}  (또는 npm run self-check:fix)` });
    }
  } else {
    rec('git', 'ok', '추적된 민감파일 없음');
  }

  // 1c) 미커밋 변경 — 자동수정으로 .gitignore/untrack 후 커밋 안내
  const dirty = (git(['status', '--porcelain']).stdout || '').split(/\r?\n/).filter((l) => l && !l.startsWith('??')).length;
  if (FIX && dirty) rec('git', 'warn', `git 변경 ${dirty}건 — 검토 후 커밋·푸시 필요: git add -A && git commit && git push`);

  // 1d) PUBLIC 레포 + 민감내용 (gh, best-effort)
  if (!QUICK) {
    try {
      const originUrl = (git(['remote', 'get-url', 'origin']).stdout || '').trim();
      const m = originUrl.match(/github\.com[:/]([^/]+\/[^/.]+)/);
      if (m) {
        const r = spawnSync('gh', ['repo', 'view', m[1], '--json', 'visibility'], { encoding: 'utf8', timeout: 10000 });
        if (r.status === 0) {
          const vis = (JSON.parse(r.stdout).visibility || '').toUpperCase();
          if (vis === 'PUBLIC') {
            rec('git', leaked.length ? 'critical' : 'warn',
              `레포가 PUBLIC (${m[1]}) — 커밋되는 모든 게 공개. 클라 납품 레포면 비공개 권장: gh repo edit ${m[1]} --visibility private`,
              { action: 'manual', cmd: `gh repo edit ${m[1]} --visibility private` });
          } else {
            rec('git', 'ok', `레포 ${vis.toLowerCase()} (${m[1]})`);
          }
        }
      }
    } catch { /* gh 없거나 미인증 — 생략 */ }
  }
}

// ─────────────────────────────────────────── 2) 런타임 (발행 깨짐 방지) ──────
// Playwright Chromium 바이너리 — npm install 은 안 깖(fresh 머신 함정). inhouse-slides + browser-publish 둘 다 필요.
if (!QUICK) {
  let chromiumOk = false;
  try {
    const o = execFileSync('node', ['--input-type=module', '-e',
      "import{chromium}from'playwright';import{existsSync}from'node:fs';const p=chromium.executablePath();process.stdout.write(p&&existsSync(p)?'OK':'NO')",
    ], { timeout: 15000 }).toString();
    chromiumOk = o.includes('OK');
  } catch { chromiumOk = false; }
  if (chromiumOk) {
    rec('runtime', 'ok', 'Playwright Chromium 설치됨');
  } else if (FIX) {
    const r = spawnSync('npx', ['playwright', 'install', 'chromium'], { encoding: 'utf8', stdio: 'inherit', shell: process.platform === 'win32' });
    rec('runtime', r.status === 0 ? 'ok' : 'critical',
      r.status === 0 ? 'Playwright Chromium 설치 완료' : 'Chromium 설치 실패 — 수동: npx playwright install chromium',
      { action: r.status === 0 ? 'fixed' : 'manual', cmd: 'npx playwright install chromium' });
  } else {
    rec('runtime', 'critical', 'Playwright Chromium 미설치 — 발행/카드캡처 깨짐', { action: 'manual', cmd: 'npx playwright install chromium  (또는 npm run self-check:fix)' });
  }
}
if (!existsSync(resolve(ROOT, 'node_modules'))) {
  rec('runtime', 'warn', 'node_modules 없음 — npm install 필요', { action: 'manual', cmd: 'npm install' });
}

// ─────────────────────────────────────────── 3) 일관성 (조용한 사고 방지) ────
let profile = null;
try { if (existsSync(PATHS.profile)) profile = readYaml(PATHS.profile); } catch {}
if (!profile) {
  rec('consistency', 'warn', 'company-profile.yaml 없음 — /sns-onboard 로 생성(브랜드 지침 posts/sources/ 반영)');
} else {
  rec('consistency', 'ok', `프로필 로드: ${profile.brand?.name ?? '(이름없음)'}`);
  // 발행 가능 채널만 enabled 인지 (doctor 와 동일 기준)
  try {
    const { knownChannels } = await import('../src/publisher/registry.mjs');
    const bad = enabledChannels(profile).filter((c) => !knownChannels().includes(c));
    if (bad.length) rec('consistency', 'warn', `발행 불가 채널이 enabled: ${bad.join(', ')} (가능: ${knownChannels().join(', ')})`);
  } catch {}
}
// 예시 프로필 검증 (신규 설치가 복사하는 파일 — 깨져 있으면 첫인상 사고)
{
  const ex = resolve(HARNESS_ROOT, 'examples/company-profile.example.yaml');
  if (existsSync(ex)) {
    const r = spawnSync('node', [resolve(HARNESS_ROOT, 'bin/profile-validate.mjs'), ex], { encoding: 'utf8' });
    rec('consistency', r.status === 0 ? 'ok' : 'warn',
      r.status === 0 ? '예시 프로필 검증 통과' : '예시 프로필 검증 실패 — validate:example 확인');
  }
}

// ─────────────────────────────────────────── 출력 ───────────────────────────
const crit = out.filter((r) => r.sev === 'critical' && r.action !== 'fixed').length;
const fixed = out.filter((r) => r.action === 'fixed').length;
const warns = out.filter((r) => r.sev === 'warn').length;

if (JSON_OUT) {
  console.log(JSON.stringify({ ok: crit === 0, crit, fixed, warns, findings: out }, null, 2));
  process.exit(crit ? 2 : 0);
}

const ICON = { ok: pc.green('✓'), warn: pc.yellow('⚠'), critical: pc.red('🚨') };
console.log();
console.log(pc.bold(pc.cyan(`🛡  self-check ${FIX ? pc.green('(자동 수정 모드)') : '(점검만)'}`)));
let lastArea = '';
const AREA = { git: '보안·git 위생', runtime: '런타임', consistency: '일관성' };
for (const r of out) {
  if (r.area !== lastArea) { console.log(); console.log(pc.dim(`── ${AREA[r.area] ?? r.area} ─────────────────────────`)); lastArea = r.area; }
  const tag = r.action === 'fixed' ? pc.green(' [수정됨]') : (r.action === 'manual' ? pc.dim(' [수동]') : '');
  console.log(`  ${ICON[r.sev]}  ${r.msg}${tag}`);
  if (r.cmd && r.action === 'manual') console.log(pc.dim(`        ↳ ${r.cmd}`));
}
console.log();
const parts = [];
if (fixed) parts.push(pc.green(`🔧 ${fixed} 수정`));
if (crit) parts.push(pc.red(`🚨 ${crit} 치명`));
if (warns) parts.push(pc.yellow(`⚠ ${warns} 경고`));
if (!parts.length) parts.push(pc.green('모두 정상'));
console.log('  ' + parts.join(' · '));
if (crit && !FIX) console.log(pc.dim('  → 자동 수정 가능한 항목: npm run self-check:fix'));
if (FIX && fixed) console.log(pc.dim('  → 변경 검토 후 커밋·푸시: git add -A && git commit && git push'));
console.log();
process.exit(crit ? 2 : 0);
