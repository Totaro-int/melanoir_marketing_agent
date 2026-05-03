---
name: sns-onboard
description: 회사 프로필을 대화형으로 수집해 company-profile.yaml을 생성한다. 부분 업데이트는 /sns-onboard update <섹션>.
---
> 업데이트 체크: `node harness/bin/check-updates.mjs` 실행 → `OK` 면 진행, `UPDATE_AVAILABLE` 이면 사용자에게 업데이트 여부 질문 후 진행. (상세: `harness/commands/_update-check.md`)

# /sns-onboard

`sns-onboard-company` 스킬을 호출해 회사 프로필 인터뷰를 진행한다.

## 사용법

```
/sns-onboard                    # 전체 인터뷰 (최초 셋업)
/sns-onboard update tone        # tone 섹션만 다시 인터뷰
/sns-onboard update banned      # 금기어 섹션만
/sns-onboard show               # 현재 저장된 프로필 요약 출력
```

## 동작

1. **`/sns-onboard show`** → `node bin/profile-show.mjs` 실행 결과 출력. 스킬 호출 없음.
2. **`/sns-onboard update <섹션>`** → 스킬을 update 모드로 호출. 해당 섹션만 인터뷰 후 머지 저장.
3. **`/sns-onboard`** (프로필 없음) → 스킬을 full 모드로 호출. 7단계 인터뷰.
4. **`/sns-onboard`** (프로필 있음) → "전체 다시 / 부분 업데이트 / 그대로" 3택.
5. 저장 직후 반드시 `node bin/profile-validate.mjs` 실행해 검증. 실패하면 깨진 필드만 다시 인터뷰.
6. 저장 직후 `git status` 한 줄 확인 — `company-profile.yaml`은 `.gitignore` 대상이라 빨간색으로 안 보여야 정상.

## 산출물

- `./company-profile.yaml` (gitignore 대상)
- 다음 단계 안내: `/sns-campaign-new "<주제>"`
