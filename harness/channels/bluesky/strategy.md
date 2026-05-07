# Bluesky Strategy

Decentralized 마이크로블로깅 (AT Protocol). 분위기는 초기 Twitter + 개발자/디자이너 비중 높음. 광고·자동화 봇에 매우 민감.

## 한 줄 요약
**짧고 진솔한 한 줄 + 이미지 4장**. 초기 Twitter 같은 친밀한 톤. 광고 외침은 즉시 mute. 사람 목소리·관점·짧은 농담이 잘 받음.

## 채널 특성

| 항목 | 내용 |
|------|------|
| 글자 수 | **300자 한도** (한국어 ~150자) |
| 미디어 | 이미지 최대 4장 (영상 60초) |
| Aspect | 1:1 또는 16:9 또는 4:5 자유 |
| 첫 줄 | 가장 중요 — 단정·관점·숫자 |
| 해시태그 | **0~2개** (커뮤니티는 해시태그 거의 안 씀) |
| 링크 | 자유 (페널티 X) — 자체 호스팅 OK |
| 시리즈 | 답글 체인 OK (`cadence: thread`) |
| API | AT Protocol (App Password) |

## 콘텐츠 원칙

1. **짧고 진솔**
   - 짧을수록 잘 받음. 1줄 관점 → 답글로 풀어쓰기
2. **광고 톤 절대 X**
   - "지금 신청" "한정" 같은 단어 즉시 mute
   - 사람 목소리 우선, 봇처럼 보이면 차단
3. **개발자·디자이너 친화 톤**
   - 기술 용어 자연스럽게 OK
   - 솔직한 의견·경험담 잘 받음
4. **시리즈는 답글 체인**
   - 1편 후킹 → 답글 2~3편으로 풀어쓰기
5. **이미지는 캐주얼**
   - 카드뉴스보다 스크린샷·캐주얼 사진이 잘 어울림

## 금기

- 자동 발행 봇 티 나는 패턴 (정확한 시간 발행, 똑같은 형식 반복)
- 광고 외침
- 해시태그 도배
- 회사 프로필 `banned.words / topics / claims` 위반
- 카드뉴스 풀-블리드 임팩트형 (Bluesky 톤과 충돌)

## 콘텐츠 타입별 권장 형식

| 타입 | 길이 | 미디어 | cadence |
|------|------|--------|---------|
| 짧은 관점 | ~150자 | 없음 | `single` |
| 이미지 첨부 한 줄 | ~100자 | 1~4장 | `single` |
| 시리즈 thread | 각 ~150자 × 3 | 0~1장 | `thread` |
| 솔직 후기·발견 | ~200자 | 스크린샷 1~2장 | `single` |

## 🎨 이미지 가이드 (Bluesky)

> 공통 6-component 공식은 `harness/agents/image-director.md` 참조.

### Bluesky 특수 (캐주얼 소셜 톤)

| 항목 | Instagram | **Bluesky** |
|------|----------|------------|
| 배경 | 어두운 풀-블리드 | **자연스러운** (밝은 OR 어두운 자유) |
| Aspect | 4:5 portrait | 1:1 또는 16:9 자유 |
| Hero 크기 | 120px+ | (Hero 개념 약함) |
| 톤 | 임팩트·glow | **친근·캐주얼·진솔** |
| 필수 요소 | pill + brand mark | (필수 X — 자연스럽게) |
| 인물 | 자제 | **OK** (소셜 톤이라) |

### 이미지 prompt 핵심 키워드

```
"casual social aesthetic, friendly approachable composition,
natural light, hand-drawn or illustrative feel,
no aggressive marketing visual, soft brand presence,
1080x1080 square or 16:9 landscape (relaxed)"
```

### 사용 권장도

- **짧은 관점**: 이미지 없는 게 더 잘 받음
- **이미지 첨부**: 1~2장 캐주얼 (카드뉴스 X)
- **스크린샷·다이어그램**: 개발자·디자이너 친화 콘텐츠라면 적극

## 회사 프로필 매핑

`copywriter`:
- `tone.preset` → 한 단계 더 캐주얼하게 변환 (formal → friendly)
- `tone.voiceNotes` → 자연스러운 일상 언어로 보정
- `targetAudience[]` 중 개발자·디자이너 페르소나 우선
- 해시태그 0~2개 (always 만 또는 생략)

`image-director`:
- 6-component 공식 적용하되 **casual 모드**
- 채널 = bluesky → 밝거나 어두운 자유, 친근 톤, glow 약하게
- `imageStyle.aestheticDirection` "playful" 또는 "editorial"이면 잘 어울림

## 업로드 (AT Protocol)

```
POST xrpc/com.atproto.repo.createRecord
- collection: app.bsky.feed.post
- record: { text, createdAt, embed: { images } }
- handle + appPassword 인증
```

자세한 어댑터: `harness/src/publisher/adapters/bluesky.mjs`

## 참고

- AT Protocol: https://docs.bsky.app/docs/get-started
- App Password: https://bsky.app/settings/app-passwords (5초 발급)

> **마지막 검증: 2026-05-07**
