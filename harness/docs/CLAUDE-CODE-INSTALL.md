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
- 키가 필요한 건 **블로그(naver-blog) 본문 인라인 이미지**(fal) 뿐 →
  **블로그 채널이 있으면 PHASE 4 필수**, 소셜 카드만이면 키 0개(PHASE 4 생략).
- ⚠ **실행 환경 (이거 틀리면 발행이 안 됨)**: 발행(브라우저 로그인)은 **로컬에서 도는 Claude Code** 에서만 된다.
  - ✅ 가장 확실: 클라이언트 Mac/PC **터미널에서 `claude` CLI** 로 실행.
  - 🖥 데스크탑 앱이면 Environment 를 **`Local`** 로 + 플러그인은 **UI(+ → Plugins → Add plugin)** 로 추가 (기본 `Remote`=클라우드라 발행 불가 + 플러그인 안 보임 — `libXdamage`·`ECONNREFUSED 9222` 에러의 정체). **자세히: `harness/docs/CLAUDE-DESKTOP.md`**
  - 생성·검수는 `Remote` 에서도 됨. `node harness/bin/doctor.mjs` 의 **"실행환경(발행)"** 행이 `warn` 이면 Local/CLI 로 전환 후 진행.

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

## PHASE 1 — 설치 (의존성 + Claude Code 플러그인 등록)

### 1-A. 의존성·런타임 설치

```bash
node harness/bin/setup.mjs
```

자동으로: `npm install` · **Playwright Chromium 다운로드(~150MB)** · `.env.local` 생성(`.env.example` 복사) ·
`auth/ auth/cookies/ out/ posts/campaigns/ posts/by-channel/ posts/sources/ logs/` 생성 · 실행 권한.
멱등 — 다시 돌려도 안전.
> ⚠ Playwright Chromium 은 카드 캡처 + browser-publish 에 **필수**. `npm install` 만으론 안 깔린다 —
> setup 이 `npx playwright install chromium` 까지 해준다. (이게 빠지면 "다른 컴퓨터에서 안 됨"의 #1 원인.)

### 1-B. Claude Code 진입 + 플러그인 등록 (← 이걸 해야 `/sns-start` 가 보인다)

이 하네스는 **Claude Code 플러그인**이라 등록해야 `/sns-start` 등 스킬이 나타난다.
**발행은 "로컬에서 도는 Claude Code"에서만 된다** (위 핵심 사실 참고). 두 경로 중 하나:

**경로 A — 터미널 CLI (가장 확실·권장)**
```bash
npm install -g @anthropic-ai/claude-code     # (없으면) Claude Code CLI 설치
claude                                        # 레포 폴더에서 진입
```
그 다음 **`claude` 안에서** — 경로에 공백/대괄호 있으면 따옴표 유지 (`setup.mjs` 가 정확한 경로를 출력해준다):
```
/plugin marketplace add "<레포 절대경로>"
/plugin install marketing_agent@marketing_agent
/plugin reload
```

**경로 B — 데스크톱 앱 (Mac/Windows)**
1. 데스크톱 앱 → **Code 탭** → 레포 폴더 열기
2. **Environment 드롭다운 → `Local`** (필수 — 기본 `Remote`=클라우드는 발행 불가 + 플러그인 안 보임)
3. 입력창 옆 **`+` → Plugins → Add plugin** → 레포 폴더(또는 마켓플레이스 `Totaro-int/melanoir_marketing_agent`) → enable
   (데스크톱엔 `/plugin` 명령이 없다 — **UI 매니저**로 추가한다.)
> 데스크톱 상세: `harness/docs/CLAUDE-DESKTOP.md`

**✅ 검증 게이트**: `node_modules`·`.env.local` 존재 + Claude Code 에서 `/` 입력 시
**`/sns-start`(또는 `/marketing_agent:sns-start`) 가 보인다.**
- 안 보이면 → (CLI) `/plugin reload` · (데스크톱) Environment=`Local` + 플러그인 enable 확인.

---

## PHASE 2 — 환경 진단 (= 설치 확인)

설치가 제대로 됐는지 **두 명령으로 확인**한다:

```bash
node harness/bin/doctor.mjs       # 런타임·키·Playwright·채널 진단
node harness/bin/self-check.mjs   # 보안·git위생·런타임 (자동수정: self-check.mjs --fix)
```

**✅ 검증 게이트**: 아래가 전부 green 이어야 다음으로.
- `runtime` (Node/package.json/node_modules) · `실행환경(발행)` ok
- `env` (`.env.local`, `CONTENT_ENGINE_PROVIDER=inhouse-slides`)
- `content-engine` → `playwright` green (없으면 `npx playwright install chromium`)
- self-check: `모두 정상` (🚨 치명 0). 치명이면 `node harness/bin/self-check.mjs --fix`

> 이 시점에 `publisher`/`channels`/`cookie-auth` 경고는 **정상**이다 (아직 로그인 전).
> 빨간 `✗` 가 runtime/env/content-engine 에 있으면 멈추고 detail 대로 처리.

---

## PHASE 3 — 브랜드 DNA (company-profile.yaml)  🧑

회사 프로필이 카피·해시태그·톤·금기어·캘린더 전부의 입력이다.

**🎨 브랜드북(PDF) 있으면 먼저 — 시각/톤이 자동으로 잡힌다:**
브랜드북을 `posts/sources/` 에 두고 텍스트 추출:
```bash
node harness/bin/parse-pdf.mjs "<브랜드북.pdf>" --out=posts/sources/brandbook.md
```
추출된 텍스트(태그라인·컬러 HEX·폰트·보이스·미학)를 인터뷰가 읽고 `company-profile.yaml` 의 아래를 자동으로 채운다 (🧑 사람은 확인·보정만):
- `taglineOneLine` ← 브랜드 태그라인
- `tone.preset`/`voiceNotes` ← 브랜드 보이스 (예: Professional·Scientific·Precise → preset `premium`/`professional` + voiceNotes)
- `visual.colors`/`visual.fonts` ← 컬러 팔레트 HEX + 타이포 (예: `#0A0A0C`·`#FFFFFF`, Pretendard)
- `imageStyle.aesthetic`/`colorMood` ← 미학 (예: monochromatic scientific minimalism → `custom` + `high_contrast`)

→ 이렇게 잡힌 `visual`/`imageStyle` 을 image-director 가 카드에 그대로 반영해서 **브랜드북과 일치하는 카드뉴스**가 나온다. (멜라누아 = "Safest Black", jet black + Pretendard 모노톤이 이 경로로 들어옴.)

그 다음 두 경로 중 하나로 나머지 필드:

**경로 A (권장) — Claude Code 인터뷰**: Claude Code 안에서 `/sns-start` 실행.
첫 사용이면 회사 프로필 인터뷰부터 자동 진행된다. 🧑 사장님이 질문(브랜드명,
업종, 톤, 채널, 금기어 등)에 답하면 Claude 가 `company-profile.yaml` 을 작성.

**경로 B — 예시 복사 후 편집**:
```bash
cp harness/examples/company-profile.example.yaml company-profile.yaml
```
🧑 핵심 필드를 채운다: `brand.name`/`brand.korName`, `industry`,
`tone.preset`(professional|friendly|witty|bold|calm|premium|custom),
`hashtags.always`+`hashtags.pool`, `channels.enabled`, `banned`.

검증:
```bash
node harness/bin/profile-validate.mjs
```

**✅ 검증 게이트**: `profile-validate` 통과(스키마 위반 0), `doctor` 의 `profile` green.

---

## PHASE 4 — 블로그 인라인 이미지용 fal 키 (FAL_KEY)  🧑

> **활성 채널이 소셜 카드(instagram·threads·linkedin 등)뿐이면 이 PHASE 건너뛴다 — 키 0개.**
> 카드는 Claude HTML 카드(`inhouse-slides`)라 API 키가 필요 없다.
>
> **단 블로그(naver-blog) 본문 인라인 이미지는 fal 로 생성** → fal 키가 필요하다.
> 블로그는 카드가 아니라 본문 article + **섹션마다 인라인 이미지**로 나가고, 그 인라인
> 이미지는 `gen-image.mjs`(fal)로 생성된다 — `CONTENT_ENGINE_PROVIDER` 값과 **무관하게 항상 fal**.
> 키가 없으면 블로그 생성이 "FAL_KEY 없음"으로 중단된다.

### 4-1. fal 키 발급  🧑

🧑 https://fal.ai/dashboard/keys 에서 키 발급(가입 즉시 키). abstract/editorial 이미지 —
멜라누아 모노톤(jet black + Pretendard)에 적합. (Claude 가 Chrome 새 탭으로 콘솔을 열어줄 수
있다 → 클라이언트 로그인 → [Create API key] → 키 복사. 자동 클릭이 막히면 직접 생성.)

### 4-2. 키 저장 + 검증

**대시보드(권장, PHASE 5 이후)**: http://localhost:7777 → ⚙ 환경 설정 → `FAL_KEY` 입력 →
**[검증]**(실 API 호출로 잔액 확인) → **[저장]**(`.env.local` 기록 + `.env.local.bak` 백업).

**또는 `.env.local` 직접** — `CONTENT_ENGINE_PROVIDER` 는 **`inhouse-slides` 그대로 두고**
`FAL_KEY` 만 추가한다 (소셜 카드는 HTML 카드로, 블로그 이미지는 fal 로):
```dotenv
CONTENT_ENGINE_PROVIDER=inhouse-slides   # 소셜 카드 = Claude HTML 카드 (키 0)
FAL_KEY=...                              # 블로그 인라인 이미지 = fal (gen-image.mjs)
# FAL_IMAGE_MODEL 값에 인라인 주석(  # ...) 붙이지 말 것 (기본 fal-ai/nano-banana-2)
```
> 이미지 전체(소셜 카드까지)를 fal 로 만들고 싶을 때만 `CONTENT_ENGINE_PROVIDER=fal` —
> 그러면 카드가 HTML 이 아니라 fal 이미지가 되고 PHASE 2 게이트도 fal 로 바뀐다.

> 한글 타이포는 AI 이미지에 그리지 않는다(깨짐). 텍스트는 글 본문에, 이미지는 abstract/
> editorial 비주얼로 — 블로그 **섹션마다 인라인 배치**된다 (한꺼번에 위에 X).

**✅ 검증 게이트**: (블로그 채널이 있으면) 대시보드 [검증] `✓ FAL 통과` 또는
`node harness/bin/doctor.mjs` 의 `content-engine → provider: fal` 가 green.

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

## 추가 도구 (대시보드 탭 — start-demo 하면 자동 기동)

발행 자동화 외에, 대시보드(http://localhost:7777) 사이드바에 두 도구가 있다:
- **📝 복붙 덱** — 채널별 완성 카피를 [복사] → 플랫폼에 직접 붙여넣기. 브라우저 자동발행이 봇으로 의심될 때 쓰는 수동 발행. (단독: `npm run deck`)
- **📸 카드 스튜디오** — 배경 사진 업로드 + 그 위에 정보성 텍스트 → 인스타 카드레터 PNG. 라이브 미리보기 + 다운로드. (단독: `npm run studio` · 자세히 `harness/docs/COPY-DECK.md`·`INSIGHT-CARDS.md`)

## 막히면

| 증상 | 확인 |
|------|------|
| **`/sns-start` 등 스킬이 안 보임** | 플러그인 미등록 — PHASE 1-B. (CLI) `/plugin reload` · (데스크톱) Environment=`Local` + 플러그인 enable |
| **`libXdamage`·`ECONNREFUSED 9222`·발행 불가** | 클라우드(`Remote`) 환경임 → 터미널 `claude` CLI, 또는 데스크톱 Environment=`Local` 로 전환 |
| **네이버 OAuth/토큰 요구** | 옛 경로(제거됨). 발행은 browser-publish(크롬 쿠키)뿐 — `start-demo` → 네이버 1회 로그인 |
| **카드/블로그 이미지 안 나옴** | Playwright Chromium 미설치 → `node harness/bin/setup.mjs` 다시 실행 · 블로그는 `FAL_KEY`(PHASE 4) |
| 9시에 아무것도 안 뜸 | `logs/morning-routine.log` + PHASE 8 `-Status` |
| 채널 빈 탭 | 인증 만료 → 마법사 재로그인 후 `npm run morning` |
| Chrome 안 뜸 | PHASE 5 `start-demo` 재실행 / doctor 의 Chrome 9222 확인 |
| 카피·이미지 비어있음 | seed-calendar 는 뼈대만 — morning 이 생성. generate 로그 확인 |
| `Cannot find module bin/...` | 경로는 `harness/bin/...` (루트에 `bin/` 없음) 또는 `npm run <script>` |

상세: [ONBOARDING.md](ONBOARDING.md) (사람용 런북) · [OPERATIONS.md](OPERATIONS.md) (운영) ·
[INSTALL.md](INSTALL.md) (요약 설치).
