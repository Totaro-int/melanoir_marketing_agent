#!/usr/bin/env node
// insight-card.mjs — 데일리 인사이트 카드(카드레터) 생성 + (선택)웹 발행.
//
// 클라 사진 1장 + 인사이트 텍스트 → 카드레터 이미지(사진 풀블리드 + 텍스트 오버레이).
// 고정 레이아웃이라 결정론적 — LLM/서브에이전트 불필요. cron/morning 에서 바로 호출 가능.
// (이미지 소스 = 클라가 제공한 사진 풀. 에이전트는 텍스트만 오버레이.)
//
// 브랜드 정체성(핸들·워드마크·폰트·컬러)은 company-profile.yaml 에서 자동으로 읽는다.
// = 클라가 브랜드 지침을 posts/sources/ 에 넣고 /sns-onboard 로 profile 에 반영 → 카드가 그 브랜드로.
//
// Usage:
//   node harness/bin/insight-card.mjs --title="..." [--subtitle=] [--category=] \
//        (--photo=<사진 경로> | --photo-dir=<클라 사진 풀 폴더>) [--date=YYYY-MM-DD] [--out=<png>] \
//        [--website=<.../web/site/insights 경로>]   # 주면 그 사이트에 발행(cards/<date>.png + cards.json)
//   브랜드 override(보통 불필요 — profile 에서 자동): [--brand=] [--wordmark=] [--handle=@x] [--font=] [--base-color=#hex]
//
// 출력: 카드 PNG (1080x1350, IG 포트레이트 4:5). --website 주면 사이트 insights/ 에도 기록.

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { resolve, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const HARNESS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(HARNESS_ROOT, '..');
const argv = process.argv.slice(2);
const flag = (n, d) => {
  const hit = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (!hit) return d;
  if (hit === `--${n}`) return true;
  return hit.split('=').slice(1).join('=');
};

const title = flag('title');
if (!title) { console.error('❌ --title 필수. 예: --title="색소 안전성은 데이터로 증명한다"'); process.exit(2); }
const subtitle = flag('subtitle', '');
const category = flag('category', '');
const W = Number(flag('width', 1080));
const H = Number(flag('height', 1350));

// ── 브랜드 정체성 — company-profile.yaml(브랜드 지침 distill 결과)에서 읽고 --flag 로 override ──
// 클라이언트는 브랜드 지침(브랜드북 PDF 등)을 posts/sources/ 에 넣고 /sns-onboard 로 profile 에 반영.
// 그러면 핸들·워드마크·폰트·컬러가 그 브랜드에 맞게 자동 적용된다(멜라누아 하드코딩 X).
let _profile = {};
try {
  const { PATHS, readYaml } = await import('./_lib.mjs');
  if (existsSync(PATHS.profile)) _profile = readYaml(PATHS.profile) || {};
} catch { /* 프로필 없으면 아래 기본값 */ }
const brandName = String(flag('brand', _profile.brand?.name || 'Brand'));
const wordmark = String(flag('wordmark', brandName)).toUpperCase();
const handle = flag('handle', '@' + brandName.toLowerCase().replace(/[^a-z0-9_.]/g, ''));
const fontStack = flag('font', _profile.visual?.fonts?.heading
  ? `${_profile.visual.fonts.heading}, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif`
  : '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif');
const baseColor = String(flag('base-color', _profile.visual?.colors?.secondary || _profile.visual?.colors?.primary || '#0a0a0c'));
const topColor = lightenHex(baseColor, 28);

// 날짜 (KST local 컴포넌트 — toISOString UTC 롤백 방지)
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
const date = flag('date') || todayStr();

// ── 사진 결정: --photo 명시, 또는 --photo-dir 에서 날짜로 회전 선택 ──────────────
let photo = flag('photo');
const photoDir = flag('photo-dir');
if (!photo && photoDir) {
  if (!existsSync(photoDir)) { console.error(`❌ --photo-dir 없음: ${photoDir}`); process.exit(2); }
  const pics = readdirSync(photoDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
  if (!pics.length) { console.error(`❌ 사진 풀이 비었음: ${photoDir}`); process.exit(2); }
  // 날짜 기반 회전 — 같은 날 = 같은 사진(결정론적), 매일 다음 사진.
  const idx = Math.abs([...date].reduce((a, c) => a + c.charCodeAt(0), 0)) % pics.length;
  photo = resolve(photoDir, pics[idx]);
}
if (photo && !existsSync(photo)) { console.error(`❌ --photo 없음: ${photo}`); process.exit(2); }

// ── 카드레터 HTML (고정 레이아웃: 사진 풀블리드 + 하단 스크림 + 텍스트 오버레이) ──
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function lightenHex(hex, amt) { // 폴백 그라디언트 상단색 — 브랜드 base 를 amt 만큼 밝게
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex).trim());
  if (!m) return '#2a2a30';
  const n = parseInt(m[1], 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.min(255, v + amt));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
function photoCss() {
  if (!photo) return `background:radial-gradient(120% 120% at 30% 18%, ${topColor} 0%, ${baseColor} 70%);`; // 사진 없을 때 브랜드 모노톤 폴백
  const b64 = readFileSync(photo).toString('base64');
  const mime = extname(photo).toLowerCase() === '.png' ? 'image/png' : extname(photo).toLowerCase() === '.webp' ? 'image/webp' : 'image/jpeg';
  return `background-image:url('data:${mime};base64,${b64}');background-size:cover;background-position:center;`;
}
const titleSize = title.length > 28 ? 64 : title.length > 16 ? 76 : 88; // 길이 적응형
const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${W}px; height:${H}px; }
  .card { position:relative; width:${W}px; height:${H}px; overflow:hidden;
          font-family:${fontStack};
          color:#fff; ${photoCss()} }
  .scrim { position:absolute; inset:0;
           background:linear-gradient(180deg, rgba(0,0,0,.30) 0%, rgba(0,0,0,0) 32%, rgba(0,0,0,.78) 100%); }
  .pad { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:space-between; padding:72px 72px 80px; }
  .handle { font-weight:700; letter-spacing:.10em; text-transform:uppercase; font-size:32px;
            text-shadow:0 2px 8px rgba(0,0,0,.55); }
  .foot { display:flex; flex-direction:column; gap:18px; }
  .eyebrow { align-self:flex-start; font-size:26px; font-weight:600; letter-spacing:.06em;
             padding:8px 18px; border-radius:10px; background:rgba(255,255,255,.16);
             backdrop-filter:blur(6px); text-shadow:0 1px 4px rgba(0,0,0,.4); }
  .title { font-size:${titleSize}px; font-weight:800; line-height:1.18; letter-spacing:-.02em;
           text-shadow:0 3px 14px rgba(0,0,0,.6); word-break:keep-all; }
  .sub { font-size:34px; font-weight:500; line-height:1.4; opacity:.94; text-shadow:0 2px 8px rgba(0,0,0,.55); }
  .mark { position:absolute; left:0; right:0; bottom:34px; text-align:center;
          font-size:22px; letter-spacing:.34em; font-weight:600; opacity:.62; text-transform:uppercase; }
</style></head><body><div class="card"><div class="scrim"></div>
  <div class="pad">
    <div class="handle">${esc(handle)}</div>
    <div class="foot">
      ${category ? `<span class="eyebrow">${esc(category)}</span>` : ''}
      <h1 class="title">${esc(title)}</h1>
      ${subtitle ? `<p class="sub">${esc(subtitle)}</p>` : ''}
    </div>
  </div>
  <div class="mark">${esc(wordmark)}</div>
</div></body></html>`;

// ── 렌더 (screenshot.mjs = Playwright HTML→PNG 재사용) ──────────────────────────
const tmp = resolve(tmpdir(), 'mkt-insight');
mkdirSync(tmp, { recursive: true });
const htmlPath = resolve(tmp, `insight-${date}.html`);
writeFileSync(htmlPath, html, 'utf8');
const out = flag('out') || resolve(ROOT, 'out', `insight-${date}.png`);
mkdirSync(dirname(out), { recursive: true });
try {
  execFileSync('node', [resolve(HARNESS_ROOT, 'bin/screenshot.mjs'), `--html=${htmlPath}`, `--out=${out}`, `--width=${W}`, `--height=${H}`], { stdio: 'pipe' });
} catch (e) {
  console.error(`❌ 렌더 실패 (Playwright Chromium 확인: npx playwright install chromium): ${e.message}`);
  process.exit(1);
}
console.log(`✅ 카드레터 생성: ${out}  (${W}x${H}${photo ? ', 사진: ' + basename(photo) : ', 사진 없음→모노톤 폴백'})`);

// ── (선택) 웹사이트 insights/ 에 발행 ───────────────────────────────────────────
const website = flag('website');
if (website) {
  if (!existsSync(website)) { console.error(`⚠ --website 경로 없음: ${website} — 카드만 생성하고 발행 skip`); process.exit(0); }
  const cardsDir = resolve(website, 'cards');
  mkdirSync(cardsDir, { recursive: true });
  const imgName = `${date}.png`;
  copyFileSync(out, resolve(cardsDir, imgName));
  const cardsJson = resolve(website, 'cards.json');
  let list = [];
  try { list = JSON.parse(readFileSync(cardsJson, 'utf8')); } catch { list = []; }
  list = list.filter((c) => c.date !== date); // 같은 날 재발행 시 교체
  list.unshift({ date, category, handle, title, subtitle, image: imgName, link: '' });
  writeFileSync(cardsJson, JSON.stringify(list, null, 2) + '\n', 'utf8');
  console.log(`✅ 사이트 발행: ${resolve(cardsDir, imgName)} + cards.json (${list.length}장)`);
  console.log(`   다음: 그 레포에서  git add web/site/insights  &&  git commit  &&  git push  (Vercel 자동배포)`);
}
