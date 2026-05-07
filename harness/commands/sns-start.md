---
name: sns-start
description: 새 캠페인 시작. 온보딩 → 생성 → 발행까지 전체 플로우. 처음 사용하거나 새 캠페인을 만들 때 사용.
---
> 업데이트 체크: `node harness/bin/check-updates.mjs` 실행 → `OK` 면 진행, `UPDATE_AVAILABLE` 이면 사용자에게 업데이트 여부 질문 후 진행. (상세: `harness/commands/_update-check.md`)

# /sns-start

첫 사용부터 발행까지 전체 캠페인 플로우를 한 번에 진행한다. 각 단계 완료 시 칸반 보드를 자동으로 표시하며, 완료 후 슬롯으로 저장해 `/sns-repeat` 에서 재사용 가능.

```
/sns-start                                        # 인터랙티브
/sns-start "신제품 런칭"
/sns-start "신제품 런칭" --channels=threads,linkedin --cadence=series-3
/sns-start --dry-run                              # 발행 단계만 dry-run
/sns-start --no-publish                           # approve 까지만, 발행 안 함
```

---

## 실행 흐름

### 0단계 — 환경 빠른 점검
`node harness/bin/doctor.mjs --quick` 실행. 빨간 항목 있으면 사용자에게 알리고 `/sns-doctor` 로 안내한 뒤 계속 진행 여부를 묻는다.

### 1단계 — 프로필 확인
`company-profile.yaml` 존재 여부 확인.
- **없음** → "처음 사용하시네요. 회사 프로필부터 만들게요." 안내 후 `sns-onboard-company` 스킬 (full 모드) 진행. 완료 후 `node harness/bin/profile-validate.mjs` 로 검증.
- **있음** → 프로필 로드 후 다음 단계.

### 2단계 — 슬롯 분기
`node harness/bin/slots.mjs list` 실행.
- **슬롯 1개 이상** → 다음을 표시하고 선택을 기다린다:
  ```
  이전 캠페인:
    1) 신제품 런칭 (threads, linkedin) — 2일 전
    2) 채용 공고 (linkedin) — 1주 전
    N) 새로 시작

  번호를 선택하거나 주제를 바로 입력하세요:
  ```
  - 번호 선택 → `/sns-repeat <번호>` 위임 후 이 명령 종료.
  - "N" 또는 새 주제 텍스트 → 3단계 진행.
- **슬롯 없음** → 안내 없이 3단계 진행.

### 3단계 — 캠페인 설정 + 소재 수집

인자로 주제가 있으면 바로, 없으면 아래 질문을 순서대로 한다.
채널/목표/cadence 미지정 시 `profile.channels.enabled` 기본값 사용.

```
주제 (한 줄):
> 

채널 (기본값 사용 시 Enter, 또는 콤마 구분 입력 — threads, linkedin, instagram, x):
> 

목표 (런칭/인지도/참여/전환/교육 중 하나, 기본: 인지도):
> 

게시 방식 (단일 포스트 / 카드 3장 / 카드 5장, 기본: 단일 포스트):
> 

핵심 메시지가 있나요? (없으면 Enter):
> 

이 포스트에 쓸 구체적인 소재가 있나요?
숫자, 데이터, 고객 반응, 특징 등을 줄바꿈으로 입력 (없으면 Enter):
> 

발행 시점은 어떻게 할까요?
  1) 지금 바로            (생성 → 미리보기 → 즉시 발행)
  2) 예약 발행            (지금 만들고 특정 시각에 자동 발행)
  3) 시리즈 분산          (N건을 기간 나눠서 자동 생성+발행)
> 
```

목표 → `--goal` 매핑: 런칭=`launch`, 인지도=`awareness`, 참여=`engagement`, 전환=`conversion`, 교육=`education`  
게시 방식 → `--cadence` 매핑: 단일 포스트=`single`, 카드 3장=`series-3`, 카드 5장=`series-5`  
입력된 내용은 `--keyMessage=` `--contentPoints="포인트1|포인트2"` 플래그로 전달.

**발행 시점 분기 처리:**
- **1) 지금 바로** → `publishMode = "immediate"`. 기존 흐름 그대로(3.5 → 4 → 5 → 6 → 7 → 8단계).
- **2) 예약 발행** → `publishMode = "scheduled"`. 추가 질문:
  ```
  언제 발행할까요? (KST, 예: 2026-05-08 09:00):
  > 
  ```
  3.5 → 4 → 5 → **6단계 휴먼 게이트에서 [S] 예약 옵션** 선택 흐름. 이후 단일 캠페인 슬롯으로 저장.
- **3) 시리즈 분산** → `publishMode = "series"`. 아래 **3-S단계로 즉시 점프**한다. 소재 수집/비주얼 스타일 단계는 건너뛴다 (시리즈는 N건 일괄 생성이라 채널 기본값 사용).

### 3-S단계 — 시리즈 분산 (publishMode=series 일 때만)

추가 질문:
```
기간을 어떻게 잡을까요? (week / month, 기본: week):
> 

기간 내 몇 회 발행할까요? (예: 3):
> 

발행 시각은? (KST, 기본 09:00):
> 

언제부터 시작할까요? (YYYY-MM-DD, 기본: 오늘):
> 

매 회 다른 주제가 있나요?
줄바꿈으로 N개 입력하거나 Enter로 시드 주제 반복:
> 

자동 발행할까요? (Y=자동발행 / N=알림만, 기본: Y):
> 

지금 모든 회차의 카피를 미리 생성하고 가이드라인까지 검수할까요?
  [Y, 권장]  N건 × 채널수 만큼 카피 일괄 생성 + 검수 (수 분 소요, LLM 비용 발생)
  [N]        예약만. 발행 시각에 워커가 직접 카피 생성 후 검수
> 
```

수집한 값으로 시리즈 캠페인 일괄 생성:
```
node harness/bin/schedule-plan.mjs --topic="<주제>" --channels=<...> \
  --period=<week|month> --frequency=<N> --time=<HH:MM> [--start=<YYYY-MM-DD>] \
  --cadence=<...> --goal=<...> [--titles="t1|t2|..."] [--no-auto-publish] [--no-generate]
```

> `pre-generate` 질문에서 **N** 을 골랐다면 `--no-generate` 를 붙인다. **Y** (기본) 면 schedule-plan 이 자체적으로 채널마다 generate 까지 수행하고 status=scheduled 로 복원한다.

- 출력에서 생성된 slug 목록을 파싱한다 (예: `[1/3] 예약됨: 2026-05-08-...`).
- 시리즈 슬롯 한 줄로 저장:
  ```
  node harness/bin/slots.mjs save-series \
    --topic="<주제>" --channels=<...> --period=<week|month> \
    --frequency=<N> --time=<HH:MM> [--titles="..."] [--no-auto-publish] \
    --slugs="<slug1>,<slug2>,..." --cadence=<...> --goal=<...>
  ```

#### 3-S.1단계 — 가이드라인 재검수 (deterministic + 의미론)

**pre-generate 게이트에서 Y 를 고른 경우에만 실행.** N 을 골랐다면 draft 가 아직 없으므로 이 단계 전체를 건너뛰고 바로 3-S.2 로 간다 (워커가 발행 시각에 검수).

draft 가 일부 채널만 만들어졌으면 그 채널만 검수하고 나머지는 경고 후 스킵.

각 (slug × channel) 조합마다:

1. deterministic 검수 실행
   ```
   node harness/bin/inspect-guidelines.mjs <slug> --channel=<ch> --json
   ```
   결과를 파싱해 `ok`/`blocking`/`needsLlmReview` 를 확인한다.

2. `needsLlmReview === true` 인 경우 LLM 의미론 검수도 실행한다 (시리즈는 자동 발행될 예정이므로 한 번 더 검증).
   ```
   node harness/bin/inspect-guidelines.mjs <slug> --channel=<ch> --spec
   ```
   → `guideline-spec-<ts>.json` 생성됨. spec 의 `outputPath` 값을 기억해 둔다.
   `harness/agents/guideline-reviewer.md` 서브에이전트를 호출해 spec 을 처리하게 한 뒤,
   ```
   node harness/bin/inspect-guidelines.mjs <slug> --channel=<ch> --merge-llm=<spec.outputPath> --json
   ```
   로 결과를 brief 에 머지한다.

3. 결과 표시 (시리즈 전체 1표 형식):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📋 시리즈 가이드라인 재검수
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  [1/3] 2026-05-08-신제품-A   threads ✅ 8/8   linkedin ✅ 8/8
  [2/3] 2026-05-10-신제품-B   threads ❌ 6/8 (key_message)   linkedin ✅ 8/8
  [3/3] 2026-05-13-신제품-C   threads ✅ 8/8   linkedin ⚠ 7/8 +LLM(voice_tone)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

4. 미준수 항목이 하나라도 있으면 사용자에게 묻는다:

```
일부 항목이 가이드라인을 못 맞췄습니다.
  [F] 미준수 항목만 재생성 (실패 채널의 generate 다시)
  [E] /sns-edit 로 직접 수정
  [C] 그대로 두기 (워커가 발행 시점에 needs_attention 으로 차단)
```

- **F** → 실패 채널마다 `node harness/bin/generate.mjs <slug> --channel=<ch>` 후 다시 검수. 1회만.
- **E** → 명령 종료. 사용자가 `/sns-edit` 로 처리.
- **C** → 명령 종료. 워커가 자동 발행 시점에 다시 검수해서 미준수면 자동 발행을 차단(needs_attention).

모두 통과하면 자동으로 다음 단계.

#### 3-S.2단계 — 워커 안내

- 칸반 1회 표시: `node harness/bin/board.mjs` (전체 캠페인 보드).
- pre-generate 분기에 따라 안내가 다르다.

**Y (pre-generate + 검수 통과/사용자 [C] 선택) 의 경우:**
```
✅ 시리즈 N건 예약 완료 (카피 미리 생성됨, 가이드라인 검수 완료)
  · 발행 시각 도달 시 자동 발행 (워커가 한 번 더 가이드라인 재검수 후 발행)
  · 자동 워커 설치: node harness/bin/install-cron.mjs install
  · 수정/취소:     /sns-edit
```

**N (예약만 — draft 미생성) 의 경우:**
```
✅ 시리즈 N건 예약 완료 (카피 미생성)
  ⚠ 워커는 카피를 자동 생성하지 않습니다. 발행 시각 전에 사람이 직접 generate 해야 합니다.
  · 카피 생성:    node harness/bin/generate.mjs <slug>  (각 slug 마다)
  · 또는:         /sns-edit 에서 캠페인 선택 → 1번(피드백 재생성) 흐름
  · 발행 시각 도달 시 draft 가 없으면 워커가 needs_attention 으로 차단합니다.
  · 자동 워커 설치: node harness/bin/install-cron.mjs install
```

- **이 명령은 여기서 종료한다.** 4~7단계는 실행하지 않는다 (각 캠페인은 워커가 알아서 처리).

### 소재 수집 (선택)

카드뉴스에 넣을 이미지 소재가 있으면 품질이 높아진다. 없어도 진행 가능.

```
이미지 소재가 있나요? (제품 사진, 스크린샷 등)
파일 절대경로를 줄바꿈으로 입력하거나 Enter로 스킵:
> 
```

입력된 경로는 `|`로 연결해 `--sourceImages="경로1|경로2"` 형태로 campaign-new에 전달.
존재하지 않는 경로는 경고 후 제외한다.

카드뉴스에 AI 배경 이미지를 자동 생성·삽입하려면 generate 단계에서 `--with-images` 플래그를 추가하거나 `.env.local`에 `SLIDE_IMAGES=true`를 설정한다 (FAL_KEY 필요):

```bash
node harness/bin/generate.mjs <slug> --with-images
```

```
참고할 텍스트 파일이 있나요? (보도자료, 제품 설명 등)
파일 절대경로 또는 직접 텍스트를 줄바꿈으로 입력하거나 Enter로 스킵:
> 
```

입력된 값은 `--sourceTexts="값1|값2"` 형태로 전달.

### 비주얼 스타일 선택 (선택)

카드뉴스 / 슬라이드의 시각적 방향을 세계적인 브랜드 디자인 시스템을 레퍼런스로 설정할 수 있다.

```
비주얼 스타일 방향이 있나요?
  [Enter]      회사 프로필 기본값 사용
  [브랜드명]   예: stripe, linear.app, apple, vercel
  [목록]       카테고리별 브랜드 전체 보기
> 
```

**[목록]** 입력 시 아래 카테고리 메뉴를 표시한다:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🎨 디자인 레퍼런스 브랜드 목록
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  💳 핀테크 / B2B SaaS
     stripe · wise · revolut · coinbase · mastercard · kraken

  🖥  개발자 도구 / 인프라
     linear.app · vercel · cursor · warp · supabase · sentry
     posthog · raycast · hashicorp · opencode.ai

  🤖 AI / LLM
     claude · openai (x.ai) · mistral.ai · cohere · replicate
     together.ai · minimax · runwayml · voltagent · elevenlabs

  🍎 프리미엄 / 하드웨어
     apple · tesla · ferrari · bmw · bmw-m · bugatti
     lamborghini · renault · vodafone · spacex · playstation

  🛍  소비자 / 라이프스타일
     nike · spotify · starbucks · uber · pinterest · shopify

  📰 미디어 / 디자인
     wired · theverge · figma · framer · miro · webflow

  🏢 엔터프라이즈
     ibm · mongodb · clickhouse · sanity · intercom · zapier

  🌟 기타
     notion · airtable · cal · expo · mintlify · ollama
     composio · resend · superhuman · lovable

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
브랜드명을 입력하거나 Enter로 기본값 사용:
> 
```

입력된 브랜드명은 소문자로 정규화해 `harness/design-refs/<브랜드명>/DESIGN.md` 존재 여부를 확인한다.
존재하지 않으면 경고 메시지 후 기본값(스킵)으로 처리한다.
유효한 경우 `--designRef=<브랜드명>` 으로 campaign-new에 전달한다.

위 질문에 대한 답변을 모두 수집한 뒤 아래 명령을 실행한다:

`node harness/bin/campaign-new.mjs "<주제>" [--channels=...] [--goal=...] [--cadence=...] [--keyMessage=...] [--contentPoints=...] [--angle=...] [--sourceImages=...] [--sourceTexts=...] [--designRef=...]`

### 3.5단계 — 채널별 키워드 자동 추출

`brief.yaml`과 `company-profile.yaml`, 각 채널의 `channels/<ch>/strategy.md`를 읽은 뒤 채널마다 다음을 인라인으로 추출한다.
- **핵심 키워드** 3~5개: topic + goal + contentPoints 기반 카피 중심 단어
- **추천 해시태그** 3~5개: 채널 전략 + profile.hashtags 기반
- **포커스 앵글** 1줄: 이 채널에서 강조할 관점
- **주의 금지어**: profile.banned.words 중 이 주제에서 걸릴 수 있는 것

> **필터링 규칙**: 추출한 핵심 키워드 및 추천 해시태그에 `profile.banned.words` 항목이 포함되어 있으면 즉시 제거하고 대체 단어를 선정한다. 금지어가 키워드에 섞이면 copywriter까지 전달되어 브랜드 가이드라인을 위반하므로 이 단계에서 반드시 정리한다.

#### 출력 형식 (아래 포맷을 그대로 사용)

추출 시작 직전, 먼저 진행 헤더를 출력한다:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📊 채널별 키워드 분석
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

채널을 하나씩 처리하면서, **각 채널 분석을 시작하기 직전에** 진행 줄을 먼저 출력한다:

```
  🧵 Threads       분석 중...
```

해당 채널 분석이 끝나면 그 바로 아래에 결과 카드를 출력한다 (채널마다 반복):

```
  🧵 Threads       분석 중...  ✅

  > 💬 정산주기 5일 → 1.8일 — 구체적 수치 임팩트로 시작

  | 핵심 키워드  | 정산 자동화 · 정산주기 · 현금흐름             |
  |-------------|----------------------------------------------|
  | 해시태그     | `#업플로우`  `#정산자동화`  `#SaaS`          |
  | 주의 금지어  | ~~혁신적인~~  ~~최고의~~                      |
```

모든 채널 완료 후 마무리 구분선을 출력한다:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅  2개 채널 분석 완료
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

그다음 확인 프롬프트:

```
키워드가 맞나요?
  [Enter]   이대로 진행
  [수정]    특정 채널 수정  (예: "threads 앵글: 고객 사례 중심으로")
  [재생성]  다른 앵글로 다시 추출
```

- **Enter** → `posts/campaigns/<slug>/keywords.json` 저장 후 4단계 진행.
- **수정** 입력 → 해당 채널 항목 업데이트 후 카드 재출력 → 재확인.
- **재생성** → 전체 재추출 후 전체 카드 재출력 → 재확인.

`keywords.json` 저장 형식:
```json
{
  "version": 1,
  "slug": "<slug>",
  "generatedAt": "<ISO 8601 KST>",
  "channels": {
    "threads": {
      "keywords": ["정산 자동화", "정산주기", "현금흐름"],
      "hashtags": ["#업플로우", "#정산자동화", "#SaaS"],
      "angle": "구체적 수치로 시작",
      "watchOut": ["혁신적인", "최고의"]
    }
  }
}
```

---

### 4단계 — 카피 + 이미지 생성

모든 provider 가 동일한 3단계 흐름을 따른다:

1. spec 작성:
```
node harness/bin/generate.mjs <slug>
```
→ 채널별 `copy-spec.json` 생성 (inhouse-slides 는 `slide-spec.json`). `brief.status = drafting`.

2. 에이전트 실행 (채널마다):
   - **inhouse-slides**: `harness/agents/image-director.md` 를 읽고 그 지침대로 **인라인으로** 처리한다. (Write 권한 필요 — 서브에이전트 미사용) `slide-spec.json` → HTML + `agent-output.json` 저장.
   - **그 외 (fal / openai / anthropic / mock)**: `copywriter` 서브에이전트가 `copy-spec.json` 처리 → `copy-output.json` 저장.

3. finalize:
```
node harness/bin/generate.mjs <slug> --finalize
```
→ inhouse-slides: Playwright 캡쳐 + draft 조립.
→ 그 외: `provider.generateImage` 로 이미지 생성 + draft 조립 + guardian 검사.

finalize 완료 후, `keywords.json`에 `watchOut` 항목이 있는 채널은 **인라인으로 추가 검사**한다:
- draft 텍스트 전체를 대상으로 `watchOut` 단어를 각각 검색한다.
- 발견 시: `⚠ [채널] watchOut 단어 발견: "단어" — 수동 검토 또는 /sns-edit 로 수정 권장` 경고를 출력한다.
- 발행을 강제 중단하지는 않으나, 경고가 있으면 6단계 휴먼 게이트 전에 한 번 더 명시적으로 표시한다.

부분 재생성 (`--card=N`) 도 같은 흐름:
```
node harness/bin/generate.mjs <slug> --channel=<ch> --card=2
# copywriter 서브에이전트 실행
node harness/bin/generate.mjs <slug> --channel=<ch> --card=2 --finalize
```

생성 완료 후 → **칸반 자동 표시 (1차)**: `node harness/bin/board.mjs <slug>`

### 4.5단계 — Hook 변형 픽커 (hook-variants.json 이 있을 때만)

`posts/campaigns/<slug>/<channel>/hook-variants.json` 존재 여부를 확인한다.
- **없음** → 이 단계 건너뜀.
- **있음** → 아래 흐름 실행.

`hook-variants.json` 이 있으면 image-director가 hook 카드를 여러 컴포지션으로 생성한 것이다.
finalize 단계에서 각 변형의 PNG가 이미 캡처돼 있으므로, **Read 도구로 각 PNG를 읽어 인라인 표시**한다.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🖼 Hook 카드 컴포지션 선택 (<channel>)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  [1] Stat Card        card1-v1-<ts>.png
  [2] Full-Bleed Type  card1-v2-<ts>.png
  [3] Split Layout     card1-v3-<ts>.png
```

각 PNG를 순서대로 Read 도구로 읽어 사용자에게 시각적으로 보여준 뒤 프롬프트:

```
어느 컴포지션으로 진행할까요?
  [1 / 2 / 3]   해당 번호로 확정
  [Enter]        현재 기본값(1번) 유지
```

- 번호 선택 시 → `node harness/bin/generate.mjs <slug> --channel=<ch> --select-variant=<N>` 실행
- Enter(기본값) → 그대로 5단계 진행

`selectedVariant` 가 확정되면 `hook-variants.json` 에 저장되고, `card1-<ts>.png` 가 선택된 안으로 업데이트된다.

### 4.6단계 — 카드 품질 평가 + 재생성 게이트 (inhouse-slides 전용)

provider 가 `inhouse-slides` 일 때만 이 단계를 실행한다. 그 외 provider 는 건너뛴다.

#### 평가 실행

```bash
node harness/bin/evaluate.mjs <slug>
```

채널별 `evalSpec.json` 이 생성된다. 이후 **`harness/agents/card-evaluator.md` 를 읽고 인라인으로** 실행한다:
- evalSpec.json 의 각 카드 PNG 를 Read 도구로 읽어 10점 루브릭 채점
- `eval.json` 에 결과 저장 (overallPass, per-card score, feedback)

card-evaluator 완료 후 결과를 아래 형식으로 출력한다:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🎯 카드 품질 평가 — <channel>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Card 1 (hook)   ████████░░  8/10  ✅ PASS
  Card 2 (body)   ██████░░░░  6/10  ⚠ FAIL
  Card 3 (cta)    █████████░  9/10  ✅ PASS

  Overall: 7.67/10  ✅ 통과

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### 재생성 게이트

모든 채널의 `overallPass` 가 `true` 이면 → 5단계 진행.

하나라도 `overallPass: false` 인 채널이 있으면 아래 프롬프트를 표시한다:

```
일부 카드가 기준 미달입니다.
  [R]     피드백 반영해서 재생성 (1회)
  [Enter] 그대로 5단계 진행
```

- **Enter** → 5단계 진행 (품질 미달 상태로 계속).
- **R** → 아래 재생성 루프 실행:
  1. `node harness/bin/generate.mjs <slug> [--channel=<ch>] --regen`
     - eval.json 피드백 → slide-spec.json 의 `regenerationFeedback` 에 주입
     - 실패 시 (exit 1) 중단하고 사용자에게 원인 안내.
  2. **`harness/agents/image-director.md` 를 인라인으로 재실행**
     - `spec.regenerationFeedback` 를 읽고 실패 카드만 다시 생성
     - 피드백 항목 전부 반영
  3. `node harness/bin/generate.mjs <slug> [--channel=<ch>] --finalize`
     - 재캡처 + 새 타임스탬프 draft 저장 (원본 draft 보존됨)
  4. `node harness/bin/evaluate.mjs <slug> [--channel=<ch>]`
     - 새 PNG 경로를 반영한 evalSpec.json 재생성 (이 단계 없이 card-evaluator 를 실행하면 이전 PNG 를 채점함)
  5. **card-evaluator 를 인라인으로 재실행** → 결과 재출력
  6. 결과와 관계없이 5단계로 진행 (재생성은 1회만).

> 재생성 루프는 최대 1회만 수행한다. 재시도 후에도 기준 미달이면 경고만 표시하고 계속 진행한다.

### 5단계 — 미리보기
`node harness/bin/preview.mjs <slug>`

draft 카피, 가디언 결과, 자산 경로를 채널별로 출력.

### 6단계 — 휴먼 게이트
```
이 내용으로 발행할까요?
  [Y] 전체 채널 승인 + 발행
  [S] 예약 발행          (publishMode=scheduled 일 때 자동 표시)
  [채널명] 특정 채널만  (예: threads)
  [N] 지금은 안 함  (/sns-edit <slug> 로 수정 가능)
```
- `--no-publish` 플래그 시 이 게이트를 skip하고 approve 상태로만 저장.
- **[S] 예약 발행** 선택(또는 `publishMode=scheduled` 자동 진입) 시:
  1. 3단계에서 입력받은 발행 시각(KST)을 ISO 8601(`+09:00`) 로 변환.
  2. `brief.yaml` 패치:
     - 채널마다 `brief.schedule[ch] = "<ISO>"`
     - `brief.status[ch] = "scheduled"`
     - `brief.autoPublish = true`
  3. 7단계(즉시 발행)는 **건너뛴다.** 8단계 슬롯 저장 + 안내만 수행.
  4. 안내:
     ```
     ✅ <YYYY-MM-DD HH:MM KST> 예약 완료
       · 자동 워커 설치되어 있지 않다면: node harness/bin/install-cron.mjs install
       · 시각/내용 수정:                /sns-edit <slug>
     ```

### 7단계 — 승인 + 발행 (publishMode=immediate 만)
승인된 채널마다 순서대로:
1. `node harness/bin/approve.mjs <slug> --channel=<ch>`
2. `node harness/bin/publish.mjs <slug> --channel=<ch> [--dry-run]`
   - `auth/<ch>.json` 없으면 자동 dry-run 강제 + "자격증명 추가: `/sns-doctor auth add <ch>`" 안내.

### 8단계 — 완료
**칸반 자동 표시 (2차)**: `node harness/bin/board.mjs <slug>`

슬롯 저장: `node harness/bin/slots.mjs save <slug>` (실패해도 캠페인은 성공)

다음 단계 안내:
```
✅ 완료!
  · 다음 캠페인 반복: /sns-repeat
  · 내용 수정:        /sns-edit <slug>
  · 환경/계정 관리:   /sns-doctor
```

---

## 칸반 표시 시점
| 시점 | 이유 |
|------|------|
| 4단계 (generate 직후) | 채널별 drafting/preview 분포 확인 |
| 8단계 (publish 직후) | 최종 결과(✅ published / ❌ failed) 확인 |

---

## 에러 처리
- `company-profile.yaml` 없음 → 온보딩으로 분기 (중단 아님)
- `auth/<ch>.json` 없음 → dry-run 강제 (중단 아님)
- generate 실패 → 오류 메시지 출력 후 `/sns-doctor` 안내
- publish 실패 → `result.json` 저장 후 계속 (다른 채널은 진행)
