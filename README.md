# marketing_agent

> 회사 정보를 한 번 입력하면, Claude가 SNS 카피·이미지·카드뉴스를 만들고, 사람이 한 번 보고 승인하면 SNS에 올려주는 도구.

토타로(Totaro) 사내·고객사 전용. Claude Code 위에서 동작합니다.

---

## 무엇을 해주나요?

| 단계 | 내가 하는 일 | 도구가 해주는 일 |
|------|--------------|------------------|
| 1. 회사 등록 | 회사 이름·톤·금기어를 한 번 알려준다 | 다음부터는 매번 묻지 않는다 |
| 2. 캠페인 시작 | "이번 주 신제품 런칭 글" 한 줄 던진다 | 채널별로 글·카드뉴스를 만든다 |
| 3. 검토 | 콘솔에 뜬 결과를 본다 | 회사 톤·금기어 자동 검사를 통과한 것만 보여준다 |
| 4. 승인/거절 | 한 줄 명령으로 OK/되돌리기 | 거절 사유는 다음 생성에 반영된다 |
| 5. 발행 | 한 줄 명령 | Threads / LinkedIn에 카드뉴스까지 자동 업로드 |
| 6. 진행 확인 | `/sns-status` | 모든 캠페인이 어느 채널에서 어느 단계인지 칸반으로 보여준다 |

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

이 repo 는 자기 자신을 marketplace 로 패키징해뒀습니다 (`.claude-plugin/marketplace.json`). private repo 라 GitHub URL 은 인증 필요하지만, **로컬 경로** 로는 인증 없이 설치됩니다.

> ⚠️ 두 명령은 **반드시 따로** 입력하세요. 한 줄에 붙이면 path 가 깨집니다.

#### Step 2-A. Marketplace 등록

먼저 아무 폴더에서 `claude` 띄우고, 안에서:

```
/plugin marketplace add /Users/me/totaro/marketing_agent
```
(끝의 경로는 본인이 위 1단계에서 clone 한 **repo 의 절대 경로**)

✅ 성공 결과: `Added marketplace "marketing_agent"` 또는 비슷한 메시지.

#### Step 2-B. 플러그인 설치

다음 명령을 **새로** 입력 (위와 한 줄에 붙이지 말 것):

```
/plugin install marketing_agent@marketing_agent
```

✅ 성공 결과: 플러그인 상세 카드가 뜨고 `Install` 버튼 → 클릭 → `Installed marketing_agent`.

#### Step 2-C. 재로드 (또는 재시작)

```
/plugin reload
```
또는 Claude 종료 후 다시 실행.

#### Step 2-D. 확인

```
/help
```
→ 명령 목록에 **`/sns-*` prefix 13개** 가 보이면 성공.

```
/sns-doctor
```
→ 환경 진단 출력 (체크리스트 형태).

---

**업데이트** (repo 변경 후): `git pull` 후 Claude 안에서 `/plugin update marketing_agent`.

**일회성 테스트** (영구 설치 없이 한 세션만):
```bash
claude --plugin-dir "$(pwd)"
```

**향후 public 전환 시**: GitHub URL 로 한 줄 설치 가능 (collaborator/PAT 불필요):
```
/plugin marketplace add https://github.com/Totaro-int/marketing_agent
/plugin install marketing_agent@marketing_agent
```

**문제 해결**

| 증상 | 원인 + 처방 |
|------|------------|
| `Path does not exist: ... /plugin install ...` | 두 명령을 한 줄에 붙임 → A 와 B 따로 입력 |
| `Failed to install: invalid manifest` | repo 가 옛날 버전 → `git pull` 후 `/plugin marketplace remove marketing_agent` → 2-A 부터 다시 |
| `Marketplace "marketing_agent" not found` | 2-A (marketplace add) 안 했거나 remove 됨 → 2-A 부터 |
| `/help` 에 sns- 명령 0개 | `/plugin reload` 누락 → 2-C 실행 |

### 3) 환경 점검 + 첫 사용

Claude 안에서:

```
/sns-doctor                            환경 진단 (빨간 점 = 다음 액션)
/sns-onboard                           회사 정보 첫 입력 (스킬이 단계별로 물어봄)
/sns-run "신제품 런칭" --dry-run        첫 캠페인 (실 발행 X)
```

빨간 점이 없으면 OK. 자세한 내용은 [harness/docs/INSTALL.md](harness/docs/INSTALL.md).

> **터미널에서 바로 돌리고 싶다면** (Claude 없이): `node harness/bin/doctor.mjs`, `node harness/bin/campaign-new.mjs "..."` 등 `harness/bin/` 의 스크립트를 직접 호출해도 동일하게 동작합니다. Claude 는 슬래시 명령으로 wrapping 만 해주는 것.

### 폴더 구조 (한 줄 요약)

| 폴더 | 무엇 |
|------|------|
| `posts/` | **사람이 보는 결과물** — `campaigns/<slug>/` 원본 + `by-channel/<채널>/` 채널별 한눈 보기 (symlink) |
| `harness/` | **하네스 본체** — bin/src/schemas/commands/skills/agents/channels/examples/statusline/docs |
| `auth/` | 자격증명 (gitignored, 본인만 보임) |
| `.claude-plugin/` | Claude Code 플러그인 매니페스트 (`plugin.json`) |
| 루트 파일 | README, LICENSE, package.json, .env.example, .gitignore |

### 이미지 생성을 쓰려면 키 한 개

`.env.local` 파일을 열어서 한 줄만 채우면 됩니다:

```
FAL_KEY=fal_xxxxxxx     # https://fal.ai/dashboard/keys 에서 발급
```

키 없이 시작해도 mock 모드로 전체 흐름은 돌아갑니다 (가짜 이미지가 생성됨).

---

## 매일 쓰는 흐름

### 1줄로 끝내기 — `/sns-run`

```
/sns-run "신제품 런칭" --channels=threads --approve --publish --dry-run
```

회사 프로필 확인 → 캠페인 생성 → 글·이미지 생성 → 가드 검사 → 자동 승인 → dry-run 발행까지 한 번에.

### 단계별로 가고 싶으면

```
/sns-onboard                                회사 정보 첫 입력
/sns-campaign-new "신제품 런칭"              새 캠페인
/sns-generate <slug>                         글 + 이미지 자동 생성
/sns-preview <slug>                          결과 보기
/sns-approve <slug> --channel=threads        OK
/sns-publish <slug> --channel=threads --dry-run    먼저 미리보기
/sns-publish <slug> --channel=threads        진짜 올리기
/sns-status --watch                          실시간 진행 보드
```

`<slug>`는 캠페인 폴더명 (예: `2026-05-02-신제품-런칭`). 처음 사용자라면 `/sns-init`.

---

## 일주일/한 달치 미리 예약 (스케줄)

`/sns-run` 으로는 즉시 1건만 만듭니다. 일주일·한 달치를 한 번에 깔아두려면:

```
/sns-schedule --topic "5월 마케팅" --channels=threads --period=week --frequency=3 --titles="A편|B편|C편"
```

| 옵션 | 의미 |
|------|------|
| `--period=week\|month` | 7일 / 30일 |
| `--frequency=N` | 그 기간 안에 게시 횟수 |
| `--titles="A\|B\|C"` | 매 회 다른 주제 (없으면 seed 주제 + #1, #2…) |
| `--time=09:00` | 발행 시각 (KST, 기본 09:00) |
| `--no-auto-publish` | 알림만, 수동 발행 |

기본은 **자동 발행**: 발행 시각에 워커가 자동 승인 → 발행. 자동이 막히면 (가드 reject, 토큰 만료 등) `needs_attention` 으로 표시되고 사람이 손으로 처리.

**워커 돌리는 두 가지 방법**

```bash
# 수동 (Claude 안에서 한 번씩)
/sns-queue tick

# 자동 (15분마다 백그라운드, macOS launchd 또는 cron)
node bin/install-cron.mjs install --every=15
```

자동 설치 안 해도 됩니다. `/sns-queue tick` 만 가끔 손으로 눌러도 동작.

자세한 옵션은 [`harness/commands/sns-run.md`](harness/commands/sns-run.md), [`harness/commands/sns-queue.md`](harness/commands/sns-queue.md).

---

## 한 번에 카드뉴스 3장

`/sns-campaign-new` 할 때 옵션을 주면 됩니다:

```
/sns-campaign-new "신제품 런칭 사례" --cadence=series-3
```

| 옵션 | 결과 |
|------|------|
| (없음) | 카드 1장 |
| `--cadence=series-3` | 카드 3장 (도입 → 본문 → 마무리) |
| `--cadence=series-5` | 카드 5장 |
| `--cadence=thread` | 텍스트만 (이미지 없음) |

---

## SNS 계정 연결

11개 채널 지원. `/sns-onboard` 단계에서 회사가 쓸 채널을 골라두면, `/sns-campaign-new` 의 기본 발행 대상이 됩니다. 채널마다 토큰 한 번씩 등록.

```
/sns-auth add threads
# 키를 입력하라고 합니다 — JSON 한 줄
```

| 채널 | 미디어 | 발급 |
|------|--------|------|
| Threads   | 텍스트+이미지+캐러셀          | Meta Graph (accessToken+userId) |
| LinkedIn  | 텍스트+이미지(여러장)         | OAuth2 (accessToken+authorUrn) |
| Instagram | 이미지/캐러셀 (텍스트만 X)    | Meta Graph (IG Business) |
| Facebook  | 텍스트+이미지(여러장)         | Page token |
| X         | 텍스트(280)+이미지<=4         | Bearer 또는 OAuth1 (이미지는 OAuth1) |
| Reddit    | self/link 글 (서브레딧)       | OAuth2 password (script app) |
| Bluesky   | 텍스트+이미지<=4              | App password (5초 발급) |
| Mastodon  | 텍스트+이미지(여러장)         | Instance + access token |
| Pinterest | 이미지 1장 (보드 지정)        | OAuth2 |
| TikTok    | **영상 전용 (.mp4)**          | OAuth2 — 텍스트/이미지 X |
| YouTube   | **영상 전용 (.mp4)**          | OAuth2 — 텍스트/이미지 X |

토큰 미등록 채널은 자동으로 dry-run 으로만 동작 (`/sns-doctor` 가 빨간 점으로 알려줌).

자세한 페이로드와 발급 절차는 [`harness/commands/sns-auth.md`](harness/commands/sns-auth.md).

저장 위치는 `auth/<채널>.json` — 내 컴퓨터에만 있고, 권한도 본인만 읽기(0600). git에 절대 안 올라갑니다.

---

## 안전장치

다음 4단계가 겹쳐 있어 사고가 나기 어렵습니다:

1. `/sns-approve` 안 한 채널은 발행 거부
2. 회사 금기어가 들어간 글은 `/sns-approve` 자체가 거부
3. `/sns-publish --dry-run` 으로 페이로드만 미리 확인 가능
4. `.env.local` 에 `PUBLISHER_DRY_RUN=true` 두면 모든 `/sns-publish` 가 자동으로 미리보기 모드

평상시 4번을 켜두고, 진짜 올릴 때만 잠시 끄는 운영을 권장합니다.

---

## 문제가 생기면

```bash
node bin/doctor.mjs           # 환경 진단 (빨간 점 = 다음 액션)
node bin/auth.mjs check <ch>  # 토큰이 살아있는지
```

자세한 트러블슈팅: [OPERATIONS.md](OPERATIONS.md).

---

## 더 알고 싶다면

| 문서 | 무엇 |
|------|------|
| [INSTALL.md](INSTALL.md) | 설치 상세 |
| [OPERATIONS.md](OPERATIONS.md) | 운영 (캠페인 라이프사이클, 토큰 회전, 트러블슈팅, 비용) |
| [CHANGELOG.md](CHANGELOG.md) | 모든 단계의 변경 이력 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 시스템 구조 |
| [channels/threads/strategy.md](channels/threads/strategy.md) | 채널 전략 (참고) |

---

## 라이선스

Proprietary — Totaro Inc. 사내·계약 고객사 전용. 외부 배포 금지.
