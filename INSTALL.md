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
- `bin/*.mjs` + `statusline/statusline.sh` 실행 권한
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

```
/onboard                         # 회사 프로필 인터뷰
/campaign new "신제품 런칭"      # brief.yaml + 채널 디렉터리
/generate <slug>                 # provider 호출 + brand-guardian
/preview <slug>                  # 콘솔 렌더링
/approve <slug> --channel=threads
/auth add threads                # JSON stdin
/publish <slug> --channel=threads --dry-run   # 페이로드만
/publish <slug> --channel=threads             # 실 발행
/status --watch                  # 칸반 보드 실시간
```

CLI 직접 사용:
```bash
node bin/campaign-new.mjs "..."
node bin/generate.mjs <slug> --all
node bin/board.mjs --watch
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
