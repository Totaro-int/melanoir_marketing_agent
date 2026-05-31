# 시연 가이드

네이버 블로그 발행 시연. 다른 PC 에서도 동일하게 동작.

전제 — `git clone` 후 `node harness/bin/setup.mjs` 실행 완료 + `.env.local` 에 `FAL_KEY` + `ANTHROPIC_API_KEY` 입력 완료. (자세한 설치는 `harness/docs/INSTALL.md` 참고)

---

## 1. 시작 (1분)

### Windows — 한 번에 시작

PowerShell 열고:

```powershell
cd <project-root>
.\scripts\start-demo.ps1
```

이 스크립트가 자동으로:
1. Chrome 9222 모드로 띄움 (전용 프로파일 `auth/chrome-attach-profile/`)
2. 대시보드 서버 띄움 (http://localhost:7777)
3. Chrome 새 탭에 대시보드 활성화

### macOS / Linux — 수동 2단계

```bash
# 터미널 1
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$(pwd)/auth/chrome-attach-profile"

# 터미널 2
cd <project-root>
node harness/bin/dashboard.mjs
```

### 채널 인증 확인

대시보드 → 🔌 채널 연결 탭 → 처음이면 모두 미연결.
각 카드의 [🔌 연결] 클릭 → 로그인 페이지 열림 → **로그인 유지 체크 켜고 로그인**.
다 끝나면 상단 [🔄 지금 다시 검사] 클릭.

---

## 2. 시연 흐름

### Part A — UI 투어 (3분)

1. 캘린더 메인 — 월간 캠페인 한눈에
2. 오늘 날짜 클릭 → TODAY 배지 + 캠페인 카드
3. 채널 카드 (예: 네이버 블로그) 클릭 → drawer 슬라이드 인
4. drawer 안에서
   - 메타 정보 (캠페인 + 채널 + 상태)
   - 본문 미리뷰 (마크다운 렌더)
   - 이미지 썸네일
   - 발행 완료 시 banner + 클릭 가능한 URL

### Part B — Dry-run 발행 시연 (3분)

1. drawer 하단 `dry-run` 토글 ON 확인 (기본값)
2. [▶ dry-run 실행] 클릭
3. 명령 복사 모달 자동 뜸 → 자연어 + Bash 명령
4. [📋 메시지 복사] 클릭
5. Claude Code 채팅창에 Ctrl+V + Enter
6. 클로드가 Bash 도구로 실행
7. 대시보드로 돌아와서 라이브 보드 보기
   - drawer 자동 1200px 확장
   - 진행률 (예: 3 / 7 단계)
   - 단계 카드 ✓ → 활성 → ✓
   - 이미지 그리드 (4칸) 회색 → 주황 → ✓
8. dry-run 통과 banner

**dry-run safety 보장** — 발행 모달 자체를 안 엶. 사용자가 실수로 누를 위험 차단.

### Part C — LIVE 발행 시연 (선택)

1. dry-run 토글 OFF → 버튼이 LIVE 모드로 바뀜
2. confirm 다이얼로그 → 진행
3. 명령 복사 → 채팅창 붙여넣기
4. 마지막 단계에서 모달 열림 → 자동 발행 click
5. URL 자동 result.json 저장 → 대시보드 banner

rollback (실패 시) — 네이버 블로그 게시글 우상단 메뉴 → 비공개 또는 삭제.

---

## 3. 종료 (중요)

**Chrome 강제 종료 절대 금지.** taskkill /F 하면 cookies 날아가서 채널 다 로그인 풀림.

### Windows — 한 번에 종료

```powershell
.\scripts\stop-demo.ps1
```

이 스크립트가 CDP `Browser.close` graceful shutdown 호출 → cookies SQLite flush 보장.

### macOS / Linux — 수동

1. 대시보드 서버: 터미널 Ctrl+C
2. Chrome 9222: Chrome 창 우상단 X 버튼 (각 창 모두). 또는 Cmd+Q (전체).

또는 직접 helper 호출:

```bash
node harness/bin/chrome-shutdown.mjs --verify
```

---

## 4. 문제 해결

| 증상 | 원인 | 해결 |
|---|---|---|
| 채널 카드 다 미연결 | Chrome 9222 안 떴거나 cookies 손실 | 채널 연결 탭 [🔄 지금 다시 검사] / 그래도 안 되면 다시 로그인 |
| 대시보드 안 뜸 | dashboard 서버 안 켜짐 | `node harness/bin/dashboard.mjs` 직접 |
| 발행 명령 채팅창 붙여넣어도 진행 X | Chrome 9222 attach 실패 | Chrome 한 번 새로고침 후 재시도 |
| browser-publish timeout | dashboard channels API 와 race | 5분 대기 또는 대시보드 새로고침 |
| fal HTTP 401 | API 키 placeholder / 모델 권한 X | `.env.local` 의 `FAL_KEY` 진짜 값 확인 / `FAL_IMAGE_MODEL=fal-ai/flux/schnell` 시도 |

---

## 5. 데이터 위치

| 항목 | 위치 |
|---|---|
| 캠페인 데이터 | `posts/campaigns/<slug>/<channel>/` |
| 발행 결과 | `posts/campaigns/<slug>/<channel>/result.json` |
| Chrome 쿠키 | `auth/chrome-attach-profile/Default/Network/Cookies` |
| 회사 프로필 | `company-profile.yaml` |
| 환경 변수 | `.env.local` |

`auth/`, `company-profile.yaml`, `.env.local` 은 `.gitignore` 대상. 절대 커밋 X.

---

## 6. 다음 시연 전 체크리스트

- [ ] `node harness/bin/setup.mjs` 한 번 돌렸음
- [ ] `.env.local` 에 `FAL_KEY` + `ANTHROPIC_API_KEY` 박혀있음
- [ ] `.env.local` 의 `FAL_IMAGE_MODEL` 값에 인라인 주석 (`  # ...`) 없음
- [ ] `company-profile.yaml` 회사 프로필 작성 완료
- [ ] 채널 8개 로그인 완료 ("로그인 유지" 체크)
- [ ] Chrome 9222 종료 시 X 버튼 또는 `chrome-shutdown.mjs` 만 사용

준비 끝났으면 `.\scripts\start-demo.ps1` 만 누르면 됨.
