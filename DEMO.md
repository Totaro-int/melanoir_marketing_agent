# 시연 가이드 — 내일 클라이언트 데모용

오늘 보여준 그대로 재현. 네이버 블로그 발행 시연.

---

## 1. 시작 (3분)

### Chrome 9222 모드로 띄우기

PowerShell 또는 명령 프롬프트:

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\Users\WIN10\Desktop\개발공장\마케팅 자동화 에이전트\auth\chrome-attach-profile"
```

→ Chrome 새로 뜸. 마지막 시연 때 로그인 쿠키 그대로 살아있음 (Chrome 9222 종료 시 graceful shutdown 했으면).

### 대시보드 서버 띄우기

새 PowerShell 창에서:

```powershell
cd "C:\Users\WIN10\Desktop\개발공장\마케팅 자동화 에이전트"
node harness/bin/dashboard.mjs
```

→ "Marketing Agent Dashboard http://localhost:7777" 뜸. 자동으로 Chrome 새 탭이 열려서 대시보드 보임.

### 채널 인증 확인

대시보드 → **🔌 채널 연결** 탭 → 8개 채널 모두 "🟢 연결됨" 인지 확인. 미연결 있으면 [🔌 연결] 버튼 클릭해서 다시 로그인.

---

## 2. 시연 흐름 (오늘 그대로)

### Part A — UI 투어 (3분)

1. **캘린더 메인** 보여주기 — "월간 캠페인 한눈에"
2. **5월 10일 오늘** 클릭 → "TODAY" 배지 + 2개 캠페인
3. **TOTARO COS** 캠페인의 채널 카드들 — 10개 채널 (네이버 ✅ 발행 완료 / 다른 것들 색깔별로)
4. **네이버 블로그 카드** 클릭 → drawer 슬라이드 인
5. drawer 안에서:
   - 메타 정보 (캠페인 + 채널 + 상태)
   - 본문 미리뷰 (h2/이미지 placeholder 등 마크다운 렌더)
   - 이미지 썸네일 9장
   - 큰 ✅ "발행 완료" banner + 클릭 가능한 URL

### Part B — 발행 시연 (5분)

**A) Dry-run 보여주기 (안전):**

1. drawer 하단 **dry-run 토글 ON 확인** (기본값)
2. **[▶ dry-run 실행]** 클릭
3. 명령 복사 모달 자동 뜸:
   - "📋 Claude Code 채팅창에 붙여넣으세요" 안내
   - 자연어 메시지 + Bash 명령
4. **[📋 메시지 복사]** 클릭 → 클립보드 복사 + 모달 닫힘
5. **Claude Code 채팅창** 으로 가서 Ctrl+V + Enter
6. 클로드(나)가 Bash 도구로 실행
7. 대시보드 탭으로 돌아와서 **라이브 보드** 보기:
   - drawer 자동으로 1200px 확장
   - 큰 진행률 (3 / 7 단계, 43%)
   - 단계 카드 ✓ → 활성 → ✓ 흐름
   - 이미지 그리드 (4칸) 회색 → 주황 → ✓
8. 7/7 끝나면 **🟡 dry-run 통과** banner

**⚠️ 주의 — dry-run 인데도 발행 모달이 마지막에 열림.** 클라이언트 앞에서 모달 안의 발행 버튼 만지면 진짜 발행됨. 모달 뜨면 손대지 말고 **Esc** 또는 **X** 로 닫고 drawer 도 닫기.

**B) LIVE 발행 시연 (선택, 위험):**

1. drawer 의 **dry-run 토글 OFF**
2. 버튼이 초록 **🚀 실제 발행** 으로 바뀜
3. confirm 다이얼로그 → 진행
4. 명령 복사 → 채팅창 → 클로드 실행
5. **마지막 [7/7]** 단계에서 발행 모달 열림 → Chrome 의 네이버 탭으로 가서 **모달 안 발행 버튼 직접 클릭**
6. 글 발행 → URL 자동 result.json 저장 → 대시보드에 🎉 banner

**현재 selector 가 모달 안 발행 버튼은 자동으로 못 누름.** 어제처럼 클로드가 prompt 입력 대기 hang → 사용자가 모달에서 직접 클릭 → 발행. 자동 클릭 fix 는 다음 작업.

**rollback (실패 시)**: 네이버 블로그 → 게시글 우상단 → 비공개 또는 삭제.

---

## 3. 종료 (중요!)

**🚨 Chrome 강제 종료 절대 금지.** taskkill /F 하면 cookies 날아가서 8채널 다 로그인 풀림 (어제 그 사고).

올바른 종료:
1. **대시보드 서버**: PowerShell 창에서 Ctrl+C
2. **Chrome 9222**: Chrome 창 우상단 X 버튼 (각 창 모두). 또는 Ctrl+Shift+Q (전체 종료).

---

## 4. 문제 발생 시

| 증상 | 원인 | 해결 |
|---|---|---|
| 채널 카드 다 "미연결" | Chrome 9222 안 떴거나 cookies 날아감 | 채널 연결 탭에서 [🔄 다시 검사] 클릭, 그래도 안 되면 다시 로그인 |
| 대시보드 안 뜸 | dashboard 서버 안 띄움 | `node harness/bin/dashboard.mjs` 실행 |
| 발행 명령 채팅창에 붙여넣어도 진행 안 됨 | Chrome 9222 attach 실패 | Chrome 한 번 새로고침 후 재시도 |
| browser-publish 가 timeout | dashboard 의 channels API 와 race | 대시보드 새로고침 한 번 또는 5분 대기 |

---

## 5. 데이터 위치 (참고)

| 항목 | 위치 |
|---|---|
| 캠페인 데이터 | `posts/campaigns/<slug>/<channel>/` |
| 발행 결과 | `posts/campaigns/<slug>/<channel>/result.json` |
| Chrome 쿠키 | `auth/chrome-attach-profile/Default/Network/Cookies` |
| 회사 프로필 | `company-profile.yaml` |
| 학습 누적 (gstack) | `~/.gstack/projects/Totaro-int-marketing_agent/learnings.jsonl` |

---

## 6. 다음 작업 (돈 받은 후)

오늘 학습으로 누적된 31개 learning 에 정리됨. 핵심:

1. **🚨 dry-run safety fix** — 6개 채널 publish 함수에 dry-run 분기 박아서 발행 모달 안 열게. 30분.
2. **네이버 모달 안 최종 발행 selector 자동 클릭** — 어제 사용자 직접 누른 거 자동화. 30분.
3. **태그 input selector 갱신** — 네이버 UI 변경. 15분.
4. **Chrome graceful shutdown helper** — `Browser.close` CDP 명령으로 cookies 보존. 15분.
5. **Tistory/Brunch/Threads/LinkedIn/Instagram LIVE 발행 검증** — selector 검증 + dry-run safety. 채널당 30분.

---

**오늘 동작 검증 완료**: TOTARO COS 네이버 블로그 LIVE 발행 성공 (`https://blog.naver.com/supperted/224281188071`). 7/7 단계 + 본문 + 이미지 4/4 inline paste.
