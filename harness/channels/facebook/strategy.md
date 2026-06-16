# Facebook Strategy

Facebook Page 채널 마케팅 전략. **40대 이상 + 한국 지역 도달**이 강한 매체. Page 운영 + Boost 광고와 자연스럽게 연결.

## 한 줄 요약
**친근·정보 전달형 + 이미지 OR 짧은 영상**. 첫 250자 후킹. 댓글·공유 유도 질문이 핵심. 광고형 외침은 알고리즘이 가라앉힘.

## 채널 특성

| 항목 | 내용 |
|------|------|
| 글자 수 | **250~600자** 권장 (한도 63,206자, 한국어 100~250자) |
| 미디어 | 이미지·캐러셀 1~10장, 영상 60분 이내 |
| Aspect | 1:1 또는 16:9 landscape |
| 첫 줄 | "...더 보기" 컷 — **첫 250자**가 미리보기 |
| 해시태그 | **2~5개** (Twitter처럼 강하지 않지만 검색용) |
| 링크 | 자유 — link preview 카드 자동 생성 |
| 캐러셀 | 1~10장 이미지 캐러셀 OK |
| API | Graph API (Page token) |

## 콘텐츠 원칙

1. **친근·정보 전달**
   - 인스타보다 친근, 트위터보다 길게
   - 한 단락 끝에 짧은 호흡 (줄바꿈)
2. **첫 250자에 핵심**
   - "...더 보기" 컷이 강함 — 그 안에 결론
3. **댓글 유도 질문**
   - 마지막에 "여러분은 어떠신가요?" 류 질문 → 알고리즘 가중치
4. **공유 유도**
   - 정보·체크리스트형이 가장 잘 공유됨
5. **링크 + 이미지 조합**
   - link preview 카드 + 본문 → 클릭 ↑

## 금기

- 외부 링크 도배 (3개+ → 페널티)
- 광고형 외침 ("지금 클릭!", "한정 특가") → 알고리즘 가라앉힘
- 자극적 낚시 제목
- 회사 프로필 `banned.words / topics / claims` 위반
- 정치·종교 토픽 (Facebook은 특히 민감)

## 콘텐츠 타입별 권장 형식

| 타입 | 길이 | 미디어 | cadence |
|------|------|--------|---------|
| 인사이트 | 250~400자 | 1장 | `single` |
| 케이스 스터디 | 400~600자 + 캐러셀 3~5장 | 캐러셀 | `series-3` |
| 가이드·체크리스트 | 500~700자 + 캐러셀 5~10장 | 캐러셀 | `series-5` |
| 제품·이벤트 | 200~400자 + 영상 또는 이미지 | 1~3장 | `single` |
| 채용 | 400~500자 + 분위기 사진 | 1장 | `single` |

## 🎨 이미지 가이드 (Facebook)

> 공통 6-component 공식은 `harness/agents/image-director.md` 참조.

### Facebook 특수

| 항목 | Instagram | **Facebook** |
|------|----------|------------|
| 배경 | 어두운 풀-블리드 | **밝은 또는 그라디언트** (다양) |
| Aspect | 4:5 portrait | **1:1 square** 또는 16:9 landscape |
| 톤 | 임팩트·glow | **균형 잡힌 친근형** |
| Hero 크기 | 120px+ | 80~100px |
| 인물 | 자제 | **OK** (소셜 톤이라) |
| 필수 요소 | pill + brand mark | brand mark + 짧은 caption (이미지 안) |

### 이미지 prompt 핵심 키워드

```
"balanced friendly composition, social-friendly aesthetic,
warm approachable mood, natural light, premium but accessible,
1080x1080 square or 1920x1080 landscape,
brand color hex from profile, soft glow background"
```

### 캐러셀 사용 권장도

- **케이스 스터디**: 3~5장 캐러셀 추천
- **가이드 체크리스트**: 5~10장 (Facebook 알고리즘이 캐러셀 도달 ↑)
- **제품 라인업**: 캐러셀이 단일보다 잘 받음

## 발행 시간 권장

- 평일 오후 1~3시 (점심 후 휴식), 저녁 8~10시
- 주말 오전 9~11시도 좋음 (Facebook 활용도 ↑)

## 회사 프로필 매핑

`copywriter`:
- `tone.preset` → 친근하게 변환 (formal → approachable)
- `targetAudience[]` 중 일반 소비자 페르소나 우선
- 마지막에 댓글 유도 질문 1줄 자동 추가
- `hashtags.always` + 2~3개 보조

`image-director`:
- 6-component 공식 적용
- 채널 = facebook → 밝은/그라디언트 배경 + 1:1 또는 16:9 + 친근 톤
- 인물 OK (`allowPeople: true`)

## 발행 — 비활성

이 채널은 비활성(`channels.json` status=disabled). 레거시 API/OAuth 발행은 2026-06 제거됨.
현재 browser-publish(크롬 쿠키)는 naver-blog / tistory / brunch / instagram / threads / linkedin 만 지원.

## 참고

- Graph API: https://developers.facebook.com/docs/graph-api
- Page Token: https://developers.facebook.com/docs/pages/access-tokens

> **마지막 검증: 2026-05-07**
