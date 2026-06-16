# Naver Blog Strategy

> ⚠️ **공통 정보성 블로그 가이드는 [`../blog/strategy.md`](../blog/strategy.md) 참조.**  
> 본 문서는 네이버 블로그 매체 특수 차이 + 발행(browser-publish) 안내만.

## 한 줄 요약
**네이버 D.I.A. + C-Rank 알고리즘 친화 + 검색 의도 충족**.  
공통 9대 패턴은 `../blog/strategy.md` 적용.

## 네이버 매체 특수 차이

| 항목 | 값 / 정책 |
|------|----------|
| 검색 알고리즘 | D.I.A. + C-Rank (네이버 자체) |
| 본문 길이 권장 | **1,500~2,000자** (블로그 공통 1,500~2,500보다 약간 짧게도 OK) |
| 제목 권장 | **25자 권장** (검색 결과 미리보기 최적). 한도 60자 |
| 태그 한도 | 30개 (10~15 권장 — long-tail 위주) |
| 이미지 | 자체 업로드, ALT 지원, 본문 중간 1~3장 권장 |
| 카테고리 | 네이버 자체 카테고리 (categoryNo 옵션) |
| 발행 빈도 | **7일에 2회** (네이버 권장 — 정기성이 알고리즘 가중치) |
| 상업성 톤 | 강함 — 직접 키워드 매칭 OK ("화장품 OEM 추천" 류) |
| B2B 적합도 | ★★★ (가장 검색 트래픽 많음) |

## 네이버 SEO 추가 디테일

- **타겟 키워드**: 변형하지 않고 똑같이 입력하거나 **앞단에 배치**
- **메인 키워드 사용**: 3~5회 (구글보다 약간 보수적)
- **이미지 ALT**: 메인 키워드 + 설명 → SEO 가중치
- **이웃 댓글·서로이웃**: 알고리즘 신호 (커뮤니티 활성도)
- **광고 분류 시**: 본문 시작에 `본 포스팅은 광고임을 알립니다` 또는 `legal.adHashtag` 표시 (한국 공정위)

## 발행 — browser-publish (크롬 쿠키)

레거시 Naver OpenAPI 발행은 제거됨(2026-06). 사용자가 크롬에 네이버 1회 로그인 → 쿠키 재사용.

```
node harness/bin/browser-publish.mjs <slug> --channel=naver-blog --attach --pre-publish
```
→ 블로그 에디터까지 자동으로 채우고 게시 직전에 멈춤. 사람이 [발행] 클릭.
대시보드 [발행] 버튼 · `npm run morning` 으로도 실행.

체크리스트: [`./checklist.md`](./checklist.md) (공통 + 네이버 추가)  
템플릿: 공통 [`../blog/templates/post.md`](../blog/templates/post.md) 사용

## 참고 링크

- 네이버 블로그 API: https://developers.naver.com/docs/blog/api/
- 네이버 SEO 가이드: https://searchadvisor.naver.com/guide
- 한국 광고 표시: 공정거래위원회 추천·보증심사지침

> **마지막 검증: 2026-05-07**
