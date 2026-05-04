// inhouse-slides provider — Claude 에이전트에 위임, 직접 API 호출 없음.
// 카피·HTML 생성: image-director 에이전트가 slide-spec.json 을 읽고 처리.
// 캡쳐: generate.mjs --finalize 가 Playwright 로 screenshot.
// Env: 없음 (Playwright 설치 여부만 확인)

import { execFileSync } from 'node:child_process';
import { assertProvider } from '../provider.mjs';

export const DIMENSIONS = {
  portrait:  { width: 1080, height: 1350 },
  square:    { width: 1080, height: 1080 },
  landscape: { width: 1080, height: 566  },
};

export const ROLE_INSTRUCTION = {
  hook:   '첫 카드 — 오버사이즈 헤드라인, 스크롤을 멈추게 하는 임팩트.',
  body:   '본문 카드 — 핵심 내용 1가지, 여백 충분히.',
  cta:    '마지막 카드 — 브랜드 컬러 강하게, 행동 유도 문구.',
  single: '단일 카드 — 주제를 한눈에 전달.',
};

export const provider = assertProvider({
  id: 'inhouse-slides',
  byok: false,

  async generateCopy() {
    throw new Error(
      'inhouse-slides: generateCopy 는 직접 호출하지 않습니다.\n' +
      'generate.mjs 가 slide-spec.json 을 작성하면 image-director 에이전트가 처리합니다.'
    );
  },

  async generateImage() {
    throw new Error(
      'inhouse-slides: generateImage 는 직접 호출하지 않습니다.\n' +
      'generate.mjs --finalize 로 Playwright 캡쳐를 실행하세요.'
    );
  },

  healthcheck() {
    try {
      execFileSync(
        'node',
        ['--input-type=module', '-e', "import 'playwright'"],
        { timeout: 10_000, stdio: 'pipe' }
      );
    } catch {
      return {
        ok: false,
        reason: 'playwright 패키지 없음 — npm install playwright && npx playwright install chromium',
      };
    }
    return { ok: true };
  },
});
