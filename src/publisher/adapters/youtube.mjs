// YouTube Data API v3 adapter — 영상(Shorts 포함) 전용.
// videos.insert 는 multipart 업로드 (resumable). MVP는 PULL 모드 없이, 사용자가 미리
// 영상 파일을 fal/CDN에 올려둔 URL 을 받아 일단 다운로드 → 업로드.
// Docs: https://developers.google.com/youtube/v3/docs/videos/insert
//
// auth/youtube.json:
//   { "accessToken": "<OAuth2 user access token>" }
// (refresh 는 별도 흐름 — auth.mjs check 에서 갱신 가이드)

import { Buffer } from 'node:buffer';
import { assertAdapter } from '../publisher.mjs';
import { withRetry } from '../retry.mjs';

const UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status';

function isVideo(u) {
  return /\.(mp4|mov|webm)(\?|$)/i.test(u ?? '');
}

function buildPayload({ draft }) {
  const u = draft.assetUrls?.[0];
  if (!u || !isVideo(u)) return { error: 'youtube: 영상 전용 (assetUrls[0] 가 .mp4 등)', text: draft.text };
  return {
    snippet: { title: (draft.text ?? '').slice(0, 100), description: draft.text ?? '' },
    status: { privacyStatus: 'public' },
    sourceUrl: u,
  };
}

export const adapter = assertAdapter({
  id: 'youtube',
  buildPayload,

  async healthcheck(creds) {
    if (!creds?.accessToken) return { ok: false, reason: 'missing accessToken (OAuth2)' };
    return { ok: true };
  },

  async publish({ draft, credentials }) {
    const u = draft.assetUrls?.[0];
    if (!u || !isVideo(u)) throw new Error('youtube: 영상 URL 필요 (.mp4/.mov/.webm).');

    const v = await fetch(u);
    if (!v.ok) throw new Error(`youtube: 영상 fetch 실패 ${u}: HTTP ${v.status}`);
    const bytes = Buffer.from(await v.arrayBuffer());

    const meta = {
      snippet: { title: (draft.text ?? '').slice(0, 100), description: draft.text ?? '' },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    };

    const boundary = '----marketing_agent_' + Math.random().toString(36).slice(2);
    const head = Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\nContent-Type: video/*\r\n\r\n`,
      'utf8',
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const body = Buffer.concat([head, bytes, tail]);

    const r = await withRetry(() => fetch(UPLOAD, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(body.length),
      },
      body,
    }).then(async (rr) => {
      const t = await rr.text();
      if (!rr.ok) throw new Error(`youtube upload HTTP ${rr.status}: ${t.slice(0, 300)}`);
      return JSON.parse(t);
    }));

    const id = r.id;
    return {
      ok: true,
      externalId: id,
      url: id ? `https://youtube.com/watch?v=${id}` : '',
      raw: r,
    };
  },
});
