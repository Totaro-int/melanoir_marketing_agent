// Provider registry — picks the active provider from env.
// Env: CONTENT_ENGINE_PROVIDER = inhouse-slides (default) | fal | openai | anthropic
// inhouse-slides: Claude가 HTML 카드뉴스 생성 → Playwright 캡쳐. API 키 불필요.
// fal / openai: AI 이미지 생성 (선택). 각각 FAL_KEY / OPENAI_API_KEY 필요.

import { provider as openai }        from './providers/openai-images.mjs';
import { provider as fal }           from './providers/fal.mjs';
import { provider as anthropic }     from './providers/anthropic.mjs';
import { provider as inhouseSlides } from './providers/inhouse-slides.mjs';
import { provider as mock }          from './providers/mock.mjs';

const ALL = { openai, fal, anthropic, 'inhouse-slides': inhouseSlides, mock };

export function getActiveProviderId() {
  return process.env.CONTENT_ENGINE_PROVIDER || 'inhouse-slides';
}

export function getProvider(id = getActiveProviderId()) {
  const p = ALL[id];
  if (!p) {
    const known = Object.keys(ALL).join(', ');
    throw new Error(`알 수 없는 provider "${id}". 지원 값: ${known}`);
  }
  const hc = p.healthcheck();
  if (!hc.ok) {
    throw new Error(`[content-engine] ${id} API 키 미설정 — ${hc.reason}`);
  }
  return p;
}

export function listProviders() {
  return Object.entries(ALL).map(([id, p]) => ({
    id,
    byok: p.byok,
    health: p.healthcheck(),
  }));
}
