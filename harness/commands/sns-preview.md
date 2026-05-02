---
name: sns-preview
description: 캠페인 채널별 draft를 콘솔에 예쁘게 렌더링. 가디언 결과·해시태그·자산 경로 포함.
---

# /sns-preview

```
/sns-preview <slug>                      # 모든 채널
/sns-preview <slug> --channel=threads    # 특정 채널만
```

내부적으로 `node bin/preview.mjs <slug> [--channel=...]` 실행. draft가 없으면 어떤 명령으로 만드는지 안내한다.

이 단계가 **휴먼 승인 게이트**의 시작점. 여기서 사용자가 한 번 본 뒤 `/sns-approve` 또는 `/sns-reject`.
