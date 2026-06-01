# Developer Handoff — 최적화 작업 가이드

> 이 문서는 개발자에게 인계할 때 읽는 가이드. **/s-skills 워크플로우**에 맞춰 작성됨.
> Tech Lead → backend / frontend / database / devops / security 디스패치 패턴 기준.

---

## 1. 절대 손대지 말 것 (사용자 데이터)

다음 경로는 `.gitignore` 대상이며 **사용자별 secrets**. 코드 작업 중 read/write 일체 금지:

```
auth/                     ← SNS 자격증명 (NID_AUT 등 cookie / chrome-attach-profile/)
company-profile.yaml      ← 회사 프로필 (브랜드 DNA + banned + tone)
.env.local                ← API 키 (FAL_KEY / ANTHROPIC_API_KEY)
posts/campaigns/*/        ← 생성된 캠페인 데이터 (brief.yaml/draft yaml/이미지)
posts/sources/            ← 사용자 던진 원본 자료 (md/pdf)
```

테스트 시 임시 fixture 생성하면 반드시 `/tmp/` 또는 `.test/` 하위. 절대 위 경로 X.

---

## 2. 신중하게 손댈 영역 (망가지면 사용자 직접 피해)

### 2-1. `harness/bin/browser-publish.mjs` (1700+ lines)

**위험도: 🔴 매우 높음** — 실제 SNS 발행. dry-run safety 빠뜨리면 의도하지 않은 게시.

규칙:
- `gate()` 함수 — dry-run 일 때 항상 `'N'` 반환. **autoClick 보다 dryRun 우선** (이미 buggy → fixed, 회귀 금지)
- 각 `publishX()` 함수의 step 2-3 (모달 열기) 전에 **`if (opts.dryRun) return { url: null, dryRun: true, cancelled: false };` 조기 종료 패턴 유지**
- selector 추가 시 `waitForFirst([...])` 헬퍼 사용 (selector drift 대응)
- **Chrome 강제 종료 금지** — `taskkill /F` 또는 `Stop-Process -Force` 쓰지 말 것. cookie 손실. `chrome-shutdown.mjs` (CDP graceful close) 만 사용.

검증:
```bash
node harness/bin/browser-publish.mjs <slug> --channel=<ch> --attach --dry-run
# → gate() 에서 "dry-run — 게시 클릭 없이 종료" 로그 나와야 통과
```

### 2-2. `harness/src/content-engine/brand-guardian.mjs`

**위험도: 🔴 매우 높음** — 한국 광고법 자동 검증. 잘못 풀면 약사법/표시광고법 위반 콘텐츠가 발행됨.

규칙:
- `KOREAN_AD_LAW.block` 패턴 7개 — **추가는 OK, 제거는 사용자 명시 동의 후**
- `inspect()` 시그니처 — `{ channel, text, hashtags, profile, brief, sourceMaterials }` 인자 모두 optional 처리. 깨지면 generate-finalize 폭발.
- regex 추가 시 lookbehind 주의 (예: `치료` 는 광고법 위반이지만 `세포 안전성 시험` 의 단어 부분 매칭은 false positive)

검증 — 케이스 테스트:
```bash
node -e "
import('./harness/src/content-engine/brand-guardian.mjs').then(({inspect}) => {
  const r = inspect({channel:'naver-blog', text:'100% 안전한 효과 보장. 의학적 효능.', profile:{}, brief:{tonePreset:'relate-kr'}});
  console.log(r.severity, r.summary);  // block, blocks=4+
});
"
```

### 2-3. `harness/bin/dashboard.mjs` (1300+ lines)

**위험도: 🟡 중간** — Node HTTP 서버 (port 7777). 사용자가 매일 사용.

규칙:
- `readChromeCookieAuth()` 의 Playwright `connectOverCDP` timeout — 현재 8초. 더 줄이면 탭 많을 때 false fail.
- `/api/publish/start` endpoint — `_publishTasks` Map 의 task 추적. running 상태 유지 안 되면 미니맵/알림 깨짐.
- `readBody()` 100MB 한도 — PDF base64 대비. 줄이면 PDF 업로드 깨짐.
- SSE endpoint `/api/watch` — 500ms 폴링. 너무 짧으면 부하, 너무 길면 사용자 체감 둔감.
- 변경 후 `node --check harness/bin/dashboard.mjs` 필수.

### 2-4. Tone presets + style-guide

**위험도: 🟡 중간** — copywriter agent 가 매번 Read 함. prompt 영역.

규칙:
- `harness/channels/blog/style-guide.md` — `## 10. 광고법` 섹션의 mustExclude list 와 `brand-guardian.mjs` 의 `KOREAN_AD_LAW.block` **동기화 유지**. 한쪽 추가하면 다른 쪽도.
- 톤 프리셋 5종 — `relate-kr / b2b / informational / friendly / sales`. ID 변경 금지 (brand-guardian 의 분기 로직 깨짐).

---

## 3. /s-skills 작업 영역 분배

각 sub-agent 가 손대도 좋은 / 안 되는 영역:

| Sub-agent | 손대도 좋은 곳 | 손대지 말 곳 |
|-----------|--------------|-------------|
| **sj-dev-backend** | `harness/bin/*.mjs` (스크립트), `harness/src/**/*.mjs` (모듈) | `harness/bin/browser-publish.mjs` 의 publishX 셀렉터 (selector drift는 별도 PR), `auth/`, `posts/` |
| **sj-dev-frontend** | `harness/dashboard/index.html` (single-file, 3200줄) | 백엔드 API 시그니처 (`/api/*` 응답 형태) |
| **sj-dev-database** | `posts/slots.yaml`, `posts/preferences.yaml` schema (현재 없음 — 정의 가능) | 기존 `brief.yaml` 필드 (`topic/keyMessage/contentPoints/...` 깨면 copywriter/brand-guardian 모두 깨짐) |
| **sj-dev-devops** | `scripts/*.ps1`, `.github/workflows/` (현재 없음), `harness/bin/doctor.mjs` | `auth/chrome-attach-profile/`, Chrome 강제 종료 절대 X |
| **sj-dev-security** | `harness/bin/_lib.mjs` (env loading), `dashboard.mjs` readBody / CORS | `auth/` 디렉토리 자체는 보안 검토만, 코드 변경 X |
| **sj-tech-lead** | 전체 아키텍처, 새 기능 분해 | 직접 코드 X — 디스패치만 |
| **sj-reviewer-code** | review-only | 코드 변경 X (PR 코멘트만) |

### 일반 패턴

- **무조건 sj-tech-lead 가 먼저 디스패치** — 단순 typo fix 도 영역 침범 가능
- **frontend ↔ backend 작업** — 같은 PR 에 묶지 말고 분리 (API 시그니처 합의 먼저)
- **selector drift fix** — sj-dev-backend 단독 (frontend 영향 X)
- **dashboard CSS 만 손대는 작업** — sj-dev-frontend 단독

---

## 4. 자주 발생하는 함정 (회귀 금지)

### 4-1. dry-run 누락 (LIVE 발행 사고)

직전에 실제로 발생한 사고:
- `gate()` 가 `autoClick` 먼저 체크 → dry-run 인데도 자동 클릭. fixed.
- `publishX()` 가 모달 열기까지 진행 후에야 dry-run 체크 → 실제 모달 떠서 사용자 혼란. fixed.

**회귀 방지 패턴**:
```javascript
// 1. gate() 안: dryRun 우선
if (dryRun) return 'N';
if (autoClick) { ... return 'Y'; }

// 2. publishX(): 모달 열기 전 조기 종료
if (opts.dryRun) {
  ui.info('  --dry-run — 모달 열기 전 종료');
  return { url: null, dryRun: true, cancelled: false };
}
```

### 4-2. Chrome 강제 종료 = cookie 손실

- `taskkill /F /IM chrome.exe` ❌ — 8 채널 로그인 다 풀림
- `Stop-Process -Name chrome -Force` ❌ — 같음
- `chrome-shutdown.mjs` (CDP `Browser.close` → `CloseMainWindow` → 10초 wait) ✓
- 또는 PowerShell 의 `Stop-Process` 는 **9222 모드 Chrome 만** filter:
  ```powershell
  Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
    Where { $_.CommandLine -match '--remote-debugging-port=9222' } |
    ForEach { Stop-Process -Id $_.ProcessId -Force }
  ```

### 4-3. Windows 경로 URL-encoded bug

```javascript
// ❌ 한국어 경로 (예: "마케팅 자동화") 에서 깨짐
const ROOT = new URL('.', import.meta.url).pathname;
// → "/C:/Users/.../%EB%A7%88%EC%BC%80%ED%8C%85%20..."

// ✓ 올바름
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('.', import.meta.url));
```

### 4-4. CRLF 줄바꿈 (Windows)

`dashboard.mjs` 의 `.env.local` 파싱이 한 번 깨짐 — `content.split('\n')` 이 Windows CRLF 에서 `\r` 남김.

**규칙**: 모든 line split 은 `/\r?\n/` 사용.

### 4-5. fal.ai sync API 401

`fal.run` (sync) 가 모든 모델에서 401 반환 → `queue.fal.run` (async + polling) 으로 마이그레이션 끝남. **다시 sync API 로 돌리지 말 것.**

### 4-6. system env placeholder 가 .env.local override

```javascript
// ❌ 잘못된 우선순위
const KEY = process.env.FAL_KEY || envFile.FAL_KEY;
// → process.env.FAL_KEY = "your-fal-key-here" 이면 placeholder 가 이김

// ✓ 올바름 — _lib.mjs 의 isPlaceholder() 거치고 결정
const sysKey = process.env.FAL_KEY;
if (isPlaceholder(sysKey)) use envFile.FAL_KEY;
else use sysKey;
```

`harness/bin/_lib.mjs` 의 placeholder 판정 로직 (regex `/^(your-|<|placeholder|example|todo|change-?me)/i`) 손대지 말 것.

### 4-7. selector drift (SNS UI 업데이트)

SNS 플랫폼이 분기마다 UI 업데이트 → 셀렉터 깨짐. 일반적.

**대응 패턴**:
```javascript
// ❌ 단일 셀렉터 — 한 번 깨지면 publishX 전체 실패
const editor = page.locator('div.ql-editor[contenteditable="true"]').first();
await editor.waitFor({ timeout: 30_000 });

// ✓ fallback chain — 한 개 깨져도 다른 후보 시도
const editor = await waitForFirst(page, [
  'div.ql-editor[contenteditable="true"]',
  '[role="textbox"][contenteditable="true"]',
  '[aria-label*="Text editor" i]',
  // ...
], 15_000);
```

`waitForFirst()` 헬퍼는 `browser-publish.mjs` 의 `gate()` 위에 정의됨. 새 publish 채널 추가 시 재사용.

---

## 5. 최적화 추천 영역 (개발자가 자유롭게 손대도 좋음)

### 5-1. `harness/dashboard/index.html` 3200줄 모놀리스

현재 single-file. 분리 추천:
- CSS → `dashboard/styles.css`
- JS → `dashboard/app.js` (또는 module 분리: `dashboard/js/{calendar,channels,sources,publish}.js`)
- 단 — script tag 추가 시 dashboard.mjs 의 정적 파일 서빙 라우트 (`DASH_DIR` 하위) 자동 처리됨

### 5-2. `dashboard.mjs` route handlers 분할

현재 `createServer` 콜백 안에 모든 endpoint 인라인. 추천 분리:
- `routes/campaigns.mjs` — `/api/campaigns`, `/api/today`, `/api/calendar`
- `routes/channels.mjs` — `/api/channels`, `/api/chrome/*`
- `routes/publish.mjs` — `/api/publish/*`, `/api/watch/*`
- `routes/sources.mjs` — `/api/source/parse`, `/api/sources`
- `routes/env.mjs` — `/api/env*`

### 5-3. 테스트 부재

현재 단위 테스트 0개. 추천 우선순위:
1. `brand-guardian.mjs` `inspect()` — 광고법 패턴 회귀 방지 (가장 중요)
2. `parse-source.mjs` `parseMarkdown()` — md → brief partial 정확도
3. `_lib.mjs` `isPlaceholder()` / env loading 우선순위

`node:test` 또는 `vitest`. 외부 의존성 없는 함수부터.

### 5-4. `browser-publish.mjs` 1700줄 모놀리스

채널별 분리:
- `publish/naver-blog.mjs` (SmartEditor API)
- `publish/tistory.mjs`
- `publish/brunch.mjs`
- `publish/instagram.mjs`
- `publish/threads.mjs`
- `publish/linkedin.mjs`
- `publish/_lib.mjs` (gate, waitForFirst, collectCardPaths, ensureLoggedIn)

단 — main `browser-publish.mjs` 의 entry-point CLI (`--channel=X` dispatch) 는 유지.

### 5-5. dashboard 알림 부분 — Service Worker

현재 `Notification` API 직접 호출. 백그라운드에서도 알림 받으려면 Service Worker 필요. push 가 아니라 local notification 이라 비교적 간단.

### 5-6. PDF parser 정확도

`parse-pdf.mjs` 의 y-좌표 line grouping 이 멀티컬럼 PDF 에서 줄 섞임. 컬럼 분리 알고리즘 (또는 PyMuPDF 등 별도 도구) 검토.

---

## 6. 검증 절차 (모든 PR 공통)

작업 끝나면:

```bash
# 1. syntax — 모든 .mjs
node --check harness/bin/dashboard.mjs
node --check harness/bin/browser-publish.mjs
node --check harness/bin/parse-source.mjs
node --check harness/src/content-engine/brand-guardian.mjs

# 2. doctor
node harness/bin/doctor.mjs

# 3. dashboard 부팅
node harness/bin/dashboard.mjs &
curl -s http://localhost:7777/api/today | jq .

# 4. 발행 작업이라면 dry-run 강제
node harness/bin/browser-publish.mjs <slug> --channel=<ch> --attach --dry-run
# → "dry-run 완료" 메시지 확인 후만 PR
```

---

## 7. 자주 쓰는 명령 (개발 중)

```bash
# 대시보드 재시작
$port=7777; Get-NetTCPConnection -LocalPort $port -State Listen -EA SilentlyContinue | 
  Select-Object -ExpandProperty OwningProcess -Unique | 
  ForEach { Stop-Process -Id $_ -Force -EA SilentlyContinue }
Start-Process node -ArgumentList "harness/bin/dashboard.mjs" -WindowStyle Hidden

# Chrome 9222 alive 확인
curl -s http://localhost:9222/json/version

# 캠페인 dry-run (안전)
node harness/bin/browser-publish.mjs "<slug>" --channel=<ch> --attach --dry-run

# brand-guardian 단발 테스트
node -e "import('./harness/src/content-engine/brand-guardian.mjs').then(({inspect}) => console.log(inspect({channel:'naver-blog', text:'...', profile:{}, brief:{tonePreset:'relate-kr'}})))"
```

---

## 8. 코드 리뷰 체크리스트 (sj-reviewer-code 가 무조건 보는 것)

- [ ] dry-run safety 깨지지 않음 (publish 영역 변경 시)
- [ ] `KOREAN_AD_LAW.block` 패턴 제거 없음 (brand-guardian 변경 시)
- [ ] Chrome 강제 종료 코드 추가 없음
- [ ] `auth/`, `posts/`, `.env.local` 직접 write 없음
- [ ] 한국어 경로 escape 처리 (`fileURLToPath` 사용)
- [ ] CRLF 호환 (line split `/\r?\n/`)
- [ ] `node --check` 통과
- [ ] dashboard 부팅 후 `/api/today` 200 응답
- [ ] commit 메시지 — `feat(영역): ...` / `fix(영역): ...` / `refactor(영역): ...` 형식

---

## 9. 인계 전 사용자 한 줄 정리

> "광고법 자동 검증 + dry-run safety + Chrome cookie 보존 — 이 3가지가 무너지면 사용자가 직접 손해. 다른 건 자유롭게 최적화 환영."

질문 있으면 `sj-tech-lead` 디스패치 → 영역별 sub-agent.
