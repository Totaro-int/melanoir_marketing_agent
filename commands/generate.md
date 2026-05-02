---
name: generate
description: 캠페인 1개 이상 채널에 대해 카피·이미지 draft를 생성 (provider는 env로 선택).
---

# /generate

```
/generate <slug>                          # brief.channels 전부
/generate <slug> --channel=threads
/generate <slug> --provider=openai
```

내부: `node bin/generate.mjs <slug> [--channel=...] [--provider=...]`.

provider 우선순위: `--provider` 플래그 > `CONTENT_ENGINE_PROVIDER` env > `mock`. provider healthcheck 실패 시 자동으로 mock 폴백.

각 채널마다:
1. `channels/<ch>/strategy + templates` + `company-profile.yaml` + brief 로드
2. provider.generateCopy → 카피
3. provider.generateImage → 카드 이미지 (out/<provider>-images/)
4. brand-guardian 검사 → ok면 `status: preview`, block이면 `status: drafting`
5. `campaigns/<slug>/<ch>/{draft.yaml, draft.md}` 저장
