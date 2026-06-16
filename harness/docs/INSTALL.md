# INSTALL

사내·고객사가 받자마자 보는 문서. 5분 안에 첫 캠페인 dry-run 까지.

## 1. 클론

```bash
git clone https://github.com/Totaro-int/marketing_agent.git
cd marketing_agent
```

## 2. 한 번에 setup

```bash
node harness/bin/setup.mjs
# 또는 Claude Code 플러그인 링크까지:
node harness/bin/setup.mjs --link=/path/to/your/working/project
```

내부적으로:
- Node 20+ 확인
- `npm install`
- `.env.local` 생성 (`.env.example` 복사)
- `auth/`, `out/`, `campaigns/` 디렉터리 생성
- `harness/bin/*.mjs` + `harness/statusline/statusline.sh` 실행 권한
- (선택) `<link>/.claude/plugins/marketing_agent` 심볼릭 링크

## 3. .env.local — 기본은 그대로 둬도 됨

기본 `CONTENT_ENGINE_PROVIDER=inhouse-slides` 는 **API 키 0개**로 동작.
카피·슬라이드를 Claude Code 서브에이전트가 생성하고, 이미지는 HTML 카드를
Playwright 로 스크린샷한다. (ANTHROPIC_API_KEY 안 씀)

```bash
CONTENT_ENGINE_PROVIDER=inhouse-slides   # 기본 — 키 불필요
```

**AI 가 그린 사진/일러스트**를 쓰고 싶을 때만 키 추가 (선택):
```bash
# CONTENT_ENGINE_PROVIDER=fal
# FAL_KEY=<https://fal.ai/dashboard/keys>
```

오프라인·결정론 테스트는 `CONTENT_ENGINE_PROVIDER=mock`.

## 4. 환경 진단

```bash
node harness/bin/doctor.mjs
```

빨간 점이 없으면 OK.

## 4.5. 브라우저 발행 환경 (Chrome 9222 attach 모드)

`browser-publish.mjs` 는 사용자가 실행 중인 Chrome 에 attach 해서 발행합니다. 채널 로그인은 그 Chrome 안에서 1회만 하면 cookies 가 영구 보존됩니다.

### Chrome 9222 모드로 띄우기 — OS 별

**Windows (PowerShell)**

```powershell
.\scripts\start-demo.ps1
```

또는 수동:

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir="$pwd\auth\chrome-attach-profile" `
  --no-first-run --no-default-browser-check
```

**macOS**

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$(pwd)/auth/chrome-attach-profile" \
  --no-first-run --no-default-browser-check
```

**Linux**

```bash
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$(pwd)/auth/chrome-attach-profile" \
  --no-first-run --no-default-browser-check
```

### 채널 로그인 (1회만)

대시보드 (`node harness/bin/dashboard.mjs`) 띄운 후:

1. http://localhost:7777 접속
2. 좌측 메뉴 **🔌 채널 연결** 클릭
3. 각 채널 카드의 **[🔌 연결]** 버튼 클릭 → Chrome 에 로그인 페이지 열림
4. 로그인 시 **"로그인 유지" / "Remember me" 체크박스 켜고 로그인** (안 켜면 session cookie 라 Chrome 종료 시 사라짐)
5. 다 끝나면 채널 연결 페이지 상단 **[🔄 지금 다시 검사]** 클릭 → 연결 상태 갱신

지원 채널 — 네이버 블로그 (NID_AUT) · Tistory (TSSESSION) · 브런치 (카카오 _kawlt) · Instagram (sessionid) · Threads (sessionid) · LinkedIn (li_at) · Facebook (c_user) · YouTube (Google SID)

### Chrome 9222 안전 종료 (cookies 보존)

**금지** — `taskkill /F`, `Stop-Process -Force`, `kill -9`. cookies SQLite flush 안 돼서 로그인 다 풀림.

**권장** — graceful shutdown helper:

```bash
node harness/bin/chrome-shutdown.mjs --verify
```

또는 Chrome 창 X 버튼으로 직접 닫기.


## 5. 첫 캠페인 사이클 (Claude Code 안에서)

**사용자가 직접 호출하는 슬래시 명령은 4개뿐**입니다. 모든 단계(온보딩·생성·검수·승인·발행)는 `/sns-start` 안에서 자동으로 진행됩니다.

```
/sns-start                # 처음 사용 또는 새 캠페인 — 0~7단계 자동
/sns-repeat               # 슬롯에서 재실행 (반복·예약)
/sns-edit                 # 진행 중 캠페인 수정·재생성
/sns-doctor               # 환경 진단·자격증명·프로필 업데이트
```

내부 단계는 4개 스킬이 `harness/commands/_sns-*.md` 가이드를 참조하며 자동 진행:
| 내부 단계 | 가이드 | 실제 실행 |
|---|---|---|
| 환경 점검 | `_sns-init.md` | `harness/bin/doctor.mjs --quick` |
| 회사 프로필 | `_sns-onboard-company.md` | `harness/bin/profile-validate.mjs` |
| 캠페인 생성 | `_sns-campaign-new.md` | `harness/bin/campaign-new.mjs` |
| 카피·이미지 | `_sns-generate.md` | `harness/bin/generate.mjs` + 에이전트 |
| 검수 | `_sns-preview.md` | `harness/bin/preview.mjs`, `harness/bin/inspect-guidelines.mjs` |
| 승인/거절 | `_sns-approve.md` / `_sns-reject.md` | `harness/bin/approve.mjs` / `harness/bin/reject.mjs` (학습 hook 자동) |
| 발행 | (커맨드 내 안내) | `harness/bin/browser-publish.mjs` (크롬 쿠키) · 대시보드 [발행] · `npm run morning` |
| 발행 인증 | (browser-publish) | 크롬에 채널 1회 로그인 → 쿠키 재사용 (별도 토큰/OAuth 없음) |

bin 스크립트 직접 호출(고급/디버깅용):
```bash
node harness/bin/campaign-new.mjs "..."
node harness/bin/generate.mjs <slug> --all
node harness/bin/board.mjs --watch
node harness/bin/learn.mjs show           # 누적 학습 상태 확인
```

## 6. 안전 모드

기본 권장:
```bash
# .env.local
PUBLISHER_DRY_RUN=true
```

실 발행 시점에만 끄고, 끝난 뒤 다시 켜는 운영 흐름.

## 7. 문제 생기면

- `node harness/bin/doctor.mjs` 결과 캡처
- `auth/` (크롬 프로필·쿠키)은 절대 공유 금지 — SNS 로그인 세션이 들어있음
- fal/openai 비용은 provider 대시보드에서 직접 확인
- 자세한 운영 지침: [OPERATIONS.md](OPERATIONS.md)
