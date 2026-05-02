// Provider registry — picks the active provider from env, with a safe mock fallback.
// Env: CONTENT_ENGINE_PROVIDER = mock | openai | fal | inhouse  (default: mock)

import { provider as mock } from './providers/mock.mjs';
import { provider as openai } from './providers/openai-images.mjs';
import { provider as fal } from './providers/fal.mjs';
import { provider as inhouse } from './providers/inhouse.mjs';

const ALL = { mock, openai, fal, inhouse };

export function getProvider(id = process.env.CONTENT_ENGINE_PROVIDER ?? 'mock') {
  const p = ALL[id];
  if (!p) {
    const known = Object.keys(ALL).join(', ');
    throw new Error(`Unknown provider "${id}". Known: ${known}`);
  }
  const hc = p.healthcheck();
  if (!hc.ok) {
    if (id !== 'mock') {
      console.warn(`[content-engine] ${id} unhealthy (${hc.reason}). Falling back to mock.`);
      return mock;
    }
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
