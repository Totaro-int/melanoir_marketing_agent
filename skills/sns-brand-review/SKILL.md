---
name: sns-brand-review
description: Use when checking marketing content against brand guidelines in the marketing_agent harness. Two-layer check: deterministic rule scan first, then LLM semantic review only when needsLlmReview is true.
---

# SNS 브랜드 검수 패턴

가이드라인 준수 여부를 결정론적 검사 + 필요 시 LLM 의미론 검사로 확인하는 2단계 패턴.

## 2단계 검수 흐름

```
1. 결정론적 검사 (항상 실행)
   node harness/bin/inspect-guidelines.mjs <slug> --channel=<ch> --json
   → ok / blocking / needsLlmReview 반환

2. LLM 의미론 검사 (needsLlmReview === true 일 때만)
   node harness/bin/inspect-guidelines.mjs <slug> --channel=<ch> --spec
   → guideline-spec-<ts>.json 생성 (outputPath 기억)
   
   harness/agents/guideline-reviewer.md 서브에이전트 실행
   → spec 처리 → guideline-output-<ts>.json 작성
   
   node harness/bin/inspect-guidelines.mjs <slug> --channel=<ch> \
     --merge-llm=<spec.outputPath> --json
   → 결과를 brief에 머지
```

## 결과 판정

| 상태 | 의미 | 처리 |
|------|------|------|
| `ok` | 전 항목 통과 | 다음 단계 진행 |
| `blocking` | 필수 항목 미준수 | 재생성 또는 /sns-edit 권고 |
| `needsLlmReview` | 의미론 검사 필요 | 2단계 LLM 검사 진행 |

## brand-guardian 에이전트 (generate finalize 내장)

`generate.mjs --finalize` 내부에서 자동 실행. guardian 결과:
- `ok` → `status: preview`
- `block` → `status: drafting` (재생성 필요)

guardian은 generate 흐름에 내장되어 있으므로 직접 호출 불필요.

## 시리즈 캠페인 자동 발행 전 검수

시리즈는 사람이 게이트를 보지 않고 자동 발행되므로 스케줄 등록 시 한 번 더 검수.
미준수 항목 발견 시 사용자에게 [F] 재생성 / [E] 직접 수정 / [C] 그대로(워커 차단) 선택 제시.

## guardian vs inspect-guidelines 차이

| 항목 | brand-guardian | inspect-guidelines |
|------|---------------|--------------------|
| 시점 | generate finalize 내장 | 별도 명시 호출 |
| 범위 | 브랜드 톤·금기어·일관성 | 채널별 가이드라인 체크리스트 |
| 출력 | brief.status 패치 | JSON 결과 + 선택적 LLM 머지 |
