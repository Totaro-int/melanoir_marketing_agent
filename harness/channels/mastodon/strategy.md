# Mastodon Strategy

Decentralized 마이크로블로깅 (Fediverse). 인스턴스별 톤이 다르지만 공통적으로 **광고 톤·자동화 봇에 매우 민감**. 개발자·디자이너·오픈소스 커뮤니티 비중 높음.

## 한 줄 요약
**500자 제한 + 사람 목소리 + open culture**. 광고 외양은 즉시 mute/block. 톤은 Bluesky와 비슷하지만 더 길게 쓸 수 있음. CW(Content Warning) 활용으로 길게 쓰면 환영.

## 채널 특성

| 항목 | 내용 |
|------|------|
| 글자 수 | 500자 한도 (인스턴스마다 다름, 일부는 5,000자까지) |
| 한국어 권장 | 250~400자 |
| 미디어 | 이미지·영상 4장까지 |
| Aspect | 1:1 또는 16:9 자유 |
| 첫 줄 | 가장 중요 — TL/HOME 노출 cut |
| 해시태그 | **2~5개** (Twitter처럼) — Mastodon 검색은 해시태그 의존 |
| 링크 | 자유 (페널티 X) |
| CW (Content Warning) | 긴 글·민감 주제 시 활용 |
| 시리즈 | 답글 체인 OK |
| API | Mastodon API (Instance + access token) |

## 콘텐츠 원칙

1. **사람 목소리**
   - 1인칭 자연스럽게, 회사 페르소나 일관
   - 봇 패턴 (정시 발행·정형 형식) → 즉시 차단
2. **CW 활용**
   - 긴 글이나 토픽 민감하면 CW로 묶고 펼치게 함
   - 광고성 콘텐츠 절대 X (CW 써도 신뢰 X)
3. **해시태그 적극**
   - Mastodon은 알고리즘 추천 X — 검색은 해시태그 의존
   - 2~5개 적절한 long-tail 권장
4. **인스턴스 문화 존중**
   - mastodon.social: 일반 / fosstodon.org: 오픈소스 / hachyderm.io: tech
   - 발행 인스턴스 톤 확인 후 아카이브
5. **답글 응대**
   - 사용자 답글 적극 응대 (Mastodon은 대화 매체)

## 금기

- 자동 봇 패턴 (정시 발행·이모지 도배·정형 머리말)
- 광고 외침 ("지금 신청", "한정 특가")
- 해시태그 도배 (5개+ 권장 한도 초과)
- 회사 프로필 `banned.words / topics / claims` 위반
- 인스턴스 문화 무시 (예: 정치 인스턴스에 광고)

## 콘텐츠 타입별 권장 형식

| 타입 | 길이 | 미디어 | cadence |
|------|------|--------|---------|
| 짧은 관점 | ~200자 | 없음 | `single` |
| 케이스 스터디 | 400~500자 + 이미지 | 1~2장 | `single` |
| Thread (대화) | 각 ~250자 × 3~5편 | 첫 편 1장 | `thread` |
| 솔직 후기·발견 | ~300자 | 스크린샷 1장 | `single` |
| 긴 글 (CW 활용) | ~500자 + CW | 0~1장 | `single` |

## 🎨 이미지 가이드 (Mastodon)

> 공통 6-component 공식 + `harness/agents/image-director.md` 참조.

### Mastodon 특수

| 항목 | Instagram | **Mastodon** |
|------|----------|------------|
| 배경 | 어두운 풀-블리드 | **자유** (Bluesky와 비슷) |
| Aspect | 4:5 portrait | 1:1 또는 16:9 |
| 톤 | 임팩트·glow | **친근·기술 친화** |
| 인물 | 자제 | **OK** (소셜 톤) |
| 장식 | pill + brand mark | (필수 X) 자연스럽게 |

### 이미지 prompt 핵심

```
"casual friendly composition, open source / tech community aesthetic,
hand-drawn or illustrative feel, soft brand presence,
no aggressive marketing visual, natural light"
```

## 발행 시간 권장
- 평일 오전 9~11시, 저녁 19~22시
- Fediverse는 글로벌 → 시간대 다양

## 회사 프로필 매핑

`copywriter`:
- `tone.preset` → 캐주얼하게 변환 (Bluesky보다 약간 길게)
- `targetAudience[]` 중 개발자·기술 친화 페르소나 우선
- 해시태그 2~5개 적극 (검색 의존)

`image-director`:
- 6-component 공식 적용
- 채널 = mastodon → 자유 비율, 친근 톤, 인물 OK

## 발행 — 비활성

이 채널은 비활성(`channels.json` status=disabled). 레거시 API/OAuth 발행은 2026-06 제거됨.
현재 browser-publish(크롬 쿠키)는 naver-blog / tistory / brunch / instagram / threads / linkedin 만 지원.

## 참고

- Mastodon API: https://docs.joinmastodon.org/api/
- Instance 선택 가이드: https://joinmastodon.org/servers

> **마지막 검증: 2026-05-08**
