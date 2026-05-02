// In-house provider stub — placeholder for the future Upflow content API gateway.
// Wired so the registry can route to it, but every method returns a sentinel error
// asking the caller to set CONTENT_ENGINE_PROVIDER=mock or supply BYO keys.

import { assertProvider } from '../provider.mjs';

const NOT_READY = new Error(
  'inhouse provider is not yet wired (Phase 4+). ' +
  'Set CONTENT_ENGINE_PROVIDER=mock for now, or configure a BYO provider (openai-images / fal / replicate).'
);

export const provider = assertProvider({
  id: 'inhouse',
  byok: false,
  async generateCopy() { throw NOT_READY; },
  async generateImage() { throw NOT_READY; },
  healthcheck() { return { ok: false, reason: 'inhouse gateway not configured' }; },
});
