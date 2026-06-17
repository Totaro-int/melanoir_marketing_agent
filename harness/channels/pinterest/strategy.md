# Pinterest Strategy

Pinterest 채널 전략. **이미지가 80%, 설명은 20%**. 검색·발견 매체. 텍스트보다 시각이 모든 것을 결정.

## 한 줄 요약
**세로형 이미지(2:3) + SEO 친화 핀 설명 + 보드 일관성**. 라이프스타일·D2C·웨딩·인테리어·뷰티·요리 매체. B2B SaaS는 적합도 낮음, B2C/뷰티/패션은 매우 강력.

## 채널 특성

| 항목 | 내용 |
|------|------|
| 글자 수 | 핀 제목 100자, 설명 500자 한도 |
| 한국어 권장 | 제목 25~50자, 설명 100~250자 |
| 미디어 | **이미지 1장** (또는 영상 < 60초) — 캐러셀 X |
| Aspect | **2:3 세로형 (1000×1500)** 권장. 1:1·9:16 가능 |
| 첫 줄 | 제목 = 핀 제목 (검색 키워드 포함) |
| 해시태그 | 0~4개 (검색에는 큰 도움 X — Pinterest는 키워드 검색) |
| 링크 | **링크 1개 필수** — 핀에서 외부 사이트로 트래픽 보내는 매체 |
| 보드 | **보드 지정 필수** (작가의 카테고리) |
| API | OAuth2 (accessToken + boardId) |

## 콘텐츠 원칙

1. **이미지가 검색 결과를 결정**
   - 텍스트 SEO보다 이미지 SEO (visual search) 우선
   - 핀 이미지 안에 텍스트 오버레이 OK (제목·키워드)
2. **세로형 2:3 비율**
   - 모바일 피드 우세 매체 → 세로 길수록 잘 노출
3. **SEO 친화 설명**
   - 핀 설명에 핵심 키워드 자연 분포
   - "DIY ___ 방법", "___ 인테리어 아이디어" 같은 형식
4. **보드 일관성**
   - 한 보드 안의 핀들이 같은 톤·주제로 묶여야 함
   - 보드명도 SEO 키워드 (예: "K-뷰티 OEM 가이드")
5. **링크는 필수**
   - 핀이 외부 트래픽 유입 매체라는 본질 — 링크 누락 X

## 금기

- 캐러셀·여러 장 (Pinterest는 1장만)
- 가로형 16:9 (모바일 피드 노출 ↓)
- 영업 톤 ("지금 사세요!" → 거부)
- 핀 설명에 외부 링크 (링크는 별도 필드)
- 회사 프로필 `banned.words / topics / claims` 위반

## 콘텐츠 타입별 권장 형식

| 타입 | 이미지 | 핀 제목 | 설명 |
|------|--------|---------|------|
| 인포그래픽 | 텍스트 + 시각 합성 | 25~50자 키워드 | 100~250자 |
| 스타일·무드보드 | 분위기 사진 | 짧은 시적 제목 | 100~150자 |
| 단계 가이드 | 단계 시각화 | "DIY/방법" 형식 | 200~400자 |
| 제품 컬렉션 | 제품 클리어 사진 | 제품명 + 카테고리 | 100~200자 |
| 비포·애프터 | 분할 비교 이미지 | 변화 강조 | 150~250자 |

## 🎨 이미지 가이드 (Pinterest)

> 공통 6-component 공식 + `harness/agents/image-director.md` 참조.

### Pinterest 특수 (이미지가 모든 것)

| 항목 | Instagram | **Pinterest** |
|------|----------|------------|
| 배경 | 어두운 풀-블리드 | **밝은 또는 그라디언트** (피드 가독성) |
| Aspect | 4:5 portrait | **2:3 세로 (1000×1500)** 절대 권장 |
| Hero 크기 | 120px+ | **150~200px** + 텍스트 오버레이 |
| 톤 | 임팩트·glow | **무드보드·인포그래픽 스타일** |
| 텍스트 in image | 절대 X | **제목 오버레이 OK** (핀 검색에 도움) |
| 인물 | 자제 | OK (라이프스타일 매체) |

### 이미지 prompt 핵심

```
"Pinterest pin aesthetic vertical 2:3 composition,
infographic or moodboard style, soft brand colors with text-friendly area,
single focal point, rich visual texture, lifestyle aesthetic,
1000x1500 portrait, brand color hex from profile,
text overlay area reserved at top or bottom 30%"
```

> Pinterest는 **이미지 안에 텍스트 OK** — 다른 채널과 다름. 단 텍스트는 회사 톤 + SEO 키워드.

## 발행 시간 권장
- 평일 오후 8~11시 (저녁 검색 피크)
- 주말 토요일 오후 (라이프스타일 검색 ↑)

## 회사 프로필 매핑

`copywriter`:
- `tone.preset` → SEO 친화 + 약간 시적
- `targetAudience[]` 중 B2C·라이프스타일 페르소나 우선
- B2B 콘텐츠는 인포그래픽 톤으로 변환
- 핀 설명에 핵심 키워드 4~6회 자연 분포

`image-director`:
- 6-component 공식 적용 + 2:3 세로형 강제
- 채널 = pinterest → **밝은 배경 + 텍스트 오버레이 영역 확보 + 인포그래픽 톤**
- (선택) 텍스트 오버레이 — 핀 제목을 이미지에 합성 (image-director가 HTML 생성 후 Playwright)

## 발행 — 비활성

이 채널은 비활성(`channels.json` status=disabled). 레거시 API/OAuth 발행은 2026-06 제거됨.
현재 browser-publish(크롬 쿠키)는 naver-blog / tistory / brunch / instagram / threads / linkedin 만 지원.

## 참고

- Pinterest API: https://developers.pinterest.com/docs/api/v5/
- Pin 사양: https://help.pinterest.com/en/business/article/pinterest-product-specs

> **마지막 검증: 2026-05-08**
