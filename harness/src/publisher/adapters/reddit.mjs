// Reddit OAuth2 (script app) adapter.
// 자기 글 자기 서브레딧/커뮤니티에 텍스트(self) 또는 링크 글 올림.
// 이미지는 i.redd.it 업로드(/api/media/asset.json)가 별도 절차라 MVP는 link/self 만.
// Docs: https://www.reddit.com/dev/api/#POST_api_submit
//
// auth/reddit.json:
//   {
//     "clientId": "...",
//     "clientSecret": "...",
//     "username": "...",
//     "password": "...",
//     "userAgent": "marketing_agent/0.9 by <username>",
//     "subreddit": "yourcompany"   // 발행 기본 서브레딧
//   }

import { Buffer } from 'node:buffer';
import { assertAdapter } from '../publisher.mjs';
import { withRetry } from '../retry.mjs';

const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const SUBMIT_URL = 'https://oauth.reddit.com/api/submit';

function buildPayload({ draft }) {
  const url = draft.assetUrls?.[0];
  if (url) return { kind: 'link', title: draft.text?.slice(0, 300), url };
  return { kind: 'self', title: draft.text?.slice(0, 300), text: draft.text };
}

export const adapter = assertAdapter({
  id: 'reddit',
  buildPayload,

  async healthcheck(creds) {
    for (const k of ['clientId', 'clientSecret', 'username', 'password', 'userAgent', 'subreddit']) {
      if (!creds?.[k]) return { ok: false, reason: `missing ${k}` };
    }
    return { ok: true };
  },

  async publish({ draft, credentials }) {
    const c = credentials;
    const basic = Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64');
    const tokenBody = new URLSearchParams({
      grant_type: 'password',
      username: c.username,
      password: c.password,
    });
    const tok = await withRetry(() => fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': c.userAgent,
      },
      body: tokenBody,
    }).then(async (r) => {
      const t = await r.text();
      if (!r.ok) throw new Error(`reddit token HTTP ${r.status}: ${t.slice(0, 200)}`);
      return JSON.parse(t);
    }));
    if (!tok.access_token) throw new Error('reddit token missing: ' + JSON.stringify(tok));

    const url = draft.assetUrls?.[0];
    const params = new URLSearchParams({
      sr: c.subreddit,
      title: (draft.text ?? '').slice(0, 300),
      api_type: 'json',
      ...(url ? { kind: 'link', url } : { kind: 'self', text: draft.text ?? '' }),
    });

    const r = await withRetry(() => fetch(SUBMIT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tok.access_token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': c.userAgent,
      },
      body: params,
    }).then(async (rr) => {
      const t = await rr.text();
      if (!rr.ok) throw new Error(`reddit submit HTTP ${rr.status}: ${t.slice(0, 300)}`);
      return JSON.parse(t);
    }));

    const errs = r?.json?.errors ?? [];
    if (errs.length) throw new Error('reddit submit errors: ' + JSON.stringify(errs));
    const data = r?.json?.data ?? {};
    return {
      ok: true,
      externalId: data.id ?? data.name ?? '',
      url: data.url ?? '',
      raw: r,
    };
  },
});
