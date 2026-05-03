---
name: sns-reject
description: draft를 거절하고 사유를 brief에 기록 → 재생성 트리거.
---
> 업데이트 체크: `node harness/bin/check-updates.mjs` 실행 → `OK` 면 진행, `UPDATE_AVAILABLE` 이면 사용자에게 업데이트 여부 질문 후 진행. (상세: `harness/commands/_update-check.md`)

# /sns-reject

```
/sns-reject <slug> --channel=<ch> [--reason="짧음, 1줄 더 살려줘"]
```

내부: `node bin/reject.mjs <slug> --channel=<ch> [--reason=...]`. status를 `drafting`으로 되돌리고 `feedback[<ch>][]`에 사유 append. copywriter는 다음 generate 시 이 피드백을 반드시 참조.
