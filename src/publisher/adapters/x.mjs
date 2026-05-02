// X (Twitter) v2 API adapter.
// Text-only tweet: POST /2/tweets. 이미지는 v1.1 media/upload 후 media_ids 첨부.
// 다중 이미지(2~4) 지원. assetUrls > 1 이면 thread 가 아니라 단일 트윗에 4장까지 첨부.
// Thread (cadence=thread) 는 이번 MVP에서 단일 트윗으로 fold (text 길이 컷).
// Docs: https://docs.x.com/x-api/posts/creation-of-a-post
//
// auth/x.json:
//   { "bearerToken": "<OAuth2 user-context bearer>" }
//   또는
//   { "oauth1": { "consumerKey":"", "consumerSecret":"", "accessToken":"", "accessSecret":"" } }
// MVP는 bearer 만. (이미지 첨부는 OAuth1 필요 — 없으면 텍스트만.)

import { Buffer } from 'node:buffer';
import { createHmac, randomBytes } from 'node:crypto';
import { assertAdapter } from '../publisher.mjs';
import { withRetry } from '../retry.mjs';

const TWEETS = 'https://api.x.com/2/tweets';
const MEDIA = 'https://upload.x.com/1.1/media/upload.json';
const X_MAX = 280;

function trimToLimit(s) {
  if (!s) return '';
  if (s.length <= X_MAX) return s;
  return s.slice(0, X_MAX - 1) + '…';
}

function buildPayload({ draft }) {
  return {
    text: trimToLimit(draft.text),
    media: draft.assetUrls?.length ? { mediaCount: Math.min(4, draft.assetUrls.length) } : undefined,
  };
}

export const adapter = assertAdapter({
  id: 'x',
  buildPayload,

  async healthcheck(creds) {
    if (!creds?.bearerToken && !creds?.oauth1) return { ok: false, reason: 'missing bearerToken or oauth1' };
    if (creds?.assetUrlsExpected && !creds?.oauth1) {
      return { ok: false, reason: 'X 이미지 첨부는 OAuth1 필요 (consumer/access key+secret)' };
    }
    return { ok: true };
  },

  async publish({ draft, credentials }) {
    const text = trimToLimit(draft.text);
    const urls = (draft.assetUrls ?? []).slice(0, 4);
    const mediaIds = [];

    if (urls.length > 0 && !credentials.oauth1) {
      // bearer-only면 이미지 못 올림. 경고 로그 남기고 텍스트만.
      // (조용히 떨어뜨리면 사용자가 왜 이미지 빠졌는지 모름 → 명시적 throw가 안전.)
      throw new Error('x: 이미지 첨부에는 OAuth1 자격증명이 필요합니다. auth/x.json 에 oauth1 추가하세요.');
    }

    for (const url of urls) {
      const img = await fetch(url);
      if (!img.ok) throw new Error(`x: 이미지 fetch 실패 ${url}: HTTP ${img.status}`);
      const bytes = Buffer.from(await img.arrayBuffer());
      const b64 = bytes.toString('base64');
      const params = new URLSearchParams({ media_data: b64 });
      const auth = oauth1Header('POST', MEDIA, {}, credentials.oauth1);
      const r = await withRetry(() => fetch(MEDIA, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      }).then(async (rr) => {
        const t = await rr.text();
        if (!rr.ok) throw new Error(`x media upload HTTP ${rr.status}: ${t.slice(0, 200)}`);
        return JSON.parse(t);
      }));
      if (!r.media_id_string) throw new Error('x media upload missing media_id_string: ' + JSON.stringify(r));
      mediaIds.push(r.media_id_string);
    }

    const body = mediaIds.length
      ? { text, media: { media_ids: mediaIds } }
      : { text };

    const headers = credentials.bearerToken
      ? { Authorization: `Bearer ${credentials.bearerToken}`, 'Content-Type': 'application/json' }
      : { Authorization: oauth1Header('POST', TWEETS, {}, credentials.oauth1), 'Content-Type': 'application/json' };

    const r = await withRetry(() => fetch(TWEETS, {
      method: 'POST', headers, body: JSON.stringify(body),
    }).then(async (rr) => {
      const t = await rr.text();
      if (!rr.ok) throw new Error(`x tweet HTTP ${rr.status}: ${t.slice(0, 300)}`);
      return JSON.parse(t);
    }));

    const id = r?.data?.id;
    if (!id) throw new Error('x tweet response missing id: ' + JSON.stringify(r));
    return { ok: true, externalId: id, url: `https://x.com/i/web/status/${id}`, raw: r };
  },
});

// 최소한의 OAuth1 HMAC-SHA1 시그니처. 외부 의존성 없이 동작.
function oauth1Header(method, url, extraParams, o) {
  if (!o) throw new Error('x: oauth1 자격증명 없음');
  const oauth = {
    oauth_consumer_key: o.consumerKey,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: o.accessToken,
    oauth_version: '1.0',
  };
  const all = { ...extraParams, ...oauth };
  const enc = (s) => encodeURIComponent(s).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  const paramStr = Object.keys(all).sort().map((k) => `${enc(k)}=${enc(all[k])}`).join('&');
  const baseStr = [method.toUpperCase(), enc(url), enc(paramStr)].join('&');
  const signingKey = `${enc(o.consumerSecret)}&${enc(o.accessSecret)}`;
  const sig = createHmac('sha1', signingKey).update(baseStr).digest('base64');
  const header = 'OAuth ' + Object.entries({ ...oauth, oauth_signature: sig })
    .map(([k, v]) => `${enc(k)}="${enc(v)}"`).join(', ');
  return header;
}
