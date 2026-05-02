# Channels

채널별 마케팅 전략 팩. 각 채널 디렉터리는 동일한 표준 구조를 따른다:

```
channels/<channel>/
├── strategy.md          # 채널 특성·원칙·금기·우선순위 (필수)
├── checklist.md         # 발행 전 점검 체크리스트 (필수)
└── templates/
    └── post.md          # 카피 템플릿 (필수, 여러 개 가능)
```

## 새 채널 추가하기

1. `channels/<id>/` 디렉터리 생성
2. `channels/threads/`를 reference로 복사 후 수정
3. `plugin.json`의 `channels[]`에 등록
   ```json
   {
     "id": "<id>",
     "status": "reference" | "active" | "planned" | "deprecated",
     "path": "channels/<id>"
   }
   ```
4. PR로 리뷰 — 특히 `strategy.md`의 "금기" 섹션은 반드시 채널 ToS 확인

## 상태 라벨

| status     | 의미 |
|------------|------|
| reference  | 표준 구조의 모범 사례 (현재: `threads`) |
| active     | 실 운영중 |
| planned    | 다음 추가 예정 (현재: `linkedin`) |
| deprecated | 더 이상 사용 안 함 |

## 현재 상태

| 채널 | status | 업로드 모드 | 비고 |
|------|--------|------------|------|
| threads | reference | Graph API | Phase 1 완성 |
| linkedin | planned | UGC API | Phase 4 |
| instagram | — | Graph API (Business) | Phase 4 |
| facebook | — | Pages API | Phase 4 |
| youtube | — | Data API v3 | Phase 5+ |
| x | — | 유료 API | Phase 5+ |
| tiktok | — | Content Posting API | Phase 5+ |
| naver_blog | — | Playwright (옵트인) | Phase 6+ |
