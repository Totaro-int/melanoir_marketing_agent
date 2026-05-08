# INSTALL

사내·고객사가 받자마자 보는 문서. 5분 안에 첫 캠페인 dry-run 까지.

## 1. 클론

```bash
git clone https://github.com/Totaro-int/marketing_agent.git
cd marketing_agent
```

## 2. 한 번에 setup

```bash
node bin/setup.mjs
# 또는 Claude Code 플러그인 링크까지:
node bin/setup.mjs --link=/path/to/your/working/project
```

내부적으로:
- Node 20+ 확인
- `npm install`
- `.env.local` 생성 (`.env.example` 복사)
- `auth/`, `out/`, `campaigns/` 디렉터리 생성
- `harness/bin/*.mjs` + `harness/statusline/statusline.sh` 실행 권한
- (선택) `<link>/.claude/plugins/marketing_agent` 심볼릭 링크

## 3. .env.local 채우기

최소:
```bash
CONTENT_ENGINE_PROVIDER=fal     # 또는 mock | openai | inhouse
FAL_KEY=<https://fal.ai/dashboard/keys>
```

키 없이 시작하려면 `CONTENT_ENGINE_PROVIDER=mock` 만 두면 됨 (오프라인·결정론).

## 4. 환경 진단

```bash
node bin/doctor.mjs
```

빨간 점이 없으면 OK.

## 5. 첫 캠페인 사이클 (Claude Code 안에서)

**사용자가 직접 호출하는 슬래시 명령은 4개뿐**입니다. 모든 단계(온보딩·생성·검수·승인·발행)는 `/sns-start` 안에서 자동으로 진행됩니다.

```
/sns-start                # 처음 사용 또는 새 캠페인 — 0~7단계 자동
/sns-repeat               # 슬롯에서 재실행 (반복·예약)
/sns-edit                 # 진행 중 캠페인 수정·재생성
/sns-doctor               # 환경 진단·자격증명·프로필 업데이트
```

내부 단계는 4개 스킬이 `harness/commands/_sns-*.md` 가이드를 참조하며 자동 진행:
| 내부 단계 | 가이드 | 실제 실행 |
|---|---|---|
| 환경 점검 | `_sns-init.md` | `bin/doctor.mjs --quick` |
| 회사 프로필 | `_sns-onboard-company.md` | `bin/profile-validate.mjs` |
| 캠페인 생성 | `_sns-campaign-new.md` | `bin/campaign-new.mjs` |
| 카피·이미지 | `_sns-generate.md` | `bin/generate.mjs` + 에이전트 |
| 검수 | `_sns-preview.md` | `bin/preview.mjs`, `bin/inspect-guidelines.mjs` |
| 승인/거절 | `_sns-approve.md` / `_sns-reject.md` | `bin/approve.mjs` / `bin/reject.mjs` (학습 hook 자동) |
| 발행 | `_sns-publish.md` | `bin/publish.mjs` 또는 `bin/browser-publish.mjs` |
| 자격증명 | `_sns-auth.md` | `bin/auth.mjs` (대화형) |

bin 스크립트 직접 호출(고급/디버깅용):
```bash
node harness/bin/campaign-new.mjs "..."
node harness/bin/generate.mjs <slug> --all
node harness/bin/board.mjs --watch
node harness/bin/learn.mjs show           # 누적 학습 상태 확인
```

## 6. 안전 모드

기본 권장:
```bash
# .env.local
PUBLISHER_DRY_RUN=true
```

실 발행 시점에만 끄고, 끝난 뒤 다시 켜는 운영 흐름.

## 7. 문제 생기면

- `node bin/doctor.mjs` 결과 캡처
- `auth/` 자격증명은 절대 공유 금지 (마스킹: `node bin/auth.mjs show <ch>`)
- fal/openai 비용은 provider 대시보드에서 직접 확인
- 자세한 운영 지침: [OPERATIONS.md](OPERATIONS.md)
