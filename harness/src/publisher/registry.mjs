// Publisher registry — 채널 메타데이터 + 검증 + dry-run 판정.
//
// ⚠ 발행은 browser-publish.mjs (크롬 쿠키 로그인) 만 사용한다.
//    레거시 API/OAuth 어댑터 레이어(adapters/*.mjs, publish.mjs, auth.mjs, auth-schemas.mjs)는
//    2026-06 제거됨 — 모든 발행은 사용자가 보이는 브라우저에 1회 로그인 → 쿠키 재사용 방식.

// 채널 메타: onboard / doctor 가 사용자에게 보여주는 라벨·미디어 요구·발행 방식.
// browser-publish 가 지원하는 채널만 (SUPPORTED in bin/browser-publish.mjs 와 일치).
export const CHANNEL_META = {
  'naver-blog': { label: 'Naver Blog', media: 'blog 본문 + 인라인 이미지',          publish: 'browser-publish (크롬 쿠키)' },
  tistory:      { label: 'Tistory',    media: 'blog 본문 + 인라인 이미지',          publish: 'browser-publish (크롬 쿠키)' },
  brunch:       { label: 'Brunch',     media: 'editorial 본문 — 사진 풍부, 인물 OK', publish: 'browser-publish (크롬 쿠키)' },
  instagram:    { label: 'Instagram',  media: 'image+carousel (텍스트만 불가)',     publish: 'browser-publish (크롬 쿠키)' },
  threads:      { label: 'Threads',    media: 'text+image+carousel',               publish: 'browser-publish (크롬 쿠키)' },
  linkedin:     { label: 'LinkedIn',   media: 'text+image+multi',                  publish: 'browser-publish (크롬 쿠키)' },
};

export function knownChannels() {
  return Object.keys(CHANNEL_META);
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
