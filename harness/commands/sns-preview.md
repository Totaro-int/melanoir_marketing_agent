---
name: sns-preview
description: 캠페인 채널별 draft를 콘솔에 예쁘게 렌더링. 가디언 결과·해시태그·자산 경로 포함.
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


# /sns-preview

```
/sns-preview <slug>                      # 모든 채널
/sns-preview <slug> --channel=threads    # 특정 채널만
```

내부적으로 `node bin/preview.mjs <slug> [--channel=...]` 실행. draft가 없으면 어떤 명령으로 만드는지 안내한다.

이 단계가 **휴먼 승인 게이트**의 시작점. 여기서 사용자가 한 번 본 뒤 `/sns-approve` 또는 `/sns-reject`.
