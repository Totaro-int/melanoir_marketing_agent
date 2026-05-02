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
  const mediaType = pickMediaType(draft);
  if (mediaType === 'CAROUSEL') {
    return {
      media_type: 'CAROUSEL',
      text: draft.text,
      children: (draft.assetUrls ?? []).map((url) => ({
        media_type: 'IMAGE',
        image_url: url,
        is_carousel_item: true,
      })),
    };
  }
  return {
    media_type: mediaType,
    text: draft.text,
    image_url: mediaType === 'IMAGE' ? draft.assetUrls?.[0] : undefined,
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

    for (const u of draft.assetUrls ?? []) {
      if (!u?.startsWith('http')) throw new Error(`threads adapter: assetUrls must be public https URLs, got ${u}`);
    }

    let creationId;
    let containers = null;
    if (mediaType === 'TEXT' || mediaType === 'IMAGE') {
      const params = new URLSearchParams({
        media_type: mediaType,
        text: draft.text,
        access_token: accessToken,
      });
      if (mediaType === 'IMAGE') params.set('image_url', draft.assetUrls[0]);
      const created = await withRetry(() =>
        fetchJson(`${BASE}/${encodeURIComponent(userId)}/threads`, { method: 'POST', body: params })
      );
      if (!created.id) throw new Error('threads create failed: ' + JSON.stringify(created));
      creationId = created.id;
      if (mediaType === 'IMAGE') await new Promise((res) => setTimeout(res, 1000));
    } else if (mediaType === 'CAROUSEL') {
      // 1) per-item IMAGE containers with is_carousel_item=true
      containers = [];
      for (const url of draft.assetUrls) {
        const itemParams = new URLSearchParams({
          media_type: 'IMAGE',
          image_url: url,
          is_carousel_item: 'true',
          access_token: accessToken,
        });
        const item = await withRetry(() =>
          fetchJson(`${BASE}/${encodeURIComponent(userId)}/threads`, { method: 'POST', body: itemParams })
        );
        if (!item.id) throw new Error('threads carousel item create failed: ' + JSON.stringify(item));
        containers.push(item.id);
      }
      // 2) wait for items, then build CAROUSEL container with children
      await new Promise((res) => setTimeout(res, 1500));
      const carouselParams = new URLSearchParams({
        media_type: 'CAROUSEL',
        text: draft.text,
        children: containers.join(','),
        access_token: accessToken,
      });
      const carousel = await withRetry(() =>
        fetchJson(`${BASE}/${encodeURIComponent(userId)}/threads`, { method: 'POST', body: carouselParams })
      );
      if (!carousel.id) throw new Error('threads carousel create failed: ' + JSON.stringify(carousel));
      creationId = carousel.id;
      await new Promise((res) => setTimeout(res, 1500));
    } else {
      throw new Error(`threads adapter: unsupported media_type ${mediaType}`);
    }

    // Final publish step is the same for all media types.
    const publishParams = new URLSearchParams({
      creation_id: creationId,
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
      raw: { creationId, containers, published },
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
