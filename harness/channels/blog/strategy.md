# Blog (정보성 글) 통합 전략

> **이 문서는 블로그 매체(naver-blog / tistory / brunch 등) 공통 가이드.**
> 각 매체별 특수 차이는 §매체별 차이 섹션 + 매체별 channel 폴더 참조.
> 분석 기반: 네이버·다음·구글 SEO 알고리즘 메타 자료 4종 (2026-05-07) + 5 모드 통합 (`modes.md`).

## 한 줄 요약
**검색 의도 충족 + 구조적 글쓰기 + 키워드 자연 분포 + 1500자+ 정보 밀도**.  
"많이 쓰기"가 아니라 **"구조적으로 쓰기"**가 상위 노출의 핵심.

## ⚡ 5 최적화 모드 (필수 — 글마다 1개 선택)

상세 가이드: [`modes.md`](./modes.md)

| 모드 | 풀네임 | 타겟 | 분량 | 핵심 |
|---|---|---|---|---|
| **default** | C-Rank / D.I.A.+ | 네이버 검색 (기존) | 2,000+ | 진정성·신뢰성·표 |
| **rcon** | RCON (Reranking with Context) | 네이버 DAN25 (최신) | 2,000+ | 다중 인텐트·시의성 |
| **ai-briefing** | AEO (AI Engine Optimization) | Cue: / Google AI Overviews | 2,500+ | 비교표·FAQ·구조화 |
| **home-plate** | 네이버 홈판 | 홈피드 추천 | 1,500~2,000 | 감성 제목·1인칭·CTA |
| **insight-edge** | 인사이트 엣지 | 차별화·결핍 | 2,000~2,500 | Pain Point·반골·인사이트 |

### 모드 선택 (campaign brief.goal 별)
- `launch` → **ai-briefing** / `awareness` → **home-plate** / `traffic` → **rcon** / `lead` → **insight-edge** / `education` → **default**
- brief 의 `blogMode` 필드로 명시적 override 가능
- 한 글에 모드 섞지 말 것 — 1 글 1 모드

## SEO 9대 핵심 패턴

### 1. 제목 (가장 중요)
- **글자수**: 25~30자 (네이버 25자 한도, 검색결과 노출 컷)
- **타겟 키워드**: **앞 25자 안 / 변형 없이 그대로** 배치
- **다중 키워드**: 괄호로 보조 키워드 ("...전략 (콘텐츠, 구조, 링크)")
- **광고 어휘 X**: 느낌표·"지금" 단독·"최고/1위/유일" 류 → 스팸 필터 작동
- **실용성·구체성**: "방법", "정리", "강화 전략" 같은 명사 마무리

### 2. 첫 단락 (핵심 100자)
- **공감 질문 또는 문제 제시**로 시작 ("글은 꾸준히 올리는데 왜 안 뜨지?")
- **첫 100자에 핵심 키워드 1회 자연 삽입** (검색 미리보기 노출 영역)
- **검색 의도 즉시 충족** — "이 글이 답이 된다"는 신호 1줄로 미리 시사
- **외부 링크 첫 단락 절대 금지** (페널티)

### 3. 본문 구조
- **H2 4~6개**, 각 섹션 3~4 문단
- **H1은 제목 전용** (본문에서 H1 사용 절대 금지 — SEO 페널티)
- **번호 매김**: "1. ~", "2. ~" — 스캔 가독성 향상
- **각 섹션 첫 줄에 결론·요약** (스캔 reader 우선)

### 4. 본문 길이
- **1,500~2,000자** (다음·구글 알고리즘 최적 구간)
- **600자 미만**: 정보 밀도 부족 페널티
- **3,000자+**: 이탈률 상승, 단 풍부한 가이드형이면 OK

### 5. 키워드 밀도
- **메인 키워드 3~7회** (네이버 3~5 / 구글 5~7)
- **stuffing 절대 금지** — 같은 키워드 8회+ 알고리즘 페널티
- **연관 키워드 자연 분포** — 메인이 "화장품 OEM"이면 "ODM·매칭·MOQ·인증"도 같이
- 본문·이미지 ALT·태그 모두에 분산

### 6. 이미지
- **헤더 이미지 1장** (썸네일·SEO·소셜 미리보기)
- **본문 중간 1~3장** (H2 사이마다)
- **ALT 텍스트 필수** — 메인 키워드 + 짧은 설명
- 광고 배너 이미지는 SEO 마이너스

### 7. 링크 전략
- **내부 링크 2~4개** — "이전 글에서 정리했어요" 자연 삽입
- **외부 링크 1~2개** — 신뢰 사이트 (정부·공식 공홈)만
- **첫 단락에 외부 링크 절대 금지**
- 내부 링크 = **체류시간 증가 → 알고리즘 가중치** 핵심 시그널

### 8. 마무리·CTA
- **결론 섹션에서 3가지 핵심 요약**
- **개인 경험담 추가** ("저 역시 처음엔...") — 신뢰 신호
- **soft CTA** ("이 세 가지를 꾸준히 적용하면" 류)
- 직접 광고 명령 ("지금 신청하세요!") 절대 금지

### 9. 메타 (태그·발행 주기·도메인 권위)
- **태그 9~15개** — 한국어 + 영문 혼합, long-tail 위주
- **발행 빈도**: 7일에 2회 (네이버 권장), 꾸준한 정기성
- **체류시간 + CTR + 외부 트래픽** 3대 시그널이 알고리즘 가중치

---

## 🖼 이미지 슬롯 가이드 (글 종류별)

블로그는 SNS와 달리 **본문에 인라인으로 이미지 삽입** (카드뉴스 X). 글 종류별로 필요한 이미지 슬롯이 다름.

### 글 종류별 이미지 슬롯 권장

| 템플릿 | 권장 이미지 수 | 슬롯 위치 (필수★ / 선택) |
|--------|--------------|-----------------------|
| **B1 가이드형** | **4~5장** | 헤더★ + H2-2 솔루션 일러스트★ + H2-3 차별점 + H2-4 사례 + H2-5 CTA 보조 |
| **B2 케이스 스터디** | **3~4장** | 헤더★ + H2-1 Before★ + H2-2 변화 또는 H2-3 결과 차트★ + H2-4 CTA |
| **B3 비교·리뷰** | **3~5장** | 헤더★ + H2-1 비교 기준 인포그래픽★ + H2-2·3 대상 A·B 시각 + H2-4 비교 표★ + H2-5 선택 가이드 |
| **B4 인사이트·관점** | **2~3장** | 헤더★ + H2-1 관점 시각 + H2-2 근거·데이터 시각 |
| **B5 제품 소개** | **4~5장** | 헤더★ + H2-1 문제 컨셉 + H2-2 제품 시각★ + H2-3 기능 인포그래픽★ + H2-4 사례 + H2-5 CTA |

> **헤더 이미지는 모든 글 종류에서 필수** (썸네일·SEO·소셜 미리보기 동시 활용).  
> 인사이트형(B4)은 글 자체가 핵심이라 이미지 보조 — 2-3장으로 충분.

### 매체별 이미지 차이

| 항목 | naver-blog | tistory | brunch |
|------|-----------|---------|--------|
| **권장 개수** | 1~3장 (3장+ 시 SEO 가중치) | 2~4장 | 1~2장 (에디토리얼) |
| **선호 스타일** | 추상·인포그래픽·차트 | 미니멀 일러스트 | Unsplash 사진·에디토리얼 |
| **비율** | landscape 16:9 또는 portrait 4:3 | landscape 우선 | landscape (Unsplash) |
| **ALT 텍스트** | **필수** (네이버 SEO 가중치) | 필수 | 선택 |
| **인물 사용** | 자제 | 자제 | OK (에디토리얼) |
| **로고·텍스트 in image** | 절대 X | 절대 X | 절대 X |

### 이미지 prompt 작성 원칙

모든 블로그 본문 이미지는 다음 원칙 준수:

1. **추상·미니멀·텍스트 없음** — 이미지 안에 글자·로고 절대 X (가독성 + 저작권 위험)
2. **인물 자제** — naver/tistory는 "no people, no faces" prompt 강제. brunch는 에디토리얼이라 OK
3. **회사 visual.colors 반영** — `imageContext.visual.colors.primary` 등을 prompt에 색상 hex로 명시
4. **회사 imageStyle.aestheticDirection 반영** — organic / minimalist / modern / editorial / playful / bold 키워드를 prompt에 포함
5. **negative prompt** 필수: `text, letters, words, faces, people, watermark, logo`
6. **각 슬롯의 컨셉을 1줄로 명시** — "abstract data network visualization", "abstract dawn launch concept" 등
7. **비율**: portrait_4_3 (블로그 본문 적합) 또는 landscape_4_3 (헤더 16:9 같은)
8. **모델**: `fal-ai/fast-sdxl` (작동 확인) 또는 `fal-ai/sana` (개발 환경 권한 확인 후)

### Brand DNA × Slot Position × Medium 디테일 prompt 조립 공식

generic prompt로는 회사별 차별이 안 됨. 6-component 자동 조립:

```
prompt = INDUSTRY MOTIF (profile.industry → 시각 모티프)
       + AESTHETIC (profile.imageStyle.aestheticDirection → 스타일 키워드)
       + BRAND COLORS (profile.visual.colors → hex 명시)
       + MOOD (moodWords 또는 tone.preset → 형용사)
       + SLOT COMPOSITION (slot.position → header/problem/solution/feature/CTA 컨벤션)
       + NEGATIVE (매체별 제약)
```

자세한 매핑 표 (industry × aesthetic × mood × position → 키워드)와 cos.totaro 적용 예시는  
`harness/agents/image-director.md` 의 **"Brand DNA → Prompt 조립 공식"** 섹션 참조.

이 공식에 따라 image-director sub-agent가 모든 slot prompt를 자동 디테일화함 — copywriter가 generic intent만 적어도 OK.

### 이미지 안티패턴

- ❌ 이미지 안에 글자/로고/UI 스크린샷
- ❌ 같은 컬러 팔레트만 4장 (다양성 X — 글 흐름 단조)
- ❌ 모든 이미지 같은 컴포지션 (헤더·본문·CTA가 다 똑같이 생김)
- ❌ 인물 클로즈업 (인물 본문 적합 X — naver/tistory)
- ❌ 광고 배너 스타일 (SEO 마이너스)
- ❌ 너무 작은 해상도 (< 800px) — 모바일 가독성 ↓

### copywriter ↔ image-director 협업 흐름 (Blog Mode)

```
1. copywriter: 본문 작성 시 이미지 자리에 placeholder 명시
   ![{ALT 한글}](IMAGE_PLACEHOLDER_N "{영문 fal prompt}")
   
2. copywriter: copy-output.json 의 cards[0].imageSlots 배열에 N개 정의:
   { index, placeholder, prompt, alt, position: "header"|"H2-1"|... }

3. image-director (Blog Mode): imageSlots 순회 → fal/openai 호출 → URL 수집

4. image-director: 본문 placeholder 자리에 URL 치환 → agent-output.json 저장

5. generate.mjs --finalize: 본문 그대로 발행 (이미지 인라인 형태)
```

> 카드뉴스 모드(Instagram 같은 series)와 달리, 블로그 모드는 **본문 markdown 안에 이미지 URL 직접 삽입**. HTML 카드 X, Playwright 캡처 X.

---

## 가장 중요한 3가지 (강조)

> **"많이 쓰기 X / 구조적으로 쓰기 O"**

1. **구조** — H2 4-6개, 첫 단락에 결론, 각 섹션 첫 줄 요약
2. **체류시간** — 내부링크로 사이트 안에서 이동 유도
3. **사용자 경험** — 짧은 문단·이미지·끝까지 읽히는 가독성

---

## 절대 금지 (스팸 페널티)

- 키워드 stuffing (같은 키워드 8회+)
- 숨겨진 키워드 (흰 글씨 등)
- 낚시성 반복 제목
- 무관 키워드 삽입
- 의미없는 특수문자 도배
- 광고 외침형 도입 ("지금 신청하세요!!!")
- 첫 단락 외부 링크
- 중복 콘텐츠 (다른 매체에 동일 글 복사 발행)
- 회사 프로필의 `banned.words / topics / claims` 위반

---

## 정보성 vs 광고성 — 정보성이 이기는 이유

| 항목 | 정보성 글 | 광고성 글 |
|------|---------|---------|
| 알고리즘 평가 | 검색 의도 충족 → 가중치 ↑ | 클릭 후 즉시 이탈 → 가중치 ↓ |
| 체류시간 | 길음 (정보 학습) | 짧음 |
| 내부 링크 클릭률 | 높음 | 낮음 |
| 자연 백링크 | 있음 (인용 가치) | 없음 |
| 추천 알고리즘 | 자주 추천 | 거의 추천 X |

→ **광고는 정보의 한 요소로 자연스럽게 녹이고, 본문은 정보 전달 우선**.

---

## 매체별 차이

| 항목 | naver-blog | tistory | brunch |
|------|-----------|---------|--------|
| **검색 알고리즘** | D.I.A. + C-Rank (네이버 자체) | 다음 + 구글 SEO | 카카오 + 구글 SEO |
| **글자수 권장** | 1,500~2,000자 | 1,500~2,500자 | 1,500~3,000자 (자유) |
| **제목 한도** | 60자 (검색 노출 컷) / 25자 권장 | 60자 권장 | 자유 |
| **태그 한도** | 30개 (10~15 권장) | 10개 한도 (5~10 권장) | 5개 한도 |
| **이미지** | 자체 업로드, ALT 지원 | 자체 업로드, ALT 지원 | Unsplash 통합, ALT 지원 |
| **카테고리** | 네이버 자체 | Tistory 카테고리 | Brunch 매거진 |
| **상업성 톤** | 강함 (직접 키워드 OK) | 중간 | 약함 (에디토리얼) |
| **B2B 적합도** | ★★★ | ★★★ | ★★ (B2C·문화 우세) |
| **API** | OpenAPI Blog Write (OAuth2) | Tistory Open API (OAuth) | 공식 API 없음 (browser-publish 권장) |
| **발행 어댑터** | `harness/src/publisher/adapters/naver-blog.mjs` | `harness/src/publisher/adapters/tistory.mjs` | (TBD) |

---

## 회사 프로필 매핑 (모든 블로그 매체 공통)

`copywriter`가 카피 생성 시:
- `tone.preset` + `tone.voiceNotes` → 본문 호흡 (단, SNS보다 정보형으로 약간 객관화)
- `tone.sampleSentences` → 모방 학습용
- `targetAudience[].painPoints` → **첫 단락 문제 환기** + H2 도출 재료
- `keyMessage` → 첫 단락 자연 삽입
- `contentPoints` → H2 본론 구성 재료
- `banned.*` → 사후 검열
- `hashtags.always` + `keywords` → 본문 자연 분포 + 태그 (매체별 한도 따라)
- `legal.adDisclosureRequired` → 본문 시작 또는 끝에 광고 표시

**핵심**: SNS와 달리 카드뉴스·이미지가 핵심이 아님 → 모든 블로그 매체에서 `image-director` 호출 **skip** (channels.json `skipImageDirector: true`).

---

## 참고 자료 (출처)

- [네이버 SEO 상위노출 첫걸음](https://idearabbit.co.kr/네이버-seo-방법/naver-seo/)
- [네이버 상위노출 알고리즘 분석](https://www.ascentkorea.com/naver_seo_strategies_2/)
- [티스토리 SEO 강화 전략](https://jehovahrapha-nissi.com/entry/티스토리-검색-노출SEO-강화-전략-콘텐츠-구조-링크)
- [티스토리·다음 상위 노출 로직](https://thegreenbookmedia.com/entry/티스토리-블로그-다음-상위-노출-로직-완벽-분석)

> **마지막 검증: 2026-05-07** (메타 SEO 자료 기반)
