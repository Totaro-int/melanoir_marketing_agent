---
name: sns-run
description: 단일 진입점 — 캠페인 생성·생성·preview·승인·발행을 한 번에. 사용자가 인자를 다 주면 바로 실행, 비면 최소 정보만 묻는다.
---
## 호출 직전 자동 업데이트 체크 (반드시 먼저 실행)

**아래 명령을 실행하고 결과를 확인하라:**

```bash
node harness/bin/check-updates.mjs
```

- 출력이 `OK` → 그대로 본 명령 진행.
- 출력이 `UPDATE_AVAILABLE <N> <branch> <root> <commit>` → **반드시** 사용자에게 물어라:
  > "marketing_agent 새 버전 <N>개 업데이트가 있습니다 (최신: <commit>). 지금 업데이트할까요?"
  - **예** → `git -C "<root>" pull origin <branch>` 실행 후 본 명령 진행.
  - **아니오** → 그대로 본 명령 진행 (30분 내 재질문 없음).

(30분 throttle — 매 호출마다 fetch 하지 않음.)

---


# /sns-run

캠페인 1건을 즉시 처리하는 슬래시 명령. 채널 선택은 회사 프로필 (`company-profile.yaml` 의 `channels.enabled`) 을 기본으로 따른다.

## 동작 원칙 (Claude 가 따를 것)

`/sns-run` 호출 시:

1. **인자가 충분하면** (주제 1줄 이상) → 바로 다음을 실행:
   ```bash
   node harness/bin/run.mjs --topic="<주제>" [추가 플래그] 
   ```
   - `--channels=` 가 없으면 스크립트가 알아서 `profile.channels.enabled` 를 사용. 사용자에게 채널을 묻지 말 것.
   - `--cadence` 기본 `single`. 사용자가 명시하면 그대로 통과.
   - `--approve --publish --dry-run` 같은 플래그도 그대로 통과.

2. **주제도 없으면** 한 줄만 묻기: "주제 한 줄로 알려주세요". 받자마자 위 1번처럼 실행.

3. **추가 정보가 필요한 경우만 질문**:
   - 사용자가 `--channels=` 명시하면 그대로 사용
   - 사용자가 명시 안 했고 `profile.channels.enabled` 도 비어있으면 → "어느 채널?" 질문. 이 경우엔 11개 전체 목록 보여주기:
     `threads, linkedin, instagram, facebook, x, reddit, bluesky, mastodon, pinterest, tiktok, youtube`

**불필요한 인터뷰 금지**. 채널/cadence/approve/publish 는 사용자가 안 정하면 스크립트의 기본값/profile 따름.

## 옵션 요약

| 플래그 | 의미 | 기본 |
|--------|------|------|
| `--channels=a,b,c` | 발행 채널 | `profile.channels.enabled` |
| `--cadence=single\|series-3\|series-5\|thread` | 카드 수 | `single` |
| `--goal=awareness\|consideration\|conversion` | 캠페인 목표 | profile 기본값 |
| `--approve` | 가드 통과 채널 자동 승인 | off |
| `--publish` | 승인 후 발행 시도 | off |
| `--dry-run` | publish 시 페이로드만 출력 (실 호출 X) | off |

## 안전장치

- 회사 금기어 들어가면 가드가 자동 reject → `needs_attention` 으로 표시
- `auth/<채널>.json` 없으면 publish 자체 거부 (자동으로 dry-run 만 동작)
- `.env.local` 에 `PUBLISHER_DRY_RUN=true` 두면 모든 publish 가 dry-run (운영 권장 기본값)

## 스케줄 (주/월 단위 N건 예약)

별도 명령으로 분리: `/sns-schedule` (`harness/bin/schedule-plan.mjs`). 이 명령은 **단건 즉시** 만 처리.

## 직접 실행 (Claude 없이 터미널)

```bash
node harness/bin/run.mjs --topic "신제품 런칭" --approve --publish --dry-run
```

`/sns-run` 은 위와 동일 명령을 spawn 할 뿐.
