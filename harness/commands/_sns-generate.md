---
name: sns-generate
description: 캠페인 1개 이상 채널에 대해 카피·이미지 draft를 생성 (provider는 env로 선택).
---
> 업데이트 체크: `node harness/bin/check-updates.mjs` 실행 → `OK` 면 진행, `UPDATE_AVAILABLE` 이면 사용자에게 업데이트 여부 질문 후 진행. (상세: `harness/commands/_update-check.md`)

# /sns-generate

```
/sns-generate <slug>                          # brief.channels 전부
/sns-generate <slug> --channel=threads
/sns-generate <slug> --provider=openai
/sns-generate <slug> --images=3               # 카드 수 강제 (cadence 자동값 무시)
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

## inhouse-slides 세 단계 흐름

`CONTENT_ENGINE_PROVIDER=inhouse-slides` 인 경우 generate 는 세 단계로 나뉜다.

**1단계 — spec 작성:**
```
node bin/generate.mjs <slug> [--channel=<ch>]
```
→ 채널별 `posts/campaigns/<slug>/<ch>/slide-spec.json` 작성 후 종료.
→ `brief.status[<ch>]` = `drafting` 으로 설정.

**2단계 — image-director 인라인 실행:**
`harness/agents/image-director.md` 를 읽고 그 지침대로 **인라인으로** 처리한다.
(Write 권한 필요 — 서브에이전트 미사용)
`slide-spec.json` → HTML 파일 + `agent-output.json` 직접 작성.

**3단계 — finalize:**
```
node bin/generate.mjs <slug> [--channel=<ch>] --finalize
```
→ HTML 파일을 Playwright 로 캡쳐 → draft YAML 조립 → brand-guardian 검사.
→ guardian ok 시 `brief.status[<ch>]` = `preview`.
