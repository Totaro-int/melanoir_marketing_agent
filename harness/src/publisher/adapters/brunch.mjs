// Brunch adapter.
// Brunch (brunch.co.kr) does NOT provide a public publishing API.
// This adapter is a stub that defers to browser-publish.mjs (Playwright/Claude in Chrome)
// for actual publish. Falls back to dry-run if no auth.
//
// Required credentials (auth/brunch.json) — placeholder for future API:
//   {
//     "kakaoEmail": "...",        // Kakao SSO email (browser-publish handles login)
//     "magazineId": "...",        // 매거진 ID (URL의 @author/<id> 안의 매거진)
//     "authorHandle": "..."       // Kakao Brunch author handle
//   }
//
// Note: Like naver-blog/tistory, brunch is a search/editorial blog medium.
// image-director runs in Blog Mode (kind:blog, imageMode: blog-inline).

import { assertAdapter } from '../publisher.mjs';

const PUBLISH_URL_BASE = 'https://brunch.co.kr/publish';

function buildPayload({ draft }) {
  // draft.text: markdown front-matter + body (same convention as naver-blog/tistory)
  const parsed = typeof draft.text === 'string' ? parseDraftText(draft.text) : draft.text;
  return {
    title: parsed.title,
    body: parsed.body,
    tags: parsed.tags ?? [],
    magazine: parsed.magazine ?? null,
  };
}

function parseDraftText(text) {
  if (text.startsWith('---\n')) {
    const end = text.indexOf('\n---\n', 4);
    if (end > 0) {
      const head = text.slice(4, end);
      const body = text.slice(end + 5).trimStart();
      const meta = parseSimpleYaml(head);
      return {
        title: meta.title ?? '',
        body,
        tags: meta.tags ?? [],
        magazine: meta.magazine ?? null,
      };
    }
  }
  const [first, ...rest] = text.split('\n');
  return {
    title: first.replace(/^#+\s*/, '').trim(),
    body: rest.join('\n').trimStart(),
    tags: [],
    magazine: null,
  };
}

function parseSimpleYaml(yaml) {
  const out = {};
  for (const raw of yaml.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.+)$/);
    if (!m) continue;
    const [, key, val] = m;
    if (val.startsWith('[') && val.endsWith(']')) {
      out[key] = val
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else {
      out[key] = val.replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

export const adapter = assertAdapter({
  id: 'brunch',
  buildPayload,

  async healthcheck(creds) {
    if (!creds?.kakaoEmail) return { ok: false, reason: 'missing kakaoEmail (Kakao SSO required)' };
    if (!creds?.magazineId) return { ok: false, reason: 'missing magazineId' };
    return {
      ok: true,
      note: 'Brunch publish runs through browser-publish.mjs (no public API).',
    };
  },

  async publish({ draft, credentials }) {
    const payload = buildPayload({ draft });

    // No public Brunch publish API. We surface a structured payload so
    // browser-publish.mjs (or a manual operator) can use it. Calling this in
    // production raises an error so users opt into browser-publish explicitly.
    throw new Error(
      'brunch adapter: direct publish is not supported (no public API). ' +
      'Use browser-publish.mjs with this payload: ' +
      JSON.stringify({
        title: payload.title,
        magazine: payload.magazine,
        tagCount: payload.tags.length,
        bodyLength: payload.body.length,
        publishUrl: PUBLISH_URL_BASE,
      }),
    );
  },
});
