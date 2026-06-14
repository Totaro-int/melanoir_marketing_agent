# OPERATIONS

운영자(Totaro 팀 + 고객사 담당자)용 일상 운영 지침.

## 캠페인 라이프사이클

```
drafting  →  preview  →  approved  →  scheduled / published / failed
                          ↑
                     guardian.ok 강제 + 학습 hook 발동
```

**사용자 진입점은 `/sns-start`, `/sns-repeat`, `/sns-edit`, `/sns-doctor` 4개 스킬뿐**입니다. 아래 표는 그 4개 안에서 자동 진행되는 내부 단계와 실제 bin 스크립트입니다.

| 내부 단계 | bin 스크립트 (4개 스킬이 자동 호출) | 결과물 |
|------|------|--------|
| 브리프 | `harness/bin/campaign-new.mjs "<주제>" [--cadence=...] [--slot-topic=...]` | `posts/campaigns/<slug>/brief.yaml` |
| 생성 | `harness/bin/generate.mjs <slug> [--channel=... --images=N]` | `<채널>/copy-spec.json`, `slide-spec.json` (학습 가이드 주입됨) |
| 에이전트 처리 | `copywriter` / `image-director` 서브에이전트 | `<채널>/copy-output.json`, `agent-output.json`, `card*.png` |
| 최종 통합 | `harness/bin/generate.mjs <slug> --finalize` | `<채널>/<TS>.md` 합본 + `agent-output.json` |
| 검토 | `harness/bin/preview.mjs <slug>` / `harness/bin/inspect-guidelines.mjs <slug>` | 콘솔 렌더링 (가디언 색상) + 가이드라인 정합성 리포트 |
| 승인 | `harness/bin/approve.mjs <slug> --channel=<ch>` | `status: approved` + **`posts/preferences.yaml` 학습 누적** |
| 거절 | `harness/bin/reject.mjs <slug> --channel=<ch> --reason="..."` | `status: drafting`, `feedback[<ch>]` 누적 + 거절 사유 학습 |
| 발행 | `harness/bin/publish.mjs <slug> --channel=<ch> [--dry-run]` 또는 `harness/bin/browser-publish.mjs ...` | `<채널>/result.json`, `status: published \| failed` |
| 동기화 | `harness/bin/sync-posts.mjs [--prune]` (자동 호출) | `posts/by-channel/<채널>/<슬롯-슬러그>/<캠페인>/` symlink 갱신 |

## cadence → 카드 수

| cadence | 카드 수 | 비고 |
|---------|---------|------|
| single | 1 | 단일 hero |
| series-3 | 3 | hook → body → cta |
| series-5 | 5 | hook → body × 3 → cta |
| thread | 0 | 텍스트 시리즈 (이미지 없음) |

`--images=N` 으로 cadence 자동값 무시 (0~10).

## 자격증명 관리

저장 위치: `auth/<channel>.json` (mode 0600, gitignored)

```bash
echo '{"accessToken":"...","userId":"..."}' | node harness/bin/auth.mjs add threads
node harness/bin/auth.mjs show threads      # 마스킹된 출력
node harness/bin/auth.mjs check threads     # 어댑터 healthcheck
node harness/bin/auth.mjs remove threads
node harness/bin/auth.mjs list
```

### 토큰 회전 절차

1. 채널 콘솔에서 새 토큰 발급
2. `node harness/bin/auth.mjs add <channel>` 으로 덮어쓰기 (덮어쓰기는 자동)
3. `/sns-doctor` 또는 `node harness/bin/auth.mjs check <channel>` 으로 확인
4. (사고 시) `node harness/bin/auth.mjs remove <channel>` + 채널에서 즉시 revoke

### BYO API 키 노출 시

`.env.local` 의 `FAL_KEY`/`OPENAI_API_KEY` 가 외부 노출됐다면 **즉시 provider 대시보드에서 revoke** 하고 새 키를 `.env.local` 에 다시 적기. 코드 변경 불필요.

## 발행 안전 모드

네 단계의 안전장치가 겹쳐 있음:

1. **`PUBLISHER_DRY_RUN=true`** (env) — 모든 발행이 페이로드만 출력
2. **`--dry-run`** (플래그) — 명령별 일회 dry-run
3. **`status === "approved"` 강제** — 승인 통과 안 한 채널은 거부
4. **가디언 차단된 draft 는 승인 거부** (`guardian.ok=false`)

운영 권장: 평상시 `.env.local` 에 `PUBLISHER_DRY_RUN=true` 켜두고, 실 발행 직전에만 임시로 끄기.

## 사용자 선호도 학습

`harness/bin/approve.mjs` / `harness/bin/reject.mjs` 종료 시 자동으로 `posts/preferences.yaml` 갱신:

| 명령 | 용도 |
|---|---|
| `node harness/bin/learn.mjs show [--channel=<ch>]` | 누적 학습 상태 확인 |
| `node harness/bin/learn.mjs rebuild` | 모든 approved 캠페인 재학습 (기존 통계 폐기 후 재구성) |
| `node harness/bin/learn.mjs reset` | 학습 데이터 초기화 |

신뢰도 게이트: 3건 미만 → spec 주입 안 함 / 3-5건 → `initial` / 5-10건 → `building` / 10건+ → `strong`.
`copywriter` / `image-director` 에이전트가 spec 의 `learnedPreferences` 를 자동 참조 (회사 profile 충돌 시 profile 우선).

## 트러블슈팅

### 카피·이미지가 mock 으로 떨어짐
- `.env.local` 에 `CONTENT_ENGINE_PROVIDER=fal` 인지 확인
- `node harness/bin/doctor.mjs` 의 content-engine 행에서 fal 빨강이면 키/모델 확인

### 발행 실패 (HTTP 401/403)
- 토큰 만료 또는 scope 부족. `node harness/bin/auth.mjs check <channel>` 후 새 토큰
- 결과: `posts/campaigns/<slug>/<ch>/result.json` 에 응답 body 저장됨

### Threads `media_type=IMAGE` 거부
- `assetUrls` 가 https public URL 인지 확인 (fal CDN 은 자동으로 OK, mock SVG 는 안 됨)

### 칸반이 갱신 안 됨
- `harness/bin/board.mjs --watch` 가 `posts/campaigns/` 의 fs.watch 의존. macOS 외 플랫폼은 1s 폴링 폴백
- 그래도 안 되면 다시 `harness/bin/board.mjs` 1회 호출

### by-channel 폴더가 어긋남
- 슬롯 추가/삭제·이름변경 시 `node harness/bin/sync-posts.mjs --prune` 으로 강제 재빌드

## 비용·미터링

provider 비용은 각 대시보드에서 직접 모니터링:
- fal.ai: https://fal.ai/dashboard
- OpenAI: https://platform.openai.com/usage

자사 콘텐츠 게이트웨이(Phase 7+)에 자체 미터링·청구가 들어올 예정.

## 스킬·전략 팩 업데이트

채널 전략(`channels/<ch>/strategy.md`) 은 외부 정책 변동 잦음. 분기에 1회 마지막 검증일 갱신 PR 권장. 현재 검증일은 각 strategy.md 하단에 명시.
