---
name: sns-init
description: 새 사용자(고객사)를 위한 첫 가이드. setup → onboard → 첫 캠페인 까지 단계별 안내.
---
## 호출 직전 자동 업데이트 체크 (반드시 먼저 실행)

**아래 명령을 실행하고 결과를 확인하라:**

```bash
node harness/bin/check-updates.mjs
```

- 출력이 `OK` → 그대로 본 명령 진행.
- 출력이 `UPDATE_AVAILABLE <N> <branch> <root> <commit>` → **반드시** 사용자에게 물어라:
  > "marketing_agent 새 버전 <N>개 업데이트가 있습니다 (최신: <commit>). 지금 업데이트할까요?"
  - **예** → `git -C "<root>" pull origin <branch>` 실행 후 본 명령 진행.
  - **아니오** → 그대로 본 명령 진행 (30분 내 재질문 없음).

(30분 throttle — 매 호출마다 fetch 하지 않음.)

---


# /sns-init

새로 마케팅 에이전트를 받은 사용자용 온보딩 진입점. 다음 순서를 그대로 안내:

1. **`node bin/setup.mjs`** — 의존성 설치, `.env.local` 생성, runtime 디렉터리, 실행 권한
2. `.env.local` 에 `FAL_KEY` 등 BYO 키 채우기 (없으면 mock 으로 동작)
3. **`/sns-doctor`** — 빨간 항목이 없는지 확인
4. **`/sns-onboard`** — 회사 프로필 인터뷰
5. **`/sns-campaign-new "<주제>"`** — 첫 캠페인
6. **`/sns-generate <slug>`** → **`/sns-preview <slug>`** → **`/sns-approve`**
7. **`/sns-auth add <channel>`** + **`/sns-publish ... --dry-run`** → 페이로드 확인 후 실 발행

각 단계는 별도 명령으로 분리되어 있어 사용자가 멈추거나 다시 시작하기 쉬움.

## 새 고객사 도입 체크리스트

- [ ] 회사 프로필 (`company-profile.yaml`) 생성
- [ ] `.env.local` 의 `FAL_KEY` 설정
- [ ] 첫 캠페인 single 카드로 전체 사이클 1회 (mock provider 로 안전)
- [ ] dry-run 페이로드 사람 검토
- [ ] LinkedIn / Threads OAuth 토큰 발급 → `/sns-auth add`
- [ ] 실 발행 1회 (single 카드)
- [ ] series-3 카드뉴스 1회
- [ ] `/sns-status --watch` 로 보드 확인
