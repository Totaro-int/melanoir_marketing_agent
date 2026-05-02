// TikTok Content Posting API adapter — 영상 전용.
// 이미지/텍스트 캠페인은 호환 안 됨. assetUrls 가 비디오(mp4 등)일 때만 동작.
// Docs: https://developers.tiktok.com/doc/content-posting-api-get-started
//
// auth/tiktok.json:
//   { "accessToken": "<user access token>", "openId": "<open id>" }

import { assertAdapter } from '../publisher.mjs';
import { withRetry } from '../retry.mjs';

const INIT = 'https://open.tiktokapis.com/v2/post/publish/video/init/';

function isVideo(u) {
  return /\.(mp4|mov|webm)(\?|$)/i.test(u ?? '');
}

function buildPayload({ draft }) {
  const u = draft.assetUrls?.[0];
  if (!u || !isVideo(u)) {
    return { error: 'tiktok: 영상 전용 (assetUrls[0] 가 .mp4 등이어야 함)', caption: draft.text };
  }
  return {
    post_info: { title: (draft.text ?? '').slice(0, 150), privacy_level: 'PUBLIC_TO_EVERYONE' },
    source_info: { source: 'PULL_FROM_URL', video_url: u },
  };
}

export const adapter = assertAdapter({
  id: 'tiktok',
  buildPayload,

  async healthcheck(creds) {
    if (!creds?.accessToken) return { ok: false, reason: 'missing accessToken' };
    if (!creds?.openId) return { ok: false, reason: 'missing openId' };
    return { ok: true };
  },

  async publish({ draft, credentials }) {
    const u = draft.assetUrls?.[0];
    if (!u || !isVideo(u)) {
      throw new Error('tiktok: 영상 URL 필요 (.mp4/.mov/.webm). 텍스트/이미지 캠페인은 호환 안 됨.');
    }
    const body = {
      post_info: {
        title: (draft.text ?? '').slice(0, 150),
        privacy_level: 'PUBLIC_TO_EVERYONE',
        disable_comment: false,
        disable_duet: false,
        disable_stitch: false,
      },
      source_info: { source: 'PULL_FROM_URL', video_url: u },
    };

    const r = await withRetry(() => fetch(INIT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }).then(async (rr) => {
      const t = await rr.text();
      if (!rr.ok) throw new Error(`tiktok init HTTP ${rr.status}: ${t.slice(0, 300)}`);
      return JSON.parse(t);
    }));

    const publishId = r?.data?.publish_id;
    if (!publishId) throw new Error('tiktok init missing publish_id: ' + JSON.stringify(r));
    // PULL_FROM_URL 모드는 TikTok 측에서 비동기 처리. status 폴링은 별도 엔드포인트.
    return { ok: true, externalId: publishId, url: '', raw: r };
  },
});
