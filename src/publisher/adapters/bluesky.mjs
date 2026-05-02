// Bluesky AT Protocol adapter.
// app password 로 createSession → uploadBlob (각 이미지) → createRecord (app.bsky.feed.post).
// Docs: https://docs.bsky.app/docs/advanced-guides/posts
//
// auth/bluesky.json:
//   { "service": "https://bsky.social", "identifier": "<handle 또는 did>", "appPassword": "<app password>" }

import { Buffer } from 'node:buffer';
import { assertAdapter } from '../publisher.mjs';
import { withRetry } from '../retry.mjs';

const BSKY_MAX = 300;

function trim(s) {
  if (!s) return '';
  if (s.length <= BSKY_MAX) return s;
  return s.slice(0, BSKY_MAX - 1) + '…';
}

function buildPayload({ draft }) {
  return {
    text: trim(draft.text),
    embed: draft.assetUrls?.length
      ? { $type: 'app.bsky.embed.images', images: draft.assetUrls.slice(0, 4).map(() => ({ alt: '' })) }
      : undefined,
  };
}

export const adapter = assertAdapter({
  id: 'bluesky',
  buildPayload,

  async healthcheck(creds) {
    if (!creds?.identifier) return { ok: false, reason: 'missing identifier' };
    if (!creds?.appPassword) return { ok: false, reason: 'missing appPassword' };
    return { ok: true };
  },

  async publish({ draft, credentials }) {
    const service = credentials.service ?? 'https://bsky.social';
    const session = await withRetry(() => postJson(`${service}/xrpc/com.atproto.server.createSession`, {
      identifier: credentials.identifier,
      password: credentials.appPassword,
    }));
    if (!session.accessJwt) throw new Error('bluesky session failed: ' + JSON.stringify(session));

    const auth = `Bearer ${session.accessJwt}`;
    const did = session.did;
    const images = [];
    for (const url of (draft.assetUrls ?? []).slice(0, 4)) {
      const img = await fetch(url);
      if (!img.ok) throw new Error(`bluesky: 이미지 fetch 실패 ${url}: HTTP ${img.status}`);
      const bytes = Buffer.from(await img.arrayBuffer());
      const ct = img.headers.get('content-type') ?? 'image/jpeg';
      const up = await withRetry(() => fetch(`${service}/xrpc/com.atproto.repo.uploadBlob`, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': ct },
        body: bytes,
      }).then(async (r) => {
        const t = await r.text();
        if (!r.ok) throw new Error(`bluesky uploadBlob HTTP ${r.status}: ${t.slice(0, 200)}`);
        return JSON.parse(t);
      }));
      if (!up.blob) throw new Error('bluesky uploadBlob missing .blob: ' + JSON.stringify(up));
      images.push({ alt: '', image: up.blob });
    }

    const record = {
      $type: 'app.bsky.feed.post',
      text: trim(draft.text),
      createdAt: new Date().toISOString(),
      ...(images.length ? { embed: { $type: 'app.bsky.embed.images', images } } : {}),
    };

    const r = await withRetry(() => postJson(`${service}/xrpc/com.atproto.repo.createRecord`, {
      repo: did, collection: 'app.bsky.feed.post', record,
    }, auth));
    if (!r.uri) throw new Error('bluesky createRecord failed: ' + JSON.stringify(r));

    const rkey = r.uri.split('/').pop();
    const handle = credentials.identifier.startsWith('did:') ? did : credentials.identifier;
    return {
      ok: true,
      externalId: r.uri,
      url: `https://bsky.app/profile/${handle}/post/${rkey}`,
      raw: r,
    };
  },
});

async function postJson(url, body, auth) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  let json; try { json = JSON.parse(t); } catch { json = { raw: t }; }
  if (!r.ok) {
    const err = new Error(`HTTP ${r.status}: ${t.slice(0, 300)}`);
    err.response = json; err.status = r.status; throw err;
  }
  return json;
}
