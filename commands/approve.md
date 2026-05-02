---
name: approve
description: draft를 발행 대기(approved)로 승격. 가디언 차단된 draft는 거부됨.
---

# /approve

```
/approve <slug> --channel=<ch>
```

내부: `node bin/approve.mjs <slug> --channel=<ch>`. 가디언 `ok=false`면 거부. 통과 시 brief.yaml 의 `status[<ch>] = "approved"`. 실제 업로드는 Phase 4 `/publish`.
