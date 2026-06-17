---
name: sns-onboard-company
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

0. **(브랜드북 PDF 있으면 먼저)** "브랜드북·브랜드 가이드 PDF 있나요?" → 있으면 `node harness/bin/parse-pdf.mjs <pdf> --out=posts/sources/brandbook.md` 로 텍스트 추출 → 거기서 **태그라인·컬러 HEX·폰트·브랜드 보이스·미학**을 읽어 `taglineOneLine`·`tone.preset`+`voiceNotes`·`visual.colors`/`fonts`·`imageStyle.aesthetic`/`colorMood` 를 **미리 채운다**. 이후 단계는 빈 칸만 묻고, 채워진 건 "이렇게 맞나요?"로 확인만 받는다. (예: "Professional·Scientific" 보이스 → `preset: premium`, "monochromatic" → `colorMood: high_contrast`, "Pretendard #0A0A0C" → visual 에 그대로.)

1. **brand.name** — "회사명이 어떻게 됩니까?"
2. **taglineOneLine** — "회사를 한 문장으로 소개한다면?" (5~120자, 카피 생성에 직접 사용됨을 안내)
   - 이어서 **차별점 1개** 추출: "경쟁사·대안이랑 딱 하나만 다른 점을 꼽으면?" → 카피 O(Offer)의 핵심. **`tone.voiceNotes`에 한 줄로 적는다.** (⚠ `competitors` 필드는 copywriter spec에 전달 안 됨 — 카피에 반영되려면 voiceNotes나 painPoints에 있어야 함)

3. **industry** — "산업/카테고리는? (예: 'B2B SaaS - 결제 인프라')"
   - ⚠ 답이 **뷰티·반영구(PMU)·화장품·피부/병의원·헬스/식품** 계열이면 → 아래 **"업종 심화 인터뷰"** 섹션의 추가 질문을 4·6단계에 끼워넣는다. (광고법 리스크가 큰 업종이라 통점·금기어를 더 깊게 받아야 함). 채울 깊이의 골드 스탠다드: `examples/company-profile.beauty-pmu.example.yaml`

4. **targetAudience** (1명 이상) — 페르소나는 한 줄로 받되, **통점은 아래 4겹으로 파고든다** (한 번에 하나씩). 이게 전체 카피 품질의 1순위 입력이다.

   a. **결정적 순간** — "고객이 우리를 찾기 직전, 어떤 상황·기분이었나요?" (막연한 '필요해서'가 아니라 구체적 장면)
   b. **실패한 대안** — "우리한테 오기 전에 뭘 써봤다가 안 됐나요?" (경쟁 대안의 빈틈 = 우리 카피의 각)
   c. **두려움** — "고객이 결제 직전 가장 망설이는/무서워하는 게 뭔가요?" (이게 P(Problem) 1순위 후보)
   d. **고객의 언어** — "고객이 실제로 쓰는 단어·말투는요? (전문용어 말고 그들 입말)" → 답을 해당 페르소나의 `dailyVocab` 배열에 저장. copywriter가 카피 어휘 풀로 직접 씀.

   a~c의 답은 구체 문장으로 `painPoints` 배열에 넣는다. 추상어("불편함", "비효율")만 나오면 "예를 들면요?"로 한 번 더 좁힌다.

5. **tone.preset** — 7개 프리셋 중 선택 (`professional / friendly / witty / bold / calm / premium / custom`). 선택 후 **voiceNotes를 다음 3개로 채운다**:
   - **종결어미** — "~합니다 체 / ~해요 체 / 명사형 중 기본은?" (혼용 비율도)
   - **금지 말투** — "이런 말투는 절대 쓰지 마세요 하는 게 있나요?" (예: 느낌표 남발, 인사말, 이모지)
   - **sampleSentences** — "잘 나왔다 싶은 기존 문장 1~3개 붙여넣어 주세요." → 그대로 저장. **붙여넣은 게 있으면 거기서 호흡·어미 패턴을 직접 읽어 voiceNotes에 1줄 요약**한다 (모방 학습의 핵심).
   - 신뢰가 중요한 업종(뷰티/의료/금융)은 `calm` 또는 `professional` + "단정 광고톤 X, 수치·근거 기반" 권장.

6. **banned.words / topics / claims** — 2단계로 받는다:

   **(1) 자동 차단은 이미 됨 — 다시 안 받아도 됨.** 한국 광고법 7패턴(치료 단정·의학적 효능·효과 보장·부작용 없음·100% 안전·최고/유일/완벽/기적/영구 같은 절대표현·즉각 효과)은 `brand-guardian`이 **모든 캠페인 카피에 자동 block** 한다. 이건 안내만 하고 넘어간다.
   > profile-validate 가 "최고의·1위·100% 누락" 소프트 경고를 띄울 수 있다 — 카피는 어차피 자동 차단되니 무시해도 발행은 막힌다. 단 banned 에 명시하면 카드 **이미지 텍스트**까지 검사가 넓어지므로, 넣어도 손해는 없다.

   **(2) 브랜드·업종 추가분만 받는다**:
   - `words` — "브랜드 가이드상 절대 안 쓰는 단어는?" (예: 특정 경쟁사명, 옛 브랜드명, 비속어)
   - `topics` — "다루면 안 되는 주제는?" (예: 정치·종교, 경쟁사 비방, 특정 시술 부작용 사례) ※ topics는 guardian이 기계 체크 안 함 — copywriter 자가검열 전용이라 **여기서 빠지면 방어선이 없다**. 꼭 받는다.
   - `claims` — 업종이 광고법 민감 계열이면 아래 "업종 심화" 라이브러리를 보여주고 해당하는 것을 고르게 한다. 일반 업종이면 "과장하면 큰일 나는 표현 있나요?"로 받는다.
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

8. **writing** — 글쓰기 스타일 설정. 필수는 아니지만 카피 품질에 직접 영향. 아래 항목을 순서대로 하나씩 묻는다:

   a. **formats** (복수 선택 가능):
   ```
   1) single_punchline  — 한 줄 임팩트. 짧고 강렬.
   2) narrative_thread  — 스토리텔링. 기승전결 흐름.
   3) data_driven       — 수치·근거 먼저. "XX% 감소" 류.
   4) question_hook     — 질문으로 시작. "왜 XX는 실패할까요?"
   5) listicle          — 리스트형. "3가지 이유", "5가지 방법"
   ```
   여러 개 선택 가능. 없으면 건너뜀.

   b. **sentenceLength** — "문장 길이 선호는?"
   ```
   1) short  — 짧고 끊김. 호흡 빠름.
   2) medium — 보통. 가독성 균형.
   3) long   — 긴 서술형. 설명 충분히.
   ```

   c. **ctaStyle** — "행동 유도(CTA) 방식은?"
   ```
   1) direct    — 직접적. "지금 시작하세요", "무료 체험하기"
   2) soft      — 제안형. "한번 살펴보세요", "관심 있으시면"
   3) implicit  — 암시적. CTA 없이 궁금증만 남김.
   ```

   d. **emojiUsage** — "이모지 사용 방식은?"
   ```
   1) none     — 이모지 없음
   2) minimal  — 강조 1~2개만 (✅ 📊 등)
   3) moderate — 자연스럽게 여러 개
   ```

   e. **referencePosts** — "지금까지 쓴 글 중 잘 됐거나 마음에 드는 포스트가 있나요? 있으면 텍스트를 붙여넣어 주세요 (최대 3개, 없으면 건너뜀)." → 받은 텍스트를 `referencePosts` 배열에 저장.

9. **imageStyle** — 이미지 생성 스타일 설정. 아래 항목을 순서대로 묻는다:

   a. **aesthetic** — "카드/이미지의 전체 분위기는?"
   ```
   1) minimal_editorial — 여백 많고 정갈한 에디토리얼
   2) bold_graphic      — 강렬한 색면·굵은 타이포그래피
   3) warm_lifestyle    — 따뜻한 감성, 사람·일상 느낌
   4) dark_luxury       — 어둡고 고급스러운 분위기
   5) playful_bright    — 밝고 컬러풀, 발랄한 느낌
   6) swiss_type        — 타이포그래피 중심, 스위스 그래픽
   7) custom            — 직접 서술
   ```
   `custom` 선택 시 → `customAesthetic`에 자유 서술 받기.

   b. **colorMood** — "색감 분위기는?"
   ```
   1) brand_only     — 브랜드 컬러만 사용
   2) cool           — 차갑고 차분한 계열 (블루·그레이)
   3) warm           — 따뜻한 계열 (크림·오렌지·레드)
   4) neutral        — 무채색 (흑·백·회)
   5) high_contrast  — 흑백 고대비
   ```

   c. **preferAbstract** — "이미지 스타일 선호는?"
   ```
   1) 추상·타이포그래피 중심 (도형, 글자, 여백)
   2) 구체적 표현 (사물, 공간, 상황 묘사)
   ```
   → true / false 저장.

   d. **avoidElements** — "이미지에서 절대 피할 요소가 있나요? (예: '사람 실루엣', '그라디언트', '스톡포토 느낌', '복잡한 배경')" → 없으면 건너뜀.

   e. **referencesBrands** — "시각적으로 닮고 싶은 브랜드나 매체가 있나요? (예: Linear, Stripe, Notion, 무신사)" → 없으면 건너뜀. 최대 3개.

10. **(선택) visual / hashtags / legal / campaigns / competitors** — 각각 "지금 입력할까요? 나중에 `/sns-onboard update <섹션>`으로 채워도 됩니다." 로 분기

## 업종 심화 인터뷰 (뷰티·반영구(PMU)·화장품·피부/병의원 계열일 때만)

industry가 이 계열이면 4·6단계에 아래를 끼워넣는다. 표시광고법·화장품법·의료법 리스크가 커서 통점·금기어를 일반 업종보다 깊게 받아야 발행 사고가 안 난다. (브랜드명은 1단계 `brand.name`에서 이미 받았으므로 여기선 업종 패턴만 다룬다.)

> 완성 예시(채울 깊이 참고): [`examples/company-profile.beauty-pmu.example.yaml`](../examples/company-profile.beauty-pmu.example.yaml) — 4겹 통점·dailyVocab·voiceNotes 3축·claims 라이브러리가 어떻게 채워지는지 그대로 보여준다.
> 블로그 채널(naver-blog/tistory/brunch)도 `channels.enabled` 에 직접 넣을 수 있다 (schema enum 에 포함됨). 블로그가 주력이면 enabled 에 naver-blog 를 추가한다.

### A. 판매 구조 먼저 (B2B / B2C 갈림)

"제품을 **시술하는 전문가(원장·샵)** 에게 파나요, **시술받는 일반 고객** 에게 파나요, 둘 다인가요?"
- **B2B(전문가향)**: persona = 시술 원장/샵 운영자. 통점 = 발색 일관성, 색 안정성(변색), 고객 클레임, 재구매 단가.
- **B2C(고객향)**: persona = 시술 받을 사람. 통점 = 아래 불안 5종.
- 둘 다면 `targetAudience`에 페르소나 2개로 나눠 각각 받는다.

### B. 고객 불안 5종 (B2C painPoints 후보 — 하나씩 확인)

반영구/시술 고객이 결제 직전 망설이는 전형. 해당하는 걸 `painPoints`에 **구체 문장**으로:
1. **통증** — "아프지 않을까"
2. **부작용·알러지** — "염증·붓기·트러블 안 생기나"
3. **색 변색** — "시간 지나 붉게/푸르게 변하지 않나" (PMU 최대 불안)
4. **부자연스러움** — "티 나게 진하거나 어색하지 않을까"
5. **지속력** — "얼마나 가나, 금방 빠지지 않나"

→ "이 중 고객이 제일 자주 묻는 거 2~3개는?"로 우선순위까지 받는다.

### C. 신뢰 축 (차별점·Offer 재료)

"고객/원장을 안심시키는 우리만의 근거가 뭔가요?" 있는 것만:
- 무균 시험(ISO 11737), 유해물질·중금속 시험성적서(N.D. 불검출)
- 발색·지속력 데이터, 색 안정성 시험
- 인증·등록 현황 (단 "식약처 인증"으로 오인되게 쓰지 말 것 — 아래 D 참조)

→ 카피의 O(Offer)·신뢰 신호. **`painPoints`에 함께 적거나 `tone.voiceNotes`에 메모한다.** (⚠ `competitors` 필드는 copywriter spec에 전달 안 됨)

### D. 광고법 claims 라이브러리 (반영구·화장품 — 해당분만 banned.claims에 추가)

자동 7패턴 **위에** 이 업종에서 특히 위험한 추가 표현. 표를 보여주고 "쓸 위험 있는 것 골라주세요":

| 위험 표현 | 왜 위험 |
|---|---|
| "영구", "평생" (반영구인데) | 반영구→영구 과장 — 표시광고법 |
| "무통", "통증 없는" | 의료 효과 단정 + 개인차 무시 |
| "1회 완성", "한 번에" | 효과 단정 (개인차 무시) |
| "식약처 인증/허가/승인 색소" | 색소는 인증제 아님 — 오인 표시 (위반) |
| "미백", "주름 개선", "재생" | 기능성화장품 아닌데 기능성 주장 (화장품법) |
| "의료용", "병원급", "메디컬 등급" | 의료기기 오인 |
| "안전성 입증", "부작용 걱정 없이" | 안전 단정 |
| 비포/애프터 과장, 경쟁 색소 비방 | 표시광고법 |

→ **안전한 대체 패턴**도 같이 안내 (copywriter.md 광고법 변환 톤과 동일):
- "100% 안전" → "공인기관 28종 유해물질 N.D. 판정"
- "부작용 없음" → "자극 인자 평균 대비 51% 낮게 측정"
- "식약처 인증" → "OO 시험성적서 보유"
- "영구" → "리터치 주기 OO개월"

---

## Validation

저장 직전 반드시 다음을 확인:

- [ ] 모든 `required` 필드가 채워졌는가
- [ ] `taglineOneLine` 길이 5~120
- [ ] `tone.preset`이 enum 값인가
- [ ] **painPoints가 구체적인가** — "불편함"·"비효율" 같은 추상어만 있으면 실패. 결정적 순간/실패한 대안/두려움이 문장으로 들어가야 함
- [ ] **고객 언어(dailyVocab)** 를 받았는가 (copywriter 어휘 풀에 직접 쓰임)
- [ ] `sampleSentences`를 붙여받았으면 → voiceNotes에 호흡·어미 1줄 요약을 남겼는가
- [ ] `banned.topics`를 받았는가 — guardian이 기계 체크 안 하는 유일한 방어선이라 비면 위험
- [ ] (뷰티/반영구/화장품 계열) 불안 5종 중 해당분 + claims 라이브러리 반영했는가. ※ 자동 7패턴은 재입력 불필요
- [ ] `legal.adDisclosureRequired`가 false면 사용자에게 한 번 더 확인 (한국 공정위 가이드라인 기본값 true)

## Modes

| 모드 | 트리거 | 동작 |
|------|--------|------|
| **full** | `/sns-onboard` (프로필 없음) | 위 9단계 전체 인터뷰 |
| **update** | `/sns-onboard update <섹션>` | 해당 섹션만 인터뷰. 변경 사항만 머지하고 `meta.updatedAt` 갱신 |
| **show** | `/sns-onboard show` | `node bin/profile-show.mjs` 실행 결과를 그대로 보여줌 (스킬은 추가 작업 없음) |
| **resume** | `/sns-onboard` (프로필 있음) | "전체 다시 / 부분 업데이트 / 그대로 두기" 3택 질문 |

업데이트 가능 섹션: `brand`, `tagline`, `industry`, `audience`, `tone`, `banned`, `channels`, `writing`, `imageStyle`, `visual`, `hashtags`, `legal`, `campaigns`, `competitors`.

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
  1) 크롬에 각 채널 1회 로그인  browser-publish 가 쿠키 재사용 (별도 토큰/OAuth 불필요)
  2) /sns-campaign-new "<주제>" 첫 캠페인 만들기 (채널 미지정 시 enabled 전부)
```

## Guardrails

- 인터뷰 도중 사용자가 "예시 보여줘" 라고 하면 해당 섹션만 발췌해 보여준다 (전체 dump 금지 — 답변 유도 효과↓). 일반 업종은 `examples/company-profile.example.yaml`, 뷰티·반영구·화장품 계열은 `examples/company-profile.beauty-pmu.example.yaml`.
- `company-profile.yaml`은 **gitignore 대상**임을 안내하고, 저장 후 `git status`에 빨간색으로 안 보이는지 확인하라고 한 줄로 안내
- 자격증명(SNS 비밀번호·API 키)는 **이 인터뷰에서 절대 묻지 않는다**. 발행은 browser-publish — 사용자가 평소 쓰는 크롬에 직접 1회 로그인하면 쿠키를 재사용하므로 하네스가 비밀번호·토큰을 저장하지 않는다.

## Don't

- 한 번에 여러 질문을 묶어서 던지지 말 것 (응답 품질 떨어짐)
- 사용자가 "잘 모르겠다" 하면 추측해서 채우지 말 것 — 그 필드는 `null`로 두고 나중에 채우도록 안내
- 스키마에 없는 필드를 임의 추가하지 말 것 (스키마 변경은 PR로)
