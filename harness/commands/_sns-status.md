---
name: sns-status
description: 캠페인별·채널별 진행 상황을 칸반으로 보여준다. --watch 로 실시간 갱신.
---
> 업데이트 체크: `node harness/bin/check-updates.mjs` 실행 → `OK` 면 진행, `UPDATE_AVAILABLE` 이면 사용자에게 업데이트 여부 질문 후 진행. (상세: `harness/commands/_update-check.md`)

# /sns-status

활성 캠페인을 채널별 칸반으로 한눈에 보여준다.

## 사용법

```
/sns-status                  # 최근 5개 캠페인
/sns-status <slug>           # 특정 캠페인만
/sns-status --watch          # 파일시스템 변경 감지 → 자동 갱신 (Ctrl-C 종료)
/sns-status <slug> --watch
```

내부: `node bin/board.mjs [<slug>] [--watch]`.

## 출력 예시

```
📣 marketing_agent — campaign board  (3)
recent: 2026-05-02-신제품-런칭 · 2026-04-28-브랜드-리뉴얼 · 2026-04-21-이벤트-안내

┌──────────────────────────────────────────────────────────────────────────────┐
│ 📣 2026-05-02-신제품-런칭-5월-1주차 · 신제품 런칭 5월 1주차                    │
│     goal: awareness  ·  cadence: single  ·  ✅ 1 published · 👀 1 preview    │
├──────────────────────────────────────────────────────────────────────────────┤
│  ✅  threads    published   https://www.threads.net/@1784000/post/123        │
│  👀  linkedin   preview                                                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 상태값

| 상태 | 아이콘 | 의미 |
|------|--------|------|
| drafting | ⏳ | 카피·이미지 생성중 |
| preview  | 👀 | 사용자 승인 대기 |
| approved | 📤 | 승인됨, 업로드 대기 |
| scheduled| 📅 | 예약됨 |
| published| ✅ | 발행 완료 |
| failed   | ❌ | 실패 (재시도 가능) |
| skipped  | ⏭ | 사용자가 건너뜀 |

## 데이터 소스

- `campaigns/<slug>/brief.yaml` 의 `status:` 섹션
- `campaigns/<slug>/<channel>/result.json` (URL · 에러 메시지)

## statusline (한 줄 요약)

Claude Code 하단 statusline은 `statusline/statusline.sh` 가 자동 표시:

```
📣 2026-05-02-신제품-런칭 │ 1/2 ▓▓░░░ │ linkedin preview
```

색상은 published 비율에 따라 dim → cyan → green, failed 가 있으면 red.
