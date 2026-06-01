# Developer Work Order — Routine 명령어 1개로 발행 직전까지

> 작업 인계 문서. 두 review (review-agent / review-code) 의 BLOCK finding 들을
> **사용자 목표 (morning routine)** 관점에서 우선순위 재정렬한 작업 지시서.
> 동결 영역 변경은 **PR 만들기 전 사용자 승인 필수** — `DEVELOPER-HANDOFF.md §0`.

---

## 🎯 사용자 궁극 목표 (이 작업의 의미)

```
[ 컴퓨터 켜고 명령어 1개 → 사용자가 [발행] 만 누름 ]

  $ npm run morning            # 또는 scripts/morning.ps1, /sns-morning 등

  자동:
    1. 환경 준비 — Chrome 9222 / 대시보드 / 채널 인증 OK 검증
    2. 오늘 캠페인 list 추출 (slots.yaml + schedule)
    3. 각 캠페인의 각 채널:
       - 카피 자동 생성 (copywriter agent)
       - 이미지 자동 생성 (image-director + fal.ai)
       - finalize (이미지 첨부 + brand-guardian 자동 검수)
       - block 있으면 → 카피 재생성 (1회 retry) → 그래도 block → SKIP + 보고
    4. browser-publish 를 게시 직전까지 (gate() 에서 멈춤)
       - Chrome 탭 N개에 발행 직전 화면 열려있음
       - dry-run 아님 — 실제 모달 + 카피 paste + 이미지 첨부 완료
    5. 대시보드 알림: "발행 대기 N개 · Chrome 탭 확인"

  사용자:
    Chrome 의 각 탭에서 검토 → [공유] 버튼 클릭
```

**왜 이 목표인가**: 사용자가 매일 30-40분 (캠페인 생성 + 카피 검토 + 이미지 + 발행) 들이던 것을
**5분 (검토 + 발행 클릭)** 으로 줄임. 자동화 가치 = 사람 시간 절약.

---

## 📋 작업 우선순위 (이 목표 관점)

### P0 — 이 목표가 동작하기 위해 필수 (선결 BLOCK)

#### P0-A. schema 채널 enum 에 블로그 3종 추가 (review-code CRITICAL)

**현재 상태**:
- `harness/schemas/company-profile.schema.yaml:172` enum:
  `[threads, linkedin, instagram, facebook, x, reddit, bluesky, mastodon, pinterest, tiktok, youtube]`
- `channels.json` 의 active 12개 중 `naver-blog / tistory / brunch` **누락**

**문제**: `company-profile.yaml` 에 `channels.enabled: [naver-blog]` 넣으면
`profile-validate.mjs:36` Ajv 검증 실패 → 캠페인 생성 자체가 막힘. routine 첫 단계에서 STOP.

**작업**:
1. `channels.json` 을 single source of truth 로 결정
2. schema 의 enum 을 제거 (`type: string` 만), 또는 enum 동적 주입 — 후자 추천:
   ```javascript
   // profile-validate.mjs 안
   const channels = JSON.parse(readFileSync('harness/channels.json', 'utf8'));
   const activeIds = channels.filter(c => c.status === 'active').map(c => c.id);
   schema.properties.channels.properties.enabled.items.enum = activeIds;
   ```
3. test fixture 추가 — `naver-blog/tistory/brunch` 가 검증 통과

**§0 영향**: §0-3 (data schema). **사용자 승인 받고 진행**.

---

#### P0-B. tonePreset 어휘 통일 (review-code CRITICAL)

**현재 상태**:
- schema `tone.preset`: `[professional, friendly, witty, bold, calm, premium, custom]`
- 런타임 (`parse-source.mjs:166-170`, CLAUDE.md §0-7): `[relate-kr, b2b, informational, friendly, sales]`
- 겹치는 값: `friendly` **하나**

**문제**: 사용자가 schema 를 신뢰해 `professional` 넣으면 런타임 분기 누락. routine 의 톤 자동 선택이 깨짐.

**작업**: 런타임 어휘를 진실로 결정 (§0-7 동결). schema enum 수정:
```yaml
tone:
  type: object
  required: [preset]
  properties:
    preset:
      type: string
      enum: [relate-kr, b2b, informational, friendly, sales]
```

`company-profile.yaml` 의 기존 `tone.preset` 값이 schema 와 안 맞으면 자동 마이그레이션 함수 추가:
```javascript
// profile-validate.mjs
const TONE_MIGRATION = {
  professional: 'relate-kr',
  witty: 'friendly',
  bold: 'sales',
  calm: 'relate-kr',
  premium: 'b2b',
  custom: 'relate-kr',  // fallback
};
```

**§0 영향**: §0-7 (tonePreset ID — 변경 X). **schema 만 런타임에 맞추는 거라 §0 본의 보존**. 사용자 보고만 하면 진행 가능.

---

#### P0-C. plugin.json agents 6개 등록 (review-agent CRITICAL)

**현재 상태**:
- `plugin.json:18-23` agents: `[copywriter, image-director, brand-guardian, publisher]` (4개)
- 실제 사용: `card-evaluator`, `guideline-reviewer` 가 `sns-start.md:465,159`, `evaluate.mjs:90`, `generate-finalize.mjs:460`, `inspect-guidelines.mjs:319` 에서 활발히 호출

**문제**: 플러그인 설치 시 Claude Code 의 SubAgent 디스패치가 이 둘을 모름 → "agents/X.md 를 Read 해서 인라인 실행" 이라는 파일 경로 직접 참조에 의존 → 깨지기 쉬운 우회. routine 의 자동 카피/검수 단계 신뢰성 떨어짐.

**작업**:
1. `plugin.json` `agents` 배열에 `card-evaluator`, `guideline-reviewer` 추가
2. CLAUDE.md 의 "에이전트 4개" 표기 → "6개" 정정
3. `harness/agents/` 에 두 .md 가 SubAgent 표준 frontmatter 따르는지 검증 (이미 따르면 OK)

**§0 영향**: §0-1 (에이전트 4개). **사용자 승인 받고 정정** (사실은 6개라는 거 인정).

---

#### P0-D. 의미론 검수 책임 단일화 (review-agent HIGH)

**현재 상태**:
- `brand-guardian.md:244-252` — `banned.topics` 는 "의미론 판단 필요하므로 warn-only, copywriter step5 가 1차 방어선"
- `guideline-reviewer.md:31-36` — `banned_topics` 를 LLM 으로 판정해 `ok:false` block

**문제**: 같은 `banned.topics` 인데 한쪽은 warn, 한쪽은 block. routine 자동화에서 같은 위반이
어느 경로 (generate-finalize 내장 guardian vs inspect-guidelines → guideline-reviewer) 를 타냐에 따라 통과/차단 갈림 → **비결정적**.

**작업**:
1. `banned.topics` 의 최종 판정 권한 = `guideline-reviewer` (LLM 의미론) — 단일화
2. `brand-guardian.mjs` 의 `banned.topics` 검사 제거 또는 info 만
3. `skills/sns-brand-review/SKILL.md:51-56` 의 "guardian vs inspect-guidelines 차이" 표 → 책임 분리 명시:
   - guardian = 결정론 (정규식 패턴 / 분량 / hashtag 등)
   - guideline-reviewer = 의미론 (banned.topics LLM 판정)

**§0 영향**: §0-1 (에이전트 역할). **사용자 승인 받고 진행**.

---

#### P0-E. **NEW** `morning-routine.mjs` entry point (목표 자체 구현)

**작성**: `harness/bin/morning-routine.mjs` 새 파일

**기능**:
```javascript
// 의사 코드
async function morningRoutine({ dryRun = false } = {}) {
  // 1. doctor — 환경 검증
  await runDoctor();  // Chrome 9222 / 대시보드 / 채널 인증 OK?
                       // 안 되면 자동 startChrome9222 + startDashboard

  // 2. 오늘 캠페인 list
  const slots = readSlots();
  const today = new Date().toISOString().slice(0, 10);
  const todayCampaigns = slots.filter(s => s.nextRun?.startsWith(today));

  // 3. 각 캠페인 fully prepare
  const prepared = [];
  for (const slot of todayCampaigns) {
    // 3-1. 카피 + 이미지 생성 (generate.mjs + --finalize)
    const slug = await generateCampaign(slot);
    // 3-2. brand-guardian 검수 — block 있으면 1회 retry
    for (const channel of slot.channels) {
      let attempt = 0;
      while (attempt < 2) {
        const report = await inspectDraft(slug, channel);
        if (report.ok) break;
        if (attempt === 0) {
          await regenerateCopy(slug, channel, report.findings);
          attempt++;
        } else {
          ui.warn(`${slug}/${channel} — block 잔존 (${report.findings.length}건), SKIP`);
          prepared.push({ slug, channel, status: 'blocked', report });
          break;
        }
      }
    }

    // 3-3. browser-publish 를 게시 직전까지 (gate 에서 멈춤)
    for (const channel of slot.channels) {
      // 기존 browser-publish 를 --pre-publish 모드 (없으면 추가):
      //   - 모달 열기 + 카피 paste + 이미지 첨부 까지 진행
      //   - gate() 에서 멈춤 — dry-run 이 아님. 사용자가 [공유] 만 누르면 됨
      //   - Chrome 탭은 그대로 유지
      await preparePublish(slug, channel, { dryRun });
      prepared.push({ slug, channel, status: 'ready' });
    }
  }

  // 4. 대시보드 알림
  await notifyDashboard({
    title: `🌅 Morning routine 완료`,
    body: `발행 대기 ${prepared.filter(p => p.status === 'ready').length}개 · Chrome 탭 확인`,
    blocked: prepared.filter(p => p.status === 'blocked'),
  });
}
```

**연관 작업**:
- `browser-publish.mjs` 에 `--pre-publish` 플래그 추가 (현재 `--dry-run` 은 모달 안 열고 종료, `--auto-click` 은 자동 게시. 중간 단계가 없음)
- `--pre-publish` = 모달 열고 모든 채우기 끝 + gate 에서 멈춤 + Chrome 탭 유지
- `scripts/morning.ps1` (Windows), `scripts/morning.sh` (macOS/Linux) — `node harness/bin/morning-routine.mjs` 호출
- `package.json` scripts: `"morning": "node harness/bin/morning-routine.mjs"`
- 새 사용자 커맨드 `/sns-morning` (선택)
- 대시보드 에 [🌅 Morning routine 시작] 큰 버튼 (오늘 캠페인 있으면)

**§0 영향**:
- §0-1 (커맨드 4개) → `/sns-morning` 추가 시 **5개로 늘림**. 사용자 승인.
- 다른 동결 영역 영향 X (기존 bin 스크립트 reuse).

---

### P1 — 이 목표 안정성 강하게 추천

#### P1-A. KOREAN_AD_LAW region gate (review 양쪽 모두 지적)

**작업**:
1. `company-profile.yaml` 에 `legal.region` 필드 추가 (default `'KR'`)
2. `brand-guardian.mjs` 의 `inspect()` 에서 `KOREAN_AD_LAW` 적용 전 region 체크:
   ```javascript
   const region = profile?.legal?.region || 'KR';
   if (region === 'KR') {
     for (const rule of KOREAN_AD_LAW.block) { ... }
     for (const rule of KOREAN_AD_LAW.warn)  { ... }
   }
   ```
3. `CASUAL_ENDINGS / FORMAL_ENDINGS / AI_PATTERNS` 도 동일 (한국어 정규식)
4. CLAUDE.md §0-5 "11개 패턴" 으로 정정 (현재 "7개" 라고 잘못 적혀 있음)
5. schema 에 `legal.region` enum (`[KR, US, EU, JP, ...]`) + locale 별 `adHashtag` default

**§0 영향**: §0-5 (KOREAN_AD_LAW 패턴 자체 동결, gate 만 추가) + §0-3 (legal.region 신규 필드). **사용자 승인 필수**.

---

#### P1-B. sns-start ↔ skills 중복 정리 (review-agent HIGH)

**현재 상태**:
- `sns-start.md:387` "이 단계는 sns-copy-generation 스킬을 invoke" 라고 적고도
- 같은 파일 `:394-507` 에 `generate.mjs / --finalize / evaluate.mjs` 전체 시퀀스를 그대로 재기술
- 두 곳 정의 → drift 발생, "위임" 이 사실은 장식

**작업**:
1. `sns-start.md` 의 generate/inspect 시퀀스를 SKILL.md 로 완전 이관
2. `sns-start.md` 본문엔 "sns-copy-generation 스킬 실행" 한 줄 + 휴먼 게이트 분기만
3. 또는 반대 — 스킬을 단일 출처로 못 박고 커맨드는 단계 순서만

**§0 영향**: §0-1 (스킬 3개 자체 변경 X — 본문 정리만). 사용자 승인 후.

---

### P2 — 코드 안정성 (DEVELOPER-HANDOFF §5 이미 추천된 것)

- **P2-A** `browser-publish.mjs` 1811줄 → 채널별 분리 (`publish/<channel>.mjs`)
  - selector drift 회귀 가장 잦은 파일, 모듈 경계 도입 필수
  - §0 영향 X — 동결 위반 없음
- **P2-B** `dashboard.mjs` 1387줄 → 라우트 핸들러 분리
  - API contract (§0-4) 유지하면서 internal 분할
  - §0 영향 X

---

### P3 — 정리 작업 (사용자 동의 필요 X, 명백한 정정)

- **P3-A** plugin.json description "11개 채널" → "다채널" (또는 12)
- **P3-B** `_lib.mjs:127-130` `reference` 분기 제거 (dead code)
- **P3-C** CLAUDE.md §0-5 "7개" → "11개" 정정 (제가 작성한 오류)
- **P3-D** `brand-guardian.md` 의 250줄 룰 데이터 → `channels/blog/modes.md` 위임 (이미 있음)
- **P3-E** `generate-spec.mjs` `writeInhouseSpecs ↔ writeCopySpecs` 100줄 중복 → 공통 헬퍼

---

## 📅 권장 작업 순서

```
Sprint 1 (3-5일) — P0 5개 + 사용자 승인 PR
  P0-A schema enum + channels.json single source
  P0-B tonePreset 어휘 통일 (런타임 기준)
  P0-C plugin.json agents 6개 등록
  P0-D 의미론 검수 책임 단일화 (guideline-reviewer)
  P0-E morning-routine.mjs entry point + browser-publish --pre-publish

Sprint 2 (2-3일) — P1
  P1-A region gate
  P1-B sns-start ↔ skills 중복 정리

Sprint 3 (3-5일) — P2 리팩토링 (§0 위반 X, 자유 작업)
  P2-A browser-publish 채널별 분리
  P2-B dashboard 분할

Sprint 4 (1일) — P3 정리
```

---

## ⚠️ 사용자 승인 절차 (§0 동결 영역)

P0-A / P0-B / P0-C / P0-D / P0-E / P1-A / P1-B 는 §0 동결 영역.
PR 만들기 전 다음 형식으로 사용자에게 보고:

```
[설계 변경 제안 — §0 영역]
항목: <P0-A>
변경 이유: <schema enum 이 채널 enum 누락으로 블로그 캠페인 검증 불가>
변경 내용: <구체 diff — schema enum 수정 + profile-validate.mjs 동적 주입>
영향 범위: <profile-validate.mjs / company-profile.yaml validation>
대안: <schema 비우는 vs 동적 주입 vs channels.json 단일화>
승인 요청합니다.
```

승인 받기 전까지 commit X.

---

## 🛠 검증 체크리스트 (각 P0 작업 후)

```bash
# 1. syntax
node --check harness/bin/morning-routine.mjs
node --check harness/bin/browser-publish.mjs
node --check harness/src/content-engine/brand-guardian.mjs

# 2. schema validation 통과
node harness/bin/profile-validate.mjs                    # naver-blog 통과해야
node harness/bin/profile-validate.mjs harness/examples/company-profile.example.yaml

# 3. brand-guardian 11개 block 패턴 (KR locale)
node -e "import('./harness/src/content-engine/brand-guardian.mjs').then(({inspect}) => {
  const r = inspect({channel:'naver-blog', text:'100% 안전 효과 보장 의학적 효능', profile:{legal:{region:'KR'}}, brief:{tonePreset:'relate-kr'}});
  console.log(r.summary.blocks >= 3 ? 'PASS' : 'FAIL');
});"

# 4. 영문 region 은 block 0건 (gate 동작)
node -e "import('./harness/src/content-engine/brand-guardian.mjs').then(({inspect}) => {
  const r = inspect({channel:'linkedin', text:'100% safe guaranteed effective', profile:{legal:{region:'US'}}, brief:{tonePreset:'b2b'}});
  console.log(r.summary.blocks === 0 ? 'PASS' : 'FAIL');
});"

# 5. routine 부팅 (dry-run)
node harness/bin/morning-routine.mjs --dry-run
# → 오늘 캠페인 list + 각 채널 prepare 로그 + Chrome 탭 X (dry-run 이라 모달 안 엶)

# 6. routine LIVE
node harness/bin/morning-routine.mjs
# → Chrome 탭 N개 발행 직전 상태로 열려있어야
```

---

## 🎯 성공 기준 (사용자 acceptance)

```
[✓] 컴퓨터 켜고 `npm run morning` 입력
[✓] 60-90초 안에 (또는 캠페인 수에 따라 길어질 수 있음):
    - Chrome 9222 자동 시작 (이미 떠 있으면 skip)
    - 대시보드 자동 시작 (이미 떠 있으면 skip)
    - 오늘 캠페인 자동 카피 + 이미지 생성
    - brand-guardian 자동 검수 (block 있으면 1회 재생성)
    - 각 채널 browser-publish 가 게시 직전까지
[✓] Chrome 화면에 N개 탭이 발행 직전 상태로 열림 (모달 + 카피 + 이미지 다 채워짐)
[✓] 대시보드 우측 상단에 "🌅 발행 대기 N개" 알림 + 데스크탑 notification
[✓] 사용자는 각 탭 검토 → [공유] 클릭만
[✓] 발행 끝나면 대시보드 미니맵 + 데스크탑 알림 (이미 구현됨)
```

이 7개 체크박스가 모두 통과하면 user acceptance.

---

## 한 줄 요약 (개발자에게 전달용)

> 두 review 의 BLOCK finding 들이 진짜 막는 건 사용자의 **morning routine 목표** —
> 컴퓨터 켜고 명령어 하나로 발행 직전까지. P0 5개는 이 목표 위해 선결,
> P1/P2 는 안정성, P3 는 정리. **§0 동결 영역은 모두 사용자 승인 후 진행.**
