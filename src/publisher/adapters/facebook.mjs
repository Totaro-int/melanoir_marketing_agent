// Facebook Page Graph API adapter.
// 텍스트: /{page-id}/feed, 이미지 1장: /{page-id}/photos, 다중 이미지: 각 photo unpublished → /feed attached_media[]
// Docs: https://developers.facebook.com/docs/pages-api/posts
//
// auth/facebook.json:
//   { "pageAccessToken": "<page token>", "pageId": "<numeric page id>" }

import { assertAdapter } from '../publisher.mjs';
import { withRetry } from '../retry.mjs';

const BASE = 'https://graph.facebook.com/v21.0';

function buildPayload({ draft }) {
  const n = draft.assetUrls?.length ?? 0;
  if (n === 0) return { endpoint: 'feed', message: draft.text };
  if (n === 1) return { endpoint: 'photos', url: draft.assetUrls[0], caption: draft.text };
  return {
    endpoint: 'feed',
    message: draft.text,
    attached_media: draft.assetUrls.map((u) => ({ media_fbid: '<from photos?published=false>', sourceUrl: u })),
  };
}

export const adapter = assertAdapter({
  id: 'facebook',
  buildPayload,

  async healthcheck(creds) {
    if (!creds?.pageAccessToken) return { ok: false, reason: 'missing pageAccessToken' };
    if (!creds?.pageId) return { ok: false, reason: 'missing pageId' };
    return { ok: true };
  },

  async publish({ draft, credentials }) {
    const { pageAccessToken: token, pageId } = credentials;
    const urls = draft.assetUrls ?? [];

    if (urls.length === 0) {
      const params = new URLSearchParams({ message: draft.text ?? '', access_token: token });
      const r = await withRetry(() =>
        fetchJson(`${BASE}/${encodeURIComponent(pageId)}/feed`, { method: 'POST', body: params })
      );
      if (!r.id) throw new Error('facebook feed create failed: ' + JSON.stringify(r));
      return { ok: true, externalId: r.id, url: `https://www.facebook.com/${r.id}`, raw: r };
    }

    if (urls.length === 1) {
      const params = new URLSearchParams({
        url: urls[0],
        caption: draft.text ?? '',
        access_token: token,
      });
      const r = await withRetry(() =>
        fetchJson(`${BASE}/${encodeURIComponent(pageId)}/photos`, { method: 'POST', body: params })
      );
      if (!r.id) throw new Error('facebook photo failed: ' + JSON.stringify(r));
      return { ok: true, externalId: r.post_id ?? r.id, url: `https://www.facebook.com/${r.post_id ?? r.id}`, raw: r };
    }

    // 다중: 각 photo published=false 로 올린 뒤 /feed 의 attached_media 로 묶음
    const fbids = [];
    for (const u of urls) {
      const p = new URLSearchParams({
        url: u, published: 'false', access_token: token,
      });
      const r = await withRetry(() =>
        fetchJson(`${BASE}/${encodeURIComponent(pageId)}/photos`, { method: 'POST', body: p })
      );
      if (!r.id) throw new Error('facebook child photo failed: ' + JSON.stringify(r));
      fbids.push(r.id);
    }
    const attached = fbids.map((id) => `{"media_fbid":"${id}"}`).join(',');
    const feedParams = new URLSearchParams({
      message: draft.text ?? '',
      attached_media: `[${attached}]`,
      access_token: token,
    });
    const r = await withRetry(() =>
      fetchJson(`${BASE}/${encodeURIComponent(pageId)}/feed`, { method: 'POST', body: feedParams })
    );
    if (!r.id) throw new Error('facebook multi-photo feed failed: ' + JSON.stringify(r));
    return { ok: true, externalId: r.id, url: `https://www.facebook.com/${r.id}`, raw: { fbids, feed: r } };
  },
});

async function fetchJson(url, init) {
  const r = await fetch(url, init);
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!r.ok) {
    const err = new Error(`HTTP ${r.status}: ${text.slice(0, 300)}`);
    err.response = json; err.status = r.status; throw err;
  }
  return json;
}
