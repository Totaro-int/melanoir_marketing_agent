---
name: sns-queue
description: 스케줄된 캠페인을 도래 시점에 자동 발행하는 워커. 수동/자동(launchd, crontab) 두 가지 실행 방식.
---
> 업데이트 체크: `node harness/bin/check-updates.mjs` 실행 → `OK` 면 진행, `UPDATE_AVAILABLE` 이면 사용자에게 업데이트 여부 질문 후 진행. (상세: `harness/commands/_update-check.md`)

# /sns-queue

스케줄(`brief.schedule[ch]`) 도달한 캠페인을 처리하는 워커.

## 명령

| 호출 | 동작 |
|------|------|
| `/sns-queue tick` | 한 번 실행. 도래한 항목 처리. |
| `/sns-queue tick --dry-run` | 시뮬레이션 (실제 발행 안 함). |
| `/sns-queue install [--every=15]` | 자동 실행 설치 (macOS launchd 또는 crontab). 기본 15분 간격. |
| `/sns-queue uninstall` | 자동 실행 제거. |
| `/sns-queue status` | 자동 실행 설치 여부 확인. |

CLI 등가:
```bash
node bin/queue-tick.mjs                  # 한 번 처리
node bin/queue-tick.mjs --dry-run        # 시뮬레이션
node bin/queue-tick.mjs --json           # 로깅용 JSON 출력
node bin/install-cron.mjs install        # 자동 실행 설치
```

## 처리 규칙

각 캠페인의 채널마다:

1. `brief.schedule[ch]` 가 미래면 스킵
2. `brief.status[ch]` 가 `published / failed / needs_attention` 이면 스킵
3. `brief.autoPublish === false` 이면 알림만 (`action: notify-only`)
4. 자동 모드:
   - `status=scheduled` → `approve.mjs` 호출 (가드 검사). 실패 → `needs_attention`
   - `status=approved` → 레거시 자동 API 발행(`publish.mjs`) 제거됨(2026-06) → `needs_attention` (browser-publish 수동 발행 대기)

`needs_attention` 으로 표시된 항목은 사람이 `/sns-preview` 후 직접 수정해야 함.
사유는 `brief.attentionReason[ch]` 에 한 줄로 기록됨.

## 권장 운영

- 큐는 due 항목을 자동 게시하지 않는다 — `approved` 도달 시 `needs_attention` 으로 표시만.
- 실제 발행은 사람이: 대시보드 [발행] 버튼 · `npm run morning` · 또는 `browser-publish.mjs --attach --pre-publish`.
- launchd/cron 로그는 `out/queue-tick.log` 에 누적
