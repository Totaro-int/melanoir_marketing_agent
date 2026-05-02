// Pinterest API v5 adapter.
// 이미지 1장 + 보드 지정으로 핀 생성. 캐러셀은 v5 carousel item 지원하지만 MVP는 single image.
// Docs: https://developers.pinterest.com/docs/api/v5/pins/
//
// auth/pinterest.json:
//   { "accessToken": "<OAuth2 access token>", "boardId": "<numeric board id>" }

import { assertAdapter } from '../publisher.mjs';
import { withRetry } from '../retry.mjs';

const BASE = 'https://api.pinterest.com/v5';

function buildPayload({ draft }) {
  const u = draft.assetUrls?.[0];
  return {
    title: (draft.text ?? '').slice(0, 100),
    description: draft.text,
    media_source: u
      ? { source_type: 'image_url', url: u }
      : { error: 'pinterest: requires at least 1 image (assetUrls[0])' },
  };
}

export const adapter = assertAdapter({
  id: 'pinterest',
  buildPayload,

  async healthcheck(creds) {
    if (!creds?.accessToken) return { ok: false, reason: 'missing accessToken' };
    if (!creds?.boardId) return { ok: false, reason: 'missing boardId' };
    return { ok: true };
  },

  async publish({ draft, credentials }) {
    const u = draft.assetUrls?.[0];
    if (!u) throw new Error('pinterest: assetUrls 비어있음. 이미지 1장 필요.');

    const body = {
      board_id: credentials.boardId,
      title: (draft.text ?? '').slice(0, 100),
      description: draft.text ?? '',
      media_source: { source_type: 'image_url', url: u },
    };

    const r = await withRetry(() => fetch(`${BASE}/pins`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }).then(async (rr) => {
      const t = await rr.text();
      if (!rr.ok) throw new Error(`pinterest pin HTTP ${rr.status}: ${t.slice(0, 300)}`);
      return JSON.parse(t);
    }));

    return {
      ok: true,
      externalId: r.id,
      url: r.id ? `https://www.pinterest.com/pin/${r.id}/` : '',
      raw: r,
    };
  },
});
