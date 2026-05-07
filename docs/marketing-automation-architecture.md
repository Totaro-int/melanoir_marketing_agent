# 마케팅 자동화 전체 아키텍처

> 화이트보드의 흐름을 데이터·도구·게이트·파일 위치까지 분해.
> 작성일: 2026-05-07

---

## 🗺 전체 한눈에

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  ┌─────────────────────────────┐         ┌─────────────────────────────┐ │
│  │     INITIAL SETUP (월 1회)  │         │      DAILY LOOP (반복)      │ │
│  │  "브랜드를 시스템에 학습"   │ ──→     │  "스케줄대로 자동 발행"     │ │
│  └─────────────────────────────┘         └─────────────────────────────┘ │
│           │                                          │                   │
│           ▼                                          ▼                   │
│   company-profile.yaml                       posts/campaigns/<slug>/     │
│   (영구 single-source-of-truth)              (캠페인별 자산)             │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠 INITIAL SETUP — 월 1회

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│   👤 USER                                                        │
│    │                                                             │
│    │ /sns-onboard  (대화형 인터뷰 9단계)                         │
│    ▼                                                             │
│   ┌──────────────────────────────────────────────┐               │
│   │  Claude 질문 (한 번에 1개)                   │               │
│   │  ──────────────────────────────────────────  │               │
│   │  Q1.  brand.name           → "TOTARO"        │               │
│   │  Q2.  taglineOneLine       → "..."           │               │
│   │  Q3.  industry             → "B2B SaaS"      │               │
│   │  Q4.  targetAudience (페르소나×N)            │               │
│   │  Q5.  tone.preset          → "calm"          │               │
│   │  Q6.  banned (word/topic/claim)              │               │
│   │  Q7.  channels.enabled     → [9개]           │               │
│   │  Q8.  writing (formats, sentence, CTA…)      │               │
│   │  Q9.  imageStyle (aesthetic, color, ref…)    │               │
│   │  +    visual / hashtags / legal / ...        │               │
│   └──────────────────────────────────────────────┘               │
│    │                                                             │
│    ▼                                                             │
│   ┌──────────────────────────────────────────────────────┐       │
│   │  📜 BRAND DNA (생성)        📚 REFERENCE FEW-SHOT    │       │
│   │  ─────────────────────      ────────────────────     │       │
│   │  · brand.name               · referencePosts (3)     │       │
│   │  · taglineOneLine           · referencesBrands (3)   │       │
│   │  · tone (preset+notes)      · sampleSentences        │       │
│   │  · voice (writing style)    · imageStyle             │       │
│   │  · banned (3종)             · visual.colors          │       │
│   │  · hashtags (always+pool)   · fonts                  │       │
│   │  · legal (광고법)                                    │       │
│   └──────────────────────────────────────────────────────┘       │
│    │                                                             │
│    ▼                                                             │
│   📅 마케팅 스케줄 (생성)                                        │
│   · cadencePerWeek (예: 3 — 월/수/금)                            │
│   · defaultGoals (awareness, lead)                               │
│    │                                                             │
│    ▼                                                             │
│   🤖 AGENT 활성화                                                │
│   · claude code (오케스트레이터)                                 │
│   · image-director / copywriter / brand-guardian (sub-agents)    │
│    │                                                             │
│    ▼                                                             │
│   💾 OUTPUT: company-profile.yaml (root, 영구)                   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**완료 시점**: 한 번 만들어두면 매번 자동으로 inject. 월 1회 업데이트.

---

## 🔁 DAILY LOOP — 매일 반복

### Phase 0: 트리거 (어떻게 시작)

```
┌────────────────────────────────────────────────────────────┐
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│   │ 수동 trigger│    │ /loop cron  │    │ /schedule   │    │
│   │ /sns-start  │    │ 매일 09:00  │    │  routine    │    │
│   └─────────────┘    └─────────────┘    └─────────────┘    │
│         │                  │                  │            │
│         └──────────────────┴──────────────────┘            │
│                            │                               │
│                            ▼                               │
│            ┌───────────────────────────┐                   │
│            │   📥 마케팅 소스 (input)  │                   │
│            │  ──────────────────────   │                   │
│            │  · 주제 한 줄             │                   │
│            │  · contentPoints (수치)   │                   │
│            │  · 이미지 소재 (옵션)     │                   │
│            │  · 텍스트 소재 (옵션)     │                   │
│            │  · 디자인 ref (브랜드)    │                   │
│            └───────────────────────────┘                   │
└────────────────────────────────────────────────────────────┘
```

소스 출처 (현재 + 미래):
- ✅ 사용자 직접 입력
- 🔜 자사 블로그 RSS
- 🔜 PostHog top events
- 🔜 경쟁사 PR 모니터링
- 🔜 K-뷰티 industry news (Tavily/Perplexity API)

### Phase 1: System Prompt 가공 (Brand DNA 주입)

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   📥 input (주제 + 소재)                                            │
│        │                                                            │
│        ▼                                                            │
│   ┌─────────────────────────────────────────────────────────┐       │
│   │   🧬 SYSTEM PROMPT 자동 inject                          │       │
│   │   ──────────────────────────────────────────────────    │       │
│   │   ① company-profile.yaml 전체 → context                 │       │
│   │   ② channels/<ch>/strategy.md → 채널 가이드             │       │
│   │   ③ keywords.json → 핵심 키워드·앵글·금지어             │       │
│   │   ④ profile.writing.referencePosts → few-shot 학습      │       │
│   └─────────────────────────────────────────────────────────┘       │
│        │                                                            │
│        ▼                                                            │
│   ┌─────────────────────────────────────────────────────────┐       │
│   │   📊 채널별 키워드 분석 (3.5단계)                       │       │
│   │   per channel:                                          │       │
│   │     · 핵심 키워드 (3~5)                                 │       │
│   │     · 추천 해시태그 (3~5)                               │       │
│   │     · 포커스 앵글 (1줄)                                 │       │
│   │     · 주의 금지어 (banned 중 임팩트 가능)               │       │
│   └─────────────────────────────────────────────────────────┘       │
│        │                                                            │
│        ▼                                                            │
│   📁 keywords.json 저장                                             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Phase 2: 채널별 게시물 생성

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   channels = [linkedin, threads, ...] ← profile.channels.enabled        │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────┐       │
│   │  🔄 FOR EACH channel (병렬 가능):                           │       │
│   └─────────────────────────────────────────────────────────────┘       │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────┐       │
│   │  Step 1. spec 작성                                          │       │
│   │  generate.mjs → slide-spec.json (또는 copy-spec.json)       │       │
│   └─────────────────────────────────────────────────────────────┘       │
│                          │                                              │
│                          ▼                                              │
│   ┌─────────────────────────────────────────────────────────────┐       │
│   │  Step 2. ✍️ COPYWRITER agent                                │       │
│   │  ─────────────────────────                                  │       │
│   │  · profile.tone + voiceNotes 적용                           │       │
│   │  · referencePosts few-shot 학습                             │       │
│   │  · keywords.json 핵심 키워드 활용                           │       │
│   │  · banned words 회피                                        │       │
│   │  · 채널 strategy 따르기 (글 길이, 해시태그 갯수)            │       │
│   │  → copy-output.json (텍스트)                                │       │
│   └─────────────────────────────────────────────────────────────┘       │
│                          │                                              │
│                          ▼                                              │
│   ┌─────────────────────────────────────────────────────────────┐       │
│   │  Step 3. 🎨 IMAGE-DIRECTOR agent                            │       │
│   │  ──────────────────────────                                 │       │
│   │  · profile.visual.colors / fonts 적용                       │       │
│   │  · profile.imageStyle (aesthetic, ref brands)               │       │
│   │  · 채널 aspect ratio (linkedin square / threads portrait)   │       │
│   │  · 카드 N장 (cadence: single / series-3 / series-5)         │       │
│   │  · Hook 카드 3 variants 생성 (Stat / Full-Bleed / Split)    │       │
│   │  · HTML 작성 → Playwright 캡쳐 → PNG                        │       │
│   │  → agent-output.json + card{1,2,3}-{v1,v2,v3}.png           │       │
│   └─────────────────────────────────────────────────────────────┘       │
│                          │                                              │
│                          ▼                                              │
│   ┌─────────────────────────────────────────────────────────────┐       │
│   │  Step 4. 🛡️ BRAND-GUARDIAN agent (광고 가이드라인 검수)     │       │
│   │  ───────────────────────────                                │       │
│   │  · banned.words / topics / claims 자동 차단                 │       │
│   │  · 한국 공정위 가이드 ("최고", "1위", "유일한"...)          │       │
│   │  · 광고 표시 의무 (legal.adDisclosureRequired)              │       │
│   │  · 해시태그 갯수 (채널별 권장)                              │       │
│   │  → result: blocks / warns / info                            │       │
│   └─────────────────────────────────────────────────────────────┘       │
│                          │                                              │
│                          ▼                                              │
│   ┌─────────────────────────────────────────────────────────────┐       │
│   │  Step 5. 🎯 CARD-EVALUATOR (옵션, inhouse-slides 전용)      │       │
│   │  ──────────────────────────                                 │       │
│   │  · 10점 루브릭 (hierarchy/whitespace/decoration/scrollStop) │       │
│   │  · 카드별 PNG 채점                                          │       │
│   │  · overallPass false면 재생성 옵션 (1회)                    │       │
│   └─────────────────────────────────────────────────────────────┘       │
│                          │                                              │
│                          ▼                                              │
│   📁 OUTPUT per channel:                                                │
│      posts/campaigns/<slug>/<channel>/                                  │
│      ├─ slide-spec.json                                                 │
│      ├─ agent-output.json                                               │
│      ├─ hook-variants.json                                              │
│      ├─ card1·v1·v2·v3·thumb.png                                        │
│      ├─ card2.png                                                       │
│      └─ card3.png                                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Phase 3: Hook Variant 선택 + Preview

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   🖼 HOOK 카드 3 variants 보여줌:                                   │
│      [V1 Stat Card] [V2 Full-Bleed] [V3 Split Layout]               │
│         │             │              │                              │
│         └─────────────┼──────────────┘                              │
│                       ▼                                             │
│   👤 사용자 선택 (또는 default V1)                                  │
│                       │                                             │
│                       ▼                                             │
│   📋 PREVIEW (채널별)                                               │
│   ─────────────                                                     │
│   · 발행글 텍스트 (해시태그 포함)                                   │
│   · 카드 PNG 썸네일                                                 │
│   · brand-guardian 결과 (warn/block 갯수)                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Phase 4: Human Gate (휴먼 게이트)

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   👤 사용자 결정:                                                   │
│      [Y]          전체 채널 발행 진행                               │
│      [채널명]     특정 채널만                                       │
│      [N]          중단 (편집은 /sns-edit)                           │
│      [수정]       특정 채널/카드 재생성                             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Phase 5: 클로드 크롬 업로드 대기 (← 내일 만들 것)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   🌐 BROWSER-PUBLISH (NEW)                                              │
│   ────────────────────                                                  │
│                                                                         │
│   사전 조건: 사용자가 chrome 세션에 SNS 모두 로그인된 상태              │
│                                                                         │
│   ┌──────────────────────────────────────────────────────┐              │
│   │  FOR EACH channel in approved:                       │              │
│   └──────────────────────────────────────────────────────┘              │
│                          │                                              │
│                          ▼                                              │
│   ┌──────────────────────────────────────────────────────┐              │
│   │  1. Claude in Chrome → SNS 사이트 navigate           │              │
│   │     · linkedin.com/feed                              │              │
│   │     · threads.net                                    │              │
│   │     · x.com/compose/post                             │              │
│   │     · facebook.com/profile/posts/create              │              │
│   │     · bsky.app/intent/compose                        │              │
│   └──────────────────────────────────────────────────────┘              │
│                          │                                              │
│                          ▼                                              │
│   ┌──────────────────────────────────────────────────────┐              │
│   │  2. "Start a post" / "New thread" 버튼 클릭          │              │
│   └──────────────────────────────────────────────────────┘              │
│                          │                                              │
│                          ▼                                              │
│   ┌──────────────────────────────────────────────────────┐              │
│   │  3. 카피 텍스트 paste (sample-by-sample 사람처럼)    │              │
│   └──────────────────────────────────────────────────────┘              │
│                          │                                              │
│                          ▼                                              │
│   ┌──────────────────────────────────────────────────────┐              │
│   │  4. 이미지 첨부 (file_upload tool)                   │              │
│   │     · card1·2·3-*.png                                │              │
│   │     · LinkedIn은 캐러셀로 업로드                     │              │
│   └──────────────────────────────────────────────────────┘              │
│                          │                                              │
│                          ▼                                              │
│   ┌──────────────────────────────────────────────────────┐              │
│   │  5. ⏸️  "Post" 버튼 직전에 멈춤                       │              │
│   │     · screenshot 캡처                                │              │
│   │     · 사용자에게 "최종 확인" 보여줌                  │              │
│   └──────────────────────────────────────────────────────┘              │
│                          │                                              │
│                          ▼                                              │
│   👤 사용자: "Y" → 자동 클릭 / "N" → 취소 / 수동 클릭                   │
│                          │                                              │
│                          ▼                                              │
│   📁 result.json 저장 (URL, status, timestamp)                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Phase 6: 가이드 재검수 (loop)

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   결과물 → 가이드 재검수 → 통과 → 업로드                            │
│              │                                                      │
│              ↓ fail                                                 │
│         재생성 / 편집 (/sns-edit) → Phase 2 반복                    │
│                                                                     │
│   현재: brand-guardian이 Step 4에서 1회 검수                        │
│   강화안: 결과물(렌더링된 PNG + 발행글 통합) 재검수                 │
│           - 광고법 위반 표현 한 번 더                               │
│           - 콘텐츠 점수 (card-evaluator)                            │
│           - 해시태그 갯수 채널별 strategy 준수                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📂 데이터 모델 (어디에 무엇이 저장되나)

```
마케팅 자동화 에이전트/
│
├── 🧬 company-profile.yaml          ← INITIAL SETUP 결과 (영구)
│   └─ brand·tone·banned·channels·visual·hashtags·writing·imageStyle
│
├── 🤖 harness/agents/
│   ├─ copywriter.md                 ← 카피 생성 가이드
│   ├─ image-director.md             ← 이미지·HTML 생성 가이드
│   ├─ brand-guardian.md             ← 광고 검수 가이드
│   ├─ card-evaluator.md             ← 카드 품질 평가
│   └─ publisher.md                  ← 발행 어댑터
│
├── 📜 harness/schemas/              ← YAML/JSON 스키마 검증
│
├── 📡 harness/bin/
│   ├─ campaign-new.mjs              ← 캠페인 생성
│   ├─ generate.mjs                  ← spec → finalize 흐름
│   ├─ evaluate.mjs                  ← card 평가
│   ├─ preview.mjs                   ← 미리보기
│   ├─ approve.mjs                   ← 승인
│   ├─ publish.mjs                   ← API 발행 (OAuth)
│   ├─ browser-publish.mjs           ← 🆕 내일 만들 것 (Chrome 자동화)
│   ├─ board.mjs                     ← 칸반
│   └─ slots.mjs                     ← 슬롯 관리 (반복용)
│
├── 🗂 harness/channels/<ch>/strategy.md  ← 채널별 가이드
│
├── 🎨 harness/design-refs/<brand>/DESIGN.md  ← 디자인 시스템 ref
│
├── 📁 posts/campaigns/<slug>/        ← 캠페인별 자산
│   ├─ brief.yaml                    ← 캠페인 메타
│   ├─ keywords.json                 ← 채널별 키워드 분석
│   ├─ <channel>/
│   │  ├─ slide-spec.json
│   │  ├─ agent-output.json
│   │  ├─ hook-variants.json
│   │  ├─ card{1,2,3}-{v1,v2,v3,thumb}.png
│   │  ├─ result.json                ← 발행 결과 (URL, status)
│   │  └─ <yyyymmdd-hhmmss>.md       ← 발행글 markdown
│   └─ ...
│
├── 🔐 auth/<ch>.json                 ← OAuth 토큰 (gitignored, 0600)
│
├── 💾 slots/                         ← 캠페인 재사용 슬롯
│
└── 🌐 .env.local                     ← API 키 (FAL/OpenAI/Anthropic/PostHog)
```

---

## 👥 Agent 협업 구조

```
                    ┌─────────────────┐
                    │  Claude Code    │
                    │  (오케스트레이터)│
                    └────────┬────────┘
                             │ harness/commands/
                             │ (sns-start.md 등)
                             │
        ┌────────────────────┼─────────────────────┐
        │                    │                     │
        ▼                    ▼                     ▼
   ┌─────────┐          ┌─────────┐          ┌──────────┐
   │ harness │          │  Sub-   │          │ External │
   │  /bin/  │          │ agents  │          │   APIs   │
   └────┬────┘          └────┬────┘          └────┬─────┘
        │                    │                    │
        │              ┌─────┴────────┐           │
        │              │              │           │
        ▼              ▼              ▼           ▼
   campaign-new   copywriter    image-       FAL (이미지)
   generate       brand-        director     OpenAI (카피)
   evaluate       guardian      (Playwright) Anthropic
   preview        card-                      LinkedIn API
   approve        evaluator                  Threads API
   publish                                   etc.
   board
   slots
   browser-                  Claude in Chrome
   publish    ──────────►   (사용자 세션)
                            navigate · click · type · upload
```

---

## ⏰ 타임라인 (실제 흐름)

```
T+0 (월 1회)  사용자 → /sns-onboard → company-profile.yaml
                                          ▼
                                          (영구 저장)

T+0 (매일)    /loop 09:00 → /sns-start
              또는 사용자 수동
                ▼
T+0:30s       Phase 1: 키워드 분석 (3.5단계)
                ▼
T+1m          Phase 2: copywriter (텍스트)
                ▼
T+3m          Phase 2: image-director (HTML + Playwright)
                ▼
T+5m          Phase 2: brand-guardian (검수)
                ▼
T+5m          Phase 3: hook variant 선택 (사용자 또는 default)
                ▼
T+6m          Phase 3: preview 출력
                ▼
T+6m          🛑 Phase 4: 휴먼 게이트 (사용자 검토)
                ▼ Y
T+7m          Phase 5: browser-publish (chrome navigate)
                ▼
T+8m          🛑 발행 직전 멈춤 (사용자 1번 클릭)
                ▼ click
T+8m          Phase 6: 결과 저장 + result.json
                ▼
T+8m          완료 — 칸반 표시 + 슬롯 저장
```

---

## 🎯 갭 (현재 → 사용자 비전)

| 화이트보드 항목 | 현재 상태 | 갭 |
|----------------|----------|-----|
| 마케팅 소스 (input) | 🟡 사용자 수동 입력 | 🔜 RSS / analytics / news 자동 수집 |
| 마케팅 스케줄 | 🟡 cadence 값만 있음 | 🔜 /loop 또는 /schedule cron |
| Brand DNA / 레퍼런스 | ✅ 100% | — |
| 광고 가이드라인 검수 | ✅ brand-guardian | 🟡 "결과물 재검수" 한 번 더 (강화 가능) |
| 채널별 게시물 | ✅ 9 채널 (인스타 데스크톱 ❌) | 🟡 사용자 비전은 3개 (linkedin, threads, instagram) |
| 가이드 재검수 loop | 🟡 card-evaluator (1회) | 🟡 결과물 통합 검수 step 추가 |
| 클로드 크롬 업로드 대기 | ❌ 미구현 | ✅ 내일 만들 핵심 |

---

## 📅 다음 우선순위

```
내일 (이어서):
  1. browser-publish.mjs 작성 (30분)         ← 미싱 핵심
  2. 채널 좁히기: linkedin + threads          ← 사용자 비전 align
  3. 첫 실제 발행 (오늘 만든 캠페인)          ← end-to-end 검증
  4. 시간 되면: instagram OAuth 토큰 발급     ← 3 채널 완성

다음 주:
  5. 마케팅 소스 자동 수집 정의
  6. /loop 또는 /schedule로 매일 cron
  7. 가이드 재검수 step 보강 (brand-guardian 강화)
```
