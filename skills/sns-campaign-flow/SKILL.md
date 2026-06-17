---
name: sns-campaign-flow
description: Use when orchestrating a full SNS marketing campaign in the marketing_agent harness. Covers env-check → profile → campaign-new → keywords → generate → preview → human-gate → publish → slot-save.
---

# SNS 캠페인 플로우

marketing_agent 하네스에서 신규 캠페인을 처음부터 발행까지 진행하는 표준 8단계 플로우.

## 단계별 흐름

| 단계 | 동작 | 핵심 체크 |
|------|------|-----------|
| 0. 환경 점검 | `node harness/bin/doctor.mjs --quick` | 빨간 항목 → `/sns-doctor` 안내 후 계속 여부 질문 |
| 1. 프로필 확인 | `company-profile.yaml` 존재 확인 | 없으면 `_sns-onboard-company.md` 실행 → `profile-validate.mjs` |
| 2. 슬롯 분기 | `node harness/bin/slots.mjs list` | 슬롯 있으면 재사용 권유; N 선택 시 3단계 진행 |
| 3. 캠페인 설정 | `node harness/bin/campaign-new.mjs <주제> [--channels] [--goal] [--cadence]` | `posts/campaigns/<slug>/brief.yaml` 생성 |
| 3.5. 키워드 분석 | 채널별 키워드·해시태그·앵글 인라인 추출 | `keywords.json` 저장; banned 단어 즉시 필터링 |
| 4. 콘텐츠 생성 | `sns-copy-generation` 스킬 실행 | **칸반 자동 표시**: `node harness/bin/board.mjs <slug>` |
| 5. 미리보기 | `node harness/bin/preview.mjs <slug>` | draft 카피 + guardian 결과 + 자산 경로 |
| 6. 휴먼 게이트 | Y / S(예약) / 채널명 / N | `--no-publish` 시 이 단계 skip, approve만 저장 |
| 7. 발행 | browser-publish(크롬 쿠키) — 대시보드 [발행]·`npm run morning`·`browser-publish.mjs --attach --pre-publish` | 사람이 [공유] 클릭; 채널 실패해도 나머지 계속 |
| 8. 완료 | **칸반 자동 표시** + 슬롯 저장 | `node harness/bin/slots.mjs save <slug>` (실패 무시) |

## 칸반 표시 시점 (반드시 지킬 것)

칸반은 **4단계(generate 완료 직후)** 와 **8단계(publish 완료 직후)** 두 번만 표시한다.

```bash
node harness/bin/board.mjs <slug>
```

## 분기 처리

**publishMode=scheduled** (6단계에서 S 선택 시):
- `brief.schedule[ch]`, `brief.autoPublish = true` 패치
- 7단계 즉시 발행 건너뜀 → 8단계 슬롯 저장 + 워커 설치 안내만

**publishMode=series** (시리즈 분산 선택 시):
- 3단계 직후 3-S단계로 점프: `schedule-plan.mjs` 일괄 생성
- 4~7단계 생략; 워커가 각 회차를 발행 시각에 처리

## 상세 가이드 위치

| 항목 | 경로 |
|------|------|
| 전체 흐름 | `harness/commands/sns-start.md` |
| 내부 단계 | `harness/commands/_sns-*.md` (14개) |
| copy 생성 패턴 | `sns-copy-generation` 스킬 |
| 브랜드 검수 | `sns-brand-review` 스킬 |
