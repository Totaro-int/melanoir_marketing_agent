// Provider registry — picks the active provider from env.
// Env: CONTENT_ENGINE_PROVIDER = fal | openai | anthropic | inhouse-slides  (required, no default)

import { provider as openai }        from './providers/openai-images.mjs';
import { provider as fal }           from './providers/fal.mjs';
import { provider as anthropic }     from './providers/anthropic.mjs';
import { provider as inhouseSlides } from './providers/inhouse-slides.mjs';

const ALL = { openai, fal, anthropic, 'inhouse-slides': inhouseSlides };

export function getActiveProviderId() {
  const id = process.env.CONTENT_ENGINE_PROVIDER;
  if (!id) {
    throw new Error(
      'CONTENT_ENGINE_PROVIDER 가 설정되지 않았습니다.\n' +
      '.env.local 에 CONTENT_ENGINE_PROVIDER=fal 을 추가하세요.\n' +
      '지원 값: fal | openai | anthropic | inhouse-slides'
    );
  }
  return id;
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
