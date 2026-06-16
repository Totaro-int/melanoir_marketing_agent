# Threads Strategy

Meta Threads(@threads) 채널 마케팅 전략. 카피라이팅·이미지 단계(`copywriter` + `image-director` 서브에이전트)의 필수 입력.

## 한 줄 요약
**관점·통찰을 짧게**. 광고 카피처럼 들리면 즉시 외면. 사람 목소리로 쓰되 회사 톤 유지. 첫 1~2줄에서 스크롤이 멈춰야 본문 펼침.

## 채널 특성

| 항목 | 내용 |
|------|------|
| 글자 수 | 본문 500자 한도, **첫 80자**가 피드 노출 컷 |
| 한국어 권장 | 250~450자 (단일) / 200~300자 × 3 (스레드) |
| 미디어 | 이미지·캐러셀 1~10장, 영상 5분 이내 |
| Aspect | **portrait 1080×1350** 권장 (1:1도 OK) |
| 해시태그 | **1~3개** (인스타와 다름. 5개+ 도배 시 외면) |
| 링크 | 허용되지만 노출 페널티 가능 — 본문 가치 우선 |
| 스레드 | 단일 + 답글 체인으로 시리즈 (`cadence: thread`) |
| 발행 | browser-publish (크롬 쿠키) |

## 콘텐츠 원칙

1. **관점이 먼저, 정보는 나중**
   - "데이터 보니 X가 늘었습니다" (X) → "Y는 끝났다고들 하는데, 우리 데이터는 정반대" (O)
2. **첫 줄은 후킹** (80자 안에 결판)
   - 단정 / 의외의 숫자 / 짧은 장면 묘사 / 통념 뒤집기
3. **'나/우리' 시점**
   - 1인칭으로 회사 페르소나 일관 ("샘플페이 팀에서 보니")
4. **마침표보다 줄바꿈**
   - 한 줄 한 호흡. 모바일 가독성 우선
5. **CTA는 본문 마지막 1줄**
   - "더 보기 → example.com/x" 정도. 강요 금지

## 금기 (이 채널 한정)

- 인스타식 해시태그 도배 (5개+)
- 광고문구형 어휘 ("지금 신청하세요!!!", "한정 특가")
- 외부 링크를 첫 줄에 (노출 페널티)
- 카드뉴스·시각이 인스타처럼 강한 임팩트형 (Threads는 텍스트 우선 매체)
- 회사 프로필 `banned.words / topics / claims` 위반

## 콘텐츠 타입별 권장 형식

| 타입 | 길이 | 미디어 | cadence |
|------|------|--------|---------|
| 인사이트(관점) | 250~400자 | 없음 또는 카드 1장 | `single` |
| 케이스 스터디 | 500자 + 카드 3~5장 | 카드뉴스 | `single` 또는 `thread` |
| 제품 업데이트 | 200~300자 | 스크린샷 1~2장 | `single` |
| 채용 | 300자 | 분위기 사진 1장 | `single` |
| 시리즈 (티저→본문→마무리) | 각 200~300자 | 통일된 카드 | `thread` (3편) |

## 🎨 이미지 가이드 (Threads)

> 공통 6-component 공식 + 한국 카드뉴스 톤은 `harness/agents/image-director.md` 참조.

### Threads 특수 (Instagram과 다른 점)

| 항목 | Instagram | **Threads** |
|------|----------|------------|
| 배경 | 어두운 풀-블리드 우선 | **밝은 배경 우선** (#F8FAFC) — Editorial clean |
| 톤 | 임팩트·glow 강함 | **차분한 editorial 톤** — accent bar, 충분한 여백 |
| Hero 크기 | 120px+ (극대화) | 80~100px (강하지만 절제) |
| 카테고리 라벨 | 알약 pill 필수 | eyebrow text 또는 작은 pill (선택) |
| Brand mark | 우상/우하단 굵은 마크 | 우하단 작고 절제 |
| 텍스트 점유 | 30~40% | **30~50%** (텍스트 더 가능, editorial이라) |
| 깊이감 | Glow B 강하게 | accent bar + 1 divider |

### 이미지 prompt 핵심 키워드 (image-director가 자동 합성)

```
"editorial clean composition, considered minimalism, accent bar with eyebrow text,
plenty of negative space, soft natural light, premium serif typography accent,
brand color hex from profile, no glow burst (Threads ≠ Instagram impact)"
```

### 카드뉴스 사용 권장도

- **인사이트(관점)**: 카드뉴스보다 **텍스트만**이 더 잘 읽힘 (Threads의 본질)
- **케이스 스터디**: 카드뉴스 3~5장 추천 (수치 시각화)
- **시리즈(thread)**: 각 답글에 카드 1장씩 통일 디자인

## 발행 시간 권장

- 평일 출근(8~9시), 점심(12~13시), 퇴근(18~19시)
- B2B 타겟이면 오전 우선, B2C는 저녁 우선

## 회사 프로필 매핑

`copywriter`:
- `tone.preset` + `tone.voiceNotes` → 문장 호흡·종결어미
- `tone.sampleSentences` → 모방 학습용
- `targetAudience[].painPoints` → **첫 줄 후킹의 재료**
- `banned.*` → 사후 검열
- `hashtags.always` + `hashtags.pool` (1~3개만)

`image-director`:
- 6-component 공식 자동 적용 (industry/aesthetic/colors/mood/position/negative)
- 채널 = threads → editorial clean + 밝은 배경 + 절제된 brand mark
- aestheticDirection 그대로 반영 (organic/minimalist/modern/editorial 등)

## 발행 — browser-publish (크롬 쿠키)

레거시 Threads Graph API 발행은 제거됨(2026-06). 사용자가 크롬에 Threads(인스타그램) 1회 로그인 → 쿠키 재사용.

```
node harness/bin/browser-publish.mjs <slug> --channel=threads --attach --pre-publish
```
→ 컴포저까지 자동으로 채우고 게시 직전에 멈춤. 사람이 [게시] 클릭.

## 참고

- Threads API: https://developers.facebook.com/docs/threads
- Meta Platform Terms: https://developers.facebook.com/terms/

> **마지막 검증: 2026-05-07**
