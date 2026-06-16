---
name: sns-copy-generation
description: Use when generating copy and images for a marketing campaign channel in the marketing_agent harness. The spec→agent→finalize two-phase pattern applies to all providers (copywriter agent for fal/openai/anthropic/mock; image-director inline for inhouse-slides).
---

# SNS 카피 생성 패턴

모든 provider에서 동일하게 적용되는 spec → agent → finalize 2단계 흐름.

## 핵심 플로우

```
1. node harness/bin/generate.mjs <slug> [--channel=<ch>]
   → 채널별 copy-spec.json (또는 inhouse-slides: slide-spec.json) 생성
   → brief.status = "drafting"

2. 에이전트 실행 (채널마다)
   → inhouse-slides: image-director 에이전트 인라인 실행 → agent-output.json
   → 그 외: copywriter 서브에이전트가 copy-spec.json 처리 → copy-output.json

3. node harness/bin/generate.mjs <slug> --finalize [--channel=<ch>]
   → inhouse-slides: Playwright 캡처 + draft 조립
   → 그 외: provider.generateImage + draft 조립 + guardian 검사
```

## kind-aware 라우팅 (먼저 확인 — provider 보다 우선)

`channels.json` 의 `kind: "blog"` 채널(**naver-blog / tistory / brunch**)은 **provider 와 무관하게 항상 블로그 본문 경로**로 간다. `generate.mjs` 가 자동으로 이 채널들을 `copy-spec.json`(copywriter) 으로 라우팅하므로, 기본 provider(inhouse-slides)여도 블로그는 카드뉴스가 되지 않는다.

| 채널 kind | 1단계 spec | 2단계 에이전트 (순서대로) | 3단계 finalize |
|-----------|-----------|--------------------------|----------------|
| **blog** (naver-blog/tistory/brunch) | `copy-spec.json` | ① `copywriter.md` (서브에이전트) → 본문 article + `imageSlots` 정의<br>② `image-director.md` (서브에이전트, **Blog Mode**) → 슬롯별 이미지 생성 + `IMAGE_PLACEHOLDER_N` 치환 → `agent-output.json` | `finalizeBlog` — 인라인 이미지 url + 본문 조립 (placeholder 0개) |
| **social** (instagram/threads/linkedin 등) | provider 따름 (아래) | provider 따름 (아래) | inhouse: Playwright 캡처 / 그 외: provider.generateImage |

> ⚠ 블로그는 반드시 **copywriter → image-director(Blog Mode)** 2개 에이전트를 순서대로 실행해야 인라인 이미지가 채워진다. image-director 를 건너뛰면 본문에 `IMAGE_PLACEHOLDER_N` 가 그대로 남아 발행 시 깨진다.

## Provider별 에이전트 선택 (social 채널에만 적용)

| Provider | 에이전트 | 실행 방식 | spec 파일 |
|----------|---------|---------|-----------|
| `inhouse-slides` | `image-director.md` (Card Mode) | 인라인 (Write 권한 필요) | `slide-spec.json` |
| `fal`, `openai`, `anthropic`, `mock` | `copywriter.md` | 서브에이전트 | `copy-spec.json` |

provider 우선순위: `--provider` 플래그 > `CONTENT_ENGINE_PROVIDER` env > `inhouse-slides`(기본)

## 부분 재생성 (카드 단위)

```bash
node harness/bin/generate.mjs <slug> --channel=<ch> --card=2
# copywriter 서브에이전트 실행
node harness/bin/generate.mjs <slug> --channel=<ch> --card=2 --finalize
```

## 피드백 기반 재생성 (카드 품질 평가 실패 시)

```bash
node harness/bin/generate.mjs <slug> [--channel=<ch>] --regen
# eval.json 피드백 → slide-spec.json regenerationFeedback 주입
# image-director 재실행 (실패 카드만)
node harness/bin/generate.mjs <slug> [--channel=<ch>] --finalize
node harness/bin/evaluate.mjs <slug> [--channel=<ch>]
# card-evaluator 재실행
```

재생성은 최대 1회. 재시도 후에도 미달이면 경고만 표시하고 계속 진행.

## watchOut 검사 (finalize 직후)

`keywords.json`에 `watchOut` 항목이 있는 채널은 finalize 완료 후 draft 텍스트 전체를 검사한다.
발견 시 경고 출력 (발행 강제 중단 아님). 경고가 있으면 6단계 휴먼 게이트 전에 재표시.

## 학습 루프 연동

`approve.mjs` 호출 시 `posts/preferences.yaml`에 학습 데이터 누적.
다음 `generate.mjs` 실행 시 `copy-spec.json`의 `learnedPreferences` 필드에 자동 주입.
신뢰도 게이트: 3건 미만 미주입 / 3-5건 `initial` / 10건+ `strong`.
