# Reddit Strategy

Reddit 채널 전략. **서브레딧별 커뮤니티 톤이 모든 것**. 광고·자기홍보는 즉시 차단·다운보트. 정보 전달·진솔한 경험담이 핵심.

## 한 줄 요약
**서브레딧 룰 우선 + 정보·경험 우선 + 광고 톤 절대 X**. self-post (text) 마크다운이 본질. 텍스트 매체이므로 이미지 거의 사용 안 함.

## 채널 특성

| 항목 | 내용 |
|------|------|
| 글자 수 | self-post 본문 40,000자 (실제 권장 500~2,500자) |
| 미디어 | self-post 또는 link post 또는 image post (서브 룰 따라) |
| Aspect | (이미지 적게 씀) 1:1 또는 자유 |
| 첫 줄 | 제목이 전부 — title 가장 중요 |
| 해시태그 | (Reddit은 해시태그 없음 — 서브레딧이 그 역할) |
| 링크 | 서브 룰 확인 필수 (자기홍보 룰) |
| 시리즈 | 일반적이지 X — 단일 self-post 우선 |
| API | OAuth2 password (clientId+secret + user/pass) |

## 콘텐츠 원칙

1. **서브레딧 룰 첫 번째**
   - 각 서브레딧의 sidebar 룰 + automod 트리거 확인
   - 자기홍보 비율 룰 (10:1 ratio 등) 엄수
2. **정보 + 경험담**
   - "이렇게 해봤더니..." 진솔 경험 잘 받음
   - 데이터·근거 있으면 자동 권위
3. **광고 톤 절대 X**
   - "지금 사세요" "할인 중" → 즉시 차단
   - 회사명·제품명도 자제 (마지막 한 번 정도만)
4. **제목이 80% 결정**
   - 호기심·구체성·짧음. 클릭베이트 X (다운보트)
5. **답글 적극 응대**
   - OP가 댓글 응대 안 하면 노출 ↓
   - top 답글에 추가 정보·해명

## 금기

- 자기홍보 룰 위반 (대부분 서브 10:1 ratio 적용)
- 회사명·URL을 본문 첫 단락에 (자동 차단 트리거)
- 외부 링크 도배
- 회사 프로필 `banned.words / topics / claims` 위반
- 봇 티 나는 패턴 (이모지 도배·정형 형식)
- AI 생성 티 나는 글 (Reddit 사용자 매우 민감)

## 콘텐츠 타입별 권장 형식

| 타입 | 길이 | 미디어 | 적합 서브 |
|------|------|--------|--------|
| 경험담·후기 | 800~1,500자 self-post | 없음 | r/<niche> 커뮤니티 |
| 가이드·How-to | 1,500~2,500자 self-post | 없음 또는 1장 | r/<technical> 커뮤니티 |
| 질문·논의 | 200~500자 + 토론 유도 | 없음 | 거의 모든 서브 |
| 데이터·연구 | 1,000~2,000자 + 차트 1장 | 1~2장 | r/dataisbeautiful, r/<niche> |
| 사례 공유 | 800~1,200자 self-post | 없음 또는 1장 | r/<industry> |

## 🎨 이미지 가이드 (Reddit — 거의 X)

Reddit은 **본질적으로 텍스트 매체**. 이미지는 다음 경우만:

- **데이터 차트 1장**: r/dataisbeautiful, 데이터 시각화 적합 서브
- **결과·증거 스크린샷**: 경험담의 증거로
- **카드뉴스 절대 X** — 자기홍보로 분류되어 차단

만약 이미지 필요 시 6-component 공식 적용하되:
- 채널 = reddit → 극도 미니멀, 단색, 데이터 중심
- 광고 외양 절대 X (배너·로고 큰 것 금지)

```
"data visualization chart, plain background,
no branding visible, no marketing aesthetic,
single chart or screenshot,
factual presentation only"
```

## 회사 프로필 매핑

`copywriter`:
- `tone.preset` → 진솔·경험담 톤으로 변환
- 회사명·제품명 본문 첫 단락 X
- 마지막 1줄에만 disclaimer ("저희 회사 제품인데 도움 됐으면 좋겠어요" 류)
- 서브레딧 명시 필수 (`reddit.subreddit` 필드)

`image-director`:
- 일반적으로 호출 안 함 (이미지 거의 안 씀)
- 호출 시 데이터 차트 또는 단순 스크린샷만

## 업로드 (Phase 4 — Reddit OAuth2)

```
POST /api/submit
- sr: <subreddit>
- title, kind: self|link
- text (self) 또는 url (link)
- access_token (OAuth2 password grant)
```

자세한 어댑터: `harness/src/publisher/adapters/reddit.mjs`

**자격증명** (`auth/reddit.json`):
```json
{
  "clientId": "...",
  "clientSecret": "...",
  "username": "...",
  "password": "...",
  "userAgent": "marketing_agent/0.9 by your_username",
  "defaultSubreddit": "..."
}
```

## 참고

- Reddit API: https://www.reddit.com/dev/api/
- Self-promotion 룰: https://www.reddit.com/wiki/selfpromotion
- 각 서브 룰 (개별 sidebar 확인)

> **마지막 검증: 2026-05-07**
