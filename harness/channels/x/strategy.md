# X (Twitter) Strategy

X(@x) 채널 전략. **짧고 punchy + 실시간 도달**이 핵심. 280자 한도가 모든 것을 결정.

## 한 줄 요약
**1문장 단정 + 수치 1개 + 이미지 옵션**. 280자 한도 안에 핵심만. 광고 톤·과장은 즉시 외면. 짧을수록 잘 받음.

## 채널 특성

| 항목 | 내용 |
|------|------|
| 글자 수 | **280자 한도** (한국어 ~140자) |
| 한국어 한도 | ~140자 — 한 문장 + 짧은 보조 |
| 미디어 | 이미지 4장 OR 영상 2분 20초 |
| Aspect | 16:9 권장 / 1:1 OK |
| 첫 줄 | 첫 줄이 전부 — 단정·수치·짧은 통찰 |
| 해시태그 | **1~2개** (도배 시 외면) |
| 링크 | OK 단, 이미지·영상이 도달 ↑ |
| 시리즈 | thread 1~10편 (`cadence: thread`) |
| API | X API v2 (Bearer 또는 OAuth1, 이미지는 OAuth1 필수) |

## 콘텐츠 원칙

1. **1문장에 결판**
   - 280자 안 한 문장 + 짧은 보조 1문장
2. **수치 1개**
   - "5.2일 → 1.8일" 같은 짧은 수치가 가장 잘 도달
3. **이미지가 도달 2배+**
   - 같은 카피여도 이미지 첨부 시 노출 큰 차이
4. **광고 톤 X**
   - "지금" "한정" "특가" 등 → 알고리즘이 노출 깎음
5. **thread는 1편이 단독으로도**
   - 1편이 retweet 안 되면 2편도 안 봄

## 금기

- 280자 꽉 채우기 (보통 200자 안이 최적)
- 해시태그 3개+ 도배
- 외부 링크 첫 트윗에 (영상·이미지가 노출 ↑)
- 회사 프로필 `banned.words / topics / claims` 위반
- 줄바꿈 도배 (X는 줄바꿈 적게 — 한 호흡)

## 콘텐츠 타입별 권장 형식

| 타입 | 길이 | 미디어 | cadence |
|------|------|--------|---------|
| 짧은 단정 | ~100자 | 없음 또는 1장 | `single` |
| 수치 + 이미지 | ~150자 + 1장 | Stat 카드 1장 | `single` |
| Thread (스토리) | 각 ~150자 × 5~10편 | 첫 편 카드 | `thread` |
| 제품 업데이트 | ~200자 + 스크린샷 | 1~2장 | `single` |
| 인용·발견 | ~150자 + 스크린샷 | 1장 | `single` |

## 🎨 이미지 가이드 (X)

> 공통 6-component 공식은 `harness/agents/image-director.md` 참조.

### X 특수 (극도 미니멀)

| 항목 | Instagram | **X** |
|------|----------|------|
| 배경 | 어두운 풀-블리드 | **밝은 #F8FAFC 또는 단색 1색** |
| Aspect | 4:5 portrait | **16:9 landscape** (피드 노출 컷 최적) |
| Hero 크기 | 120px+ | **150~200px** (수치 하나가 전부) |
| 톤 | 임팩트·glow | **극도 미니멀** |
| 필수 요소 | pill + brand mark | **Hero stat + 작은 eyebrow + divider 1개만** |
| 인물 | 자제 | 자제 |

### 이미지 prompt 핵심 키워드

```
"extreme minimalism for X feed, single hero stat composition,
raw sans-serif typography, plenty of white space,
no decoration except 1 divider line, 16:9 landscape,
brand accent only on the hero number, no glow"
```

### 카드 사용 권장도

- **수치 1개**: Stat Card 가 X에서 가장 강력
- **인용**: Quote Block 적합
- **다단계 정보**: 캐러셀 X (X는 단일 이미지가 강함)

## 발행 시간 권장

- 평일 오전 8~10시, 점심 12~13시, 저녁 19~21시
- 한국어 트윗은 한국 시간대 우선

## 회사 프로필 매핑

`copywriter`:
- `tone.preset` → punchy 톤으로 변환 (긴 문장 → 짧은 한 줄)
- `keyMessage` → 첫 문장에 그대로 (수정 최소)
- `hashtags.always` 만 (1~2개)
- 형용사 모두 제거, 사실·수치만

`image-director`:
- 6-component 공식 적용
- 채널 = x → 극도 미니멀 + 16:9 + Hero stat 거대화
- `imageStyle.aestheticDirection` "minimalist" 강제 (다른 톤이어도 X용으론 절제)

## 발행 — 비활성

이 채널은 비활성(`channels.json` status=disabled). 레거시 API/OAuth 발행은 2026-06 제거됨.
현재 browser-publish(크롬 쿠키)는 naver-blog / tistory / brunch / instagram / threads / linkedin 만 지원.

## 참고

- X API v2: https://developer.x.com/en/docs/x-api/v2
- Media Upload: https://developer.x.com/en/docs/x-api/v1/media

> **마지막 검증: 2026-05-07**
