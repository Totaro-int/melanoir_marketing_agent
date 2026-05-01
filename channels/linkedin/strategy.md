# LinkedIn Strategy

LinkedIn(@linkedin) 회사 페이지 + 임직원 개인 프로필 채널 전략. B2B 의사결정자 도달이 목표.

## 한 줄 요약
**전문성·인사이트·산업 맥락**. 광고 톤은 외면당하지만, "내가 일하면서 배운 것"은 잘 받는다.

## 채널 특성

| 항목 | 내용 |
|------|------|
| 글자 수 | 본문 ~3000자 가능, **권장 800~1500자** ("more 펼치기" 후에도 읽힐 길이) |
| 첫 3줄 | 피드 노출 컷 — 여기서 클릭 결정 |
| 미디어 | 이미지 9장(캐러셀=PDF), 영상 10분, 문서(PDF) 업로드 |
| 해시태그 | 3~5개. 산업·역할 중심 (`#fintech #B2BSaaS #productmanagement`) |
| 멘션 | `@회사`, `@사람` 적극 활용 (도달 부스트) |
| 외부 링크 | 본문에 두면 노출 페널티 → **댓글 첫 줄에 링크** 패턴이 정석 |
| 발행 시간 | 평일 오전 7~10시 (출근길), 화·수·목이 베스트 |
| API | UGC API (OAuth, scope: `w_member_social` 또는 `w_organization_social`) |

## 콘텐츠 원칙

1. **"이번 분기 우리는 X를 배웠다" 형식**
   - 회사 자랑(X) → 일하면서 알게 된 통찰(O)
2. **첫 3줄에서 결론·숫자·갈고리**
   - "1.8일." (한 줄) "지난해 5.2일이던 걸 줄였다." (한 줄) "방법은 의외로 단순했다." (한 줄)
3. **본문은 단락별로 1~3줄**
   - 빽빽한 문단 금지. 모바일 앱 가독성 절대 우선
4. **마지막 1문장은 질문**
   - "여러분의 팀은 어떻게 하시나요?" → 댓글 유도 (알고리즘 가중치)
5. **댓글에 출처·링크**
   - 본문 노출 페널티 회피 + 본인이 첫 댓글로 링크 다는 패턴

## 금기 (이 채널 한정)

- 슬로건/광고 카피 ("업계 최고의 솔루션을 만나보세요")
- 영업 직접 멘트 ("도입 문의는 DM 주세요" 본문에)
- 자뻑 ("우리 팀이 정말 자랑스럽습니다" 단독 — 맥락 없는 회사 자랑)
- 회사 프로필의 `banned.words / topics / claims` 위반

## 콘텐츠 타입별 권장 형식

| 타입 | 길이 | 미디어 | 비고 |
|------|------|--------|------|
| 인사이트(관점) | 800~1200자 | 없음 또는 캐러셀 1장 | 가장 잘 받음 |
| 케이스 스터디 | 1200~1800자 | 캐러셀 6~9장(=PDF) | 숫자 캐러셀 강력 |
| 제품/회사 업데이트 | 600~900자 | 스크린샷 1~2장 | 릴리스 노트 톤 |
| 채용 | 800~1200자 | 팀 사진 1~2장 | "우리는 _____를 찾습니다" 후킹 |
| 회고/연말정산 | 1500~2500자 | 캐러셀 | 1년에 1~2회 |

## 회사 프로필 매핑

`copywriter`가 카피 생성 시:
- `tone.preset`이 `friendly` 또는 `witty` 라도 LinkedIn에선 **professional 쪽으로 한 단계 보정**
- `targetAudience[].painPoints` → 첫 3줄 후킹의 재료
- `hashtags.always` + `hashtags.pool`에서 **산업 해시태그 3~5개** 선택 (Threads는 1~3, LinkedIn은 더 많이 OK)
- 본문에 외부 링크가 필요하면 → 본문 마지막에 "👇 댓글에 링크 달아둡니다" 표기 + 별도 첫 댓글 자동 생성

## 업로드 (Phase 4 — UGC API)

```
1. POST /v2/ugcPosts
   - author: urn:li:organization:{ORG_ID} 또는 urn:li:person:{PERSON_ID}
   - lifecycleState: PUBLISHED
   - specificContent.com.linkedin.ugc.ShareContent
2. (이미지/캐러셀이면 사전 register-upload → asset URN)
3. 발행 후 첫 댓글 자동 생성 (선택): POST /v2/socialActions/{shareUrn}/comments
```

자세한 어댑터 구현은 `publisher/linkedin/` 참조 (Phase 4).

## 참고 링크

- UGC Posts API: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/shares/ugc-post-api
- OAuth scopes: https://learn.microsoft.com/en-us/linkedin/shared/authentication/permissions

> **마지막 검증: 2026-05-01**
