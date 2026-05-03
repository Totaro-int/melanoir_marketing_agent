// 채널별 자격증명 필드 스펙. auth.mjs 의 대화형 모드에서 사용.
// key: payload 의 JSON key (dot-path 허용 → 중첩 객체 조립, 예: oauth1.consumerKey)
// secret: true → 입력 시 [비공개] 표시
// optional: true → 빈 값 허용
// hint: 입력 전 한 줄 안내

export const AUTH_SCHEMAS = {
  threads: {
    fields: [
      { key: 'accessToken', label: 'Access Token', secret: true, hint: 'Meta App > Threads API > Long-lived user access token' },
      { key: 'userId', label: 'User ID', hint: 'Graph API: GET me?fields=id' },
    ],
  },
  linkedin: {
    fields: [
      { key: 'accessToken', label: 'Access Token', secret: true, hint: 'LinkedIn Developers > OAuth2 3-legged > scope: w_member_social' },
      { key: 'authorUrn', label: 'Author URN', hint: '예: urn:li:person:<id> 또는 urn:li:organization:<id>' },
    ],
  },
  instagram: {
    fields: [
      { key: 'accessToken', label: 'Access Token (Page long-lived)', secret: true, hint: 'Meta App > Instagram Graph API' },
      { key: 'igUserId', label: 'IG User ID', hint: 'me/accounts → instagram_business_account.id' },
    ],
  },
  facebook: {
    fields: [
      { key: 'pageAccessToken', label: 'Page Access Token', secret: true, hint: 'Meta App > me/accounts → page-level token (user token 아님)' },
      { key: 'pageId', label: 'Page ID', hint: 'me/accounts 응답의 id 필드' },
    ],
  },
  x: {
    note: '텍스트 트윗만 → bearerToken 만으로 충분. 이미지 첨부 → oauth1 4개 모두 필요.',
    fields: [
      { key: 'bearerToken', label: 'Bearer Token (텍스트 전용)', secret: true, optional: true, hint: 'X Developer Portal > OAuth2 App Only' },
      { key: 'oauth1.consumerKey', label: 'OAuth1 Consumer Key (이미지 첨부용)', optional: true },
      { key: 'oauth1.consumerSecret', label: 'OAuth1 Consumer Secret', secret: true, optional: true },
      { key: 'oauth1.accessToken', label: 'OAuth1 Access Token', secret: true, optional: true },
      { key: 'oauth1.accessSecret', label: 'OAuth1 Access Secret', secret: true, optional: true },
    ],
  },
  reddit: {
    fields: [
      { key: 'clientId', label: 'Client ID', hint: 'reddit.com/prefs/apps > script 타입 앱' },
      { key: 'clientSecret', label: 'Client Secret', secret: true },
      { key: 'username', label: '계정 username' },
      { key: 'password', label: '계정 password', secret: true },
      { key: 'userAgent', label: 'User Agent', hint: '예: marketing_agent/1.0 by <username>' },
      { key: 'subreddit', label: '발행할 서브레딧', hint: '예: yourcompany  (r/ 제외)' },
    ],
  },
  bluesky: {
    fields: [
      { key: 'service', label: 'Service URL', hint: '예: https://bsky.social' },
      { key: 'identifier', label: 'Handle', hint: '예: you.bsky.social' },
      { key: 'appPassword', label: 'App Password', secret: true, hint: '설정 > App passwords > Add  (5초 발급)' },
    ],
  },
  mastodon: {
    fields: [
      { key: 'instance', label: 'Instance URL', hint: '예: https://mastodon.social' },
      { key: 'accessToken', label: 'Access Token', secret: true, hint: 'Preferences > Development > New application  (scopes: write:statuses write:media)' },
      { key: 'visibility', label: 'Visibility', optional: true, hint: 'public / unlisted / private  (기본: public)' },
    ],
  },
  pinterest: {
    fields: [
      { key: 'accessToken', label: 'Access Token', secret: true, hint: 'Pinterest Developers > OAuth2. scope: pins:write' },
      { key: 'boardId', label: 'Board ID', hint: 'GET /v5/boards 에서 확인' },
    ],
  },
  tiktok: {
    note: '⚠️  영상 전용 채널 — 텍스트/이미지 캠페인에는 사용 불가.',
    fields: [
      { key: 'accessToken', label: 'Access Token', secret: true, hint: 'TikTok for Developers > Content Posting API' },
      { key: 'openId', label: 'Open ID' },
    ],
  },
  youtube: {
    note: '⚠️  영상 전용 채널.',
    fields: [
      { key: 'accessToken', label: 'Access Token', secret: true, hint: 'Google Cloud > YouTube Data API v3 > OAuth2. scope: youtube.upload' },
    ],
  },
};

// dot-path key 로 중첩 객체에 값을 설정 (예: 'oauth1.consumerKey' → obj.oauth1.consumerKey)
export function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}
