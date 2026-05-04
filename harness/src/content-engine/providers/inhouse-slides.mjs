// inhouse-slides provider — Claude Vision generates HTML slide → Playwright screenshots it.
// generateCopy delegates to anthropic provider.
// Env: ANTHROPIC_API_KEY (required)
//      ANTHROPIC_SLIDE_MODEL (default: claude-sonnet-4-6)

import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { assertProvider } from '../provider.mjs';
import { provider as anthropic } from './anthropic.mjs';

const KEY         = () => process.env.ANTHROPIC_API_KEY ?? '';
const SLIDE_MODEL = () => process.env.ANTHROPIC_SLIDE_MODEL ?? 'claude-sonnet-4-6';

const DIMENSIONS = {
  portrait:  { width: 1080, height: 1350 },
  square:    { width: 1080, height: 1080 },
  landscape: { width: 1080, height: 566 },
};

const ROLE_INSTRUCTION = {
  hook:   '첫 카드 — 오버사이즈 헤드라인, 스크롤을 멈추게 하는 임팩트.',
  body:   '본문 카드 — 핵심 내용 1가지, 여백 충분히.',
  cta:    '마지막 카드 — 브랜드 컬러 강하게, 행동 유도 문구.',
  single: '단일 카드 — 주제를 한눈에 전달.',
};

function imageBlock(filePath) {
  const ext  = filePath.split('.').pop()?.toLowerCase() ?? 'png';
  const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext] ?? 'image/png';
  const data = readFileSync(filePath).toString('base64');
  return { type: 'image', source: { type: 'base64', media_type: mime, data } };
}

function buildMessages({ copyText, visual, role, cardIndex, cardTotal, topic, sourceMaterials, dim }) {
  const colors  = visual?.colors ?? {};
  const primary = colors.primary    ?? '#0F172A';
  const accent  = colors.accent     ?? '#6366F1';
  const bg      = colors.background ?? '#FFFFFF';
  const font    = visual?.fontFamily ?? 'Pretendard, Apple SD Gothic Neo, sans-serif';

  const roleDesc   = ROLE_INSTRUCTION[role] ?? '카드 슬라이드.';
  const validImages = (sourceMaterials?.images ?? []).filter((p) => existsSync(p)).slice(0, 3);

  const textPrompt = `당신은 SNS 카드뉴스 슬라이드 디자이너입니다.
아래 카피와 브랜드 가이드를 바탕으로 완성된 HTML 파일 하나를 생성하세요.

## 카피
${copyText}

## 브랜드 가이드
- Primary: ${primary}
- Accent:  ${accent}
- Background: ${bg}
- Font: ${font}

## 카드 정보
- 주제: ${topic}
- 역할: ${roleDesc} (${cardIndex}/${cardTotal})
- 크기: ${dim.width}×${dim.height}px
${validImages.length
  ? `- 소재 이미지 ${validImages.length}개 첨부 — 슬라이드의 주요 비주얼로 배치하라.`
  : '- 소재 이미지 없음. 텍스트·컬러 블록 중심 디자인.'}

## HTML 요구사항
1. <html>~</html> 완전한 단일 파일. 외부 URL 참조 금지.
2. font-family: system-ui, ${font} 순서로 지정 (Google Fonts URL 사용 금지).
3. body { margin:0; width:${dim.width}px; height:${dim.height}px; overflow:hidden; }
4. 카피 텍스트 반드시 포함 (읽기 쉬운 크기).
5. 소재 이미지가 있으면 <img src="REPLACE_IMAGE_0"> placeholder를 배치하라 — 실제 src는 나중에 교체됨.
6. 로고: 우하단에 브랜드명 텍스트만 (24px, opacity 0.6).
7. 애니메이션 없음. 인쇄 품질.
8. HTML 코드만 출력. 설명·마크다운 펜스 없음.`;

  const content = [{ type: 'text', text: textPrompt }];
  for (const p of validImages) {
    content.push(imageBlock(p));
  }

  return [{ role: 'user', content }];
}

function injectImages(html, sourceMaterials) {
  const validImages = (sourceMaterials?.images ?? []).filter((p) => existsSync(p)).slice(0, 3);
  let result = html;
  validImages.forEach((p, i) => {
    const ext  = p.split('.').pop()?.toLowerCase() ?? 'png';
    const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext] ?? 'image/png';
    const b64  = readFileSync(p).toString('base64');
    result = result.replaceAll(`REPLACE_IMAGE_${i}`, `data:${mime};base64,${b64}`);
  });
  return result;
}

async function callClaude(messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': KEY(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: SLIDE_MODEL(),
      max_tokens: 4096,
      messages,
    }),
  });
  if (!res.ok) throw new Error(`Claude slide API error: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.content?.[0]?.text?.trim() ?? '';
}

function runScreenshot(htmlPath, outPath, width, height) {
  const bin = resolve(process.cwd(), 'harness/bin/screenshot.mjs');
  execFileSync('node', [bin, `--html=${htmlPath}`, `--out=${outPath}`, `--width=${width}`, `--height=${height}`], { stdio: 'inherit' });
}

export const provider = assertProvider({
  id: 'inhouse-slides',
  byok: true,

  generateCopy: anthropic.generateCopy.bind(anthropic),

  async generateImage({ visual, aspect = 'square', cardText, role = 'single', cardIndex = 1, cardTotal = 1, topic = '', sourceMaterials }) {
    const t0  = Date.now();
    const dim = DIMENSIONS[aspect] ?? DIMENSIONS.square;

    const messages = buildMessages({ copyText: cardText ?? '', visual, role, cardIndex, cardTotal, topic, sourceMaterials, dim });
    let html = await callClaude(messages);

    if (sourceMaterials?.images?.length) {
      html = injectImages(html, sourceMaterials);
    }

    const tmpId  = randomBytes(6).toString('hex');
    const tmpDir = resolve(tmpdir(), 'marketing-agent-slides');
    mkdirSync(tmpDir, { recursive: true });

    const htmlPath = resolve(tmpDir, `slide-${tmpId}.html`);
    const outPath  = resolve(tmpDir, `slide-${tmpId}.png`);
    writeFileSync(htmlPath, html, 'utf8');
    runScreenshot(htmlPath, outPath, dim.width, dim.height);

    return {
      paths: [outPath],
      urls:  [],
      meta:  { provider: 'inhouse-slides', model: SLIDE_MODEL(), latencyMs: Date.now() - t0 },
    };
  },

  healthcheck() {
    if (!KEY()) return { ok: false, reason: 'ANTHROPIC_API_KEY not set' };
    try {
      execFileSync(
        'node',
        ['--input-type=module', '-e', "import 'playwright'"],
        { timeout: 10000, stdio: 'pipe' }
      );
    } catch {
      return { ok: false, reason: 'playwright 패키지 없음 — npm install playwright && npx playwright install chromium' };
    }
    return { ok: true };
  },
});
