---
name: sns-doctor
description: 로컬 환경(Node, deps, env, 자격증명, provider 헬스체크) 한눈 진단.
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


# /sns-doctor

```
/sns-doctor
```

내부: `node bin/doctor.mjs`. 다음을 점검:

| 그룹 | 항목 |
|------|------|
| runtime | Node 버전, package.json, node_modules |
| profile | company-profile.yaml 존재 |
| env | .env.local, CONTENT_ENGINE_PROVIDER |
| content-engine | mock/openai/fal/inhouse 각 provider healthcheck |
| publisher | auth/ 디렉터리 + 각 자격증명 파일 모드(0600), PUBLISHER_DRY_RUN 상태 |
| plugin | plugin.json |
| campaigns | campaigns/ 항목 수 |

실패 항목이 있으면 detail 컬럼에 다음 액션을 명시 (예: `npm install`, `cp .env.example .env.local`, `/sns-onboard`). exit code 0/1 로 CI 게이트에도 사용 가능.

## /sns-init 도 비슷한 일을 하나요?

`/sns-init`(skill)은 **새 사용자 첫 가이드** — `bin/setup.mjs` 를 권장하고 `/sns-onboard` 로 넘김. `/sns-doctor`는 **언제든 환경 점검**.
