// LinkedIn UGC Posts adapter (text-only in Phase 4; image upload in 4.1).
// Docs: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/shares/ugc-post-api
//
// Required credentials (auth/linkedin.json):
//   { "accessToken": "...", "authorUrn": "urn:li:person:<id>" or "urn:li:organization:<id>" }

import { assertAdapter } from '../publisher.mjs';

const BASE = 'https://api.linkedin.com/v2';

function buildPayload({ draft }) {
  return {
    author: '<authorUrn>',
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: draft.text },
        shareMediaCategory: 'NONE',
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
    if (draft.assets?.length) {
      // Image/document share needs register-upload + asset URN; deferred to Phase 4.1.
      throw new Error(
        'linkedin adapter: image posting requires register-upload step (Phase 4.1). ' +
        'For now, use --dry-run or generate a text-only draft.'
      );
    }

    const body = buildPayload({ draft });
    body.author = credentials.authorUrn;

    const r = await fetch(`${BASE}/ugcPosts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
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
      throw err;
    }

    // LinkedIn returns the new urn in `id` (e.g. urn:li:share:6800000000000000000)
    const urn = json.id ?? '';
    const numeric = (urn.match(/(\d+)$/) || [])[1];
    return {
      ok: true,
      externalId: urn,
      url: numeric ? `https://www.linkedin.com/feed/update/${urn}/` : '',
      raw: json,
      attempts: 1,
    };
  },
});
