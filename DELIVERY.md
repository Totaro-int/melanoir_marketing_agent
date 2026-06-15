# marketing_agent 납품 가이드

> 대상: Totaro 납품 담당자 + 고객사 담당자

---

## Part 1. 납품 전 — Totaro 담당자 체크리스트

고객사에 넘기기 전 아래 항목을 순서대로 처리합니다.

### 1-1. 레포 복제

```bash
git clone https://github.com/Totaro-int/marketing_agent.git <고객사-식별자>_marketing_agent
cd <고객사-식별자>_marketing_agent
```

> 고객사마다 별도 레포를 사용합니다. 공통 base는 `main` 브랜치에서 `git pull`로 수시 갱신 가능.

### 1-2. plugin.json 고객사명 등록

```bash
# .claude-plugin/plugin.json
# "author": { "name": "{{고객사명}}" }  →  실제 고객사명으로 교체
```

### 1-3. 회사 프로필 작성

```bash
cp harness/examples/company-profile.example.yaml company-profile.yaml
```

`company-profile.yaml`을 고객사 정보로 채웁니다. 작성 기준:

| 항목 | 필수 | 설명 |
|------|:----:|------|
| `brand.name` | ✓ | 브랜드명 (카피에 직접 사용됨) |
| `taglineOneLine` | ✓ | 한 줄 슬로건 |
| `industry` | ✓ | 업종 (카피 톤에 영향) |
| `targetAudience` | ✓ | 페르소나 1-2개 + 페인포인트 |
| `tone.preset` | ✓ | `professional` / `friendly` / `b2b` / `informational` / `sales` |
| `tone.voiceNotes` | ✓ | 문체·이모지·금지 표현 지침 |
| `tone.sampleSentences` | ✓ | 브랜드 목소리 예시 2-3문장 |
| `banned.words` | ✓ | 절대 사용 금지 단어 목록 |
| `visual.colors` | ✓ | primary / accent / background hex |
| `hashtags` | ✓ | 고정 해시태그 + 풀 |
| `channels.enabled` | ✓ | 실제 운영할 채널만 (나머지는 dry-run) |

스키마 전체: `harness/schemas/company-profile.schema.yaml`

### 1-4. 환경변수 설정

```bash
cp .env.example .env.local
```

최소 설정:

```dotenv
# 이미지 생성 방식 선택
CONTENT_ENGINE_PROVIDER=inhouse-slides   # 기본 — 외부 API 키 0개 (Claude Code 가 카피·슬라이드 직접 생성)
# CONTENT_ENGINE_PROVIDER=fal           # fal.ai AI 이미지 생성 (FAL_KEY 필요)
# CONTENT_ENGINE_PROVIDER=mock          # 오프라인 테스트용

# FAL_KEY=fal_...                       # fal provider 선택 시에만 필요
# OPENAI_API_KEY=sk-...                 # openai provider 선택 시에만 필요

PUBLISHER_DRY_RUN=true                  # 납품 전까지 반드시 true 유지
```

> **API 키 없이 동작합니다.** 기본 inhouse-slides 는 카피·슬라이드를
> Claude Code 서브에이전트 (copywriter / image-director) 가 만듭니다.
> `ANTHROPIC_API_KEY` 는 코드에서 쓰지 않습니다 (anthropic provider 도 byok:false).

### 1-5. 설치 및 진단

```bash
node harness/bin/setup.mjs
node harness/bin/doctor.mjs
```

`doctor.mjs` 출력에 빨간 항목이 없어야 납품 가능합니다.

### 1-6. 납품 전 dry-run 검증

Claude Code에서:

```
/sns-start "납품 전 테스트"
```

- 카피 생성 → 이미지 생성 → 브랜드 검수까지 오류 없이 통과 확인
- `PUBLISHER_DRY_RUN=true` 상태라 실제 발행은 안 됨

### 1-7. 납품 파일 전달

고객사에 전달하는 것:

| 파일 | 방법 |
|------|------|
| 레포 전체 | git clone URL 또는 zip |
| `company-profile.yaml` | 레포에 **포함하지 말고** 별도 전달 (민감 정보) |
| `.env.local` | 레포에 **절대 포함 금지**, 별도 전달 |
| 이 문서 (`DELIVERY.md`) | 레포에 포함 |

---

## Part 2. 고객사 설치 가이드

### 사전 요구사항

| 항목 | 버전 |
|------|------|
| Node.js | 20 이상 |
| Claude Code CLI | 최신 (`npm i -g @anthropic-ai/claude-code`) |
| OS | macOS / Linux / Windows (WSL2) |
| Chromium | Playwright가 자동 설치 (inhouse-slides 사용 시) |

### Step 1. 레포 받기

담당자에게 받은 레포를 클론하거나 zip을 풀고, 터미널에서 해당 폴더로 이동합니다.

```bash
cd marketing_agent   # 폴더명은 담당자가 알려줌
```

### Step 2. 설치

```bash
node harness/bin/setup.mjs
```

자동으로 처리되는 것:
- npm 패키지 설치
- `.env.example` → `.env.local` 복사 (이미 있으면 스킵)
- `auth/`, `out/` 폴더 생성
- 스크립트 실행 권한 설정

### Step 3. 환경변수 입력

담당자에게 받은 `.env.local` 내용을 프로젝트 루트의 `.env.local`에 붙여넣습니다.

### Step 4. 회사 프로필 배치

담당자에게 받은 `company-profile.yaml`을 프로젝트 루트에 놓습니다.

```
marketing_agent/
├── company-profile.yaml   ← 여기
├── .env.local             ← 여기
└── ...
```

### Step 5. 진단

```bash
node harness/bin/doctor.mjs
```

모든 항목이 초록색이면 OK. 빨간 항목이 있으면 출력된 안내를 따릅니다.

### Step 6. Claude Code 플러그인 등록

터미널에서 `claude`를 실행한 후, Claude 안에서 순서대로 입력합니다.

**6-A. 마켓플레이스 등록** (경로는 실제 본인 경로로 교체)

```
/plugin marketplace add /Users/나의이름/marketing_agent
```

**6-B. 설치**

```
/plugin install marketing_agent@marketing_agent
```

**6-C. 재로드**

```
/plugin reload
```

**6-D. 확인**

```
/help
```

→ `/sns-start`, `/sns-repeat`, `/sns-edit`, `/sns-doctor` 4개가 목록에 보이면 성공.

---

## Part 3. 첫 실행 — 고객사 담당자

### 3-1. 환경 확인

```
/sns-doctor
```

빨간 항목이 없으면 바로 시작 가능합니다.

### 3-2. 첫 캠페인 (dry-run)

```
/sns-start "첫 번째 테스트 캠페인"
```

처음 실행은 `PUBLISHER_DRY_RUN=true` 상태로 진행하여 실제 발행 없이 흐름을 확인합니다.

카피와 이미지가 마음에 들면:

```
/sns-edit
```

수정 후 재생성할 수 있습니다.

### 3-3. SNS 계정 연결

실제 발행을 위해 SNS 토큰을 등록합니다.

```
/sns-doctor auth add threads
/sns-doctor auth add linkedin
/sns-doctor auth add instagram
```

채널별 토큰 발급 방법은 각 채널 개발자 콘솔을 참고하거나 담당자에게 문의합니다.

토큰 등록 후 확인:

```
/sns-doctor
```

### 3-4. 실제 발행 활성화

SNS 계정 연결이 완료되면 `.env.local`에서 dry-run을 해제합니다.

```dotenv
# PUBLISHER_DRY_RUN=true   ← 이 줄을 주석 처리 또는 false로 변경
```

이후 `/sns-start`로 캠페인을 만들고 승인하면 실제 SNS에 발행됩니다.

---

## Part 4. 일상 운영

| 상황 | 명령 |
|------|------|
| 새 캠페인 만들기 | `/sns-start "주제"` |
| 이전 캠페인 다시 돌리기 | `/sns-repeat` |
| 생성된 내용 수정 | `/sns-edit` |
| 환경 이상 / 계정 변경 | `/sns-doctor` |

자세한 운영 방법: `harness/docs/OPERATIONS.md`

### 4-A. Morning Routine — 명령어 1개로 발행 직전까지

매일 아침 컴퓨터 켜고 `npm run morning` 1줄이면:
1. Chrome 9222 + 대시보드 자동 시작
2. 오늘 캠페인의 각 채널 (status=approved) 발행 직전 자동 준비
3. Chrome 새 탭 N개에 발행 직전 상태 (모달 + 카피 + 이미지)
4. 사용자 검토 → 각 탭에서 [공유]/[발행] 클릭만

**수동 실행**:

```bash
# macOS / Linux
bash scripts/morning.sh

# Windows
powershell -ExecutionPolicy Bypass -File scripts\morning.ps1
```

또는 npm:

```bash
npm run morning           # 실 발행 준비
npm run morning:dry       # 시뮬레이션 (Chrome 모달 안 엶)
```

### 4-B. 매일 자동 실행 등록 (Task Scheduler / launchd)

컴퓨터 켤 때 + 매일 정시 (default 09:00) 자동 실행 등록:

**macOS / Linux**:

```bash
bash scripts/install-morning-cron.sh                   # 등록
bash scripts/install-morning-cron.sh --time=08:00      # 시각 변경
bash scripts/install-morning-cron.sh --status          # 상태 확인
bash scripts/install-morning-cron.sh --uninstall       # 제거
```

macOS — `~/Library/LaunchAgents/com.marketing-agent.morning-routine.plist`
Linux — systemd user timer 또는 crontab fallback (자동 감지)

**Windows**:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-morning-cron.ps1
powershell -ExecutionPolicy Bypass -File scripts\install-morning-cron.ps1 -Time "08:00"
powershell -ExecutionPolicy Bypass -File scripts\install-morning-cron.ps1 -Status
powershell -ExecutionPolicy Bypass -File scripts\install-morning-cron.ps1 -Uninstall
```

Task Scheduler 의 `MarketingAgentMorningRoutine` 작업으로 등록됨.

**기본 트리거 2가지** (3 OS 동일):
- 사용자 로그인 시 (30초 지연) — 컴퓨터 켤 때 자동
- 매일 09:00 (시각 변경 가능) — 이미 켜져 있으면 그 시각

**로그**: `logs/morning-routine.log` (시작 시간 + 결과 + 에러)

⚠ **컴퓨터 자동 부팅** (BIOS Wake Timer 등) 은 OS 스케줄러 영역 밖. 매일 정시 발행 위해 컴퓨터가 그 시각에 켜져 있어야.

### 4-C. 채널별 작동 상태 (정직한 납품 기준)

morning routine 이 **발행 직전까지 자동** 처리하는 채널:

| 채널 | 자동화 | 인증(cookie) 정책 | 비고 |
|------|--------|------------------|------|
| **Instagram** | ✅ 완전 자동 | sessionid — 장기 유지 (수주~수개월) | 모달 + 이미지 + 캡션 |
| **Threads** | ✅ 완전 자동 | sessionid — 장기 유지 | 컴포저 + 텍스트 (3단계 paste 검증) |
| **Naver Blog** | ✅ 자동 (인증 시) | NID_AUT — **세션 만료 잦음** | SmartEditor segment paste + 발행 모달 |
| **LinkedIn** | ✅ 자동 (인증 시) | li_at — 약 5일 유지 | 피드 일반 post 모달 |
| **Tistory** | ⚠ 인증 불안정 | TSSESSION — 글쓰기 페이지 추가 인증 필요 | 인증 부족 시 명확히 skip + 알림 |
| Brunch | ⚠ 작가 승인 필요 | 계정 자격 이슈 | draft 저장만 |

**핵심 동작 — 인증 만료 자동 처리** (P0 안정성):
- routine 시작 시 모든 대상 채널의 cookie 를 자동 검증
- 만료된 채널은 (1) 데스크탑 알림 (2) 로그인 페이지 자동 오픈 (3) 그 채널만 skip
- → **만료 채널 때문에 전체 routine 이 멈추거나 빈 탭이 뜨는 일 없음**

**인증 만료 시 사용자 액션** (30초):
1. 데스크탑 알림 확인 → Chrome 의 로그인 탭에서 로그인
2. `npm run morning` 다시 실행 (또는 다음날 자동)

**결과 알림**: routine 완료 시 "발행 대기 N · 로그인 필요 M · 실패 K" 데스크탑 알림 + `logs/morning-result.json` 기록. 9시 자동 실행이 깨져도 즉시 인지 가능.

---

## Part 5. 업데이트

base 템플릿에 새 기능이 추가되면 담당자가 알려줍니다.

```bash
git pull
node harness/bin/setup.mjs   # 새 의존성 설치
```

Claude Code 안에서:

```
/plugin update marketing_agent
```

---

## 문제 해결

| 증상 | 확인 사항 |
|------|---------|
| `/help`에 sns- 명령 없음 | `/plugin reload` 실행 |
| `company-profile.yaml not found` | 파일을 프로젝트 루트에 놓았는지 확인 |
| 이미지 생성 실패 | `CONTENT_ENGINE_PROVIDER` 값 확인. fal 쓰면 `FAL_KEY` 유효성. inhouse-slides 면 Playwright 설치 확인 (`node harness/bin/doctor.mjs`) |
| SNS 발행 실패 | `/sns-doctor` 실행 → 빨간 항목 확인 |
| 카피가 브랜드 톤과 다름 | `company-profile.yaml`의 `tone.voiceNotes`, `sampleSentences` 보강 |

상세 트러블슈팅: `harness/docs/INSTALL.md`
