---
name: sns-edit
description: 기존 draft / 예약 스케줄 / 슬롯 메타 수정. 플래그 없이 대화형으로 어떤 대상·항목을 고칠지 모두 묻는다.
---
> 업데이트 체크: `node harness/bin/check-updates.mjs` 실행 → `OK` 면 진행, `UPDATE_AVAILABLE` 이면 사용자에게 업데이트 여부 질문 후 진행. (상세: `harness/commands/_update-check.md`)

# /sns-edit

생성된 draft, 예약 스케줄, 또는 슬롯 메타가 마음에 안 들 때 수정한다. **플래그를 받지 않고 모든 선택을 대화형으로 진행**한다.

```
/sns-edit
```

---

## 실행 흐름

### 1단계 — 수정 대상 분기

```
무엇을 수정할까요?
  1) 캠페인 draft / 예약 스케줄
  2) 슬롯 메타 (반복 캠페인 설정)
```

- **1)** → 2단계A로 진입 (기존 캠페인 편집 흐름).
- **2)** → 2단계B로 진입 (슬롯 편집 흐름).

---

## A. 캠페인 편집 분기

### 2단계A — 캠페인 선택

`node harness/bin/board.mjs` 실행 후 번호를 묻는다.

```
최근 캠페인:
  1) 2026-05-03-신제품-런칭   threads ✓ linkedin ✓
  2) 2026-05-02-채용-공고     linkedin ⏰ scheduled (2026-05-09 09:00)

어떤 캠페인을 수정할까요? (번호 입력):
```

선택된 캠페인의 `brief.yaml` 을 로드해 `schedule` / `autoPublish` 존재 여부를 기억한다.

### 3단계A — 채널 선택

캠페인의 채널 목록과 현재 상태를 표시하고 번호를 묻는다.

```
[2026-05-03-신제품-런칭] 채널 현황:
  1) threads   — preview ✓
  2) linkedin  — scheduled ⏰ (2026-05-09 09:00)

어떤 채널을 수정할까요? (번호 입력):
```

### 4단계A — 현재 draft 표시

`node harness/bin/preview.mjs <slug> --channel=<ch>`

카피 본문 + 가디언 결과 + 자산 경로 출력. 시리즈는 카드 목록도 함께 표시.

### 5단계A — 수정 방법 선택

```
어떻게 수정할까요?
  1) 피드백 주고 전체 재생성
  2) 카피 직접 편집
  3) 이미지만 다시 생성
  4) 이 채널 건너뜀 (skipped 처리)
  5) 발행 시각 변경            ← brief.schedule[ch] 있을 때만
  6) 자동 발행 토글            ← brief.autoPublish 있을 때만
  7) 예약 취소                 ← brief.schedule[ch] 있을 때만
  8) 가이드라인 재검수 (LLM 의미론 포함)
```

5/6/7번은 조건부 표시. 없으면 메뉴에서 제외하고 번호도 재할당하지 말고 그대로 1~4 + 8 만 보여준다.

시리즈인 경우 1번 선택 시 추가 질문:
```
어떤 카드를 수정할까요?
  0) 전체 카드 다시 생성
  1) 카드 1 (hook)만
  2) 카드 2 (body)만
  3) 카드 3 (cta)만
```

### 6단계A — 분기별 처리

#### 5A-1) 피드백 재생성

```
어떻게 바꿔드릴까요?
> 
```

```
node harness/bin/reject.mjs <slug> --channel=<ch> --reason="<피드백>"
node harness/bin/generate.mjs <slug> --channel=<ch>
```

특정 카드만:
```
node harness/bin/generate.mjs <slug> --channel=<ch> --card=<n>
```

#### 5A-2) 직접 편집

```
campaigns/<slug>/<ch>/<timestamp>.yaml 의 text 필드를 수정하세요.
(시리즈는 cards[n].text 수정)
```

사용자가 파일 수정 후 Enter → `brief.status[ch] = 'preview'` 로 갱신.

#### 5A-3) 이미지 재생성

`node harness/bin/generate.mjs <slug> --channel=<ch> --images=1`

#### 5A-4) 채널 폐기

`brief.status[<ch>] = 'skipped'` 로 직접 갱신.

#### 5A-5) 발행 시각 변경

```
새로운 발행 시각? (KST, 예: 2026-05-09 14:00):
> 
```

입력값을 ISO(`+09:00`) 로 변환 후 `brief.yaml` 패치:
- `brief.schedule[<ch>] = "<ISO>"`
- `brief.status[<ch>] = "scheduled"` (이미 published 면 경고 후 변경 거부)
- `brief.meta.updatedAt = nowKst`

#### 5A-6) 자동 발행 토글

현재 값 표시 후 토글 확인:
```
현재 autoPublish=<true|false>. <반대값>으로 바꿀까요? [Y/N]
```

Y → `brief.autoPublish = !brief.autoPublish` 저장.

#### 5A-7) 예약 취소

```
예약을 취소할까요? (draft는 유지됩니다) [Y/N]
```

Y →
- `delete brief.schedule[<ch>]`
- `brief.status[<ch>] = "preview"` (이미 generate 됐으면) 또는 `"drafting"` (아직이면)

#### 5A-8) 가이드라인 재검수 (LLM 의미론 포함)

draft 가 사용자가 정한 가이드라인(슬롯 메타 + 브랜드 프로필 + 채널 규칙)을 의미상으로도 따르는지 한 번 더 검증한다. 워커는 deterministic 만 돌리지만 여기서는 의미론까지 확인.

1. deterministic 부터:
   ```
   node harness/bin/inspect-guidelines.mjs <slug> --channel=<ch>
   ```
   결과를 사용자에게 보여준다.

2. `needsLlmReview === true` 또는 사용자가 강제로 LLM 검수를 원하면:
   ```
   node harness/bin/inspect-guidelines.mjs <slug> --channel=<ch> --spec
   ```
   `harness/agents/guideline-reviewer.md` 서브에이전트로 spec 처리:
   - 입력: 위에서 만든 `guideline-spec-<ts>.json` 절대경로 1개
   - 서브에이전트가 spec 의 `outputPath` 절대경로에 결과 저장
   - 그 `outputPath` 값을 기억해 둔다 (다음 머지 단계에서 그대로 인자로 넘김)
   
   머지:
   ```
   node harness/bin/inspect-guidelines.mjs <slug> --channel=<ch> --merge-llm=<spec.outputPath>
   ```

3. 결과 표시 후 사용자에게 다음 행동을 묻는다:
   ```
   가이드라인 재검수 결과:
     deterministic ✅ 8/8
     의미론        ❌ voice_tone (voiceNotes는 '~합니다 체' 인데 마지막 문장 '...해요')

   어떻게 할까요?
     [F] 피드백 주고 재생성        ← 5A-1로 위임
     [E] 직접 편집                ← 5A-2로 위임
     [C] 그대로 두기 (예약돼있으면 워커가 다시 검사 후 차단할 수 있음)
   ```

### 7단계A — 결과 확인 + 다음 단계

**칸반 자동 표시**: `node harness/bin/board.mjs <slug>`

5번대 분기(스케줄/오토/취소) 처리 후에는 발행 게이트 없이 종료 안내:
```
✅ 스케줄 업데이트 완료
  · 워커가 새 시각에 자동 처리합니다
  · 다른 항목 수정: /sns-edit
```

1~4번대 분기(draft 수정) 처리 후에는 기존 발행 게이트 유지:
```
이대로 발행할까요?
  [Y] approve + 발행(browser-publish)
  [N] 다시 수정
```

Y 선택 시:
```
node harness/bin/approve.mjs <slug> --channel=<ch>
# 발행: 대시보드 [발행] · npm run morning · 또는:
node harness/bin/browser-publish.mjs <slug> --channel=<ch> --attach --pre-publish
```

---

## B. 슬롯 편집 분기

### 2단계B — 슬롯 선택

`node harness/bin/slots.mjs list` 출력 후 번호를 묻는다.

```
저장된 슬롯:
  #  topic                           channels            형태       마지막 실행
  ─────────────────────────────────────────────────────────────────────────────
  1  신제품 런칭                       threads,linkedin    단일       2일 전
  2  정산 자동화 시리즈                 threads             📅 3/주    1주 전

어떤 슬롯을 수정할까요? (번호 입력):
```

선택된 슬롯의 JSON 을 로드한다 (`node harness/bin/slots.mjs get <id>`).

### 3단계B — 항목 선택

슬롯이 **단일** 형태인 경우:
```
어떤 항목을 수정할까요?
  1) 주제 (topic)
  2) 채널 (channels)
  3) 목표 (goal)
  4) 게시 방식 (cadence)
  5) 핵심 메시지 (keyMessage)
  6) 콘텐츠 포인트 (contentPoints)
  7) 앵글 (angle)
  8) 슬롯 삭제
```

슬롯이 **시리즈** 형태인 경우 위 1~7 + 추가:
```
  8) 기간 (period: week / month)
  9) 빈도 (frequency: 기간 내 N회)
  10) 발행 시각 (time: HH:MM)
  11) 매 회 주제 목록 (titles)
  12) 자동 발행 (autoPublish)
  13) 슬롯 삭제
```

### 4단계B — 새 값 입력

선택된 항목별로 현재 값을 표시하고 새 값을 묻는다.

예시:
```
현재 채널: threads, linkedin
새 채널 (콤마 구분, 비우면 취소):
> 
```

```
현재 빈도: 3
새 빈도 (1 이상의 정수, 비우면 취소):
> 
```

빈 입력은 항상 취소(아무 변경 없이 1단계로 복귀하거나 종료).

### 5단계B — 저장

`node harness/bin/slots.mjs edit <id> --patch='<json>'` 호출.

`<json>` 형식 예:
- `{"topic":"새 주제"}`
- `{"channels":["threads","x"]}`
- `{"contentPoints":["포인트1","포인트2"]}`
- `{"frequency":5,"time":"10:30"}`
- `{"titles":["t1","t2","t3"]}`
- `{"autoPublish":false}`

배열 필드는 사용자 입력을 적절히 분해해서 넣는다 (channels: 콤마 / contentPoints, titles: 줄바꿈).

**슬롯 삭제** 분기 선택 시:
```
정말 삭제할까요? "<topic>" [Y/N]
```
Y → `node harness/bin/slots.mjs remove <id>`.

### 6단계B — 결과 확인

`node harness/bin/slots.mjs list` 재출력 후:
```
✅ 슬롯 업데이트 완료
  · 다음 캠페인 반복: /sns-repeat
  · 다른 슬롯 수정:   /sns-edit
```

> 시리즈 슬롯의 항목을 수정해도 이미 예약된 캠페인(`brief.schedule`)은 자동 재계획되지 않는다. 예약 자체를 다시 잡으려면 `/sns-start` 로 새 시리즈를 생성하거나, 개별 캠페인은 A 분기의 5A-5 (발행 시각 변경)로 수정한다.

---

## 에러 처리

- 번호 잘못 입력 → 다시 묻기 (3회 실패 시 종료).
- 캠페인/슬롯 0개 → 안내 후 종료 (`/sns-start` 또는 `/sns-repeat` 안내).
- `brief.yaml` 손상 → 오류 출력 후 종료.
- `slots.mjs edit` 실패 → 사용자에게 원인 표시 후 4단계B 재시도.
