// Naver Blog adapter.
// Naver blog publishes via the OpenAPI Blog Write endpoint (OAuth2).
// Docs: https://developers.naver.com/docs/blog/api/
//
// Required credentials (auth/naver-blog.json):
//   {
//     "accessToken": "...",        // OAuth2 access token (Naver Login)
//     "blogId": "your_blog_id",    // 네이버 블로그 ID (URL의 .blog.naver.com 앞부분)
//     "categoryNo": 0              // 선택 — 분류 카테고리 번호 (기본 0)
//   }
//
// Note: Unlike SNS channels, naver-blog payload is title + content (HTML/markdown) + tags.
// Card image attachments are optional and not part of the core flow (image-director is skipped per channels.json).

import { assertAdapter } from '../publisher.mjs';
import { withRetry } from '../retry.mjs';

const BASE = 'https://openapi.naver.com/blog';

function buildPayload({ draft }) {
  // draft.text expects: { title, body, tags? }
  // body is HTML or plain text (네이버 OpenAPI accepts both via contents field).
  const parsed = typeof draft.text === 'string' ? parseDraftText(draft.text) : draft.text;
  return {
    title: parsed.title,
    contents: parsed.body,
    tags: (parsed.tags ?? []).join(','),
  };
}

// Convention: copywriter writes draft.text as a markdown string with a YAML-ish front-matter:
//   ---
//   title: "Real title"
//   tags: ["tag1", "tag2"]
//   ---
//   <body markdown here>
// If no front-matter, treat first line as title and rest as body.
function parseDraftText(text) {
  if (text.startsWith('---\n')) {
    const end = text.indexOf('\n---\n', 4);
    if (end > 0) {
      const head = text.slice(4, end);
      const body = text.slice(end + 5).trimStart();
      const meta = parseSimpleYaml(head);
      return { title: meta.title ?? '', body, tags: meta.tags ?? [] };
    }
  }
  const [first, ...rest] = text.split('\n');
  return { title: first.replace(/^#+\s*/, '').trim(), body: rest.join('\n').trimStart(), tags: [] };
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
  id: 'naver-blog',
  buildPayload,

  async healthcheck(creds) {
    if (!creds?.accessToken) return { ok: false, reason: 'missing accessToken' };
    if (!creds?.blogId) return { ok: false, reason: 'missing blogId' };
    return { ok: true };
  },

  async publish({ draft, credentials }) {
    const { accessToken, blogId, categoryNo = 0 } = credentials;
    const payload = buildPayload({ draft });

    const body = new URLSearchParams({
      title: payload.title,
      contents: payload.contents,
      categoryNo: String(categoryNo),
    });
    if (payload.tags) body.set('tags', payload.tags);

    const res = await withRetry(() =>
      fetch(`${BASE}/writePost.json`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      }),
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`naver-blog publish failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    // Naver OpenAPI returns: { result: { logNo, postId, url, ... } } on success
    const url = data?.result?.url ?? null;
    const postId = data?.result?.postId ?? data?.result?.logNo ?? null;
    return {
      ok: true,
      url,
      postId,
      raw: data,
    };
  },
});
