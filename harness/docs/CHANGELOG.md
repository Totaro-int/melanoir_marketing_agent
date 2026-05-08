# Changelog

All notable changes to this project. Format: Phase / version → highlights.

## Unreleased — by-channel 슬롯 그루핑 + 선호도 학습

### by-channel 2단 구조
- `posts/by-channel/<채널>/<슬롯-topic-슬러그>/<캠페인-slug>` 2단 구조로 변경 — 채널·슬롯별 결과물 한눈 보기
- 슬롯과 매칭 안 된 캠페인은 `posts/by-channel/<채널>/_ungrouped/` 로
- 매칭 우선순위: ① brief.slotTopic ② brief.topic ↔ slot.topic 정규화 매칭 ③ _ungrouped
- `bin/campaign-new.mjs`: `--slot-topic="<topic>"` 플래그 추가
- `bin/slots.mjs save`: 캠페인 brief 에 slotTopic 역기록 (소급 매칭 보강)
- `bin/sync-posts.mjs`: 매 실행마다 wipe-and-rebuild (슬롯 추가/삭제·이름변경 자동 반영)

### 사용자 선호도 점진 학습 (end-to-end 루프 완성)
- `posts/preferences.yaml` (gitignored): approve/reject 시 자동 누적되는 사용자 선호 통계
- 신호: 본문 길이, 이모지 수, 해시태그 수, 톤(격식/캐주얼), designRef·goal 빈도
- 학습 알고리즘: 1/n 가중 산술평균 (간단한 EMA 변종, 3/5/10건 게이트로 신뢰도 표시)
- `bin/learn.mjs`: approve/reject/show/rebuild/reset 5개 서브커맨드
- `bin/approve.mjs` / `bin/reject.mjs`: 종료 시 자동 학습 hook (실패 시 본 작업은 통과)
- `src/preferences.mjs`: `loadPrefs()` / `renderGuide({ channel })` 헬퍼
- **에이전트 통합**: `bin/generate.mjs` 가 copy-spec.json / slide-spec.json 에 `learnedPreferences` 필드 주입 (sampleCount ≥ 3 일 때)
  - copywriter: `targets.{avgLength, avgEmojis, avgHashtags}` ± 30% 범위 + tone 분포 + 최근 거절 사유 회피
  - image-director: `preferredDesignRefs[]` — designRef 미지정 시 자주 승인된 브랜드 우선 후보로
- 두 에이전트 .md 에 적용 규칙 명시 (회사 profile 충돌 시 profile 우선, confidence 별 가중치 차등)

## 0.9.1 — 루트 폴더 정리 (posts/ + harness/)

- 루트가 폴더 11개 → 2개 (`posts/`, `harness/`) + 표준 파일 + gitignored 런타임으로 정리
- `harness/`: bin/src/schemas/commands/skills/agents/channels/examples/statusline/docs 모두 이동 (git mv 로 history 보존)
- `posts/campaigns/<slug>/`: 캠페인 원본 (이전 `campaigns/`)
- `posts/by-channel/<채널>/<slug>`: 채널별 한눈 보기 — `posts/campaigns/<slug>/<채널>` 로 향한 symlink
- `harness/bin/sync-posts.mjs`: by-channel symlink 자동 동기화. campaign-new 종료 시 호출, `--prune` 옵션으로 dangling 정리
- 경로 분리: `_lib.mjs` 가 `HARNESS_ROOT` (코드/스키마) vs `ROOT` (사용자 데이터/매니페스트) 둘 다 export
- `plugin.json` / `package.json` 의 모든 path 에 `harness/` prefix
- README 에 폴더 구조 한 줄 요약 추가
- `INSTALL.md`/`OPERATIONS.md`/`CHANGELOG.md` → `harness/docs/`

## 0.9.0 — Phase 8 (11개 채널 + 온보딩 채널 선택)

- 새 publisher adapter 9개: instagram, facebook, x, reddit, bluesky, mastodon, pinterest, tiktok, youtube (각 dry-run buildPayload + healthcheck + 실 publish, withRetry 적용)
- `src/publisher/registry.mjs`: 11채널 등록, `CHANNEL_META` (label/media/auth) export, `knownChannels()` 추가
- 스키마: `company-profile.schema.yaml` 에 `channels.enabled[]` (11 enum) 필수 추가
- 온보딩: `skills/onboard-company/SKILL.md` 7단계에 채널 선택 추가, 카탈로그 한눈 표시 + 추천(threads/bluesky/mastodon)
- `bin/campaign-new.mjs`: 우선순위 `--channels` > profile.enabled > plugin.json. 미등록 채널 차단, profile 외 채널 사용 시 경고
- `bin/_lib.mjs`: `enabledChannels(profile)` helper
- `bin/doctor.mjs`: enabled 채널별 `auth/<ch>.json` 존재 점검 + media/auth 요건 표시
- `commands/auth.md`: 11채널 가이드 (페이로드 + 발급 절차 + 제약)
- `examples/auth/<channel>.example.json` 9개 추가
- `plugin.json` channels[] 11개로 확장, version 0.9.0
- 영상 채널(tiktok/youtube): assetUrls 가 .mp4/.mov/.webm 일 때만 동작, 텍스트/이미지 캠페인은 명시적 reject

## 0.8.0 — Phase 7 (단일 진입점 + 스케줄)

- `/sns-run` 단일 진입점 (`bin/run.mjs`): profile→campaign→generate→preview→approve→publish 한 줄
- `/sns-schedule` (`bin/schedule-plan.mjs`): 주/월 단위 N건 예약 생성, 매 회 다른 주제 옵션
- `/sns-queue tick` 워커 (`bin/queue-tick.mjs`): publishAt 도래 항목 자동 승인+발행, 실패시 `needs_attention`
- `bin/install-cron.mjs`: macOS launchd / Linux crontab 옵션 설치 (안 깔아도 수동 동작)
- `commands/run.md`, `commands/queue.md` 추가
- 스키마: `needs_attention` status enum, `autoPublish: boolean`, `attentionReason{ch}` 추가
- board: scheduled / needs_attention 색상·아이콘, publishAt tail 표시
- doctor: queue 섹션 (scheduled 대기·needs_attention 카운트)
- bug fix: `publish --dry-run` 이 brief.status 를 published 로 덮던 문제 (854568b)

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
- `/sns-onboard show` / `/sns-onboard update <섹션>` 분기

## 0.1.0 — Phase 1 (스캐폴드)

- 플러그인 매니페스트, Threads reference, 온보딩 skill, 회사 프로필 스키마
- statusline 1줄 요약
- `.gitignore` 자격증명·생성물 보호

## 0.10.0 — 콘텐츠 엔진 리팩터링 (inhouse-slides + unified copy flow)

- feat: inhouse-slides가 기본 provider로 변경 (API 키 불필요, Playwright 스크린샷 기반 HTML 슬라이드 생성)
- feat: 모든 provider (fal/openai/inhouse-slides)에서 직접 카피 생성 제거 → copywriter 에이전트 단일 경로로 통일
- feat: `generate.mjs` 오케스트레이션 흐름 재구성: writeCopySpecs() → copywriter agent → finalizeRegularChannels()
- feat: copywriter 에이전트 재작성 — copy-spec.json 읽고 copy-output.json 저장 (공통 인터페이스)
- feat: image-director 에이전트에 inhouse-slides 전용 spec/finalize 처리 절차 추가
- feat: image-director를 인라인 실행으로 전환 (상황에 따라 fal/openai/inhouse-slides 간 선택)
- feat: fal nano-banana-2 모델 지원 추가; copy-output flat 포맷 fallback 수정
- fix: Playwright 스크린샷 후 PNG를 캠페인 디렉토리로 복사; HTML 한국어 폰트 스택 수정
- fix: 이미지 프롬프트에서 텍스트/타이포그래피 제거 (한국어 글리프 깨짐 방지)
- fix: copywriter 종결어미 다양화 강화 — 동일 어미 3회 연속 금지, 채용 카피 예시 추가
- fix: copywriter 두괄식·자연체 재작성
- docs: sns-start.md step 4 — 전 provider 통합 3단계 흐름으로 업데이트

## [Unreleased]
- fix: 업데이트 감지 시 exit 10으로 강제 중단 (Claude가 반드시 사용자에게 보고)
- fix: fal.ai portrait 치수 portrait_9_16 → {width:1080, height:1350} 객체 형식
- feat: 이미지 생성 품질 개선 (flux-pro/v1.1, OpenAI quality=high, rich prompt)
- feat: inhouse-slides AI 배경 이미지 — SLIDE_IMAGES=true / --with-images 활성화 시 카드별 비주얼 컨셉 계획 후 fal(nano-banana-2)로 배경 이미지 생성·삽입
- feat: harness/bin/gen-image.mjs — fal 단독 이미지 생성 CLI (--prompt, --aspect, --out)
