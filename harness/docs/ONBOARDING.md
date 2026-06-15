# 설치 당일 Runbook (신규 회사)

> 클라이언트 PC 앞에서 위→아래로 따라가면 끝. 각 단계 끝에 검증 명령 있음.
> 목표: 설치 → 매일 아침 자동으로 "발행 직전 화면" 까지 1시간 안에.

---

## 0. 준비물 (담당자가 미리 챙길 것)

| 항목 | 내용 |
|------|------|
| `company-profile.yaml` | 고객사 브랜드 DNA (brand / industry / tone / hashtags / channels) |
| `topics.txt` | 30일 캘린더 주제 (Claude 가 브랜드 DNA 보고 생성) |
| SNS 계정 | 고객사가 직접 로그인할 ID/PW (담당자가 대신 X) |
| (선택) `FAL_KEY` | **AI 이미지** 를 fal.ai 로 생성할 때만. 기본 inhouse-slides 면 불필요 |

> **API 키 없이 동작합니다.** 기본 `CONTENT_ENGINE_PROVIDER=inhouse-slides` 는
> 카피·슬라이드를 Claude Code 가 직접 생성 (서브에이전트). 외부 API 키 0개.
> `ANTHROPIC_API_KEY` 는 쓰지 않습니다 (코드에 참조 없음).

---

## 1. 설치

```bash
cd <레포 폴더>
node harness/bin/setup.mjs
```

자동으로: npm install · `.env.local` 생성 · runtime dirs · 실행 권한.

---

## 2. 환경 설정 (키 선택)

`.env.local` 편집 (또는 대시보드 ⚙ 환경 설정 탭). 기본은 키 없이 동작:

```dotenv
CONTENT_ENGINE_PROVIDER=inhouse-slides   # 기본 — 키 불필요
# FAL_KEY=fal_...        # AI 이미지(fal) 쓸 때만
# OPENAI_API_KEY=sk-...  # OpenAI 이미지 쓸 때만
```

검증:
```bash
node harness/bin/doctor.mjs      # env / content-engine 초록색 확인
```

---

## 3. 브랜드 DNA 배치

`company-profile.yaml` 을 프로젝트 루트에 둠. 없으면 예시 복사 후 편집:

```bash
cp harness/examples/company-profile.example.yaml company-profile.yaml
```

핵심 필드 (캘린더·카피·해시태그에 자동 반영):
- `brand.name` / `brand.korName`
- `industry`
- `tone.preset` (relate-kr / b2b / informational / friendly / sales)
- `hashtags.always` + `hashtags.pool`
- `channels.enabled`

검증:
```bash
node harness/bin/doctor.mjs      # profile 초록색
```

---

## 4. Chrome 9222 + 대시보드 시작

```bash
# Windows
powershell -ExecutionPolicy Bypass -File scripts\start-demo.ps1
# macOS / Linux
bash scripts/start-demo.sh
```

→ Chrome 9222 (별도 프로필) + 대시보드 http://localhost:7777 자동.

---

## 5. SNS 채널 로그인 (고객사가 직접)

대시보드 → 🔌 채널 연결 → **📡 마법사 시작**.
미연결 채널마다 Chrome 탭 열림 → 고객사가 로그인 → 자동 감지.

권장 채널 (발행 함수 검증됨): **naver-blog · instagram · threads · linkedin**

⚠ cookie 정책 (DELIVERY.md Part 4-C):
- Instagram / Threads — 장기 유지 (수주~)
- LinkedIn — 약 5일
- Naver Blog — 세션 만료 잦음 (아침마다 재로그인 가능성)
- Tistory — 글쓰기 추가 인증 (불안정)

검증:
```bash
node harness/bin/doctor.mjs      # Chrome 9222 attach live + 채널 cookie
```

---

## 6. 캘린더 생성 (브랜드 DNA → 30일)

`topics.txt` 준비 (Claude 에게 "company-profile 보고 30개 주제 뽑아줘" 요청 →
`harness/examples/topics.example.txt` 형식으로 저장).

```bash
node harness/bin/seed-calendar.mjs --topics topics.txt \
  --start <오늘 또는 내일 YYYY-MM-DD> \
  --channels naver-blog,instagram,threads,linkedin \
  --status approved
```

브랜드명·해시태그·톤·채널은 company-profile 에서 자동 주입.
검증: 대시보드 캘린더에 30일 캠페인 점 표시.

> 카피/이미지 carousel 은 별도 — copywriter / image-director 또는 디자인 스크립트로 채움.
> seed-calendar 는 "캘린더 뼈대 + 브랜드 해시태그" 까지.

---

## 7. 매일 아침 자동 실행 등록

```bash
# Windows
powershell -ExecutionPolicy Bypass -File scripts\install-morning-cron.ps1 -Time "09:00"
# macOS / Linux
bash scripts/install-morning-cron.sh --time=09:00
```

트리거 2개 (자동): 로그인 시 (30초 후) + 매일 09:00.

검증:
```bash
# Windows
powershell -ExecutionPolicy Bypass -File scripts\install-morning-cron.ps1 -Status
# macOS / Linux
bash scripts/install-morning-cron.sh --status
```

---

## 8. 최종 리허설 (즉시 1회)

```bash
npm run morning           # 또는 morning.ps1 / morning.sh
```

기대 동작:
1. 사전 인증 검증 → 만료 채널 로그인 페이지 자동 오픈 + 알림
2. **만료 채널 있으면 최대 3분 로그인 대기** — 그 자리에서 로그인하면 자동 감지해서 진행 (재실행 불필요)
3. 인증된 채널 → Chrome 새 탭에 발행 직전 화면
4. 완료 데스크탑 알림 ("발행 대기 N · 로그인 M")
5. `logs/morning-result.json` 결과 기록

→ 고객사는 각 탭 검토 후 [공유]/[발행] 클릭만.

옵션:
- `--no-wait-login` : 로그인 대기 끄기 (만료 채널 즉시 skip)
- `--wait-login=300` : 대기 시간 조정 (초)
- `--max=N` : 한 번에 처리할 캠페인 수 (기본 5)

---

## 인계 한 줄

> "매일 아침 컴퓨터 켜면 자동으로 발행 직전까지 준비됩니다.
> 알림 뜨면 Chrome 탭 확인 → 검토 후 [공유] 클릭.
> Naver 는 로그인 만료 시 알림이 뜨니 그때만 재로그인하시면 됩니다."

## 문제 발생 시

| 증상 | 확인 |
|------|------|
| 9시에 아무것도 안 뜸 | `logs/morning-routine.log` + `-Status` |
| 채널 빈 탭 | 인증 만료 — 마법사로 재로그인 후 `npm run morning` |
| Chrome 안 뜸 | `start-demo` 재실행 / doctor Chrome 9222 확인 |
| 카피·이미지 비어있음 | seed-calendar 는 뼈대만 — carousel 디자인 별도 |
