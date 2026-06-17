#!/usr/bin/env node
// insight-daily.mjs — 매일 인사이트 카드 1장 발행 오케스트레이션.
//
// 토픽(insights-topics.txt, 날짜 순환) + 클라 사진 풀(--photo-dir, 날짜 순환)
//   → insight-card.mjs → ① 웹(insights/cards + cards.json) 발행 ② IG-ready 번들(카드 + 캡션)
//   → (옵션) 웹 레포 git commit/push. cron/morning 에서 매일 1회 호출.
//
// Usage:
//   node harness/bin/insight-daily.mjs \
//     [--topics=insights-topics.txt] [--photo-dir=posts/insight-photos] \
//     [--website=/path/to/web/site/insights] [--date=YYYY-MM-DD] \
//     [--commit] [--push] [--dry-run]
//
// insights-topics.txt 형식 (한 줄 = 한 인사이트, 날짜로 순환 = 매일 다음 줄):
//   카테고리 | 제목 | 서브타이틀
//   # 주석/빈 줄 무시

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const HARNESS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(HARNESS_ROOT, '..');
const argv = process.argv.slice(2);
const flag = (n, d) => { const h = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (!h) return d; return h === `--${n}` ? true : h.split('=').slice(1).join('='); };
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const ok = (s) => console.log(`\x1b[32m✅\x1b[0m ${s}`);
const warn = (s) => console.log(`\x1b[33m⚠\x1b[0m  ${s}`);
const err = (s) => console.error(`\x1b[31m❌\x1b[0m ${s}`);

const dryRun = argv.includes('--dry-run');
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
const date = flag('date') || todayStr();

// 1) 토픽 로드
const topicsFile = resolve(ROOT, flag('topics', 'insights-topics.txt'));
if (!existsSync(topicsFile)) {
  err(`토픽 파일 없음: ${topicsFile}`);
  err('  형식 한 줄: "카테고리 | 제목 | 서브타이틀"  (예시: harness/examples/insights-topics.example.txt)');
  process.exit(2);
}
const topics = readFileSync(topicsFile, 'utf8').split(/\r?\n/)
  .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  .map((l) => { const [category, title, subtitle] = l.split('|').map((s) => (s || '').trim()); return { category, title, subtitle }; })
  .filter((t) => t.title);
if (!topics.length) { err('유효한 토픽이 없음'); process.exit(2); }

// 2) 날짜 순환 — 매일 다음 토픽 (결정론적)
const days = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
const topic = topics[((days % topics.length) + topics.length) % topics.length];

// 3) 사진 풀
const photoDir = flag('photo-dir', resolve(ROOT, 'posts/insight-photos'));
const hasPhotos = existsSync(photoDir) && readdirSync(photoDir).some((f) => /\.(jpe?g|png|webp)$/i.test(f));
if (!hasPhotos) warn(`사진 풀 비었음(${photoDir}) → 모노톤 폴백으로 생성. 클라 사진을 이 폴더에 넣으면 카드레터 배경으로 사용.`);

const website = flag('website'); // 예: /path/to/melanoir-recruitment/web/site/insights
const outPng = resolve(ROOT, 'out', `insight-${date}.png`);

console.log(`\x1b[1m📰 데일리 인사이트 카드 — ${date}\x1b[0m`);
console.log(dim(`  토픽[${((days % topics.length) + topics.length) % topics.length}/${topics.length}]: ${topic.category} · ${topic.title}`));
console.log(dim(`  사진 풀: ${hasPhotos ? photoDir : '(없음 → 폴백)'}  |  웹: ${website || '(미지정)'}`));

if (dryRun) { warn('--dry-run — 생성/발행 안 함'); process.exit(0); }

// 4) insight-card.mjs 호출 (생성 + 웹 발행)
const args = [
  resolve(HARNESS_ROOT, 'bin/insight-card.mjs'),
  `--title=${topic.title}`,
  `--date=${date}`,
  `--out=${outPng}`,
];
if (topic.subtitle) args.push(`--subtitle=${topic.subtitle}`);
if (topic.category) args.push(`--category=${topic.category}`);
if (hasPhotos) args.push(`--photo-dir=${photoDir}`);
if (website) args.push(`--website=${website}`);
const r = spawnSync('node', args, { stdio: 'inherit' });
if (r.status !== 0) { err('insight-card 생성 실패'); process.exit(1); }

// 5) IG-ready 캡션 (브랜드 해시태그 주입) — 카드 옆에 .caption.txt
let tags = [];
try {
  const { PATHS, readYaml } = await import('./_lib.mjs');
  const profile = readYaml(PATHS.profile) || {};
  tags = [...new Set([...(profile.hashtags?.always || []), ...((profile.hashtags?.pool || []).slice(0, 4))])];
} catch { /* 프로필 없으면 태그 생략 */ }
const caption = [topic.title, topic.subtitle, '', tags.join(' ')].filter(Boolean).join('\n');
const capPath = website ? resolve(website, 'cards', `${date}.caption.txt`) : resolve(ROOT, 'out', `insight-${date}.caption.txt`);
try { writeFileSync(capPath, caption + '\n', 'utf8'); ok(`IG 캡션: ${capPath}`); } catch (e) { warn(`캡션 쓰기 실패: ${e.message}`); }

// 6) (옵션) 웹 레포 커밋/푸시
if (website && argv.includes('--commit')) {
  const root = spawnSync('git', ['-C', website, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout?.trim();
  if (root) {
    execFileSync('git', ['-C', root, 'add', 'web/site/insights'], { stdio: 'pipe' });
    const c = spawnSync('git', ['-C', root, 'commit', '-m', `insight: ${date} ${topic.title}`], { encoding: 'utf8' });
    if (c.status === 0) {
      ok(`웹 레포 커밋: ${date}`);
      if (argv.includes('--push')) {
        const p = spawnSync('git', ['-C', root, 'push'], { encoding: 'utf8' });
        if (p.status === 0) ok('웹 레포 push → Vercel 자동배포');
        else warn(`push 실패 (권한?) — 수동 push 필요: git -C "${root}" push`);
      } else { console.log(dim(`  다음: git -C "${root}" push  (또는 --push)`)); }
    } else { console.log(dim('  커밋할 변경 없음(이미 오늘 카드 있음)')); }
  }
}

console.log('');
ok(`완료 — 카드: ${outPng}`);
console.log(dim('  IG 발행: 위 카드 PNG + 캡션으로 인스타 단일 이미지 포스트 (browser-publish/대시보드).'));
