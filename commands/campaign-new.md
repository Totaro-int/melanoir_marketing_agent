---
name: campaign-new
description: 새 캠페인 브리프를 생성하고 채널별 카피·이미지 초안을 만든다. (Phase 3에서 완성)
---

# /campaign new

> ⚠️ **현재 Phase 2**: 브리프 파일 + 채널 디렉터리 생성까지 자동. 카피·이미지 생성은 Phase 3에서 활성화.

## 사용법

```
/campaign new "<주제>"
/campaign new "<주제>" --channels threads,linkedin
/campaign new "<주제>" --goal lead --cadence single
```

## 동작 (Phase 2)

내부적으로 `node bin/campaign-new.mjs "<주제>" [--channels=...] [--goal=...] [--cadence=...]` 를 실행한다.

1. `company-profile.yaml` 존재 확인 — 없으면 `/onboard` 안내 후 종료
2. `--channels` 미지정 시 `plugin.json`의 `status: reference|active` 채널 자동 선택
3. `campaigns/<YYYY-MM-DD>-<slug>/brief.yaml` 생성 (스키마: `schemas/campaign-brief.schema.yaml`)
4. 채널별 디렉터리 + placeholder README 생성: `campaigns/<slug>/<channel>/`
5. 결과 요약 출력 + 다음 단계 안내

## brief.yaml 스키마 (초안)

```yaml
version: 1
slug: 2026-05-01-신제품-런칭
topic: "신제품 런칭 5월 1주차"
goal: awareness         # awareness | lead | conversion | retention | recruiting
channels: [threads]
cadence: single         # single | thread | series-3 | series-5
constraints:
  maxLengthOverride: null
  mustInclude: []
  mustExclude: []
status:
  threads: drafting     # drafting | preview | approved | scheduled | published | failed
```

## 다음 단계 (Phase 3+)

- 채널별 `copywriter` 서브에이전트가 카피 생성
- `image-director`가 카드뉴스 프롬프트 생성 → content-engine 호출
- 휴먼 승인 게이트 → `/preview <slug>` → `/publish <slug>`
