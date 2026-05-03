---
name: sns-edit
description: 기존 draft 수정 또는 재생성. 피드백 재생성 / 직접 편집 / 이미지만 재생성 / 채널 폐기 4가지 분기.
---
> 업데이트 체크: `node harness/bin/check-updates.mjs` 실행 → `OK` 면 진행, `UPDATE_AVAILABLE` 이면 사용자에게 업데이트 여부 질문 후 진행. (상세: `harness/commands/_update-check.md`)

# /sns-edit

생성된 draft가 마음에 안 들 때 수정한다.

```
/sns-edit                                      # 최근 캠페인 목록에서 선택
/sns-edit <slug>                               # slug 지정
/sns-edit <slug> --channel=threads             # 채널까지 지정
/sns-edit <slug> --channel=threads --regen     # 피드백만 묻고 바로 재생성
/sns-edit <slug> --channel=threads --skip      # 해당 채널 폐기
```

---

## 실행 흐름

### 0단계 — 대상 선택
- `<slug>` 없음 → `node harness/bin/board.mjs` 로 최근 캠페인 표시 후 선택.
- `<slug>` 있고 `--channel` 없음 → 해당 slug 의 채널 상태 표 출력 후 선택.
- 둘 다 있음 → 바로 1단계.

### 1단계 — 현재 draft 표시
`node harness/bin/preview.mjs <slug> --channel=<ch>`

카피 본문 + 가디언 결과 + 자산 경로 출력.

### 2단계 — 수정 방법 선택
```
어떻게 수정할까요?
  1) 피드백 주고 재생성    (AI가 다시 작성)
  2) 카피 직접 편집        (draft.md 수정)
  3) 이미지만 다시 생성
  4) 이 채널 건너뜀        (skipped 처리)
```
`--regen` 플래그 시 1번 자동 선택. `--skip` 플래그 시 4번 자동 선택.

### 3단계A — 피드백 재생성
피드백 한 줄 입력.
```
node harness/bin/reject.mjs <slug> --channel=<ch> --reason="<피드백>"
node harness/bin/generate.mjs <slug> --channel=<ch>
```

### 3단계B — 직접 편집
```
campaigns/<slug>/<ch>/<timestamp>.yaml 의 text 필드를 수정하세요.
```
사용자가 파일 수정 후 Enter → brief.status[ch] = 'preview' 로 갱신.

### 3단계C — 이미지 재생성
`node harness/bin/generate.mjs <slug> --channel=<ch> --images=1`
카피는 유지하고 이미지만 재호출.

### 3단계D — 채널 폐기
`brief.status[<ch>] = 'skipped'` 로 직접 갱신.

### 4단계 — 결과 확인 + 다음 단계
**칸반 자동 표시**: `node harness/bin/board.mjs <slug>`

```
이대로 발행할까요?
  [Y] approve + publish
  [N] 다시 수정  (/sns-edit <slug> 재실행)
```
Y 선택 시:
```
node harness/bin/approve.mjs <slug> --channel=<ch>
node harness/bin/publish.mjs <slug> --channel=<ch>
```
