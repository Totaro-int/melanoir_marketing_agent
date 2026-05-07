# Blog (정보성 글) 통합 템플릿

> 모든 블로그 매체(naver-blog / tistory / brunch) 공통 템플릿.  
> 5종 정보성 글 패턴 + 채우기 규칙.

---

## B1. 가이드형 (2,000~2,500자, H2 5~6개) — 이미지 4~5장

**목적**: "어떻게 하면 ~할 수 있을까" 검색 의도 충족  
**제목 패턴**: "{핵심 키워드}, {결과 약속} — {차별점}"

**구조**:
```
[제목]
{핵심 키워드를 앞 25자 안에 배치한 명확한 제목}

[도입 단락 — 약 200자]
{공감 질문 또는 문제 제시로 시작}
{첫 100자 안에 핵심 키워드 1회 + 검색 의도 미리 시사}
{이 글이 어떤 답을 주는지 1줄 약속}

★ ![{ALT}](IMAGE_PLACEHOLDER_1 "{prompt}") ← 헤더 이미지 (필수)

[H2-1: 문제 정의 — 약 400자]
{왜 그게 문제인가, 누가 겪는가}
{각 H2 첫 줄에 결론 1줄}

[H2-2: 핵심 솔루션 — 약 500자]
{제품·방법·접근 — 가장 구체적 정보}

★ ![{ALT}](IMAGE_PLACEHOLDER_2 "{prompt}") ← 솔루션 일러스트 (필수)

[H2-3: 차별점 또는 기능 상세 — 약 400자]
{경쟁 방식과 어떻게 다른가}

  ![{ALT}](IMAGE_PLACEHOLDER_3 "{prompt}") ← 차별점 시각 (선택)

[H2-4: 사용 사례 또는 적용 단계 — 약 400자]
{실제 어떤 단계에서 가장 유용한가}

  ![{ALT}](IMAGE_PLACEHOLDER_4 "{prompt}") ← 사례 일러스트 (선택)

[H2-5: 마무리·CTA — 약 200자]
{3가지 핵심 요약}
{개인 경험담 1줄 — 신뢰 신호}
{soft CTA}

  ![{ALT}](IMAGE_PLACEHOLDER_5 "{prompt}") ← CTA 보조 (선택)

[태그 매체별 한도 따라]
```

**imageSlots 배열 예시**:
```json
[
  { "index": 1, "placeholder": "IMAGE_PLACEHOLDER_1", "position": "header",  "prompt": "...", "alt": "..." },
  { "index": 2, "placeholder": "IMAGE_PLACEHOLDER_2", "position": "H2-2",    "prompt": "...", "alt": "..." },
  { "index": 3, "placeholder": "IMAGE_PLACEHOLDER_3", "position": "H2-3",    "prompt": "...", "alt": "..." },
  { "index": 4, "placeholder": "IMAGE_PLACEHOLDER_4", "position": "H2-4",    "prompt": "...", "alt": "..." },
  { "index": 5, "placeholder": "IMAGE_PLACEHOLDER_5", "position": "H2-5",    "prompt": "...", "alt": "..." }
]
```

---

## B2. 케이스 스터디형 (1,500~2,000자, H2 4개) — 이미지 3~4장

**목적**: 실제 사례를 통한 신뢰 확보  
**제목 패턴**: "{고객·사례} — {달성 결과}"

**구조**:
```
[도입 — 약 200자]
{어떤 회사·어떤 상황 + 결과 한 줄 스포일러}

★ ![{ALT}](IMAGE_PLACEHOLDER_1 "{prompt}") ← 헤더 (필수)

[H2-1: 시작 시점의 상황 — 약 400자]
{Before — 무엇이 문제였는지}

★ ![{ALT}](IMAGE_PLACEHOLDER_2 "{prompt}") ← Before 시각 (필수)

[H2-2: 어떤 변화를 시도했는가 — 약 400자]
{무엇을 도입·바꿨는지}

[H2-3: 결과·수치 — 약 400자]
{After — 구체 수치, 변화 양상}

★ ![{ALT}](IMAGE_PLACEHOLDER_3 "{prompt}") ← 결과·수치 차트 (필수)

[H2-4: 적용 가이드·CTA — 약 200자]
{읽는 사람이 어떻게 동일 가치 얻을 수 있는지 + 링크}

  ![{ALT}](IMAGE_PLACEHOLDER_4 "{prompt}") ← CTA (선택)

[태그]
```

---

## B3. 비교·리뷰형 (2,000~2,500자, H2 5~6개) — 이미지 3~5장

**목적**: 결정 단계 검색자 (구매 직전) 흡수  
**제목 패턴**: "{대상 A} vs {대상 B} — {기준 키워드}"

**구조**:
```
[도입 — 약 200자]
{비교 배경 + 누가 이 결정을 고민하는가}

★ ![{ALT}](IMAGE_PLACEHOLDER_1 "{prompt}") ← 헤더 (필수)

[H2-1: 비교 기준 — 약 300자]
{어떤 항목으로 비교하는가}

★ ![{ALT}](IMAGE_PLACEHOLDER_2 "{prompt}") ← 비교 기준 인포그래픽 (필수)

[H2-2: 대상 A 상세 — 약 500자]

  ![{ALT}](IMAGE_PLACEHOLDER_3 "{prompt}") ← 대상 A 시각 (선택)

[H2-3: 대상 B 상세 — 약 500자]

  ![{ALT}](IMAGE_PLACEHOLDER_4 "{prompt}") ← 대상 B 시각 (선택)

[H2-4: 항목별 비교 표 — 약 300자]
{한 화면 요약}

★ ![{ALT}](IMAGE_PLACEHOLDER_5 "{prompt}") ← 비교 표 시각 (필수)

[H2-5: 어떤 경우에 어떤 선택 — 약 300자]
{추천 가이드}

[H2-6: 결론·CTA — 약 200자]

[태그]
```

> 주의: `banned.topics` "경쟁사 직접 비방" 위반 위험 — 객관적 사실만, 일방적 폄하 X.

---

## B4. 인사이트·관점형 (1,500~2,000자, H2 3~4개) — 이미지 2~3장

**목적**: 차별 메시지로 브랜드 권위 빌드 (글 자체가 핵심, 이미지 보조)  
**제목 패턴**: "{단정·반전 메시지} — {근거 키워드}"

**구조**:
```
[도입 — 약 250자]
{관점 단정 + 왜 그렇게 보는지 미리 시사}

★ ![{ALT}](IMAGE_PLACEHOLDER_1 "{prompt}") ← 헤더 (필수)

[H2-1: 통념 vs 우리의 관점 — 약 500자]
{대비 구조로 차별 메시지}

  ![{ALT}](IMAGE_PLACEHOLDER_2 "{prompt}") ← 관점 시각 (선택)

[H2-2: 근거·데이터·경험 — 약 600자]
{관점을 뒷받침하는 사실들}

  ![{ALT}](IMAGE_PLACEHOLDER_3 "{prompt}") ← 데이터·근거 시각 (선택)

[H2-3: 그래서 무엇을 의미하는가 — 약 400자]
{독자가 가져갈 implication}

[H2-4: 마무리·관련 콘텐츠 — 약 200자]

[태그]
```

---

## B5. 제품 소개형 (1,500~2,000자, H2 4~5개) — 이미지 4~5장

**목적**: 제품 검색자에게 정보성 진입 + soft 전환  
**제목 패턴**: "{제품·서비스명} {기능 핵심} — {차별점·성과}"

**구조**:
```
[도입 — 약 200자]
{문제 환기 + 제품 한 줄 소개}

★ ![{ALT}](IMAGE_PLACEHOLDER_1 "{prompt}") ← 헤더 (필수)

[H2-1: 어떤 문제를 푸는가 — 약 400자]
{P 단계 — 페르소나의 일상 문제}

  ![{ALT}](IMAGE_PLACEHOLDER_2 "{prompt}") ← 문제 컨셉 (선택)

[H2-2: 제품 핵심 — 약 400자]
{S 단계 — 어떻게 푸는지}

★ ![{ALT}](IMAGE_PLACEHOLDER_3 "{prompt}") ← 제품 핵심 시각 (필수)

[H2-3: 핵심 기능 상세 — 약 500자]
{O 단계 — 구체 수치·기능}

★ ![{ALT}](IMAGE_PLACEHOLDER_4 "{prompt}") ← 기능 인포그래픽 (필수)

[H2-4: 어떤 단계에서 유용한가 — 약 400자]
{사용 시나리오}

  ![{ALT}](IMAGE_PLACEHOLDER_5 "{prompt}") ← 사례·CTA 시각 (선택)

[H2-5: 시작하는 방법 — 약 200자]
{N+A — 대상 좁히기 + soft CTA}

[태그]
```

---

## 채우기 규칙 (copywriter용)

1. `{...}` 자리는 회사 프로필의 톤으로 재작성. 템플릿 문장을 그대로 두지 말 것.
2. **제목**: 핵심 키워드를 앞 25자 안에 배치. 60자 이내. 광고 어휘 X.
3. **첫 단락(150자 내)**: 핵심 키워드 1회 + 검색 의도 미리 시사 + 외부 링크 X.
4. **본문 키워드 분포**: 3~7회 자연스럽게 (stuffing 금지). 연관 키워드 2~4종 같이.
5. **H2 4~6개**: 각 H2 첫 줄에 결론·요약 (스캔 읽기 최적화).
6. **본문 길이**: 1,500~2,500자 (가이드형은 ~3,000자까지 가능).
7. **이미지**: 헤더 1장 + 본문 1~3장. 모두 ALT 텍스트 (메인 키워드 + 짧은 설명).
8. **내부 링크**: 2~4개 (관련 글 자연 삽입). 외부 링크: 0~2개 (신뢰 사이트만, 첫 단락 X).
9. **마무리**: 3가지 핵심 요약 + 개인 경험담 1줄 + soft CTA.
10. **태그 매체별 한도**: naver-blog 10~15 / tistory 5~10 / brunch ≤5.
11. **회사 톤은 유지하되 정보형으로 약간 객관화**: SNS보다 설명적·친절한 톤.

## image-director Blog Mode

블로그 매체는 카드뉴스·HTML 슬라이드가 아니라 **본문 markdown에 이미지 URL 인라인 삽입** 방식.  
image-director는 "Blog Mode" 분기로 동작 (카드뉴스 X, fal로 N장 생성 → 본문 placeholder 치환).

**copywriter 책임**:
1. 위 B1~B5 템플릿에서 이미지 슬롯 위치 정함
2. 각 슬롯에 `![{ALT}](IMAGE_PLACEHOLDER_N "{영문 fal prompt}")` 형식으로 placeholder 삽입
3. `cards[0].imageSlots` 배열에 N개 슬롯 정의 (index, placeholder, prompt, alt, position)

**image-director 책임 (Blog Mode)**:
1. `imageSlots` 순회 → fal 호출 → URL 수집
2. 본문의 `IMAGE_PLACEHOLDER_N` 자리에 URL 치환
3. `agent-output.json` 저장 (수정된 본문 + URL 메타)
4. **HTML/Playwright 단계 skip** (블로그는 카드 X)

자세한 흐름은 `harness/agents/image-director.md` 의 "Blog Mode" 섹션 참조.

## 매체별 발행 시 추가 사항

- **naver-blog**: front-matter 에 `title`, `tags` (10~15개) 명시. categoryNo 옵션.
- **tistory**: front-matter 에 `title`, `tags` (5~10개), `category` (선택). 마크다운 직접 발행 가능.
- **brunch**: 공식 발행 API 없음 — `browser-publish.mjs` 으로 처리. front-matter `title`, `매거진명`.
