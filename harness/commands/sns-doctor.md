---
name: sns-doctor
description: 환경 진단 + 자격증명(auth) 관리 + 회사 프로필 업데이트. 뭔가 이상하거나 설정을 바꾸고 싶으면 여기서.
---
> 업데이트 체크: `node harness/bin/check-updates.mjs` 실행 → `OK` 면 진행, `UPDATE_AVAILABLE` 이면 사용자에게 업데이트 여부 질문 후 진행. (상세: `harness/commands/_update-check.md`)

# /sns-doctor

환경 진단, 채널 자격증명 관리, 회사 프로필 부분 갱신을 한 곳에서 처리한다.

```
/sns-doctor                            # 전체 환경 진단
/sns-doctor --quick                    # 빠른 진단 (runtime/profile/env/content-engine 만)
/sns-doctor fix                        # 자동 수정 시도

/sns-doctor auth list                  # 저장된 자격증명 목록
/sns-doctor auth add <채널>            # 자격증명 추가 (대화형)
/sns-doctor auth show <채널>           # 마스킹 출력
/sns-doctor auth check <채널>          # healthcheck
/sns-doctor auth remove <채널>

/sns-doctor profile show               # 현재 프로필 내용 출력
/sns-doctor profile update <섹션>      # 특정 섹션만 재인터뷰
/sns-doctor profile validate           # 스키마 검증
/sns-doctor profile rebuild            # 전체 프로필 처음부터 재작성
```

---

## 진단 모드 (`/sns-doctor`)

`node harness/bin/doctor.mjs` 실행.

| 그룹 | 점검 항목 |
|------|---------|
| runtime | Node 버전, package.json, node_modules |
| profile | company-profile.yaml 존재 여부 |
| env | .env.local, CONTENT_ENGINE_PROVIDER |
| content-engine | anthropic/openai/fal/inhouse-slides 각 provider healthcheck (활성 provider만 fail, 나머지는 warn) |
| content-engine | `playwright` (`inhouse-slides` 전용) — npm 패키지 + chromium 설치 여부 |
| publisher | auth/ 디렉터리 + 각 자격증명 파일 모드(0600), PUBLISHER_DRY_RUN 상태 |
| channels | profile에서 활성화된 채널별 auth 파일 존재 여부 |
| plugin | plugin.json |
| campaigns | campaigns/ 항목 수 |
| queue | queue-tick.mjs 존재 여부, scheduled/needs_attention 항목 수 |

빨간 항목마다 detail 컬럼에 다음 액션 제시. exit 0/1 (CI 게이트 사용 가능).

### `/sns-doctor fix`
진단 결과의 자동 수정 가능 항목을 순서대로 처리:
- `node_modules` 없음 → `npm install`
- `.env.local` 없음 → `.env.example` 복사. **기본(inhouse-slides)은 API 키 0개로 동작** — 카피·슬라이드는 Claude Code 서브에이전트가 생성. 아래는 선택 provider 쓸 때만:
  - `FAL_KEY` (AI 이미지 생성, provider=fal): https://fal.ai/dashboard/keys
  - `OPENAI_API_KEY` (provider=openai): https://platform.openai.com/api-keys
  - ⚠ `ANTHROPIC_API_KEY` 는 사용 안 함 (anthropic provider 도 byok:false)
- `auth/` 디렉터리 없음 → 생성 + `chmod 0700`
- 자격증명 파일 모드 != 0600 → `chmod 0600`

---

## auth 관리 (`/sns-doctor auth ...`)

내부: `node harness/bin/auth.mjs <subcommand> ...`

`add` 서브커맨드는 **대화형** — 채널별 필드를 순서대로 묻고 저장 후 자동 healthcheck.

### 채널별 필요 정보

| 채널 | 필드 | 발급처 |
|------|------|--------|
| threads | accessToken, userId | Meta App > Threads API |
| linkedin | accessToken, authorUrn | LinkedIn Developers > OAuth2 |
| instagram | accessToken, igUserId | Meta App > Instagram Graph API |
| facebook | pageAccessToken, pageId | Meta App > me/accounts |
| x | bearerToken (텍스트), oauth1.* (이미지) | X Developer Portal |
| reddit | clientId, clientSecret, username, password, userAgent, subreddit | reddit.com/prefs/apps |
| bluesky | service, identifier, appPassword | 설정 > App passwords (5초 발급) |
| mastodon | instance, accessToken, visibility | Preferences > Development |
| pinterest | accessToken, boardId | Pinterest Developers |
| tiktok | accessToken, openId | TikTok for Developers (영상 전용) |
| youtube | accessToken | Google Cloud > YouTube Data API v3 (영상 전용) |

전체 JSON 예시: `harness/examples/auth/<채널>.example.json`

보안: 평문 `auth/<채널>.json` (mode 0600) 로컬 저장. 자사 서버 미전송. `.gitignore` 포함.

---

## 프로필 관리 (`/sns-doctor profile ...`)

| 서브커맨드 | 내부 | 설명 |
|-----------|------|------|
| `show` | `bin/profile-show.mjs` | 현재 프로필 내용 출력 |
| `update <섹션>` | sns-onboard-company 스킬 update 모드 | 해당 섹션만 재인터뷰 |
| `validate` | `bin/profile-validate.mjs` | 스키마 위반·소프트 경고 검사 |
| `rebuild` | sns-onboard-company 스킬 full 모드 | 처음부터 전체 재작성 |

업데이트 가능 섹션: `brand` `tagline` `industry` `audience` `tone` `banned` `channels` `writing` `imageStyle` `visual` `hashtags` `legal` `campaigns` `competitors`
