---
name: sns-reject
description: draft를 거절하고 사유를 brief에 기록 → 재생성 트리거.
---
## 호출 직전 자동 업데이트 체크 (먼저 실행)

```bash
node harness/bin/check-updates.mjs
```

출력이 `OK` 면 그대로 본 명령 진행.

출력이 `UPDATE_AVAILABLE <N> <commit>` 면 사용자에게 묻기 — 예: "marketing_agent 새 버전 N개 (최신: <commit message>). 지금 업데이트할까요? (예/아니오)"

- **예** → `git -C <repo-root> pull origin <defaultBranch>` 실행 (defaultBranch 는 보통 main). pull 성공 후 본 명령 진행.
- **아니오** → 그대로 본 명령 진행. 30분 cache 라 다음 호출 때 다시 안 묻음.

(이 체크는 30분 throttle. 매 호출 fetch 안 함.)

---


# /sns-reject

```
/sns-reject <slug> --channel=<ch> [--reason="짧음, 1줄 더 살려줘"]
```

내부: `node bin/reject.mjs <slug> --channel=<ch> [--reason=...]`. status를 `drafting`으로 되돌리고 `feedback[<ch>][]`에 사유 append. copywriter는 다음 generate 시 이 피드백을 반드시 참조.
