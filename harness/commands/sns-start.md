---
name: sns-start
description: 새 캠페인 시작. 온보딩 → 생성 → 발행까지 전체 플로우. 처음 사용하거나 새 캠페인을 만들 때 사용.
---
> 업데이트 체크: `node harness/bin/check-updates.mjs` 실행 → `OK` 면 진행, `UPDATE_AVAILABLE` 이면 사용자에게 업데이트 여부 질문 후 진행. (상세: `harness/commands/_update-check.md`)

# /sns-start

첫 사용부터 발행까지 전체 캠페인 플로우를 한 번에 진행한다. 각 단계 완료 시 칸반 보드를 자동으로 표시하며, 완료 후 슬롯으로 저장해 `/sns-repeat` 에서 재사용 가능.

```
/sns-start                                        # 인터랙티브
/sns-start "신제품 런칭"
/sns-start "신제품 런칭" --channels=threads,linkedin --cadence=series-3
/sns-start --dry-run                              # 발행 단계만 dry-run
/sns-start --no-publish                           # approve 까지만, 발행 안 함
```

---

## 실행 흐름

### 0단계 — 환경 빠른 점검
`node harness/bin/doctor.mjs --quick` 실행. 빨간 항목 있으면 사용자에게 알리고 `/sns-doctor` 로 안내한 뒤 계속 진행 여부를 묻는다.

### 1단계 — 프로필 확인
`company-profile.yaml` 존재 여부 확인.
- **없음** → "처음 사용하시네요. 회사 프로필부터 만들게요." 안내 후 `sns-onboard-company` 스킬 (full 모드) 진행. 완료 후 `node harness/bin/profile-validate.mjs` 로 검증.
- **있음** → 프로필 로드 후 다음 단계.

### 2단계 — 슬롯 분기
`node harness/bin/slots.mjs list` 실행.
- **슬롯 1개 이상** → 다음을 표시하고 선택을 기다린다:
  ```
  이전 캠페인:
    1) 신제품 런칭 (threads, linkedin) — 2일 전
    2) 채용 공고 (linkedin) — 1주 전
    N) 새로 시작

  번호를 선택하거나 주제를 바로 입력하세요:
  ```
  - 번호 선택 → `/sns-repeat <번호>` 위임 후 이 명령 종료.
  - "N" 또는 새 주제 텍스트 → 3단계 진행.
- **슬롯 없음** → 안내 없이 3단계 진행.

### 3단계 — 캠페인 설정 + 소재 수집

인자로 주제가 있으면 바로, 없으면 한 줄 질문.
채널/goal/cadence 미지정 시 `profile.channels.enabled` 기본값 사용.

주제가 확정되면 다음 2가지를 추가로 묻는다:

```
핵심 메시지가 있나요? (없으면 Enter 스킵)
> 

이 포스트에 쓸 구체적인 소재가 있나요?
숫자, 데이터, 고객 반응, 특징 등을 줄바꿈으로 입력 (없으면 Enter 스킵)
> 
```

입력된 내용은 `--keyMessage=` `--contentPoints="포인트1|포인트2"` 플래그로 전달.

`node harness/bin/campaign-new.mjs "<주제>" [--channels=...] [--goal=...] [--cadence=...] [--keyMessage=...] [--contentPoints=...] [--angle=...]`

### 4단계 — 카피 + 이미지 생성
`node harness/bin/generate.mjs <slug>`

생성 완료 후 → **칸반 자동 표시 (1차)**: `node harness/bin/board.mjs <slug>`

### 5단계 — 미리보기
`node harness/bin/preview.mjs <slug>`

draft 카피, 가디언 결과, 자산 경로를 채널별로 출력.

### 6단계 — 휴먼 게이트
```
이 내용으로 발행할까요?
  [Y] 전체 채널 승인 + 발행
  [채널명] 특정 채널만  (예: threads)
  [N] 지금은 안 함  (/sns-edit <slug> 로 수정 가능)
```
- `--no-publish` 플래그 시 이 게이트를 skip하고 approve 상태로만 저장.

### 7단계 — 승인 + 발행
승인된 채널마다 순서대로:
1. `node harness/bin/approve.mjs <slug> --channel=<ch>`
2. `node harness/bin/publish.mjs <slug> --channel=<ch> [--dry-run]`
   - `auth/<ch>.json` 없으면 자동 dry-run 강제 + "자격증명 추가: `/sns-doctor auth add <ch>`" 안내.

### 8단계 — 완료
**칸반 자동 표시 (2차)**: `node harness/bin/board.mjs <slug>`

슬롯 저장: `node harness/bin/slots.mjs save <slug>` (실패해도 캠페인은 성공)

다음 단계 안내:
```
✅ 완료!
  · 다음 캠페인 반복: /sns-repeat
  · 내용 수정:        /sns-edit <slug>
  · 환경/계정 관리:   /sns-doctor
```

---

## 칸반 표시 시점
| 시점 | 이유 |
|------|------|
| 4단계 (generate 직후) | 채널별 drafting/preview 분포 확인 |
| 8단계 (publish 직후) | 최종 결과(✅ published / ❌ failed) 확인 |

---

## 에러 처리
- `company-profile.yaml` 없음 → 온보딩으로 분기 (중단 아님)
- `auth/<ch>.json` 없음 → dry-run 강제 (중단 아님)
- generate 실패 → 오류 메시지 출력 후 `/sns-doctor` 안내
- publish 실패 → `result.json` 저장 후 계속 (다른 채널은 진행)
