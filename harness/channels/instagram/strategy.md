# Instagram Strategy

Instagram(@business) 채널 마케팅 전략. 이 문서는 카피라이팅·이미지 단계(`copywriter` + `image-director` 서브에이전트)의 필수 입력이다.

## 한 줄 요약
**비주얼이 첫 진입, 캡션은 보조**. 첫 카드(hook)가 캐러셀 시청을 결정. 광고처럼 외치면 즉시 스킵당한다.

## 채널 특성

| 항목 | 내용 |
|------|------|
| 글자 수 | 캡션 본문 2,200자 한도, **첫 125자만 피드 미리보기** |
| 미디어 | 이미지·캐러셀 1~10장, 영상(릴스) 90초 이내 |
| Aspect | **1:1 (square 1080×1080)** 권장, 4:5 (portrait 1080×1350) 가능 |
| 첫 카드 | **hook 카드 단독으로 시선 멈춰야 함** (피드는 첫 카드만 보고 스크롤) |
| 해시태그 | **5~15개** (Threads/X와 다름. 30개 한도지만 5~15가 효과 최적) |
| 링크 | 본문 링크 클릭 X — "프로필 링크에서" 표현 권장 |
| 캐러셀 | 3~10장 카드뉴스 시리즈 (`cadence: series-3 / series-5`) |
| API | Instagram Graph API (Business Account 필수) |

## 콘텐츠 원칙

1. **비주얼 first, 카피 second**
   - 카드 디자인이 80%, 캡션이 20%의 임팩트
   - cardVisual은 image-director가 담당, 캡션은 copywriter가 담당
2. **첫 카드(hook)가 전부**
   - 인스타그램 피드는 첫 카드만 노출 — 거기서 스크롤이 멈춰야 캐러셀이 열림
   - Hero stat 120px+ / Eyebrow / Caption 1줄 — 임팩트 극대화
3. **어두운 배경 + glow 권장**
   - 인스타그램은 임팩트 매체. 수치·키워드가 빛나야 함 (image-director.md 참조)
4. **캡션은 두괄식 + 짧게**
   - 첫 125자에 핵심 메시지 (`peek` 영역)
   - 이후 본문은 펼침 클릭한 사람만 봄 → 보조 설명·CTA
5. **해시태그는 5~15개**
   - 캡션 끝에 줄바꿈 후 별도 블록
   - 또는 첫 댓글에 분리 (둘 다 알고리즘에 동일 노출)

## 금기 (이 채널 한정)

- 첫 카드에 텍스트 70% 이상 (피드에서 외면)
- 카드뉴스 마지막 카드에 광고 외침 ("지금 신청하세요!!!")
- 본문에 외부 링크 직접 (인스타는 클릭 X — "프로필 링크" 표현으로)
- 쓰레드식 짧은 카피만 + 비주얼 약한 카드 (Threads와 다른 매체)
- 회사 프로필의 `banned.words / topics / claims` 위반
- 광고 분류 시 `#광고` 또는 `#AD` 누락

## 콘텐츠 타입별 권장 형식

| 타입 | 카드 수 | 캡션 길이 | cadence |
|------|---------|---------|---------|
| 단일 인사이트 | 1장 | 100~250자 | `single` |
| 케이스 스터디 | 3장 (hook + body + cta) | 200~400자 | `series-3` |
| 가이드·교육 | 5~10장 | 300~500자 | `series-5` |
| 제품 런칭 | 3~5장 | 200~400자 | `series-3` 또는 `series-5` |
| 짧은 비포·애프터 | 2장 | 100~200자 | `series-2` (cardVisual 강조) |

## 첫 카드(hook) 디자인 원칙

> image-director.md "카드 레이아웃 카탈로그 5종" + "채널별 디자인 톤" 의 Instagram 행 참조.

- **레이아웃**: Stat Card 또는 Full-Bleed 우선
- **배경**: 어두운 (#0F172A 권장) 또는 강한 그라디언트
- **Hero stat**: 120px 이상, gradient text 또는 brand accent color
- **Eyebrow**: 18~22px, 카테고리·캠페인 라벨
- **Caption**: 26~32px, 1줄
- **장식**: Glow B (강하게), divider, accent dot 중 2개 이상

## 발행 시간 권장

- 평일 점심(12~13시), 저녁(19~21시), 주말 오후(14~17시)
- B2B 타겟 (이번 cos.totaro 같은 K-뷰티 OEM)이면 평일 점심·저녁 우선

## 회사 프로필 매핑

`copywriter`가 카피 생성 시:
- `tone.preset` + `tone.voiceNotes` → 캡션 호흡 (단, 인스타용으로 약간 친근하게 변환 가능)
- `targetAudience[].painPoints` → hook 카드 cardVisual의 핵심 메시지
- `banned.*` → 사후 검열
- `hashtags.always` + `hashtags.pool` (5~15개 선택)
- `legal.adDisclosureRequired` → `#광고` 또는 `legal.adHashtag` 자동 첨부

`image-director`가 카드 생성 시:
- `imageStyle.aestheticDirection` → 카드 분위기 (organic/modern/...)
- `visual.colors.{primary, accent, background}` → 카드 색상 (HTML 실제 색)
- `imageStyle.referencesBrands` → 시각 DNA 학습 (linear/stripe/vercel...)
- 채널 = instagram → 어두운 배경 + Glow B 권장

## 업로드 (Phase 4 — Instagram Graph API)

```
1. POST /me/media (image_url + caption + media_type=CAROUSEL_ALBUM)
   → 각 카드별 child media_id 생성
2. POST /me/media (carousel children + caption + product_tags 옵션)
   → carousel container creation_id
3. POST /me/media_publish?creation_id=... → 발행
4. (선택) GET /me/insights → 도달·노출
```

자세한 어댑터 구현은 `harness/src/publisher/adapters/instagram.mjs` 참조.

## 참고 링크

- Instagram Graph API: https://developers.facebook.com/docs/instagram-api
- Business Account 설정: https://help.instagram.com/1791090728226327
- 한국 광고 표시 규정: 공정거래위원회 추천·보증심사지침

> **마지막 검증: 2026-05-07**
