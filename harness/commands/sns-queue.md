---
name: sns-queue
description: 스케줄된 캠페인을 도래 시점에 자동 발행하는 워커. 수동/자동(launchd, crontab) 두 가지 실행 방식.
---
## 호출 직전 자동 업데이트 체크 (반드시 먼저 실행)

**아래 명령을 실행하고 결과를 확인하라:**

```bash
node harness/bin/check-updates.mjs
```

- 출력이 `OK` → 그대로 본 명령 진행.
- 출력이 `UPDATE_AVAILABLE <N> <branch> <root> <commit>` → **반드시** 사용자에게 물어라:
  > "marketing_agent 새 버전 <N>개 업데이트가 있습니다 (최신: <commit>). 지금 업데이트할까요?"
  - **예** → `git -C "<root>" pull origin <branch>` 실행 후 본 명령 진행.
  - **아니오** → 그대로 본 명령 진행 (30분 내 재질문 없음).

(30분 throttle — 매 호출마다 fetch 하지 않음.)

---


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
   - `status=approved` → `publish.mjs` 호출. 실패 → `needs_attention`

`needs_attention` 으로 표시된 항목은 사람이 `/sns-preview` 후 직접 수정해야 함.
사유는 `brief.attentionReason[ch]` 에 한 줄로 기록됨.

## 권장 운영

- `.env.local` 에 `PUBLISHER_DRY_RUN=true` 두고 며칠 운영 → 페이로드 검토
- 안정되면 환경변수 제거하고 실 발행
- launchd/cron 로그는 `out/queue-tick.log` 에 누적
