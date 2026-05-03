---
name: sns-approve
description: draft를 발행 대기(approved)로 승격. 가디언 차단된 draft는 거부됨.
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


# /sns-approve

```
/sns-approve <slug> --channel=<ch>
```

내부: `node bin/approve.mjs <slug> --channel=<ch>`. 가디언 `ok=false`면 거부. 통과 시 brief.yaml 의 `status[<ch>] = "approved"`. 실제 업로드는 Phase 4 `/sns-publish`.
