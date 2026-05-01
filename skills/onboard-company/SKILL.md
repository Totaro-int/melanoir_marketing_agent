---
name: onboard-company
description: Use when the user runs `/onboard` or first-time setup, OR when a campaign command detects missing company-profile.yaml. Conducts a structured interview to fill schemas/company-profile.schema.yaml and writes company-profile.yaml at the project root.
---

# Onboard Company

회사 프로필을 대화형으로 수집해 `company-profile.yaml`을 생성한다. 모든 캠페인 카피·이미지 생성은 이 파일을 참조하므로, 인터뷰 품질이 곧 결과물 품질이다.

## When to use

- 사용자가 `/onboard`를 실행했을 때
- `company-profile.yaml`이 없는 상태에서 `/campaign new`가 호출됐을 때 (자동 트리거)
- `/onboard update <섹션>` 으로 부분 업데이트 요청 시 (해당 섹션만 다시 인터뷰)

## Inputs

- `schemas/company-profile.schema.yaml` — 필수 필드와 검증 룰의 단일 출처
- `examples/company-profile.example.yaml` — 사용자가 막힐 때 보여줄 참고 예시
- 기존 `company-profile.yaml` (있다면) — 이미 채워진 값은 재질문하지 말고 변경 여부만 확인

## Interview flow

스키마의 `required` 필드를 **이 순서**로 진행한다. 각 단계는 한 번에 하나의 질문만 하고, 사용자가 답한 즉시 다음 질문으로 넘어간다.

1. **brand.name** — "회사명이 어떻게 됩니까?"
2. **taglineOneLine** — "회사를 한 문장으로 소개한다면?" (5~120자, 카피 생성에 직접 사용됨을 안내)
3. **industry** — "산업/카테고리는? (예: 'B2B SaaS - 결제 인프라')"
4. **targetAudience** (1명 이상) — 페르소나·통점·자주 쓰는 채널을 묶어서 질문
5. **tone.preset** — 7개 프리셋 중 선택 (`professional / friendly / witty / bold / calm / premium / custom`). 선택 후 `voiceNotes`에 자유 서술 추가
6. **banned.words / topics / claims** — "절대 쓰면 안 되는 단어·주제·표현이 있나요?" (없으면 `[]` 허용하되, `claims`에는 한국 광고법 위반 위험 표현 예시 보여주기)
7. **(선택) visual / hashtags / legal / campaigns / competitors** — 각각 "지금 입력할까요? 나중에 `/onboard update <섹션>`으로 채워도 됩니다." 로 분기

## Validation

저장 직전 반드시 다음을 확인:

- [ ] 모든 `required` 필드가 채워졌는가
- [ ] `taglineOneLine` 길이 5~120
- [ ] `tone.preset`이 enum 값인가
- [ ] `banned.words`에 한국 광고법 고위험 표현(예: "최고의", "1위", "유일한")이 누락됐다면 추가 권장
- [ ] `legal.adDisclosureRequired`가 false면 사용자에게 한 번 더 확인 (한국 공정위 가이드라인 기본값 true)

## Output

`./company-profile.yaml`로 저장. 메타데이터:
```yaml
meta:
  createdAt: <ISO8601 KST>
  updatedAt: <ISO8601 KST>
  filledBy: interview
```

저장 후 다음 메시지를 정확히 출력:

```
✅ company-profile.yaml 저장 완료.
다음 단계: /campaign new "<주제>" 로 첫 캠페인을 만들어 보세요.
```

## Guardrails

- 인터뷰 도중 사용자가 "예시 보여줘" 라고 하면 `examples/company-profile.example.yaml`의 해당 섹션만 발췌해 보여준다 (전체 dump 금지 — 답변 유도 효과↓)
- `company-profile.yaml`은 **gitignore 대상**임을 안내하고, 저장 후 `git status`에 빨간색으로 안 보이는지 확인하라고 한 줄로 안내
- 자격증명(SNS 비밀번호·API 키)는 **이 인터뷰에서 절대 묻지 않는다**. 별도 명령(`/auth add <channel>`, Phase 4)에서 OS 키체인으로 처리

## Don't

- 한 번에 여러 질문을 묶어서 던지지 말 것 (응답 품질 떨어짐)
- 사용자가 "잘 모르겠다" 하면 추측해서 채우지 말 것 — 그 필드는 `null`로 두고 나중에 채우도록 안내
- 스키마에 없는 필드를 임의 추가하지 말 것 (스키마 변경은 PR로)
