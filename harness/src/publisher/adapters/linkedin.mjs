// LinkedIn Community Management API adapter (REST Posts).
// Migrated from deprecated v2 UGC Posts API to /rest/posts (2024).
// Docs: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/shares/posts-api
//
// Required credentials (auth/linkedin.json):
//   { "accessToken": "...", "authorUrn": "urn:li:person:<id>" or "urn:li:organization:<id>" }
//
// OAuth scope: w_member_social  (same as before)
// Set LINKEDIN_API_VERSION env var to override the version header (default: 202501).

import { Buffer } from 'node:buffer';
import { assertAdapter } from '../publisher.mjs';
import { withRetry } from '../retry.mjs';

const REST_BASE = 'https://api.linkedin.com/rest';
const LINKEDIN_VERSION = process.env.LINKEDIN_API_VERSION ?? '202501';

function buildPayload({ draft }) {
  const urls = draft.assetUrls ?? [];
  let content;
  if (urls.length === 1) {
    content = { media: { id: '<urn:li:image:PLACEHOLDER>', title: '' } };
  } else if (urls.length > 1) {
    content = { multiImage: { images: urls.map(() => ({ id: '<urn:li:image:PLACEHOLDER>', altText: '' })) } };
  }
  return {
    author: '<authorUrn>',
    commentary: draft.text,
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    ...(content ? { content } : {}),
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };
}

export const adapter = assertAdapter({
  id: 'linkedin',
  buildPayload,

  async healthcheck(creds) {
    if (!creds?.accessToken) return { ok: false, reason: 'missing accessToken' };
    if (!creds?.authorUrn) return { ok: false, reason: 'missing authorUrn (urn:li:person:... or urn:li:organization:...)' };
    return { ok: true };
  },

  async publish({ draft, credentials }) {
    const urls = draft.assetUrls ?? [];

    // Upload each image; collect URNs.
    const imageUrns = [];
    for (const url of urls) {
      const init = await withRetry(() =>
        liPost(
          `${REST_BASE}/images?action=initializeUpload`,
          credentials.accessToken,
          { initializeUploadRequest: { owner: credentials.authorUrn } },
        )
      );
      const uploadUrl = init?.value?.uploadUrl;
      const imageUrn = init?.value?.image;
      if (!uploadUrl || !imageUrn) {
        throw new Error('linkedin initializeUpload missing uploadUrl/image: ' + JSON.stringify(init).slice(0, 300));
      }

      const img = await fetch(url);
      if (!img.ok) throw new Error(`linkedin: failed to fetch source image ${url}: HTTP ${img.status}`);
      const bytes = Buffer.from(await img.arrayBuffer());

      const up = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          'Content-Type': img.headers.get('content-type') ?? 'image/jpeg',
        },
        body: bytes,
      });
      if (!up.ok) throw new Error(`linkedin image upload failed: HTTP ${up.status}`);

      imageUrns.push(imageUrn);
    }

    // Build content block based on image count.
    let content;
    if (imageUrns.length === 1) {
      content = { media: { id: imageUrns[0], title: '' } };
    } else if (imageUrns.length > 1) {
      content = { multiImage: { images: imageUrns.map((id) => ({ id, altText: '' })) } };
    }

    const body = {
      author: credentials.authorUrn,
      commentary: draft.text,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      ...(content ? { content } : {}),
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };

    const json = await withRetry(() => liPost(`${REST_BASE}/posts`, credentials.accessToken, body));
    const urn = json.id ?? '';
    return {
      ok: true,
      externalId: urn,
      url: urn ? `https://www.linkedin.com/feed/update/${urn}/` : '',
      raw: json,
    };
  },
});

async function liPost(url, token, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': LINKEDIN_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  });
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
