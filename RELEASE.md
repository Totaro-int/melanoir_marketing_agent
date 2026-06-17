# 릴리스 상태 (Melanoir 납품) — 발행 준비 완료

> 한 줄: **`git clone` → 가이드(`harness/docs/CLAUDE-CODE-INSTALL.md`) PHASE 0~9 → 발행 직전 화면.**
> 발행은 **로컬에서 도는 Claude Code**(터미널 `claude` CLI 또는 데스크톱 Environment=Local)에서만.

## ✅ 출시 준비 완료 — 코어 에이전트 (push 됨)

| 영역 | 상태 |
|---|---|
| 블로그 = 본문 article + 인라인 이미지(섹션별) | ✅ kind-aware 라우팅 + finalizeBlog (풀 파이프라인 실행 검증) |
| 발행 = browser-publish(크롬 쿠키)만 | ✅ 레거시 API/OAuth 발행 레이어 완전 제거 (양 레포) |
| 설치 가이드 — **플러그인 등록 단계 포함** (CLI + 데스크톱) | ✅ PHASE 1-B + 트러블슈팅 + `CLAUDE-DESKTOP.md` |
| fresh 머신 구축 | ✅ setup 이 Playwright Chromium 까지 · doctor 바이너리 검사 |
| 환경 가드 | ✅ doctor "실행환경(발행)" — Remote(클라우드) 감지 + 안내 |
| 자가 업데이트 | ✅ 스킬 사용 시 감지 → `git pull --autostash` (fresh-clone E2E 검증) |
| 깨끗한 git | ✅ package-lock 추적 해제 (npm install 후에도 트리 clean) |
| 문서 일관성 | ✅ `/sns-publish`·`/sns-auth` 등 옛 참조 0개 (32파일 정리) |
| **자가 점검·자동 수정** | ✅ `npm run self-check`(:fix) — 보안·git위생·런타임 (setup 끝 자동 1회). 갭/추적민감파일/PUBLIC/Playwright 검사 + 안전 자동수정 |
| 브랜드 지침 → 에이전트 | ✅ `posts/sources/` 드롭 → `/sns-onboard` → profile → 카피·검수·인사이트카드 자동 참조 (insight-card 브랜드 정체성 profile 연동) |

레포: melanoir `a28fb7b` · 템플릿(marketing_agent) `698d3ea` — doctor·self-check 정상.

> ⚠ melanoir 레포는 PUBLIC — 클라 민감데이터 커밋 금지(self-check 가 감시). 비공개 전환 권장: `gh repo edit Totaro-int/melanoir_marketing_agent --visibility private`

## 🧑 발행(go-live) 체크리스트 — 현장에서 사람이

1. (클라 Mac) `git clone` → `node harness/bin/setup.mjs` → **플러그인 등록**(가이드 PHASE 1-B, CLI 또는 데스크톱 Local) → `/sns-start` 보이면 OK
2. 이미지 키(블로그용 `FAL_KEY`) 발급 — PHASE 4 🧑
3. `start-demo` → SNS 채널 로그인(사장님) 🧑
4. seed-calendar(30일) → `npm run morning` → 발행 직전 탭 → [공유] 클릭 🧑

## ✅ 인사이트 카드 기능 — 에이전트 쪽 빌드+검증 완료

| 영역 | 상태 |
|---|---|
| 카드레터 생성기 (`insight-card.mjs`) | ✅ 클라 사진 + 텍스트 오버레이, 4:5 1080x1350, 결정론적 (실사진/폴백 렌더 검증) |
| 매일 발행 오케스트레이션 (`insight-daily.mjs`) | ✅ 토픽 날짜순환 + 사진풀 → 카드 → 웹발행 + IG캡션 + git commit/push (E2E 실행 검증) |
| npm 스크립트 | ✅ `insight:card` / `insight:daily` |
| 가이드 | ✅ `harness/docs/INSIGHT-CARDS.md` (준비→카드1장→매일자동→cron→IG) |

쓰는 법: `npm run insight:daily -- --website="<melanoir-recruitment>/web/site/insights" --commit --push`
(매일 cron 한 줄로 자동화 가능 — 가이드 §4)

## 🟡 인사이트 카드 — 남은 입력 (현장에서)

- **웹 페이지**: `melanoir-recruitment/web/site/insights/` 빌드 완료(기존 구조 0 변경). 로컬 브랜치 `feat/insight-cards`(`d3d7b72`) — **push 권한 대기** (ted-dylan write 없음 → 클라/토타로 계정으로 push 또는 collaborator 추가).
- **클라 사진 풀**: `posts/insight-photos/` 에 브랜드 사진 넣기 (없으면 모노톤 폴백으로 동작). 토픽은 `insights-topics.txt`(예시 복사) 편집.
- **IG 자동 포스트**: 카드+캡션은 IG-ready. **지금**은 IG 앱/웹에 카드 PNG 직접 업로드 + 캡션 붙여넣기(수동). browser-publish 는 캠페인 바인딩이라 임의 이미지를 못 받음 → morning 자동 IG 포스트는 insight-daily 가 IG 캠페인 디렉토리도 생성하거나 browser-publish ad-hoc 모드 추가 필요, 둘 다 §0 동결 닿아 **사용자 승인 후 별도 작업**. (자세히: `harness/docs/INSIGHT-CARDS.md` §5)
