// Mastodon API adapter.
// instance + access token 으로 POST /api/v1/statuses.
// 이미지: /api/v2/media 로 업로드 → media_ids[].
// Docs: https://docs.joinmastodon.org/methods/statuses/#create
//
// auth/mastodon.json:
//   { "instance": "https://mastodon.social", "accessToken": "...", "visibility": "public" }

import { Buffer } from 'node:buffer';
import { assertAdapter } from '../publisher.mjs';
import { withRetry } from '../retry.mjs';

function buildPayload({ draft }) {
  return {
    status: draft.text,
    media_ids: (draft.assetUrls ?? []).map(() => '<from /api/v2/media>'),
    visibility: 'public',
  };
}

export const adapter = assertAdapter({
  id: 'mastodon',
  buildPayload,

  async healthcheck(creds) {
    if (!creds?.instance) return { ok: false, reason: 'missing instance (e.g. https://mastodon.social)' };
    if (!creds?.accessToken) return { ok: false, reason: 'missing accessToken' };
    return { ok: true };
  },

  async publish({ draft, credentials }) {
    const base = credentials.instance.replace(/\/$/, '');
    const token = credentials.accessToken;
    const auth = `Bearer ${token}`;

    const mediaIds = [];
    for (const url of draft.assetUrls ?? []) {
      const img = await fetch(url);
      if (!img.ok) throw new Error(`mastodon: 이미지 fetch 실패 ${url}: HTTP ${img.status}`);
      const bytes = Buffer.from(await img.arrayBuffer());
      const fd = new FormData();
      fd.append('file', new Blob([bytes], { type: img.headers.get('content-type') ?? 'image/jpeg' }), 'asset.jpg');
      const r = await withRetry(() => fetch(`${base}/api/v2/media`, {
        method: 'POST', headers: { Authorization: auth }, body: fd,
      }).then(async (rr) => {
        const t = await rr.text();
        if (!rr.ok) throw new Error(`mastodon media HTTP ${rr.status}: ${t.slice(0, 200)}`);
        return JSON.parse(t);
      }));
      if (!r.id) throw new Error('mastodon media missing id: ' + JSON.stringify(r));
      mediaIds.push(r.id);
    }

    const params = new URLSearchParams({
      status: draft.text ?? '',
      visibility: credentials.visibility ?? 'public',
    });
    for (const id of mediaIds) params.append('media_ids[]', id);

    const r = await withRetry(() => fetch(`${base}/api/v1/statuses`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    }).then(async (rr) => {
      const t = await rr.text();
      if (!rr.ok) throw new Error(`mastodon status HTTP ${rr.status}: ${t.slice(0, 300)}`);
      return JSON.parse(t);
    }));

    return { ok: true, externalId: r.id, url: r.url ?? '', raw: r };
  },
});
