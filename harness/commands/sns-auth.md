---
name: auth
description: 채널 발행용 자격증명을 로컬에만 저장 (auth/<channel>.json, mode 0600, gitignored).
---

# /sns-auth

```
/sns-auth list
/sns-auth add <channel>            # JSON 을 stdin 으로 입력
/sns-auth show <channel>           # 토큰은 마스킹되어 출력
/sns-auth check <channel>          # 어댑터 healthcheck
/sns-auth remove <channel>
```

내부: `node bin/auth.mjs ...`.

## 채널별 페이로드 형식

> 모든 예시는 `examples/auth/<channel>.example.json` 에 동일하게 있음. `cp` 후 수정해도 됨.

### threads
```json
{ "accessToken": "EAAB...", "userId": "1784..." }
```
Meta App > Threads API > Long-lived user access token. `userId` 는 GET `me?fields=id`.

### linkedin
```json
{ "accessToken": "AQ...", "authorUrn": "urn:li:person:abc123" }
```
LinkedIn Developers > OAuth2 (3-legged) > scope `w_member_social` (개인) 또는 `w_organization_social` + `r_organization_social` (회사). authorUrn = `urn:li:person:<id>` 또는 `urn:li:organization:<id>`.

### instagram
```json
{ "accessToken": "EAA... (Page long-lived token)", "igUserId": "17841..." }
```
Meta App > Instagram Graph API. IG Business 계정이 페이스북 Page 에 연결돼 있어야 함. `igUserId` = `me/accounts` → 각 page 의 `instagram_business_account.id`.

### facebook
```json
{ "pageAccessToken": "EAA...", "pageId": "100000..." }
```
Meta App > Pages > `me/accounts` 의 각 page 에서 발급되는 page-level token. user token 아님.

### x
```json
{
  "bearerToken": "AAAA... (텍스트 트윗만)",
  "oauth1": { "consumerKey":"", "consumerSecret":"", "accessToken":"-", "accessSecret":"" }
}
```
X Developer Portal > Project. 텍스트만 올릴 거면 OAuth2 user-context bearer 만으로 충분. **이미지 첨부는 v1.1 media/upload 가 필요해 OAuth1 자격이 필수.** 무료 tier 는 월 글쓰기 제한이 있으니 발행 빈도 확인할 것.

### reddit
```json
{
  "clientId":"...","clientSecret":"...",
  "username":"...","password":"...",
  "userAgent":"marketing_agent/0.9 by <username>",
  "subreddit":"yourcompany"
}
```
reddit.com/prefs/apps > "create app" > **script** 타입. 자기 계정 + 자기 서브레딧이 가장 마찰 없음. 다른 서브레딧은 룰 위반 시 ban 되니 community 가이드 먼저 읽기.

### bluesky
```json
{ "service": "https://bsky.social", "identifier": "you.bsky.social", "appPassword": "xxxx-xxxx-xxxx-xxxx" }
```
설정 > App passwords > Add. 5초 발급. self-host 인스턴스면 service URL 만 바꾸면 됨.

### mastodon
```json
{ "instance": "https://mastodon.social", "accessToken": "...", "visibility": "public" }
```
인스턴스 > Preferences > Development > New application. scopes: `write:statuses write:media`.

### pinterest
```json
{ "accessToken": "pina_...", "boardId": "123..." }
```
Pinterest Developers > OAuth2. scope: `pins:write`. boardId 는 `GET /v5/boards`.

### tiktok
```json
{ "accessToken": "act....", "openId": "..." }
```
TikTok for Developers > Content Posting API. **영상 전용** — 텍스트/이미지 캠페인은 호환 안 됨. 어댑터가 어차피 reject.

### youtube
```json
{ "accessToken": "ya29...." }
```
Google Cloud Console > YouTube Data API v3 > OAuth2. scope: `https://www.googleapis.com/auth/youtube.upload`. **영상 전용**. refresh token 별도 관리 필요.

## 보안
- 평문 JSON 으로 저장하지만 파일 모드 0600 + .gitignore (`auth/`)
- 자사 서버에 절대 전송하지 않음
- 토큰 만료 시 `/sns-auth add` 로 덮어쓰기 (rotation 자동화는 Phase 4.1)
- OS 키체인 연동은 Phase 6 검토 (현재는 디버깅 용이성 우선)
