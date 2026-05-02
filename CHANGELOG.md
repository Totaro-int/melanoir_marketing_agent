# Changelog

All notable changes to this project. Format: Phase / version → highlights.

## 0.7.0 — Phase 6 (사내 패키징)

- `bin/setup.mjs`: 한 번에 install (Node 체크 → npm install → .env.local → runtime dirs → chmod → 옵션 plugin symlink)
- `bin/doctor.mjs`: runtime/profile/env/content-engine/publisher/plugin/campaigns 한눈 진단
- `commands/{init,doctor}.md`: 새 사용자 첫 가이드 + 환경 진단
- `INSTALL.md`: 5분 안에 첫 dry-run
- `OPERATIONS.md`: 캠페인 라이프사이클, 토큰 회전, 트러블슈팅, 비용 모니터링
- README/plugin 정리, version bump

## 0.6.0 — Phase 4.2 (캐러셀)

- `bin/generate.mjs`: cadence(single/series-3/series-5/thread) 와 `--images=N` 으로 카드 수 결정, 카드별 role hint(hook/body/cta) 주입
- Threads CAROUSEL: 각 IMAGE 컨테이너(is_carousel_item) → CAROUSEL 부모 → publish
- LinkedIn 다중 이미지: 각 URL registerUpload + bytes PUT → asset URN[] → ugcPosts media[]
- image-director / generate.md 카드 역할 명시

## 0.5.0 — Phase 5 (칸반 보드)

- `bin/board.mjs`: zero-dep ANSI 칸반, `--watch` (fs.watch 디바운스), East Asian Wide 폭 정렬
- `statusline.sh`: ANSI 색상, 5칸 progress bar, failed/완료 상태 색상

## 0.4.0 — Phase 4 (Publisher)

- `src/publisher/`: provider 인터페이스, registry(dry-run env/플래그)
- adapters: threads(2-step Graph API), linkedin(UGC API)
- credentials: `auth/<channel>.json` (mode 0600, gitignored)
- `bin/{publish,auth}.mjs`, `commands/{publish,auth}.md`, `agents/publisher.md`

### 0.4.x — Phase 4.1 (이미지 발행 + 재시도)

- `providers/fal.mjs`: BYO FAL_KEY, fal CDN URL 보존
- `publisher/retry.mjs`: 408/425/429/5xx + 네트워크 에러 지수 백오프
- adapters: `assetUrls` 사용해 IMAGE 발행 분기
- `bin/_lib.mjs`: `.env.local` 자동 로드 (zero-dep)

## 0.3.0 — Phase 3 (콘텐츠 엔진 + 휴먼 게이트)

- `src/content-engine/{provider,registry,brand-guardian}.mjs`
- providers: mock, openai-images, inhouse-stub
- `bin/{generate,preview,approve,reject}.mjs`
- subagents: copywriter, image-director, brand-guardian
- `schemas/draft.schema.yaml`

## 0.2.0 — Phase 2 (검증 + LinkedIn reference)

- `bin/{profile-validate,profile-show,campaign-new}.mjs`
- `schemas/campaign-brief.schema.yaml`
- `channels/linkedin/*` reference 채널 완성
- `/onboard show` / `/onboard update <섹션>` 분기

## 0.1.0 — Phase 1 (스캐폴드)

- 플러그인 매니페스트, Threads reference, 온보딩 skill, 회사 프로필 스키마
- statusline 1줄 요약
- `.gitignore` 자격증명·생성물 보호
