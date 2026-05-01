---
name: status
description: 캠페인별·채널별 진행 상황을 칸반으로 보여준다.
---

# /status

활성 캠페인의 채널별 진행 상황을 한눈에 보여준다.

## 사용법

```
/status                       # 모든 활성 캠페인
/status <slug>                # 특정 캠페인
/status --channel threads     # 특정 채널만 필터
/status --watch               # 1초마다 갱신 (Phase 5)
```

## 출력 형식 (Phase 1: ASCII)

```
┌─ 캠페인: 신제품 런칭 5월 1주차 ─────────────────────────┐
│ Threads    ✅ 발행완료  14:22  https://threads.net/...  │
│ LinkedIn   ⏳ 카피 생성중  ▓▓▓░░  3/5                  │
│ Instagram  ⏸  대기 (승인 필요)                          │
│ X          ❌ 실패 (셀렉터)  → /retry x                 │
└─────────────────────────────────────────────────────────┘
```

## 상태값

| 상태 | 아이콘 | 의미 |
|------|--------|------|
| drafting | ⏳ | 카피·이미지 생성중 |
| preview  | 👀 | 사용자 승인 대기 |
| approved | ✅ | 승인됨, 업로드 대기 |
| scheduled| 📅 | 예약됨 |
| published| ✅ | 발행 완료 |
| failed   | ❌ | 실패 (재시도 가능) |
| skipped  | ⏭ | 사용자가 건너뜀 |

## 데이터 소스

`campaigns/<slug>/brief.yaml`의 `status:` 섹션과 각 채널 디렉터리의 `result.json`을 머지해 렌더링.

## Phase 5 확장

- statusline에 한 줄 요약 (`📣 2/4 채널 완료 │ LinkedIn 생성중`)
- Ink 보조 창(`marketing_ai status --watch`)에서 풀스크린 칸반
- Claude Code hooks(PostToolUse)로 단계 변화 자동 push
