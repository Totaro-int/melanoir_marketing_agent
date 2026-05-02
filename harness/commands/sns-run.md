---
name: run
description: 단일 진입점. 회사 프로필부터 발행까지 한 번에 실행. 스케줄(주/월) 옵션.
---

# /sns-run

전체 흐름을 한 번에 실행하는 단일 슬래시 명령.

## 두 가지 모드

### 1) 즉시 1건 (스케줄 안 씀)

`/sns-run "<주제>" --channels=threads,linkedin [--cadence=single|series-3|series-5] [--approve] [--publish] [--dry-run]`

내부 동작:
1. `company-profile.yaml` 존재 확인 (없으면 사용자에게 `/sns-onboard` 안내)
2. `bin/campaign-new.mjs` 로 캠페인 생성
3. 채널마다 `bin/generate.mjs` 실행 (provider = `.env.local` 의 `CONTENT_ENGINE_PROVIDER`, 없으면 mock)
4. `bin/preview.mjs` 로 결과 출력
5. `--approve` 면 가드 통과 채널 자동 승인
6. `--publish` 면 발행 (기본은 dry-run 안전망 권장: `PUBLISHER_DRY_RUN=true`)

CLI: `node bin/run.mjs --topic "<주제>" --channels=threads --approve --publish --dry-run`

### 2) 기간 예약 (스케줄)

`/sns-run schedule "<주제>" --channels=threads --period=week|month --frequency=N [--time=09:00] [--start=YYYY-MM-DD] [--titles="t1|t2|t3"] [--no-auto-publish] [--no-generate]`

내부 동작:
1. `bin/schedule-plan.mjs` 호출 → 기간 내 N개 캠페인 동시 생성, 각 항목 `schedule[ch]` ISO 시각 분산
2. 기본 `autoPublish=true` — publishAt 도달 시 워커가 자동 승인 + 발행 시도
3. 자동 실패 (가드 reject, 인증 만료 등) → `status=needs_attention` + `attentionReason[ch]` 기록 → 사람이 `/sns-preview` 후 손으로 수정
4. `--no-auto-publish` 주면 알림만 (사람이 `/sns-publish` 직접 호출)
5. `--titles="..."` 로 매 회 다른 주제 지정 가능. 없으면 seed 주제 + `#1, #2, ...` 자동 부여

워커 실행:
- 수동: `/sns-queue tick`
- 자동: `node bin/install-cron.mjs install --every=15` (macOS launchd 또는 crontab)

CLI: `node bin/schedule-plan.mjs --topic "<주제>" --channels=threads --period=week --frequency=3 --titles="A|B|C"`

## Claude 가 사용자와 대화할 때

사용자가 `/sns-run` 만 입력하고 인자가 없으면 다음을 차례로 묻기:

1. "주제는?" → free-form 한 줄
2. "어느 채널? (threads / linkedin / 둘 다)"
3. "한 번 게시 / 시리즈(3장 또는 5장) / 텍스트 thread"
4. "한 번만 / 일주일에 N회 / 한 달에 N회" — 후자 둘은 스케줄 모드
5. (스케줄이면) "시작일? 발행 시각? (기본: 오늘 09:00 KST)"
6. (스케줄이면) "매 회 다른 주제로 갈래? 그럼 N개 제목 알려줘"
7. (스케줄이면) "발행 자동? 알림만? (기본: 자동, 실패시 needs_attention)"

답변 모이면 위 두 모드 중 하나의 CLI 한 줄로 실행.

## 안전장치 유지

- 자동 발행이라도 **회사 금기어가 들어간 글은 가드가 막아서 자동 승인 거부** → `needs_attention`
- `auth/<채널>.json` 없으면 publish 자체가 거부 (autoPublish=true여도 마찬가지)
- `PUBLISHER_DRY_RUN=true` 가 .env.local 에 있으면 모든 자동 발행이 dry-run (운영 권장 기본값)
