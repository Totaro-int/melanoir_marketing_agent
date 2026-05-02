// Threads (Meta) Graph API adapter.
// Two-step publish: create container -> publish container.
// Docs: https://developers.facebook.com/docs/threads
//
// Required credentials (auth/threads.json):
//   { "accessToken": "...", "userId": "<numeric IG/Threads user id>" }

import { assertAdapter } from '../publisher.mjs';
import { withRetry } from '../retry.mjs';

const BASE = 'https://graph.threads.net/v1.0';

function pickMediaType(draft) {
  const n = draft.assetUrls?.length ?? 0;
  if (n === 0) return 'TEXT';
  if (n === 1) return 'IMAGE';
  return 'CAROUSEL';
}

function buildPayload({ draft }) {
  return {
    media_type: pickMediaType(draft),
    text: draft.text,
    image_urls: draft.assetUrls ?? [],
  };
}

export const adapter = assertAdapter({
  id: 'threads',
  buildPayload,

  async healthcheck(creds) {
    if (!creds?.accessToken) return { ok: false, reason: 'missing accessToken' };
    if (!creds?.userId) return { ok: false, reason: 'missing userId' };
    return { ok: true };
  },

  async publish({ draft, credentials }) {
    const { accessToken, userId } = credentials;
    const mediaType = pickMediaType(draft);

    // Carousel needs per-item containers + parent CAROUSEL container.
    // Phase 4.1 ships TEXT and single-IMAGE; carousel is staged for Phase 4.2.
    if (mediaType === 'CAROUSEL') {
      throw new Error('threads adapter: CAROUSEL is Phase 4.2. Reduce to 1 image or none for now.');
    }

    if (mediaType === 'IMAGE' && !draft.assetUrls?.[0]?.startsWith('http')) {
      throw new Error('threads adapter: assetUrls[0] must be a public https URL (use the fal provider).');
    }

    // Step 1: create media container.
    const createParams = new URLSearchParams({
      media_type: mediaType,
      text: draft.text,
      access_token: accessToken,
    });
    if (mediaType === 'IMAGE') createParams.set('image_url', draft.assetUrls[0]);

    const created = await withRetry(() =>
      fetchJson(`${BASE}/${encodeURIComponent(userId)}/threads`, { method: 'POST', body: createParams })
    );
    if (!created.id) throw new Error('threads create failed: ' + JSON.stringify(created));

    // Step 2: publish container. (Meta recommends a small wait when media is included.)
    if (mediaType === 'IMAGE') await new Promise((res) => setTimeout(res, 1000));
    const publishParams = new URLSearchParams({
      creation_id: created.id,
      access_token: accessToken,
    });
    const published = await withRetry(() =>
      fetchJson(`${BASE}/${encodeURIComponent(userId)}/threads_publish`, { method: 'POST', body: publishParams })
    );
    if (!published.id) throw new Error('threads publish failed: ' + JSON.stringify(published));

    return {
      ok: true,
      externalId: published.id,
      url: `https://www.threads.net/@${userId}/post/${published.id}`,
      raw: { created, published },
    };
  },
});

async function fetchJson(url, init) {
  const r = await fetch(url, init);
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!r.ok) {
    const err = new Error(`HTTP ${r.status}: ${text.slice(0, 300)}`);
    err.response = json;
    err.status = r.status;
    throw err;
  }
  return json;
}
