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
| 6. 진행 확인 | `/status` | 모든 캠페인이 어느 채널에서 어느 단계인지 칸반으로 보여준다 |

**중요한 약속**
- 사람이 한 번 본 다음에만 발행됩니다 (자동 발행 없음)
- 회사 프로필·SNS 비밀번호는 내 컴퓨터에만 저장됩니다 (서버로 안 보냄)
- 회사가 정한 금기어가 들어간 글은 승인 자체가 거부됩니다

---

## 처음 한 번만 (5분)

```bash
# 1) 받기
git clone https://github.com/Totaro-int/marketing_agent.git
cd marketing_agent

# 2) 한 번에 설치 (의존성 + 폴더 + 권한 자동)
node bin/setup.mjs

# 3) 환경 점검
node bin/doctor.mjs
```

빨간 점이 없으면 OK. 자세한 내용은 [INSTALL.md](INSTALL.md).

### 이미지 생성을 쓰려면 키 한 개

`.env.local` 파일을 열어서 한 줄만 채우면 됩니다:

```
FAL_KEY=fal_xxxxxxx     # https://fal.ai/dashboard/keys 에서 발급
```

키 없이 시작해도 mock 모드로 전체 흐름은 돌아갑니다 (가짜 이미지가 생성됨).

---

## 매일 쓰는 흐름

### 1줄로 끝내기 — `/run`

```
/run "신제품 런칭" --channels=threads --approve --publish --dry-run
```

회사 프로필 확인 → 캠페인 생성 → 글·이미지 생성 → 가드 검사 → 자동 승인 → dry-run 발행까지 한 번에.

### 단계별로 가고 싶으면

```
/onboard                                회사 정보 첫 입력
/campaign new "신제품 런칭"              새 캠페인
/generate <slug>                         글 + 이미지 자동 생성
/preview <slug>                          결과 보기
/approve <slug> --channel=threads        OK
/publish <slug> --channel=threads --dry-run    먼저 미리보기
/publish <slug> --channel=threads        진짜 올리기
/status --watch                          실시간 진행 보드
```

`<slug>`는 캠페인 폴더명 (예: `2026-05-02-신제품-런칭`). 처음 사용자라면 `/init`.

---

## 일주일/한 달치 미리 예약 (스케줄)

`/run` 으로는 즉시 1건만 만듭니다. 일주일·한 달치를 한 번에 깔아두려면:

```
/schedule --topic "5월 마케팅" --channels=threads --period=week --frequency=3 --titles="A편|B편|C편"
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
/queue tick

# 자동 (15분마다 백그라운드, macOS launchd 또는 cron)
node bin/install-cron.mjs install --every=15
```

자동 설치 안 해도 됩니다. `/queue tick` 만 가끔 손으로 눌러도 동작.

자세한 옵션은 [`commands/run.md`](commands/run.md), [`commands/queue.md`](commands/queue.md).

---

## 한 번에 카드뉴스 3장

`/campaign new` 할 때 옵션을 주면 됩니다:

```
/campaign new "신제품 런칭 사례" --cadence=series-3
```

| 옵션 | 결과 |
|------|------|
| (없음) | 카드 1장 |
| `--cadence=series-3` | 카드 3장 (도입 → 본문 → 마무리) |
| `--cadence=series-5` | 카드 5장 |
| `--cadence=thread` | 텍스트만 (이미지 없음) |

---

## SNS 계정 연결

11개 채널 지원. `/onboard` 단계에서 회사가 쓸 채널을 골라두면, `/campaign new` 의 기본 발행 대상이 됩니다. 채널마다 토큰 한 번씩 등록.

```
/auth add threads
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

토큰 미등록 채널은 자동으로 dry-run 으로만 동작 (`/doctor` 가 빨간 점으로 알려줌).

자세한 페이로드와 발급 절차는 [`commands/auth.md`](commands/auth.md).

저장 위치는 `auth/<채널>.json` — 내 컴퓨터에만 있고, 권한도 본인만 읽기(0600). git에 절대 안 올라갑니다.

---

## 안전장치

다음 4단계가 겹쳐 있어 사고가 나기 어렵습니다:

1. `/approve` 안 한 채널은 발행 거부
2. 회사 금기어가 들어간 글은 `/approve` 자체가 거부
3. `/publish --dry-run` 으로 페이로드만 미리 확인 가능
4. `.env.local` 에 `PUBLISHER_DRY_RUN=true` 두면 모든 `/publish` 가 자동으로 미리보기 모드

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
