---
name: sns-publish
description: approved draft 를 채널에 발행. dry-run 기본 모드 권장 (PUBLISHER_DRY_RUN=true).
---
> 업데이트 체크: `node harness/bin/check-updates.mjs` 실행 → `OK` 면 진행, `UPDATE_AVAILABLE` 이면 사용자에게 업데이트 여부 질문 후 진행. (상세: `harness/commands/_update-check.md`)

# /sns-publish

```
/sns-publish <slug> --channel=<ch>            # 실제 발행
/sns-publish <slug> --channel=<ch> --dry-run  # 페이로드만 출력, 네트워크 호출 없음
```

내부: `node bin/publish.mjs <slug> --channel=<ch> [--dry-run]`.

## 안전장치
- `brief.status[<ch>] === "approved"` 가 아니면 거부 (먼저 `/sns-approve`)
- `auth/<ch>.json` 없으면 거부 (먼저 `/sns-auth add <ch>`)
- dry-run 우선순위: `--dry-run` 플래그 > `PUBLISHER_DRY_RUN` env 변수 (둘 다 없으면 실제 발행). 실행 시 `(source: flag|env)` 로 출처 표시.
- 실패 시 `result.json` 에 에러 응답 저장하고 `status` 를 `failed` 로 갱신 (수동 재시도 가능)

## Phase 4 범위
- 본문 텍스트만 발행 (이미지·캐러셀은 Phase 4.1 에서 CDN 업로드 단계 추가)
- Threads / LinkedIn 두 채널만
- 1회 시도, 자동 재시도 없음 (지수 백오프는 4.1)
