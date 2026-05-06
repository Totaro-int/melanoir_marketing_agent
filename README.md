# marketing_agent

> 회사 정보를 한 번 입력하면, Claude가 SNS 카피·이미지·카드뉴스를 만들고, 사람이 한 번 보고 승인하면 SNS에 올려주는 도구.

토타로(Totaro) 사내·고객사 전용. Claude Code 위에서 동작합니다.

> **⚠️ Claude 데스크탑 앱(Mac/Windows)·웹(claude.ai)에서는 동작하지 않습니다.**
> 로컬 파일 접근, 터미널 실행, 커스텀 스킬(`/sns-start` 등)은 **Claude Code CLI 전용** 기능입니다.
> 반드시 터미널에서 `claude` 명령어로 진입해 사용하세요.

---

## 무엇을 해주나요?

| 단계 | 내가 하는 일 | 도구가 해주는 일 |
|------|--------------|------------------|
| 1. 회사 등록 | 회사 이름·톤·금기어를 한 번 알려준다 | 다음부터는 매번 묻지 않는다 |
| 2. 캠페인 시작 | "이번 주 신제품 런칭 글" 한 줄 던진다 | 채널별로 글·카드뉴스를 만든다 |
| 3. 검토 | 콘솔에 뜬 결과를 본다 | 회사 톤·금기어 자동 검사를 통과한 것만 보여준다 |
| 4. 승인 | 한 줄 명령으로 OK | 승인 전까지 발행 불가 |
| 5. 발행 | 한 줄 명령 | Threads / LinkedIn에 카드뉴스까지 자동 업로드 |

**중요한 약속**
- 사람이 한 번 본 다음에만 발행됩니다 (자동 발행 없음)
- 회사 프로필·SNS 비밀번호는 내 컴퓨터에만 저장됩니다 (서버로 안 보냄)
- 회사가 정한 금기어가 들어간 글은 승인 자체가 거부됩니다

---

## 처음 한 번만 (5분)

이 도구는 [Claude Code](https://docs.claude.com/en/docs/claude-code) 위에서 동작하는 플러그인입니다. Claude Code 가 깔려 있다고 가정합니다 (없다면 `npm i -g @anthropic-ai/claude-code`).

### 1) 클론 + 설치

```bash
git clone https://github.com/Totaro-int/marketing_agent.git
cd marketing_agent
node harness/bin/setup.mjs        # 의존성 + 폴더 + 권한 자동
```

### 2) Claude Code 에 플러그인 등록

> ⚠️ 두 명령은 **반드시 따로** 입력하세요. 한 줄에 붙이면 path 가 깨집니다.

#### Step 2-A. Marketplace 등록

먼저 아무 폴더에서 `claude` 띄우고, 안에서:

```
/plugin marketplace add /Users/me/totaro/marketing_agent
```
(끝의 경로는 본인이 위 1단계에서 clone 한 **repo 의 절대 경로**)

#### Step 2-B. 플러그인 설치

```
/plugin install marketing_agent@marketing_agent
```

#### Step 2-C. 재로드

```
/plugin reload
```

#### Step 2-D. 확인

```
/help
```
→ 명령 목록에 **`/sns-start`, `/sns-repeat`, `/sns-edit`, `/sns-doctor`** 4개가 보이면 성공.

---

**업데이트** (repo 변경 후): `git pull` 후 Claude 안에서 `/plugin update marketing_agent`.

**일회성 테스트** (영구 설치 없이 한 세션만):
```bash
claude --plugin-dir "$(pwd)"
```

**문제 해결**

| 증상 | 원인 + 처방 |
|------|------------|
| `Path does not exist: ... /plugin install ...` | 두 명령을 한 줄에 붙임 → A 와 B 따로 입력 |
| `Failed to install: invalid manifest` | repo 가 옛날 버전 → `git pull` 후 `/plugin marketplace remove marketing_agent` → 2-A 부터 다시 |
| `/help` 에 sns- 명령 0개 | `/plugin reload` 누락 → 2-C 실행 |

### 3) 첫 시작

Claude 안에서 딱 한 줄:

```
/sns-start
```

회사 정보 인터뷰 → 캠페인 생성 → 카피·이미지 생성 → 칸반 보드 → 발행까지 안내해줍니다.

> **비용 0 검증**: `.env.local` 에 `CONTENT_ENGINE_PROVIDER=mock` 두면 fal.ai/openai 호출 없이 mock 이미지/카피로 흐름 검증 가능. 운영 전 dry-run 테스트 권장.

---

## 명령어 4개

| 명령 | 언제 쓰나 |
|------|-----------|
| `/sns-start` | 처음 사용하거나 새 캠페인을 만들 때. 전체 플로우 한 번에. |
| `/sns-repeat` | 이전에 만든 캠페인을 다시 돌릴 때. 예약·스케줄도 여기서. |
| `/sns-edit` | 생성된 내용이 마음에 안 들 때. 피드백 재생성 / 직접 편집 / 이미지만 다시. |
| `/sns-doctor` | 환경이 이상하거나 계정/프로필 설정을 바꿀 때. |

---

## 매일 쓰는 흐름

### 새 캠페인

```
/sns-start "신제품 런칭"
```

주제만 던지면 채널·목표·cadence는 회사 프로필 기본값으로 채워집니다.
각 단계마다 칸반 보드가 자동으로 표시됩니다.

### 이전 캠페인 반복

```
/sns-repeat
```

저장된 슬롯 목록이 표시되고, 번호를 고르면 동일 설정으로 새 캠페인을 만들어줍니다.

### 일주일/한 달치 예약

```
/sns-repeat
→ 슬롯 선택 → "예약"을 입력 → 주기 설정 (예: "매주 화요일 오전 10시")
```

### 한 번에 카드뉴스 3장

```
/sns-start "신제품 런칭 사례" --cadence=series-3
```

| 옵션 | 결과 |
|------|------|
| (없음) | 카드 1장 |
| `--cadence=series-3` | 카드 3장 (도입 → 본문 → 마무리) |
| `--cadence=series-5` | 카드 5장 |
| `--cadence=thread` | 텍스트만 (이미지 없음) |

---

## SNS 계정 연결

11개 채널 지원. `/sns-start` 첫 실행 시 회사가 쓸 채널을 골라두면, 이후 캠페인의 기본 발행 대상이 됩니다.

채널 토큰 등록:
```
/sns-doctor auth add threads
```
대화형으로 필드를 하나씩 안내합니다. 저장 직후 자동으로 healthcheck.

| 채널 | 미디어 | 토큰 발급 |
|------|--------|-----------|
| Threads   | 텍스트+이미지+캐러셀          | Meta Graph |
| LinkedIn  | 텍스트+이미지(여러장)         | OAuth2 |
| Instagram | 이미지/캐러셀 (텍스트만 X)    | Meta Graph (IG Business) |
| Facebook  | 텍스트+이미지(여러장)         | Page token |
| X         | 텍스트(280)+이미지<=4         | Bearer 또는 OAuth1 |
| Reddit    | self/link 글 (서브레딧)       | OAuth2 password |
| Bluesky   | 텍스트+이미지<=4              | App password (5초 발급) |
| Mastodon  | 텍스트+이미지(여러장)         | Instance + access token |
| Pinterest | 이미지 1장 (보드 지정)        | OAuth2 |
| TikTok    | **영상 전용 (.mp4)**          | OAuth2 |
| YouTube   | **영상 전용 (.mp4)**          | OAuth2 |

토큰 미등록 채널은 자동으로 dry-run 으로만 동작 (`/sns-doctor` 가 빨간 점으로 알려줌).

자격증명 저장 위치: `auth/<채널>.json` — 내 컴퓨터에만 있고, 본인만 읽기(0600). git에 절대 안 올라갑니다.

---

## 콘텐츠 생성 흐름 (오케스트레이션)

`/sns-start` 실행 시 내부 흐름:

1. **채널별 스펙 생성** (`generate.mjs`)
   - 회사 프로필 + 캠페인 주제 → 채널별 `copy-spec.json` + `slide-spec.json` 생성

2. **카피 작성** (copywriter 에이전트)
   - 채널별 `copy-spec.json` 읽기 → 카피라이팅 → `copy-output.json` 저장
   - 톤·금기어 자동 적용

3. **이미지 생성** (image-director 에이전트)
   - **기본값: inhouse-slides** — Claude Vision으로 HTML 슬라이드 생성 → Playwright 스크린샷 → PNG
   - **선택형: fal/openai** — 외부 API 호출로 AI 이미지 생성

4. **최종 통합** (`generate.mjs --finalize`)
   - `copy-output.json` + 이미지 파일 → `agent-output.json`

5. **검수 + 승인**
   - brand-guardian 에이전트 검사 (금기어·톤) → 사용자 확인 → approve/reject

6. **발행** (publisher)
   - 채널별 공식 API 호출 → SNS에 업로드

---

## 이미지 생성 옵션

`.env.local`에서 `CONTENT_ENGINE_PROVIDER`로 선택합니다.

| Provider | 방식 | 필요 키 | API 키 필수 |
|----------|------|--------|-----------|
| `inhouse-slides` | Claude HTML 슬라이드 → Playwright 스크린샷 | `ANTHROPIC_API_KEY` | ✓ 필수 (이미 있음) |
| `fal` | fal.ai 이미지 생성 | `FAL_KEY` | ✓ 필요 |
| `openai` | OpenAI DALL-E | `OPENAI_API_KEY` | ✓ 필요 |

### inhouse-slides (기본값·권장)

**API 키 없이도 동작합니다.** `ANTHROPIC_API_KEY`만 있으면 됩니다.

외부 이미지 API 없이 브랜드 컬러·카피가 정확하게 반영된 슬라이드를 생성합니다.
소재 이미지(제품 사진 등)를 Claude가 실제로 보고 슬라이드에 배치합니다.

```bash
# 최초 1회 설치 (Playwright 필요)
npm install playwright
npx playwright install chromium

# .env.local
CONTENT_ENGINE_PROVIDER=inhouse-slides
ANTHROPIC_API_KEY=sk-ant-...
```

`/sns-start` 실행 시 제품 사진 경로를 입력하면 슬라이드에 자동 삽입됩니다.

### fal / openai

AI 이미지 생성이 필요한 경우:

```bash
FAL_KEY=fal_xxxxxxx      # https://fal.ai/dashboard/keys
# 또는
OPENAI_API_KEY=sk-...
```

---

## 안전장치

1. 금기어가 들어간 글은 승인 자체가 거부됩니다
2. `auth/<ch>.json` 없으면 자동 dry-run (실제 발행 안 됨)
3. `.env.local` 에 `PUBLISHER_DRY_RUN=true` 두면 모든 발행이 미리보기 모드
4. `/sns-start --dry-run` 플래그로 일시적 dry-run 가능

평상시 `PUBLISHER_DRY_RUN=true` 켜두고, 진짜 올릴 때만 끄는 운영을 권장합니다.

---

## 문제가 생기면

```
/sns-doctor
```

빨간 항목마다 다음 액션이 표시됩니다. 자동 수정 가능한 항목은:

```
/sns-doctor fix
```

자세한 트러블슈팅: [harness/docs/INSTALL.md](harness/docs/INSTALL.md).

---

## 폴더 구조

| 폴더 | 무엇 |
|------|------|
| `posts/` | **결과물** — `campaigns/<slug>/` 원본 + `by-channel/<채널>/` 채널별 한눈 보기 |
| `harness/` | **하네스 본체** — bin/src/schemas/commands/skills/agents/channels/examples/docs |
| `auth/` | 자격증명 (gitignored, 본인만 보임) |
| `.claude-plugin/` | Claude Code 플러그인 매니페스트 |

---

## 라이선스

Proprietary — Totaro Inc. 사내·계약 고객사 전용. 외부 배포 금지.
