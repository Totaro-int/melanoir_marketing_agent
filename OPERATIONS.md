# OPERATIONS

운영자(Totaro 팀 + 고객사 담당자)용 일상 운영 지침.

## 캠페인 라이프사이클

```
draft  →  preview  →  approved  →  published / failed
                       ↑
                   guardian.ok 강제
```

| 단계 | 명령 | 결과물 |
|------|------|--------|
| 브리프 | `/campaign new "<주제>" [--cadence=...]` | `campaigns/<slug>/brief.yaml` |
| 생성 | `/generate <slug> [--channel=... --images=N]` | `<channel>/draft.yaml`, `<channel>/draft.md`, `out/<provider>-images/*` |
| 검토 | `/preview <slug>` | 콘솔 렌더링 (가디언 색상) |
| 승인 | `/approve <slug> --channel=<ch>` | `status: approved` |
| 거절 | `/reject <slug> --channel=<ch> --reason="..."` | `status: drafting`, `feedback[<ch>]` 누적 |
| 발행 | `/publish <slug> --channel=<ch> [--dry-run]` | `<channel>/result.json`, `status: published \| failed` |

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
echo '{"accessToken":"...","userId":"..."}' | node bin/auth.mjs add threads
node bin/auth.mjs show threads      # 마스킹된 출력
node bin/auth.mjs check threads     # 어댑터 healthcheck
node bin/auth.mjs remove threads
node bin/auth.mjs list
```

### 토큰 회전 절차

1. 채널 콘솔에서 새 토큰 발급
2. `node bin/auth.mjs add <channel>` 으로 덮어쓰기 (덮어쓰기는 자동)
3. `/doctor` 또는 `node bin/auth.mjs check <channel>` 으로 확인
4. (사고 시) `node bin/auth.mjs remove <channel>` + 채널에서 즉시 revoke

### BYO API 키 노출 시

`.env.local` 의 `FAL_KEY`/`OPENAI_API_KEY` 가 외부 노출됐다면 **즉시 provider 대시보드에서 revoke** 하고 새 키를 `.env.local` 에 다시 적기. 코드 변경 불필요.

## 발행 안전 모드

세 단계의 안전장치가 겹쳐 있음:

1. **`PUBLISHER_DRY_RUN=true`** (env) — 모든 `/publish` 가 페이로드만 출력
2. **`--dry-run`** (플래그) — 명령별 일회 dry-run
3. **`status === "approved"` 강제** — `/approve` 통과 안 한 채널은 거부
4. **가디언 차단된 draft 는 `/approve` 거부** (`guardian.ok=false`)

운영 권장: 평상시 `.env.local` 에 `PUBLISHER_DRY_RUN=true` 켜두고, 실 발행 직전에만 임시로 끄기.

## 트러블슈팅

### `/generate` 가 mock 으로 떨어짐
- `.env.local` 에 `CONTENT_ENGINE_PROVIDER=fal` 인지 확인
- `node bin/doctor.mjs` 의 content-engine 행에서 fal 빨강이면 키/모델 확인

### 발행 실패 (HTTP 401/403)
- 토큰 만료 또는 scope 부족. `node bin/auth.mjs check <channel>` 후 새 토큰
- 결과: `campaigns/<slug>/<ch>/result.json` 에 응답 body 저장됨

### Threads `media_type=IMAGE` 거부
- `assetUrls` 가 https public URL 인지 확인 (fal CDN 은 자동으로 OK, mock SVG 는 안 됨)

### 칸반이 갱신 안 됨
- `/status --watch` 가 `campaigns/` 의 fs.watch 의존. macOS 외 플랫폼은 1s 폴링 폴백
- 그래도 안 되면 다시 `/status` 1회 호출

## 비용·미터링

provider 비용은 각 대시보드에서 직접 모니터링:
- fal.ai: https://fal.ai/dashboard
- OpenAI: https://platform.openai.com/usage

자사 콘텐츠 게이트웨이(Phase 7+)에 자체 미터링·청구가 들어올 예정.

## 스킬·전략 팩 업데이트

채널 전략(`channels/<ch>/strategy.md`) 은 외부 정책 변동 잦음. 분기에 1회 마지막 검증일 갱신 PR 권장. 현재 검증일은 각 strategy.md 하단에 명시.
