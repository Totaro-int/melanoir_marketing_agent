# 🧬 SYSTEM PROMPT — Zoom In

> 화이트보드의 핵심: 매번 LLM에 inject되는 system prompt 안에 무엇이 들어가는지.
> 작성일: 2026-05-07

---

## 한 장으로

```
┌─────────────────────────────────────────────────────────────────────┐
│                  📥 매번 바뀌는 입력 (캠페인별)                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │  marketing source (input)                                   │   │
│   │   · topic            "TOTARO COS 정식 런칭"                 │   │
│   │   · contentPoints    "1만 5천 제조사 / 3초 매칭 / ..."      │   │
│   │   · sourceMaterials  (이미지/텍스트 첨부, 옵션)             │   │
│   └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│           🧬 SYSTEM PROMPT 자동 조립 (영구 + 캠페인 전용)           │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │  ① 브랜드 DNA  ←  company-profile.yaml                      │   │
│   │     ────────────────────────────                            │   │
│   │     · brand.name / taglineOneLine / industry / audience     │   │
│   │     · tone.preset + voiceNotes + sampleSentences            │   │
│   │     · visual.colors / fonts / aestheticDirection            │   │
│   │     · hashtags.always / pool                                │   │
│   │     · legal.adDisclosureRequired / adHashtag                │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │  ② 레퍼런스 few-shot                                        │   │
│   │     ────────────────                                        │   │
│   │     · profile.writing.referencePosts (잘 됐던 글 3개)       │   │
│   │     · profile.writing.sampleSentences                       │   │
│   │     · profile.imageStyle.referencesBrands  (linear/stripe…) │   │
│   │     · harness/design-refs/<brand>/DESIGN.md  (디자인 시스템)│   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │  ③ 광고 가이드라인  ←  brand-guardian이 enforce             │   │
│   │     ─────────────────────────────                           │   │
│   │     · profile.banned.words  (최고의, 1위, 유일한, ...)      │   │
│   │     · profile.banned.topics  (의약품 효능 표방, 비방, ...)  │   │
│   │     · profile.banned.claims  (100% 보장, 치료, 완치, ...)   │   │
│   │     · 한국 공정위 가이드 (legal.ko)                         │   │
│   │     · 화장품법 (피부 의학적 작용 표현 금지)                 │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │  ④ 채널 strategy  ←  harness/channels/<channel>/strategy.md │   │
│   │     ──────────────────                                      │   │
│   │     · 글 길이 권장 (LinkedIn 800자 / Threads 280자)         │   │
│   │     · 해시태그 갯수 (LinkedIn ≤5 / Threads ≤3 / X ≤2)       │   │
│   │     · aspect ratio (square / portrait / landscape)          │   │
│   │     · CTA 스타일                                            │   │
│   │     · 채널별 톤 (LinkedIn formal / Threads short / X punchy)│   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │  ⑤ 캠페인 키워드  ←  keywords.json (3.5단계 생성)           │   │
│   │     ──────────────                                          │   │
│   │     · 핵심 키워드 (3~5)                                     │   │
│   │     · 추천 해시태그 (3~5)                                   │   │
│   │     · 포커스 앵글 (이번 캠페인 한정)                        │   │
│   │     · watchOut (이번 주제에 특히 위험한 banned 표현)        │   │
│   └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼ (assembly)
┌─────────────────────────────────────────────────────────────────────┐
│              📝 ASSEMBLED PROMPT (텍스트로 합침)                    │
│   "당신은 TOTARO 브랜드의 카피라이터입니다.                         │
│    톤은 calm, ~합니다 체, 이모지 0…                                 │
│    절대 사용 금지: '최고의', '1위'…                                 │
│    레퍼런스 글: <referencePost1>…                                   │
│    채널: linkedin (800자 권장, 해시태그 5개)…                       │
│    이번 캠페인 키워드: K-뷰티 OEM, AI 매칭…                         │
│    주제: TOTARO COS 정식 런칭…"                                     │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│              📨 LLM 호출 (sub-agent별로)                            │
│   ┌─────────────┐  ┌──────────────┐  ┌──────────────┐               │
│   │ copywriter  │  │image-director│  │brand-guardian│               │
│   │ (텍스트)    │  │  (HTML+PNG)  │  │   (검수)     │               │
│   └─────────────┘  └──────────────┘  └──────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
   📤 채널별 OUTPUT (copy + cards + result)
```

---

## 5가지 inject 소스를 한 표로

| # | 출처 | 영구/일회성 | 어떤 영향 |
|---|------|-------------|----------|
| ① | `company-profile.yaml` (brand/tone/visual/hashtags/legal) | 영구 | 브랜드 정체성, 모든 generation의 톤·컬러·로고 |
| ② | `profile.writing.referencePosts` + `imageStyle.referencesBrands` + `harness/design-refs/<brand>/DESIGN.md` | 영구 | Few-shot 학습. 카피 스타일 + 시각적 DNA |
| ③ | `profile.banned` + `legal` + `harness/agents/brand-guardian.md` | 영구 | 금지어 차단, 광고법 준수 |
| ④ | `harness/channels/<channel>/strategy.md` | 영구 (per channel) | 글 길이·해시태그 갯수·aspect 등 채널별 룰 |
| ⑤ | `posts/campaigns/<slug>/keywords.json` | 일회성 (캠페인별) | 이번 주제 한정 키워드·앵글·watchOut |

---

## 시스템 프롬프트가 실제로 어떻게 생기는가 (예시)

위 5가지가 합쳐지면 LLM이 받는 system prompt는 이런 구조:

```
[BRAND DNA]
- Brand: TOTARO (주식회사 토타로 인터내셔널)
- Tagline: 어떤 피부든, 어느 나라든. K-뷰티를 찾아드립니다.
- Industry: B2B SaaS — K-뷰티 매칭 플랫폼
- Tone: calm. "광고처럼 외치지 않고 정보를 정제해서 전달."
       "~합니다" 체 기본. 차분하고 단정적인 종결.
       이모지 사용 안 함. 형용사 남발 금지.
       B2B 바이어가 출장 비행기에서 읽기 좋은 톤.
- Sample sentence: "어떤 피부든, 어느 나라든. K-뷰티를 찾아드립니다."

[REFERENCE FEW-SHOT — 잘 됐던 글 3편]
1. "왜 AI 회사가 '도토리 공장'에서 시작했을까?
    아랜딩(Aranding)을 시작했습니다. 처음부터 거창한 AI 담론을 꺼내지는…"
   → 학습 포인트: 질문으로 시작 + 사실·구조로 답함 + 형용사 절제

[VISUAL DNA]
- Primary color: #3d6b2e (forest green)
- Background: #f5f4ef (warm beige)
- Heading font: Noto Serif KR
- Body font: Geist Sans
- Aesthetic: Organic/Natural — 자연주의 + 전문성
- Reference brands: linear.app, stripe, vercel

[광고 가이드라인 — 절대 사용 금지]
- Words: 최고의, 1위, 유일한, 100% 보장, 효과 만점, 치료, 완치
- Topics: 경쟁사 직접 비방, 의약품 효능 표방
- Claims: 100% 검증, 의학적으로 입증, 임상적으로 증명
- Legal: 광고로 분류 시 #광고 해시태그 의무

[CHANNEL: linkedin]
- 글 길이: 800자 권장
- 해시태그: ≤5개
- 카드 aspect: 1:1 (square)
- CTA: implicit (직접 호출 X, 궁금증 남김)

[이번 캠페인 — keywords.json]
- 키워드: K-뷰티 OEM, AI 매칭, 검증 제조사, B2B 소싱
- 추천 해시태그: #KBeauty #B2BSourcing #CosmeticsOEM #SourcingKorea #KoreanCosmetics
- 앵글: 1만 5천 데이터 + 인증 검증 — 출장 없이도 신뢰 가능한 OEM 발견
- watchOut (이번에 특히 위험): 최고의, 1위, 유일한, 100% 검증, 베스트

[USER REQUEST — 이번 입력]
- Topic: TOTARO COS 정식 런칭 — K-뷰티 매칭 플랫폼
- Content points:
  · 1만 5천여 한국 화장품 제조사 DB
  · HACCP·ISO·CGMP 인증 자동 검증
  · 평균 매칭 시간 3초
  · 한·영·일 3개 언어 지원
  · MOQ·리드타임·인증 조건 필터링

[TASK]
LinkedIn 게시물 800자 작성. 위 모든 제약 준수.
시리즈 3장 카드 중 카피 (hook → body → CTA).
```

→ 이 prompt를 받은 copywriter가 텍스트 생성, image-director가 HTML 생성, brand-guardian이 결과 검수.

---

## 어디서 inject되는가 (코드 위치)

```
harness/bin/generate.mjs
  └─ writeInhouseSpecs() / writeCopySpecs()
      ├─ loadProfile()           → company-profile.yaml 로드 (①②③)
      ├─ loadChannelDocs()       → channels/<ch>/strategy.md 로드 (④)
      ├─ loadKeywordsMap()       → keywords.json 로드 (⑤)
      ├─ loadDesignRef()         → design-refs/<brand>/DESIGN.md 로드 (②)
      └─ writes slide-spec.json with all of the above merged
                  │
                  ▼
                 read by sub-agent (image-director.md / copywriter.md)
                  │
                  ▼
                 LLM 호출 — 5개 inject + user input 합쳐 prompt 생성
```

---

## 화이트보드 ↔ 우리 매핑 (system prompt 한정)

| 화이트보드 | 실제 구현 | 파일 |
|-----------|----------|------|
| 브랜드 DNA → 맞춰서 소스 가공 | `profile.brand/tone/visual/hashtags` + 캠페인 input | `company-profile.yaml` ① |
| 레퍼런스 few shot → 맞춰서 소스 가공 | `referencePosts` (글 톤) + `referencesBrands`·`DESIGN.md` (시각) | `profile.writing` + `harness/design-refs/<brand>/` ② |
| 광고 가이드라인 검수 | `banned` + `legal` + brand-guardian agent | `profile.banned`/`legal` + `harness/agents/brand-guardian.md` ③ |
| (확장) | 채널별 룰 + 캠페인 한정 키워드 | `harness/channels/` + `keywords.json` ④⑤ |
