// Instagram Graph API adapter (IG Business / Creator account 필요).
// 2-step: media container → media_publish. CAROUSEL_ALBUM 은 children 컨테이너 묶음.
// Docs: https://developers.facebook.com/docs/instagram-api/guides/content-publishing
//
// auth/instagram.json:
//   { "accessToken": "<long-lived page token>", "igUserId": "<numeric ig business account id>" }

import { assertAdapter } from '../publisher.mjs';
import { withRetry } from '../retry.mjs';

const BASE = 'https://graph.facebook.com/v21.0';

function pickType(draft) {
  const n = draft.assetUrls?.length ?? 0;
  if (n === 0) return 'TEXT_UNSUPPORTED'; // IG는 캡션만은 발행 못 함
  if (n === 1) return 'IMAGE';
  return 'CAROUSEL';
}

function buildPayload({ draft }) {
  const t = pickType(draft);
  if (t === 'TEXT_UNSUPPORTED') {
    return { error: 'instagram requires at least 1 image (assetUrls)', caption: draft.text };
  }
  if (t === 'CAROUSEL') {
    return {
      media_type: 'CAROUSEL',
      caption: draft.text,
      children: (draft.assetUrls ?? []).map((u) => ({ image_url: u, is_carousel_item: true })),
    };
  }
  return { image_url: draft.assetUrls?.[0], caption: draft.text };
}

export const adapter = assertAdapter({
  id: 'instagram',
  buildPayload,

  async healthcheck(creds) {
    if (!creds?.accessToken) return { ok: false, reason: 'missing accessToken' };
    if (!creds?.igUserId) return { ok: false, reason: 'missing igUserId (IG Business account id)' };
    return { ok: true };
  },

  async publish({ draft, credentials }) {
    const { accessToken, igUserId } = credentials;
    const t = pickType(draft);
    if (t === 'TEXT_UNSUPPORTED') {
      throw new Error('instagram: assetUrls 가 비어있음. IG는 이미지/영상 1개 이상 필요.');
    }
    for (const u of draft.assetUrls ?? []) {
      if (!u?.startsWith('http')) throw new Error(`instagram: assetUrls must be public https URLs, got ${u}`);
    }

    let creationId;
    if (t === 'IMAGE') {
      const params = new URLSearchParams({
        image_url: draft.assetUrls[0],
        caption: draft.text ?? '',
        access_token: accessToken,
      });
      const c = await withRetry(() =>
        fetchJson(`${BASE}/${encodeURIComponent(igUserId)}/media`, { method: 'POST', body: params })
      );
      if (!c.id) throw new Error('instagram media create failed: ' + JSON.stringify(c));
      creationId = c.id;
    } else {
      const childIds = [];
      for (const url of draft.assetUrls) {
        const p = new URLSearchParams({
          image_url: url,
          is_carousel_item: 'true',
          access_token: accessToken,
        });
        const child = await withRetry(() =>
          fetchJson(`${BASE}/${encodeURIComponent(igUserId)}/media`, { method: 'POST', body: p })
        );
        if (!child.id) throw new Error('instagram carousel child failed: ' + JSON.stringify(child));
        childIds.push(child.id);
      }
      const carouselParams = new URLSearchParams({
        media_type: 'CAROUSEL',
        caption: draft.text ?? '',
        children: childIds.join(','),
        access_token: accessToken,
      });
      const c = await withRetry(() =>
        fetchJson(`${BASE}/${encodeURIComponent(igUserId)}/media`, { method: 'POST', body: carouselParams })
      );
      if (!c.id) throw new Error('instagram carousel create failed: ' + JSON.stringify(c));
      creationId = c.id;
    }

    await new Promise((r) => setTimeout(r, 2000)); // IG 미디어 처리 짧은 대기

    const pub = new URLSearchParams({ creation_id: creationId, access_token: accessToken });
    const published = await withRetry(() =>
      fetchJson(`${BASE}/${encodeURIComponent(igUserId)}/media_publish`, { method: 'POST', body: pub })
    );
    if (!published.id) throw new Error('instagram publish failed: ' + JSON.stringify(published));

    return {
      ok: true,
      externalId: published.id,
      url: `https://www.instagram.com/p/${published.id}/`,
      raw: { creationId, published },
    };
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
