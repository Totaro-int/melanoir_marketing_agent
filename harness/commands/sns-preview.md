---
name: sns-preview
description: 캠페인 채널별 draft를 콘솔에 예쁘게 렌더링. 가디언 결과·해시태그·자산 경로 포함.
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


# /sns-preview

```
/sns-preview <slug>                      # 모든 채널
/sns-preview <slug> --channel=threads    # 특정 채널만
```

내부적으로 `node bin/preview.mjs <slug> [--channel=...]` 실행. draft가 없으면 어떤 명령으로 만드는지 안내한다.

이 단계가 **휴먼 승인 게이트**의 시작점. 여기서 사용자가 한 번 본 뒤 `/sns-approve` 또는 `/sns-reject`.
