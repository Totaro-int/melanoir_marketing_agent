---
name: sns-approve
description: draft를 발행 대기(approved)로 승격. 가디언 차단된 draft는 거부됨.
---
> 업데이트 체크: `node harness/bin/check-updates.mjs` 실행 → `OK` 면 진행, `UPDATE_AVAILABLE` 이면 사용자에게 업데이트 여부 질문 후 진행. (상세: `harness/commands/_update-check.md`)

# /sns-approve

```
/sns-approve <slug> --channel=<ch>
```

내부: `node bin/approve.mjs <slug> --channel=<ch>`. 가디언 `ok=false`면 거부. 통과 시 brief.yaml 의 `status[<ch>] = "approved"`. 실제 발행은 browser-publish(크롬 쿠키) — 대시보드 [발행] 버튼 · `npm run morning` · 또는 `node harness/bin/browser-publish.mjs <slug> --channel=<ch> --attach --pre-publish` 후 사람이 [공유]/[발행] 클릭.
