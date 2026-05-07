// Tistory adapter.
// Tistory Open API supports OAuth2 access tokens for post publishing.
// Docs: https://tistory.github.io/document-tistory-apis/apis/v1/post/write.html
//
// Required credentials (auth/tistory.json):
//   {
//     "accessToken": "...",            // OAuth2 access token
//     "blogName": "your_blog_name",    // 블로그명 (your_blog_name.tistory.com)
//     "categoryId": "0",               // 선택 (기본 0)
//     "visibility": "3"                // 3=공개, 2=보호, 0=비공개 (기본 3)
//   }
//
// Note: Like naver-blog, tistory is a search-driven blog medium (not SNS).
// image-director is skipped per channels.json (kind:blog, skipImageDirector:true).

import { assertAdapter } from '../publisher.mjs';
import { withRetry } from '../retry.mjs';

const BASE = 'https://www.tistory.com/apis';

function buildPayload({ draft }) {
  // draft.text expects either a parsed object { title, body, tags } or a markdown
  // string with YAML-ish front-matter (same convention as naver-blog adapter).
  const parsed = typeof draft.text === 'string' ? parseDraftText(draft.text) : draft.text;
  return {
    title: parsed.title,
    content: parsed.body,
    tag: (parsed.tags ?? []).join(','),
    category: parsed.category ?? '0',
  };
}

// Convention: copywriter writes draft.text as markdown with front-matter
//   ---
//   title: "Real title"
//   tags: ["tag1", "tag2"]
//   category: "10"
//   ---
//   <body markdown here>
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
        category: meta.category ?? '0',
      };
    }
  }
  const [first, ...rest] = text.split('\n');
  return {
    title: first.replace(/^#+\s*/, '').trim(),
    body: rest.join('\n').trimStart(),
    tags: [],
    category: '0',
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
  id: 'tistory',
  buildPayload,

  async healthcheck(creds) {
    if (!creds?.accessToken) return { ok: false, reason: 'missing accessToken' };
    if (!creds?.blogName) return { ok: false, reason: 'missing blogName' };
    return { ok: true };
  },

  async publish({ draft, credentials }) {
    const { accessToken, blogName, visibility = '3' } = credentials;
    const payload = buildPayload({ draft });

    const body = new URLSearchParams({
      access_token: accessToken,
      output: 'json',
      blogName,
      title: payload.title,
      content: payload.content,
      visibility,
      category: payload.category,
    });
    if (payload.tag) body.set('tag', payload.tag);

    const res = await withRetry(() =>
      fetch(`${BASE}/post/write`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      }),
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`tistory publish failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    // Tistory returns: { tistory: { status: "200", postId: "...", url: "..." } }
    const inner = data?.tistory ?? data;
    if (inner?.status && String(inner.status) !== '200') {
      throw new Error(`tistory publish error: status=${inner.status}, message=${inner.error_message ?? 'unknown'}`);
    }
    const url = inner?.url ?? null;
    const postId = inner?.postId ?? null;
    return {
      ok: true,
      url,
      postId,
      raw: data,
    };
  },
});
