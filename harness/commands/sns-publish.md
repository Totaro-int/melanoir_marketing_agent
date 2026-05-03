---
name: sns-publish
description: approved draft 를 채널에 발행. dry-run 기본 모드 권장 (PUBLISHER_DRY_RUN=true).
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


# /sns-publish

```
/sns-publish <slug> --channel=<ch>            # 실제 발행
/sns-publish <slug> --channel=<ch> --dry-run  # 페이로드만 출력, 네트워크 호출 없음
```

내부: `node bin/publish.mjs <slug> --channel=<ch> [--dry-run]`.

## 안전장치
- `brief.status[<ch>] === "approved"` 가 아니면 거부 (먼저 `/sns-approve`)
- `auth/<ch>.json` 없으면 거부 (먼저 `/sns-auth add <ch>`)
- `PUBLISHER_DRY_RUN=true` 환경변수 또는 `--dry-run` 플래그면 네트워크 호출 없이 페이로드만 dump
- 실패 시 `result.json` 에 에러 응답 저장하고 `status` 를 `failed` 로 갱신 (수동 재시도 가능)

## Phase 4 범위
- 본문 텍스트만 발행 (이미지·캐러셀은 Phase 4.1 에서 CDN 업로드 단계 추가)
- Threads / LinkedIn 두 채널만
- 1회 시도, 자동 재시도 없음 (지수 백오프는 4.1)
