---
name: onboard
description: 회사 프로필을 대화형으로 수집해 company-profile.yaml을 생성한다. 부분 업데이트는 /onboard update <섹션>.
---

# /onboard

`onboard-company` 스킬을 호출해 회사 프로필 인터뷰를 진행한다.

## 사용법

```
/onboard                    # 전체 인터뷰 (최초 셋업)
/onboard update tone        # tone 섹션만 다시 인터뷰
/onboard update banned      # 금기어 섹션만
/onboard show               # 현재 저장된 프로필 요약 출력
```

## 동작

1. `company-profile.yaml` 존재 여부 확인
2. 없으면 → 전체 인터뷰
3. 있으면 → `update <섹션>`이 있으면 그 섹션만, 없으면 변경 여부 묻기
4. `onboard-company` 스킬에 인터뷰 위임
5. 저장 직후 `git status`로 `.gitignore` 적용 확인

## 산출물

- `./company-profile.yaml` (gitignore 대상)
- 다음 단계 안내: `/campaign new "<주제>"`
