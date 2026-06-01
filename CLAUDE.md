# CLAUDE.md — marketing_agent 하네스

## 이 프로젝트는 Claude Code 플러그인 하네스입니다

이 레포는 **Claude Code 플러그인으로 설치해야만 동작합니다.**
일반 코드 프로젝트가 아니며, 플러그인 없이 파일만 열어서 사용하는 것은 의도된 사용법이 아닙니다.

```
# 1. 마켓플레이스 등록 (클론한 절대 경로)
/plugin marketplace add /path/to/marketing_agent

# 2. 설치
/plugin install marketing_agent@marketing_agent

# 3. 재로드
/plugin reload
```

설치 후 `/help` 에서 `/sns-start`, `/sns-repeat`, `/sns-edit`, `/sns-doctor` 가 보이면 준비 완료.

---

## 하네스 구조

이 플러그인은 3계층으로 동작합니다:

```
커맨드 (4개, 사용자 호출)
  └─ 스킬 (3개, 커맨드가 invoke)
       └─ bin 스크립트 (25개, 스킬이 실행)
```

### 커맨드 → 스킬 위임 관계

| 커맨드 | 위임하는 스킬 | 단계 |
|--------|-------------|------|
| `/sns-start` | `sns-copy-generation` | 4단계 카피·이미지 생성 |
| `/sns-start` | `sns-brand-review` | 5단계 브랜드 검수 |
| `/sns-repeat` | `sns-copy-generation` | generate 단계 |
| `/sns-repeat` | `sns-brand-review` | preview 단계 |

전체 플로우 흐름은 `sns-campaign-flow` 스킬을 참조한다.

### 스킬 목록

| 스킬 | 역할 |
|------|------|
| `sns-campaign-flow` | 전체 8단계 캠페인 플로우 |
| `sns-copy-generation` | spec→에이전트→finalize 2단계 생성 패턴 |
| `sns-brand-review` | 결정론적 + LLM 브랜드 검수 2단계 패턴 |

### 에이전트 목록

| 에이전트 | 역할 |
|---------|------|
| `copywriter` | copy-spec.json 처리 → copy-output.json |
| `image-director` | slide-spec.json 처리 → HTML + agent-output.json |
| `brand-guardian` | 브랜드 톤·금기어·일관성 검사 |
| `publisher` | 채널 API/브라우저 발행 |

---

## 파일 구조

```
.claude-plugin/plugin.json   ← 플러그인 매니페스트
skills/                      ← 스킬 3개 (플러그인 루트 — Claude Code가 자동 인식)
harness/
  commands/                  ← 사용자 커맨드 4개 + 내부 가이드 14개(_sns-*)
  agents/                    ← 에이전트 4개
  bin/                       ← Node.js 스크립트 25개
  channels/                  ← 채널별 전략·톤·템플릿
posts/                       ← 생성된 캠페인 (gitignore)
auth/                        ← SNS 자격증명 (gitignore)
company-profile.yaml         ← 회사 프로필 (gitignore)
```

---

## 주의사항

- `auth/`, `company-profile.yaml`, `.env.local` 은 `.gitignore` 대상. 절대 커밋하지 않는다.
- 플러그인 업데이트 후 `/plugin reload` 필요.
- 자세한 설치/운영: `harness/docs/INSTALL.md`, `harness/docs/OPERATIONS.md`

## 개발자에게 인계할 때

코드 최적화 / 리팩토링 / 신기능 작업 전 **반드시** 읽어야 할 문서:

→ **`harness/docs/DEVELOPER-HANDOFF.md`**

이 문서에는:
- 절대 손대지 말 영역 (`auth/`, `posts/`, `company-profile.yaml`)
- 신중하게 손댈 영역 (광고법 검증 / dry-run safety / Chrome cookie 보존)
- `/s-skills` 각 sub-agent 별 작업 영역 분배
- 회귀 금지 함정 7가지 (dry-run 누락, Chrome 강제 종료, Windows 경로, CRLF, fal sync, env placeholder, selector drift)
- 최적화 추천 영역 (3200줄 dashboard 분할, brand-guardian 단위 테스트, browser-publish 채널별 분리)
- 검증 절차 + 코드 리뷰 체크리스트
