---
name: onboard-company
description: Use when the user runs `/sns-onboard` or first-time setup, OR when a campaign command detects missing company-profile.yaml. Conducts a structured interview to fill schemas/company-profile.schema.yaml and writes company-profile.yaml at the project root.
---

# Onboard Company

회사 프로필을 대화형으로 수집해 `company-profile.yaml`을 생성한다. 모든 캠페인 카피·이미지 생성은 이 파일을 참조하므로, 인터뷰 품질이 곧 결과물 품질이다.

## When to use

- 사용자가 `/sns-onboard`를 실행했을 때
- `company-profile.yaml`이 없는 상태에서 `/sns-campaign-new`가 호출됐을 때 (자동 트리거)
- `/sns-onboard update <섹션>` 으로 부분 업데이트 요청 시 (해당 섹션만 다시 인터뷰)

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
7. **channels.enabled** — "어느 SNS에 발행할 건가요? (1개 이상 골라야 함)" — 아래 11개 카탈로그를 한 번에 보여주고 콤마 또는 줄바꿈으로 받기. 각 옵션 옆에 미디어 요건과 토큰 발급 난이도를 한 줄씩 표기.

   ```
   1) threads     텍스트+이미지+캐러셀     Meta Graph
   2) linkedin    텍스트+이미지(여러장)    OAuth2 (회사 페이지면 organization URN)
   3) instagram   이미지/캐러셀 (텍스트만 X)  Meta Graph (IG Business)
   4) facebook    텍스트+이미지(여러장)    Page token
   5) x           텍스트(280자)+이미지<=4   Bearer 또는 OAuth1 (이미지는 OAuth1 필요)
   6) reddit      self/link 글 (서브레딧 지정) OAuth2 password
   7) bluesky     텍스트+이미지<=4         AT Protocol (app password 발급 5초)
   8) mastodon    텍스트+이미지(여러장)    Instance + access token
   9) pinterest   이미지 1장 (보드 지정)   OAuth2
   10) tiktok     영상 전용 (.mp4)         OAuth2 — 텍스트/이미지 캠페인 X
   11) youtube    영상 전용 (.mp4)         OAuth2 — 텍스트/이미지 캠페인 X
   ```

   - 추천: 첫 캠페인이라면 토큰 발급이 쉬운 `threads, bluesky, mastodon` 부터.
   - 영상 캠페인 계획 없으면 tiktok/youtube 는 빼는 게 좋음 (이미지/텍스트와 호환 안 됨).
   - 최소 1개 필수. 입력값은 `channels.enabled` 배열로 저장.

8. **(선택) visual / hashtags / legal / campaigns / competitors** — 각각 "지금 입력할까요? 나중에 `/sns-onboard update <섹션>`으로 채워도 됩니다." 로 분기

## Validation

저장 직전 반드시 다음을 확인:

- [ ] 모든 `required` 필드가 채워졌는가
- [ ] `taglineOneLine` 길이 5~120
- [ ] `tone.preset`이 enum 값인가
- [ ] `banned.words`에 한국 광고법 고위험 표현(예: "최고의", "1위", "유일한")이 누락됐다면 추가 권장
- [ ] `legal.adDisclosureRequired`가 false면 사용자에게 한 번 더 확인 (한국 공정위 가이드라인 기본값 true)

## Modes

| 모드 | 트리거 | 동작 |
|------|--------|------|
| **full** | `/sns-onboard` (프로필 없음) | 위 7단계 전체 인터뷰 |
| **update** | `/sns-onboard update <섹션>` | 해당 섹션만 인터뷰. 변경 사항만 머지하고 `meta.updatedAt` 갱신 |
| **show** | `/sns-onboard show` | `node bin/profile-show.mjs` 실행 결과를 그대로 보여줌 (스킬은 추가 작업 없음) |
| **resume** | `/sns-onboard` (프로필 있음) | "전체 다시 / 부분 업데이트 / 그대로 두기" 3택 질문 |

업데이트 가능 섹션: `brand`, `tagline`, `industry`, `audience`, `tone`, `banned`, `channels`, `visual`, `hashtags`, `legal`, `campaigns`, `competitors`.

저장 직전 반드시 `node bin/profile-validate.mjs` 실행해 스키마 위반·소프트 경고를 확인하고, 실패 시 사용자에게 어느 필드가 깨졌는지 알리고 그 필드만 다시 묻는다.

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
활성 채널: <enabled 콤마 나열>
다음 단계:
  1) /sns-auth add <채널>     선택한 채널마다 토큰 등록 (안 하면 dry-run 만 동작)
  2) /sns-campaign-new "<주제>" 첫 캠페인 만들기 (채널 미지정 시 enabled 전부)
```

## Guardrails

- 인터뷰 도중 사용자가 "예시 보여줘" 라고 하면 `examples/company-profile.example.yaml`의 해당 섹션만 발췌해 보여준다 (전체 dump 금지 — 답변 유도 효과↓)
- `company-profile.yaml`은 **gitignore 대상**임을 안내하고, 저장 후 `git status`에 빨간색으로 안 보이는지 확인하라고 한 줄로 안내
- 자격증명(SNS 비밀번호·API 키)는 **이 인터뷰에서 절대 묻지 않는다**. 별도 명령(`/sns-auth add <channel>`, Phase 4)에서 OS 키체인으로 처리

## Don't

- 한 번에 여러 질문을 묶어서 던지지 말 것 (응답 품질 떨어짐)
- 사용자가 "잘 모르겠다" 하면 추측해서 채우지 말 것 — 그 필드는 `null`로 두고 나중에 채우도록 안내
- 스키마에 없는 필드를 임의 추가하지 말 것 (스키마 변경은 PR로)
