---
name: generate
description: 캠페인 1개 이상 채널에 대해 카피·이미지 draft를 생성 (provider는 env로 선택).
---

# /generate

```
/generate <slug>                          # brief.channels 전부
/generate <slug> --channel=threads
/generate <slug> --provider=openai
/generate <slug> --images=3               # 카드 수 강제 (cadence 자동값 무시)
```

내부: `node bin/generate.mjs <slug> [--channel=...] [--provider=...] [--images=N]`.

provider 우선순위: `--provider` 플래그 > `CONTENT_ENGINE_PROVIDER` env > `mock`. healthcheck 실패 시 mock 폴백.

## 카드 수 자동 결정 (cadence → cardCount)

| cadence | 카드 수 | 비고 |
|---------|---------|------|
| single (기본) | 1 | 단일 hero 카드 |
| series-3 | 3 | hook → body → cta |
| series-5 | 5 | hook → body × 3 → cta |
| thread | 0 | 텍스트 시리즈, 이미지 없음 |

`--images=N` 으로 명시 지정 시 cadence 무시 (0~10).

각 채널마다:
1. `channels/<ch>/strategy + templates` + `company-profile.yaml` + brief 로드
2. provider.generateCopy → 카피
3. provider.generateImage × cardCount → 각 카드별 role hint(hook/body/cta) 주입
4. brand-guardian 검사 → ok면 `status: preview`, block이면 `status: drafting`
5. `campaigns/<slug>/<ch>/{draft.yaml, draft.md}` 저장 (assets + assetUrls 둘 다)
