---
name: sns-edit
description: 기존 draft 수정 또는 재생성. 피드백 재생성 / 직접 편집 / 이미지만 재생성 / 채널 폐기 4가지 분기.
---
> 업데이트 체크: `node harness/bin/check-updates.mjs` 실행 → `OK` 면 진행, `UPDATE_AVAILABLE` 이면 사용자에게 업데이트 여부 질문 후 진행. (상세: `harness/commands/_update-check.md`)

# /sns-edit

생성된 draft가 마음에 안 들 때 수정한다. 모든 선택은 플래그 없이 대화형으로 진행한다.

```
/sns-edit                          # 캠페인 목록 표시 후 선택
/sns-edit --channel=threads        # 캠페인 선택 후 해당 채널로 바로 진입
```

---

## 실행 흐름

### 1단계 — 캠페인 선택

`node harness/bin/board.mjs` 실행 후 번호를 묻는다.

```
최근 캠페인:
  1) 2026-05-03-신제품-런칭   threads ✓ linkedin ✓
  2) 2026-05-02-채용-공고     linkedin ✓

어떤 캠페인을 수정할까요? (번호 입력):
```

`--channel=` 만 있고 캠페인이 지정되지 않은 경우 이 단계를 거친 후 해당 채널로 바로 진입.

---

### 2단계 — 채널 선택

캠페인의 채널 목록과 현재 상태를 표시하고 번호를 묻는다.

```
[2026-05-03-신제품-런칭] 채널 현황:
  1) threads   — preview ✓
  2) linkedin  — drafting (가디언 차단)

어떤 채널을 수정할까요? (번호 입력):
```

`--channel=` 인자가 있으면 이 단계를 건너뜀. 없으면 선택된 캠페인의 채널 목록을 표시하고 선택받는다.

---

### 3단계 — 현재 draft 표시

`node harness/bin/preview.mjs <slug> --channel=<ch>`

카피 본문 + 가디언 결과 + 자산 경로 출력.

시리즈(cards 필드가 있는 경우) → 카드 목록도 함께 표시:
```
[카드 1/3 · hook]  "정산 주기가 5일이던 팀이..."
[카드 2/3 · body]  "3가지 변화가 있었습니다..."
[카드 3/3 · cta]   "지금 바로 시작할 수 있습니다..."
```

---

### 4단계 — 수정 방법 선택

```
어떻게 수정할까요?
  1) 피드백 주고 전체 재생성
  2) 카피 직접 편집
  3) 이미지만 다시 생성
  4) 이 채널 건너뜀 (skipped 처리)
```

시리즈인 경우 1번 선택 시 추가 질문:
```
어떤 카드를 수정할까요?
  0) 전체 카드 다시 생성
  1) 카드 1 (hook)만
  2) 카드 2 (body)만
  3) 카드 3 (cta)만
```

---

### 5단계A — 피드백 재생성

피드백을 한 줄 입력받는다.

```
어떻게 바꿔드릴까요?
> 
```

```
node harness/bin/reject.mjs <slug> --channel=<ch> --reason="<피드백>"
node harness/bin/generate.mjs <slug> --channel=<ch>
```

특정 카드만 수정인 경우 (`--card` 는 series-3/series-5 cadence 에서만 유효):
```
node harness/bin/generate.mjs <slug> --channel=<ch> --card=<n>
```

### 5단계B — 직접 편집

```
campaigns/<slug>/<ch>/<timestamp>.yaml 의 text 필드를 수정하세요.
(시리즈는 cards[n].text 수정)
```

사용자가 파일 수정 후 Enter → `brief.status[ch] = 'preview'` 로 갱신.

### 5단계C — 이미지 재생성

`node harness/bin/generate.mjs <slug> --channel=<ch> --images=1`

카피는 유지하고 이미지만 재호출.

### 5단계D — 채널 폐기

`brief.status[<ch>] = 'skipped'` 로 직접 갱신.

---

### 6단계 — 결과 확인 + 다음 단계

**칸반 자동 표시**: `node harness/bin/board.mjs <slug>`

```
이대로 발행할까요?
  [Y] approve + publish
  [N] 다시 수정
```

Y 선택 시:
```
node harness/bin/approve.mjs <slug> --channel=<ch>
node harness/bin/publish.mjs <slug> --channel=<ch>
```
