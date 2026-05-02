// Threads (Meta) Graph API adapter.
// Two-step publish: create container -> publish container.
// Docs: https://developers.facebook.com/docs/threads
//
// Required credentials (auth/threads.json):
//   { "accessToken": "...", "userId": "<numeric IG/Threads user id>" }

import { assertAdapter } from '../publisher.mjs';

const BASE = 'https://graph.threads.net/v1.0';

function buildPayload({ draft }) {
  return {
    media_type: draft.assets?.length ? (draft.assets.length > 1 ? 'CAROUSEL' : 'IMAGE') : 'TEXT',
    text: draft.text,
    image_count: draft.assets?.length ?? 0,
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

    // Phase 4 scope: text-only and single-image text+image. Carousel/upload of local
    // assets requires hosted public URLs — flagged as TODO when Phase 4.1 takes it on.
    const isImage = draft.assets?.length === 1;
    const createUrl = `${BASE}/${encodeURIComponent(userId)}/threads`;
    const params = new URLSearchParams({
      media_type: isImage ? 'IMAGE' : 'TEXT',
      text: draft.text,
      access_token: accessToken,
    });
    if (isImage) {
      // NOTE: Threads requires a publicly reachable image URL.
      // Local SVG/PNG paths must be uploaded to a CDN first (Phase 4.1).
      throw new Error(
        'threads adapter: image posting needs a public image URL. ' +
        'Phase 4.1 will add a CDN upload step. For now, use --dry-run or remove assets.'
      );
    }

    const created = await fetchJson(createUrl, { method: 'POST', body: params });
    if (!created.id) throw new Error('threads create failed: ' + JSON.stringify(created));

    const publishUrl = `${BASE}/${encodeURIComponent(userId)}/threads_publish`;
    const publishParams = new URLSearchParams({
      creation_id: created.id,
      access_token: accessToken,
    });
    const published = await fetchJson(publishUrl, { method: 'POST', body: publishParams });
    if (!published.id) throw new Error('threads publish failed: ' + JSON.stringify(published));

    return {
      ok: true,
      externalId: published.id,
      url: `https://www.threads.net/@${userId}/post/${published.id}`,
      raw: { created, published },
      attempts: 1,
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
    throw err;
  }
  return json;
}
