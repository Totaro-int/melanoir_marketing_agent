// Publisher registry — picks the adapter for a channel and decides whether to
// short-circuit into dry-run mode (env: PUBLISHER_DRY_RUN=true OR --dry-run flag).

import { adapter as threads } from './adapters/threads.mjs';
import { adapter as linkedin } from './adapters/linkedin.mjs';
import { adapter as instagram } from './adapters/instagram.mjs';
import { adapter as facebook } from './adapters/facebook.mjs';
import { adapter as x } from './adapters/x.mjs';
import { adapter as reddit } from './adapters/reddit.mjs';
import { adapter as bluesky } from './adapters/bluesky.mjs';
import { adapter as mastodon } from './adapters/mastodon.mjs';
import { adapter as pinterest } from './adapters/pinterest.mjs';
import { adapter as tiktok } from './adapters/tiktok.mjs';
import { adapter as youtube } from './adapters/youtube.mjs';
import { adapter as naverBlog } from './adapters/naver-blog.mjs';
import { adapter as tistory } from './adapters/tistory.mjs';

const ADAPTERS = {
  threads, linkedin, instagram, facebook, x,
  reddit, bluesky, mastodon, pinterest, tiktok, youtube,
  'naver-blog': naverBlog,
  tistory,
};

// 채널별 메타: onboard / doctor 가 사용자에게 보여주는 라벨, 미디어 요구.
export const CHANNEL_META = {
  threads:   { label: 'Threads',     media: 'text+image+carousel', auth: 'Meta Graph (accessToken+userId)' },
  linkedin:  { label: 'LinkedIn',    media: 'text+image+multi',    auth: 'OAuth2 (accessToken+authorUrn)' },
  instagram: { label: 'Instagram',   media: 'image+carousel (텍스트만 불가)', auth: 'Meta Graph (accessToken+igUserId)' },
  facebook:  { label: 'Facebook Page', media: 'text+image+multi',  auth: 'Page token (pageAccessToken+pageId)' },
  x:         { label: 'X (Twitter)', media: 'text+image(<=4)',     auth: 'Bearer 또는 OAuth1 (이미지 첨부는 OAuth1 필요)' },
  reddit:    { label: 'Reddit',      media: 'text(self)+link',     auth: 'OAuth2 password (clientId/secret + user/pass)' },
  bluesky:   { label: 'Bluesky',     media: 'text+image(<=4)',     auth: 'AT Protocol (handle + app password)' },
  mastodon:  { label: 'Mastodon',    media: 'text+image+multi',    auth: 'Instance + access token' },
  pinterest: { label: 'Pinterest',   media: 'image (1장)',         auth: 'OAuth2 (accessToken+boardId)' },
  tiktok:    { label: 'TikTok',      media: '영상 전용 (.mp4 등)', auth: 'OAuth2 (accessToken+openId)' },
  youtube:   { label: 'YouTube',     media: '영상 전용 (.mp4 등)', auth: 'OAuth2 (accessToken)' },
  'naver-blog': { label: 'Naver Blog', media: 'text(blog post) — 이미지 선택, 카드뉴스 X', auth: 'OAuth2 (accessToken + blogId)' },
  tistory:   { label: 'Tistory',     media: 'text(blog post) — 이미지 선택, 카드뉴스 X', auth: 'OAuth2 (accessToken + blogName)' },
};

export function knownChannels() {
  return Object.keys(ADAPTERS);
}

export function getAdapter(channel) {
  const a = ADAPTERS[channel];
  if (!a) throw new Error(`No publisher adapter for channel "${channel}". Known: ${knownChannels().join(', ')}`);
  return a;
}

export function isDryRun({ flagDryRun = false } = {}) {
  if (flagDryRun) return { dry: true, source: 'flag' };
  const v = (process.env.PUBLISHER_DRY_RUN ?? '').toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes') return { dry: true, source: 'env' };
  return { dry: false, source: null };
}

// unknown: registry에 없는 채널 (에러). notEnabled: profile.enabled에 없는 채널 (경고).
export function validateChannels(channels, { enabled = [] } = {}) {
  const knownSet = new Set(knownChannels());
  const unknown = channels.filter((c) => !knownSet.has(c));
  const notEnabled = enabled.length ? channels.filter((c) => knownSet.has(c) && !enabled.includes(c)) : [];
  return { unknown, notEnabled, ok: unknown.length === 0 };
}
