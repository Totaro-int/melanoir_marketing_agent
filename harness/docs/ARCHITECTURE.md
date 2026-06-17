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
 톤·템플릿         로컬 저장        inhouse-slides 기본  공식 API 우선
                                   (API 키 불필요)      자사 스크린샷 폴백
                        ▲
                        │ 진행상황 hooks
                        │
                ┌───────┴────────┐
                │   statusline   │  Phase 5: + Ink 보조 칸반
                └────────────────┘
```

## 사용자 진입점 — 4개 슬래시 명령

`plugin.json` 의 `commands` 배열에 등록된 사용자 노출 스킬은 정확히 4개입니다.

| 스킬 | 트리거 |
|---|---|
| `/sns-start` | 처음 사용 또는 새 캠페인 (전체 플로우) |
| `/sns-repeat` | 슬롯 재실행·예약·시리즈 |
| `/sns-edit` | 진행 중 캠페인 수정 |
| `/sns-doctor` | 환경 진단·자격증명·프로필 업데이트 |

이 4개 스킬은 `harness/commands/_sns-*.md` 내부 가이드 14개를 단계별로 참조하며 진행합니다 (`_` prefix = 사용자 직접 호출 안 함). 가이드는 다시 `harness/bin/*.mjs` 25개 스크립트를 호출합니다. 즉 **3계층**: 스킬 4 → 내부 가이드 14 → bin 스크립트 25.

## 데이터 흐름 (`/sns-start` 한 줄로 자동 진행)

1. `_sns-init.md` → `bin/doctor.mjs --quick` 환경 점검
2. `_sns-onboard-company.md` (프로필 없을 때) → `company-profile.yaml` 생성
3. `bin/slots.mjs list` → 슬롯 분기 (있으면 재사용 권유)
4. `_sns-campaign-new.md` → `bin/campaign-new.mjs` → `posts/campaigns/<slug>/brief.yaml`
5. `_sns-generate.md` → `bin/generate.mjs` → 채널별 `copy-spec.json` + `slide-spec.json` (학습 가이드 자동 주입, sampleCount ≥ 3 일 때)
6. **Copywriter 에이전트** → `copy-spec.json` → `copy-output.json`
7. **이미지 생성**:
   - **inhouse-slides** (기본값): image-director 에이전트 → HTML → Playwright → `card*.png`
   - **fal/openai** (opt-in): provider API → `card*.png`
8. `bin/generate.mjs --finalize` → `copy-output.json` + `card*.png` 병합 → `agent-output.json`
9. `_sns-preview.md` → `bin/preview.mjs` + `brand-guardian` 에이전트 검사 + `bin/inspect-guidelines.mjs`
10. 휴먼 승인 게이트 → `_sns-approve.md` / `_sns-reject.md`
11. `bin/approve.mjs` → 승인 확정 + **`posts/preferences.yaml` 학습 hook 발동**
12. `bin/publish.mjs` 또는 `bin/browser-publish.mjs` → 채널 API/UI 발행 → `result.json`
13. `bin/sync-posts.mjs` → `posts/by-channel/<채널>/<슬롯-슬러그>/<캠페인>/` symlink 자동 갱신

## 학습 루프

```
approve/reject  →  preferences.yaml 누적 (1/n 가중 평균)
                       ↓
다음 generate  →  copy-spec.json / slide-spec.json 의 learnedPreferences 필드에 자동 주입
                       ↓
copywriter / image-director 에이전트 → 사용자 톤·길이·시각 선호 반영
```

신호: 본문 길이, 이모지/해시태그 수, 톤(격식/캐주얼), designRef·goal 빈도, 거절 사유.
신뢰도 게이트: 3건 미만 미주입 / 3-5건 `initial` / 5-10건 `building` / 10건+ `strong`.

## 보안 원칙

- **자격증명 로컬만**: 회사 프로필·SNS 세션·BYO API 키는 사용자 머신에만. 자사 서버 무보관.
- **휴먼 승인 게이트**: 자동 발행은 옵트인. 기본은 preview → approve → publish.
- **자동화 ToS 준수**: 공식 API가 있는 채널은 무조건 API. Playwright는 옵트인 채널에만.

## Claude Code 통합 지점

| 통합 | 용도 | 위치 |
|------|------|----------|
| Commands (사용자 노출) | 플러그인 진입점 4개 | `/sns-start`, `/sns-repeat`, `/sns-edit`, `/sns-doctor` |
| Commands (내부 가이드) | 4개 스킬이 단계별로 참조 | `harness/commands/_sns-*.md` (14개, 사용자 노출 X) |
| Subagents | 카피·이미지·검수·발행 | `harness/agents/` — copywriter, image-director, brand-guardian, card-evaluator, guideline-reviewer, publisher |
| Channels | 채널별 전략·톤·템플릿·체크리스트 | `harness/channels/<채널>/` (12개) |
| Skills (Claude Code skill 시스템) | 미사용 | `harness/skills/` 비어있음, plugin.json `"skills": []` |
| statusLine | 현재 단계 한 줄 표시 | `harness/statusline/` |
| MCP Server | (선택) content-engine·publisher를 MCP로 노출 | (선택) |

## 채널 정책 요약

| 채널 | 발행 | 비고 |
|------|------|------|
| naver-blog / tistory / brunch | browser-publish (크롬 쿠키) | 블로그 — 활성 |
| instagram / threads / linkedin | browser-publish (크롬 쿠키) | 소셜 — 활성 |
| facebook / x / reddit / bluesky / mastodon / pinterest | — | 비활성 (레거시 API 발행 제거, 2026-06) |
| tiktok / youtube | — | 비활성 (영상 전용) |
| TikTok | Content Posting API | 심사 필요, Phase 5+ |
| X | 유료 API | 비용 검토 후 Phase 5+ |
| Naver Blog | Playwright | 공식 API 없음, 옵트인 |
