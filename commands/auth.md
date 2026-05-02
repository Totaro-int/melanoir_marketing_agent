---
name: auth
description: 채널 발행용 자격증명을 로컬에만 저장 (auth/<channel>.json, mode 0600, gitignored).
---

# /auth

```
/auth list
/auth add <channel>            # JSON 을 stdin 으로 입력
/auth show <channel>           # 토큰은 마스킹되어 출력
/auth check <channel>          # 어댑터 healthcheck
/auth remove <channel>
```

내부: `node bin/auth.mjs ...`.

## 채널별 페이로드 형식

**threads**
```json
{ "accessToken": "EAAB...", "userId": "1784..." }
```
발급: Meta App > Threads API > Long-lived user access token. `userId` 는 GET `me?fields=id` 로 확인.

**linkedin**
```json
{ "accessToken": "AQ...", "authorUrn": "urn:li:person:abc123" }
```
발급: LinkedIn Developers > OAuth 2.0 (3-legged) > scope `w_member_social` (개인) 또는 `w_organization_social` + `r_organization_social` (회사 페이지). `authorUrn` 은 `urn:li:person:<id>` 또는 `urn:li:organization:<id>`.

## 보안
- 평문 JSON 으로 저장하지만 파일 모드 0600 + .gitignore (`auth/`)
- 자사 서버에 절대 전송하지 않음
- 토큰 만료 시 `/auth add` 로 덮어쓰기 (rotation 자동화는 Phase 4.1)
- OS 키체인 연동은 Phase 6 검토 (현재는 디버깅 용이성 우선)
