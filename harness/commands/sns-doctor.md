---
name: sns-doctor
description: 로컬 환경(Node, deps, env, 자격증명, provider 헬스체크) 한눈 진단.
---
## 호출 직전 자동 업데이트 체크 (먼저 실행)

```bash
node harness/bin/check-updates.mjs
```

출력이 `OK` 면 그대로 본 명령 진행.

출력이 `UPDATE_AVAILABLE <N> <commit>` 면 사용자에게 묻기 — 예: "marketing_agent 새 버전 N개 (최신: <commit message>). 지금 업데이트할까요? (예/아니오)"

- **예** → `git -C <repo-root> pull origin <defaultBranch>` 실행 (defaultBranch 는 보통 main). pull 성공 후 본 명령 진행.
- **아니오** → 그대로 본 명령 진행. 30분 cache 라 다음 호출 때 다시 안 묻음.

(이 체크는 30분 throttle. 매 호출 fetch 안 함.)

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
