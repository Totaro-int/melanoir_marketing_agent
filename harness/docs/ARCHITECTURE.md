# Architecture

## 한 문장
Claude Code를 실행 엔진으로, GitHub 한 개로 배포되는 채널별 전략 팩을 로드하여, 회사 프로필을 인터뷰로 수집하고, 콘텐츠를 생성·승인·업로드하고, 진행 상황을 채널별 칸반으로 보여주는 사내·고객사용 SNS 마케팅 자동화 하네스.

## 컴포넌트

```
[ 사용자 ] ── Claude Code CLI ──┐
                                │
                                ▼
              ┌────────────────────────────┐
              │     marketing_ai plugin     │
              │   (Skills + Commands)       │
              └─────────┬──────────────────┘
                        │
       ┌────────────────┼────────────────┬────────────────┐
       ▼                ▼                ▼                ▼
[ channels/* ]    [ company-      [ content-engine ]  [ publisher ]
 채널별 전략·      profile.yaml ]   (Phase 3)           (Phase 4)
 톤·템플릿         로컬 저장        BYO 키 우선          공식 API 우선
                                   자사 API stub        Playwright 폴백
                        ▲
                        │ 진행상황 hooks
                        │
                ┌───────┴────────┐
                │   statusline   │  Phase 5: + Ink 보조 칸반
                └────────────────┘
```

## 데이터 흐름

1. `/sns-onboard` → `company-profile.yaml` 생성
2. `/sns-campaign-new "<주제>"` → `campaigns/<slug>/brief.yaml`
3. 채널별 카피 + 카드뉴스 → `campaigns/<slug>/<channel>/draft.md`
4. 휴먼 승인 게이트 → 사용자가 CLI에서 approve / reject / edit
5. Publisher 업로드 → `campaigns/<slug>/<channel>/result.json`
6. `/sns-status` → 채널별 칸반 보드

## 보안 원칙

- **자격증명 로컬만**: 회사 프로필·SNS 세션·BYO API 키는 사용자 머신에만. 자사 서버 무보관.
- **휴먼 승인 게이트**: 자동 발행은 옵트인. 기본은 preview → approve → publish.
- **자동화 ToS 준수**: 공식 API가 있는 채널은 무조건 API. Playwright는 옵트인 채널에만.

## Claude Code 통합 지점

| 통합 | 용도 |
|------|------|
| Skills | 채널별 카피라이팅 노하우, 톤가이드, 체크리스트 |
| Commands | `/sns-onboard`, `/sns-campaign-new`, `/sns-status` |
| Subagents | (Phase 3+) `copywriter`, `image-director`, `brand-guardian` |
| Hooks | PostToolUse로 진행상황 이벤트 push (Phase 5) |
| statusLine | 현재 단계 한 줄 표시 |
| MCP Server | (선택) content-engine·publisher를 MCP로 노출 |

## 채널 정책 요약

| 채널 | 모드 | 비고 |
|------|------|------|
| Threads | Graph API | Reference 채널 (Phase 1) |
| LinkedIn | UGC API (OAuth) | Phase 4 |
| Instagram (Business) | Graph API | Phase 4 |
| Facebook Page | Graph API | Phase 4 |
| YouTube | Data API v3 | Phase 5+ |
| TikTok | Content Posting API | 심사 필요, Phase 5+ |
| X | 유료 API | 비용 검토 후 Phase 5+ |
| Naver Blog | Playwright | 공식 API 없음, 옵트인 |
