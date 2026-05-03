---
name: sns-repeat
description: 이전 캠페인 슬롯을 골라 재실행. 예약·스케줄 관리도 여기서.
---
> 업데이트 체크: `node harness/bin/check-updates.mjs` 실행 → `OK` 면 진행, `UPDATE_AVAILABLE` 이면 사용자에게 업데이트 여부 질문 후 진행. (상세: `harness/commands/_update-check.md`)

# /sns-repeat

저장된 슬롯에서 캠페인을 골라 재실행한다. 즉시 실행 또는 예약 스케줄로 등록 가능.

```
/sns-repeat                        # 슬롯 선택 인터랙티브
/sns-repeat 1                      # 슬롯 #1 즉시 재실행
/sns-repeat tick                   # 예약 큐 수동 1회 실행
/sns-repeat tick --dry-run
/sns-repeat status                 # 워커 설치 여부 + 예약 목록
/sns-repeat uninstall              # 자동 실행 워커 제거
```

---

## 실행 흐름

### 0단계 — 슬롯 목록 표시
`node harness/bin/slots.mjs list`

슬롯이 없으면:
```
아직 저장된 캠페인이 없어요.
/sns-start 로 첫 캠페인을 만들면 자동으로 저장됩니다.
```
→ 종료.

### 1단계 — 선택
- 인자에 번호가 있으면 바로 해당 슬롯 사용.
- 없으면 사용자에게 번호를 묻는다.
- "schedule" 또는 "예약" 입력 → 스케줄 모드로 분기.

### 2단계A — 즉시 재실행 모드
`node harness/bin/slots.mjs get <번호>` 로 슬롯 정보 읽기.

슬롯의 topic/channels/goal/cadence 를 그대로 사용해 `/sns-start` 와 동일한 3~8단계 진행:
```
node harness/bin/campaign-new.mjs "<topic>" --channels=<ch> --goal=<goal> --cadence=<cadence>
→ generate → 칸반 표시 → preview → 게이트 → approve + publish → 칸반 표시 → 슬롯 갱신
```

### 2단계B — 스케줄 모드 (예약)
```
언제 발행할까요?
예: "매주 화요일 오전 10시", "월 3회", "내일 오후 2시"
```

`node harness/bin/schedule-plan.mjs --slot=<번호> --when="<입력값>"` 실행.
→ `brief.schedule` 에 미래 시각 등록, `status=scheduled` 마킹.

처음 예약이면:
```
예약을 자동으로 발행하려면 백그라운드 워커가 필요해요. 설치할까요? [Y/n]
```
Y → `node harness/bin/install-cron.mjs install --every=15`

**칸반 자동 표시**: `node harness/bin/board.mjs` (📅 분포 확인)

---

## 서브커맨드 상세

| 커맨드 | 내부 스크립트 | 설명 |
|--------|-------------|------|
| `tick` | `queue-tick.mjs` | 예약 큐 수동 1회 실행 |
| `status` | `install-cron.mjs status` | 워커 설치 여부 + 다음 예약 목록 |
| `uninstall` | `install-cron.mjs uninstall` | 자동 실행 워커 제거 |

---

## 슬롯 형식 (posts/slots.yaml)

```yaml
version: 1
slots:
  - topic: "신제품 런칭"
    channels: [threads, linkedin]
    goal: awareness
    cadence: single
    lastSlug: "2026-05-03-신제품-런칭"
    lastRun: "2026-05-03T09:30:00Z"
    runCount: 3
```

최대 5개 유지. 동일 topic 반복 실행 시 갱신 (중복 push 없음).
