# Claude Code 설치 가이드 (현장 설치용)

> **이 문서는 Claude Code 가 직접 따라 실행하는 설치 런북이다.**
> 설치 담당자는 클라이언트 PC 에서 Claude Code 를 열고 이 문서를 가리키며
> "이 문서 따라 설치 진행해줘" 라고 하면 된다.
>
> Claude 에게: 아래 PHASE 0 → 9 를 **순서대로** 실행한다. 각 PHASE 끝의
> **✅ 검증 게이트**를 통과하지 못하면 멈추고 사람에게 알린다. 다음 PHASE 로
> 넘어가지 않는다. 🧑 표시는 **사람(담당자/사장님)이 직접 해야 하는 일** —
> Claude 가 대신 못 한다 (로그인 비밀번호, API 키 붙여넣기, 프로필 답변).

목표: 설치 → **매일 아침 컴퓨터 켜면 자동으로 "발행 직전 화면"까지** 준비.
사장님은 Chrome 탭에서 [공유]/[발행] 클릭만.

핵심 사실 (헷갈리지 말 것):
- 기본 `CONTENT_ENGINE_PROVIDER=inhouse-slides` 는 **API 키 0개**로 동작.
  카피·슬라이드는 Claude Code 서브에이전트가 만들고, 이미지는 HTML 카드를
  Playwright 로 스크린샷. `ANTHROPIC_API_KEY` 는 **쓰지 않는다**.
- 키가 필요한 건 **AI 가 그린 사진/일러스트**(fal/openai)를 쓸 때 뿐 → PHASE 4 (선택).

---

## PHASE 0 — 사전 확인

```bash
node --version          # v20 이상이어야 함
git rev-parse --show-toplevel   # 레포 루트 확인 (클론 위치)
```

OS 판별: Windows 면 PowerShell 스크립트(`.ps1`), macOS/Linux 면 `.sh` 를 쓴다.
이 문서의 명령은 양쪽 다 표기한다.

**✅ 검증 게이트**: Node ≥ v20, 레포 루트가 잡힌다.
- Node 가 낮거나 없으면 → 사람에게 https://nodejs.org 설치 요청 후 중단.

---

## PHASE 1 — setup (의존성 + 런타임 디렉토리)

```bash
node harness/bin/setup.mjs
```

자동으로: `npm install` · `.env.local` 생성(`.env.example` 복사) ·
`auth/ out/ posts/campaigns/ posts/by-channel/` 생성 · 실행 권한.
멱등 — 다시 돌려도 안전.

**✅ 검증 게이트**: `.env.local` 존재, `node_modules` 존재.

---

## PHASE 2 — 환경 진단

```bash
node harness/bin/doctor.mjs
```

**✅ 검증 게이트**: 아래가 전부 green 이어야 다음으로.
- `runtime` (Node/package.json/node_modules)
- `env` (`.env.local`, `CONTENT_ENGINE_PROVIDER=inhouse-slides`)
- `content-engine` → `playwright` green (없으면 `npx playwright install chromium`)

> 이 시점에 `publisher`/`channels`/`cookie-auth` 경고는 **정상**이다 (아직 로그인 전).
> 빨간 `✗` 가 runtime/env/content-engine 에 있으면 멈추고 detail 대로 처리.

---

## PHASE 3 — 브랜드 DNA (company-profile.yaml)  🧑

회사 프로필이 카피·해시태그·톤·금기어·캘린더 전부의 입력이다. 두 경로:

**경로 A (권장) — Claude Code 인터뷰**: Claude Code 안에서 `/sns-start` 실행.
첫 사용이면 회사 프로필 인터뷰부터 자동 진행된다. 🧑 사장님이 질문(브랜드명,
업종, 톤, 채널, 금기어 등)에 답하면 Claude 가 `company-profile.yaml` 을 작성.

**경로 B — 예시 복사 후 편집**:
```bash
cp harness/examples/company-profile.example.yaml company-profile.yaml
```
🧑 핵심 필드를 채운다: `brand.name`/`brand.korName`, `industry`,
`tone.preset`(relate-kr|b2b|informational|friendly|sales),
`hashtags.always`+`hashtags.pool`, `channels.enabled`, `banned`.

검증:
```bash
node harness/bin/profile-validate.mjs
```

**✅ 검증 게이트**: `profile-validate` 통과(스키마 위반 0), `doctor` 의 `profile` green.

---

## PHASE 4 — (선택) AI 이미지 키 FAL_KEY  🧑

> 기본 카드뉴스(inhouse-slides)만 쓸 거면 **이 PHASE 건너뛴다 — 키 불필요.**
> 배경에 AI 가 그린 사진/일러스트를 섞고 싶을 때만.

🧑 https://fal.ai/dashboard/keys 에서 키 발급(사람이). 입력 방법 둘:

**대시보드(권장, PHASE 5 이후)**: http://localhost:7777 → ⚙ 환경 설정 →
`FAL_KEY` 입력 → [검증] → [저장]. (`.env.local.bak` 자동 백업)

**또는 `.env.local` 직접**:
```dotenv
CONTENT_ENGINE_PROVIDER=fal
FAL_KEY=fal_...
# FAL_IMAGE_MODEL 값에는 인라인 주석(  # ...) 붙이지 말 것
```

주의: AI 이미지 모델엔 한글 타이포를 그리게 하면 깨진다. 텍스트 오버레이는
inhouse-slides 레이어가 담당하므로, fal 은 **배경 비주얼 용도**로만.

**✅ 검증 게이트**: (이 PHASE 를 했다면) 대시보드 [검증] 에서 `✓ FAL 통과`.

---

## PHASE 5 — Chrome 9222 + 대시보드 시작

```powershell
# Windows
powershell -ExecutionPolicy Bypass -File scripts\start-demo.ps1
```
```bash
# macOS / Linux
bash scripts/start-demo.sh
```

한 번에: Chrome(디버그 포트 9222, 전용 프로필) + 대시보드(http://localhost:7777)
+ 대시보드 탭 열기. 이미 떠 있으면 건너뛴다(멱등).

**✅ 검증 게이트**:
```bash
node harness/bin/doctor.mjs        # 'Chrome 9222 attach live' + 'dashboard 7777 live'
```

---

## PHASE 6 — SNS 채널 로그인  🧑

🧑 **사장님이 직접 로그인한다** (Claude 가 비밀번호를 대신 칠 수 없다).

대시보드 → 🔌 채널 연결 → **📡 마법사 시작**. 미연결 채널마다 Chrome 탭이
열린다 → 사장님이 로그인 → 자동 감지.

로그인 시 **"로그인 유지 / Remember me" 체크박스 켜기** (안 켜면 Chrome 닫을 때
쿠키 날아감).

권장 채널 (발행 함수 검증됨): **naver-blog · instagram · threads · linkedin**

쿠키 수명 (현실):
- Instagram / Threads — 장기 (수주)
- LinkedIn — 약 5일
- Naver Blog — 세션 만료 잦음 (아침마다 재로그인 가능성 → PHASE 9 가 자동 안내)
- Tistory — 글쓰기에 추가 인증, 불안정

**✅ 검증 게이트**:
```bash
node harness/bin/doctor.mjs        # cookie-auth: 로그인한 채널 '쿠키 살아있음'
```
최소 1개 채널이 green 이어야 리허설 의미가 있다.

> **로그인 지속성**: 한번 로그인하면 쿠키가 `auth/cookies/<채널>.json`에 자동 스냅샷되고
> (로그인 감지 시 + graceful 종료 시), 다음 시작(start-demo)·매일 아침(morning)에 **없으면 복원**된다.
> 그래서 강제종료·프로필 손상에도 로그인이 유지된다. (복원은 현재 로그인을 절대 덮어쓰지 않음)
> 수동 확인: `npm run cookies status` · 강제 스냅샷: `npm run cookies save`.
> 단 **네이버는 서버가 세션을 만료**시키면 복원해도 무효 — 그때만 재로그인 (morning preflight 자동 안내).

---

## PHASE 7 — 캘린더 생성 (브랜드 DNA → 30일)

🧑 주제 파일 `topics.txt` 준비. (Claude 에게 "company-profile 보고 30개 주제 뽑아줘"
요청 → `harness/examples/topics.example.txt` 형식으로 저장.)

```bash
node harness/bin/seed-calendar.mjs --topics topics.txt \
  --start <오늘 또는 내일 YYYY-MM-DD> \
  --channels naver-blog,instagram,threads,linkedin \
  --status approved
```

브랜드명·해시태그·톤·채널은 company-profile 에서 자동 주입.

**✅ 검증 게이트**: 대시보드 캘린더에 캠페인 점 표시, 또는
`node harness/bin/board.mjs` 에 캠페인 목록.

> 카피/이미지 carousel 은 PHASE 9(morning)가 자동 생성한다. seed-calendar 는
> "캘린더 뼈대 + 브랜드 해시태그"까지.

---

## PHASE 8 — 매일 아침 자동 실행 등록

```powershell
# Windows
powershell -ExecutionPolicy Bypass -File scripts\install-morning-cron.ps1 -Time "09:00"
```
```bash
# macOS / Linux
bash scripts/install-morning-cron.sh --time=09:00
```

트리거 2개(자동): 로그인 시(30초 후) + 매일 09:00.

**✅ 검증 게이트**:
```powershell
# Windows
powershell -ExecutionPolicy Bypass -File scripts\install-morning-cron.ps1 -Status
```
```bash
# macOS / Linux
bash scripts/install-morning-cron.sh --status
```
등록됨(Registered/Ready) 확인.

---

## PHASE 9 — 리허설 (즉시 1회 실행)

```bash
npm run morning
```

기대 동작 (순서대로):
1. **사전 인증 검증** → 만료 채널 있으면 로그인 페이지 자동 오픈 + 데스크탑 알림
2. 만료 채널 있으면 **최대 3분 로그인 대기** — 🧑 그 자리에서 로그인하면 자동
   감지해서 진행 (재실행 불필요). `--no-wait-login` 으로 끌 수 있음.
3. 오늘 캠페인마다: **draft 없으면 카피+이미지 자동 생성** → brand-guardian 검수
   (block 이면 SKIP+보고) → **browser-publish --pre-publish** (모달 열고 본문
   붙여넣고 이미지 첨부까지, **발행 버튼 직전에서 멈춤**)
4. 채널마다 **Chrome 새 탭에 발행 직전 화면** (사장님 기존 탭은 보존)
5. 완료 데스크탑 알림 ("발행 대기 N · 로그인 M") + `logs/morning-result.json`

**✅ 최종 검증 게이트**: Chrome 에 발행 직전 탭이 N개 떠 있다.
🧑 사장님이 각 탭 검토 후 [공유]/[발행] 클릭 → 끝.

옵션: `--no-wait-login`(대기 끔) · `--wait-login=300`(초) · `--max=N`(처리 수, 기본 5) ·
`--dry-run`(Chrome 모달 안 열고 시뮬레이션).

---

## 설치 완료 인계 (사장님께 한 줄)

> "매일 아침 컴퓨터 켜면 자동으로 발행 직전까지 준비됩니다.
> 알림 뜨면 Chrome 탭 확인 → 검토 후 [공유] 클릭.
> Naver 는 로그인 만료 시 알림이 뜨니 그때만 다시 로그인하시면 됩니다."

## 막히면

| 증상 | 확인 |
|------|------|
| 9시에 아무것도 안 뜸 | `logs/morning-routine.log` + PHASE 8 `-Status` |
| 채널 빈 탭 | 인증 만료 → 마법사 재로그인 후 `npm run morning` |
| Chrome 안 뜸 | PHASE 5 `start-demo` 재실행 / doctor 의 Chrome 9222 확인 |
| 카피·이미지 비어있음 | seed-calendar 는 뼈대만 — morning 이 생성. generate 로그 확인 |
| `Cannot find module bin/...` | 경로는 `harness/bin/...` (루트에 `bin/` 없음) 또는 `npm run <script>` |

상세: [ONBOARDING.md](ONBOARDING.md) (사람용 런북) · [OPERATIONS.md](OPERATIONS.md) (운영) ·
[INSTALL.md](INSTALL.md) (요약 설치).
