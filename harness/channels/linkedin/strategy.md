# LinkedIn Strategy

LinkedIn 채널 마케팅 전략. 카피라이팅·이미지 단계의 필수 입력. **B2B professional + 글로벌 도달**이 핵심.

## 한 줄 요약
**B2B 신뢰 톤 + 데이터 중심 + 800~1,200자**. 글로벌 영문 OK. 캐러셀 PDF가 가장 강력. 광고 톤·과장은 즉시 평가 절하.

## 채널 특성

| 항목 | 내용 |
|------|------|
| 글자 수 | **800~1,200자** 권장 (한국어 400~600자), 한도 3,000자 |
| 한국어/영어 | 둘 다 OK. 글로벌 도달 원하면 영문 우선 |
| 미디어 | 이미지·캐러셀 PDF (5~10장), 영상 10분 이내 |
| Aspect | **square 1080×1080** (캐러셀) 또는 1920×1080 영상 |
| 첫 줄 | "...더 보기" 컷 — **첫 200자**가 미리보기 |
| 해시태그 | **3~5개** (전문 용어 위주) |
| 링크 | 첫 댓글에 배치 권장 (본문 노출 페널티) |
| 캐러셀 | **PDF 캐러셀 가장 강력** — 데이터 인포그래픽·가이드 |
| 발행 | browser-publish (크롬 쿠키) |

## 콘텐츠 원칙

1. **B2B Professional 톤**
   - "혁신적인" "최고의" 같은 형용사 X — 수치·사실·검증으로 말함
   - 한국어든 영어든 **격식 + 평이 + 정확** 균형
2. **첫 200자에 핵심**
   - "...더 보기" 컷 안에 수치·결론 있어야 클릭
3. **데이터·근거 중심**
   - 인사이트는 1줄 단정 → 근거 2~3줄 → 시사점 1줄
4. **캐러셀 PDF 활용**
   - 가이드·비교·체크리스트는 PDF 5~10장이 텍스트보다 도달 ↑
5. **글로벌 영문 옵션**
   - K-뷰티·B2B 글로벌 페르소나면 영문이 도달 ↑↑

## 금기 (이 채널 한정)

- 광고형 어휘 ("출시!", "한정", "지금 바로") → 알고리즘 페널티
- 개인 SNS 톤 (이모지 도배, 캐주얼 줄임말)
- 첫 줄에 외부 링크 (페널티)
- 회사 프로필 `banned.words / topics / claims` 위반
- 글로벌 콘텐츠인데 한국어 전용 표현 (글로벌 페르소나 못 읽음)

## 콘텐츠 타입별 권장 형식

| 타입 | 길이 | 미디어 | cadence |
|------|------|--------|---------|
| 인사이트·관점 | 800~1,200자 | 없음 또는 1장 | `single` |
| 케이스 스터디 | 1,000~1,500자 + 캐러셀 5장 | 캐러셀 PDF | `single` (캐러셀로 시리즈 통합) |
| 데이터 가이드 | 600~900자 + 캐러셀 7~10장 | PDF 인포그래픽 | `series-7` 또는 `series-10` |
| 제품 업데이트 | 400~600자 | 스크린샷 1~2장 | `single` |
| 채용 | 600~800자 | 팀 사진 1장 | `single` |

## 🎨 이미지 가이드 (LinkedIn)

> 공통 6-component 공식은 `harness/agents/image-director.md` 참조.

### LinkedIn 특수 (B2B 톤)

| 항목 | Instagram | **LinkedIn** |
|------|----------|------------|
| 배경 | 어두운 풀-블리드 | **밝은 배경 + 흰 카드** (구조적·신뢰감) |
| Aspect | 4:5 portrait | **1:1 square** (캐러셀 PDF) |
| Hero 크기 | 120px+ | 80~120px (B2B 절제) |
| 톤 | 임팩트·glow | **데이터 중심·구조적** |
| 필수 요소 | pill + brand mark | **Quote block / Stat card badge / Divider** |
| 카테고리 라벨 | pill 필수 | eyebrow text + 작은 badge |
| 인물 | 자제 | **자제** (B2B는 데이터 우선) |

### 이미지 prompt 핵심 키워드

```
"structured B2B aesthetic, professional editorial composition,
data infographic feel, single brand accent (refined),
quote block or stat card with hairline border,
white background canvas, dark charcoal text tone for depth,
glow A subtle (not aggressive Instagram glow),
1080x1080 square for carousel"
```

### 캐러셀 PDF 구조 (LinkedIn 핵심)

| 카드 | 역할 | 디자인 |
|------|------|--------|
| 1 (cover) | hook | Stat Card — 핵심 수치 거대화, 제목 |
| 2-3 | 문제·맥락 | Quote Block 또는 Split Layout |
| 4-6 | 데이터·솔루션 | Stat Cards 또는 인포그래픽 |
| 7-9 | 사례·증거 | Quote Block |
| 마지막 | CTA | Carousel-friendly — "Connect / Visit / Book" |

> 캐러셀은 PDF 형태로 업로드. HTML+Playwright로 PNG 생성 후 PDF 변환은 별도 (현재는 PNG 직접 업로드).

## 발행 시간 권장

- 평일 화·수·목 오전 10~11시 (B2B 골든타임)
- 한국 시간대면 글로벌 도달 위해 오후 8~9시도 고려

## 회사 프로필 매핑

`copywriter`:
- `tone.preset` (calm/bold) → B2B 격식 톤으로 변환
- `targetAudience[]` 중 B2B 페르소나 우선 (글로벌 바이어 등)
- `keyMessage` → 첫 200자에 자연 삽입
- `banned.*` → 사후 검열
- `hashtags.always` + 전문 용어 3~5개

`image-director`:
- 6-component 공식 적용
- 채널 = linkedin → 밝은 배경 + 흰 카드 + 데이터 중심 + 1:1 square
- `imageStyle.aestheticDirection` 적용하되 **minimalist + modern** 우선 (B2B 매체)

## 발행 — browser-publish (크롬 쿠키)

레거시 LinkedIn API v2(OAuth2) 발행은 제거됨(2026-06). 사용자가 크롬에 LinkedIn 1회 로그인 → 쿠키 재사용.

```
node harness/bin/browser-publish.mjs <slug> --channel=linkedin --attach --pre-publish
```
→ 컴포저(PDF 캐러셀 첨부 포함)까지 자동으로 채우고 게시 직전에 멈춤. 사람이 [게시] 클릭.

## 참고

- LinkedIn API: https://learn.microsoft.com/en-us/linkedin/
- Marketing API: https://learn.microsoft.com/en-us/linkedin/marketing/

> **마지막 검증: 2026-05-07**
