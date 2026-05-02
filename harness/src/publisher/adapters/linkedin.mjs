// LinkedIn UGC Posts adapter.
// Text + single image (via register-upload + IMAGE share). Carousels/PDFs in Phase 4.2.
// Docs: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/shares/ugc-post-api
//
// Required credentials (auth/linkedin.json):
//   { "accessToken": "...", "authorUrn": "urn:li:person:<id>" or "urn:li:organization:<id>" }

import { Buffer } from 'node:buffer';
import { assertAdapter } from '../publisher.mjs';
import { withRetry } from '../retry.mjs';

const BASE = 'https://api.linkedin.com/v2';

function pickShareMediaCategory(draft) {
  return draft.assetUrls?.length ? 'IMAGE' : 'NONE';
}

function buildPayload({ draft }) {
  return {
    author: '<authorUrn>',
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: draft.text },
        shareMediaCategory: pickShareMediaCategory(draft),
        media: (draft.assetUrls ?? []).map((u) => ({ status: 'READY', originalUrl: u })),
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
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
    const hasImage = urls.length > 0;

    // Each image needs its own register-upload + bytes PUT, then we collect the
    // resulting asset URNs into a single ugcPosts media[] array.
    const mediaEntries = [];
    for (const url of urls) {
      const reg = await withRetry(() =>
        liPost(`${BASE}/assets?action=registerUpload`, credentials.accessToken, {
          registerUploadRequest: {
            recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
            owner: credentials.authorUrn,
            serviceRelationships: [{
              relationshipType: 'OWNER',
              identifier: 'urn:li:userGeneratedContent',
            }],
          },
        })
      );
      const uploadUrl = reg?.value?.uploadMechanism?.[
        'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
      ]?.uploadUrl;
      const asset = reg?.value?.asset;
      if (!uploadUrl || !asset) throw new Error('linkedin register-upload missing uploadUrl/asset: ' + JSON.stringify(reg).slice(0, 300));

      const img = await fetch(url);
      if (!img.ok) throw new Error(`linkedin: failed to fetch source image ${url}: HTTP ${img.status}`);
      const bytes = Buffer.from(await img.arrayBuffer());
      const up = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
        body: bytes,
      });
      if (!up.ok) throw new Error('linkedin upload failed: HTTP ' + up.status);

      mediaEntries.push({ status: 'READY', media: asset });
    }

    const body = {
      author: credentials.authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: draft.text },
          shareMediaCategory: hasImage ? 'IMAGE' : 'NONE',
          media: mediaEntries,
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    };

    const json = await withRetry(() => liPost(`${BASE}/ugcPosts`, credentials.accessToken, body));
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
