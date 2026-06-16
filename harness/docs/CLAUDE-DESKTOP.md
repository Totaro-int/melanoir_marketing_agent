# Claude 데스크톱 앱(Mac/Windows)에서 쓰기 — 플러그인 스킬

> **결론: 데스크톱 앱에서도 된다. 단 두 가지가 필수다 — ① Environment = `Local`, ② 플러그인은 UI로 추가.**
> 클라이언트가 처음 막혔던 건 데스크톱이라서가 아니라 **기본값 `Remote`(클라우드)** 였기 때문.
> CLI(`claude` 터미널)가 가장 확실하지만, 데스크톱 앱도 아래대로 하면 동작한다.

---

## ⚠ 가장 중요 — Environment 를 `Local` 로

데스크톱 Claude Code 의 **Code 탭**은 실행 위치를 고르는 **Environment** 가 있다:

| Environment | 실행 위치 | 이 에이전트 |
|---|---|---|
| **Local** | 내 Mac/PC | ✅ 생성 + 발행 다 됨 |
| **Remote** (기본값) | Anthropic 클라우드(리눅스) | ❌ 플러그인·발행 불가 (생성도 cloud 세션은 플러그인 미지원) |
| SSH | 원격 머신 | 그 머신에 따라 |

→ Code 탭 입력창 근처 **Environment 드롭다운 → `Local`** 로 바꾼다. (기본 Remote 면 `libXdamage`·`ECONNREFUSED 9222` 에러 + 플러그인이 아예 안 보임.)

> 공식: 플러그인·스킬·Bash 실행은 **local / SSH 세션에서만**, cloud(Remote) 세션은 미지원.

---

## 설치 (데스크톱 앱, Mac 기준)

```
0. (1회) 터미널에서 클론 + setup — Playwright Chromium 까지 받아둔다:
     git clone https://github.com/Totaro-int/melanoir_marketing_agent.git
     cd melanoir_marketing_agent
     node harness/bin/setup.mjs

1. 데스크톱 앱 → Code 탭 → 위 폴더 열기 (Open folder)
2. Environment 드롭다운 → **Local** 로 변경        ← 필수
3. 플러그인 추가 (⌘ 아님, UI):
     입력창 옆 **+ 버튼 → Plugins → Add plugin**
     → 로컬 폴더(이 클론 경로) 또는 마켓플레이스(Totaro-int/melanoir_marketing_agent) 선택
     → Manage plugins 에서 enable 확인
   (데스크톱엔 `/plugin marketplace add` 명령이 없다 — UI 매니저로 관리한다.)
4. 환경변수 주입 (macOS PATH 한계 우회):
     Environment 드롭다운 → Local 위에 hover → ⚙(톱니) → 환경 편집기
     → 필요 시 FAL_KEY 등 추가. (.env.local 에 두면 harness 가 자동으로 읽으므로 보통 불필요.
       단 node/chrome 가 PATH 에 없으면 여기서 PATH 보정.)
5. 진단:  node harness/bin/doctor.mjs   → "실행환경(발행)" 행이 ok 인지 (warn 이면 아직 Remote).
6. 스킬 사용:  입력창에 `/` 또는 + → 슬래시 명령 → `/sns-start` (또는 `/marketing_agent:sns-start`)
```

---

## 무엇이 되고 무엇이 한계인가 (정직하게)

| 단계 | 데스크톱 Local | 비고 |
|---|---|---|
| 프로필·캠페인·**카피/이미지 생성** | ✅ 잘 됨 | Local 세션에서 스킬·서브에이전트·Bash 실행 |
| **검수**(brand-guardian) | ✅ 잘 됨 | |
| **발행**(browser-publish, 크롬 쿠키) | ⚠ Local 필요 + 로컬 Chrome | 데스크톱 Local 의 Playwright/Chrome 제어는 **비공식** — 되면 OK, 안 되면 CLI 로 |

**권장 (하이브리드):** 생성·검수는 데스크톱 앱(Local)으로 편하게, **발행만은 터미널 `claude` CLI** (또는 `bash scripts/start-demo.sh` → `browser-publish`)가 가장 안정적. 둘 다 같은 `.claude/`·`.env.local`·`auth/cookies/` 를 읽어 상태가 공유된다.

---

## 빠른 자가진단

- 스킬(`/sns-start`)이 안 보임 → Environment 가 Remote 임. **Local 로** + 플러그인 enable 확인.
- 발행에서 `ECONNREFUSED 9222` → 로컬 Chrome 미실행. `scripts/start-demo`(.sh/.ps1) 먼저, 또는 Remote 임.
- `libXdamage`·리눅스 에러 → 100% Remote(클라우드) 세션. Local 로 전환.
- 카드/이미지 안 나옴 → `node harness/bin/setup.mjs` 다시(Playwright Chromium) + `doctor` playwright 행 확인.
