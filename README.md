# marketing_agent

토타로 사내·고객사 SNS 마케팅 자동화 하네스 (Claude Code 플러그인).

## 무엇

- Claude Code를 실행 엔진으로 쓰는 SNS 마케팅 자동화 도구
- GitHub 한 개로 배포되는 **채널별 전략 팩** + **회사 프로필 온보딩** + **콘텐츠 엔진(BYO/자사)** + **휴먼 승인 게이트** + **Publisher** + **CLI 진행 보드**
- B2B 내부 운영툴 (사내·고객사 전용, 비공개)

## 빠른 시작

```bash
# 1) 의존성 설치
cd /path/to/marketing_agent
npm install
cp .env.example .env.local       # provider·BYO 키 설정 (선택, 기본 mock)

# 2) Claude Code 플러그인으로 로드 (개발 모드)
cd /path/to/your/project
ln -s /Users/songseungju/totaro/marketing_agent .claude/plugins/marketing_agent

# 3) Claude Code 안에서 — 캠페인 한 사이클
/onboard                          # 회사 프로필 인터뷰
/campaign new "신제품 런칭"       # 브리프 + 채널 디렉터리 생성
/generate <slug>                  # 채널별 카피·이미지 draft (provider 자동 선택)
/preview <slug>                   # 가디언 결과 + 카피 + 자산 콘솔 렌더링
/approve <slug> --channel=threads # 발행 대기로 승격
/auth add threads                 # 자격증명 등록 (실 발행 전, JSON stdin)
/publish <slug> --channel=threads --dry-run   # 페이로드만 검증
/publish <slug> --channel=threads             # 실제 발행
/status                                       # 모든 캠페인 칸반
/status --watch                               # 실시간 갱신 (Ctrl-C)

# 또는 직접 CLI
npm run validate:example
npm run profile:show
node bin/campaign-new.mjs "..."
node bin/generate.mjs <slug> --all
```

## 디렉터리

```
marketing_agent/
├── plugin.json                 # Claude Code 플러그인 매니페스트
├── package.json                # 의존성 (yaml, ajv, picocolors)
├── .env.example                # provider/BYO 키 템플릿
├── bin/
│   ├── cli.mjs                 # marketing-agent <subcmd> 디스패처
│   ├── profile-validate.mjs    # 스키마 검증기
│   ├── profile-show.mjs        # 프로필 요약 출력
│   ├── campaign-new.mjs        # 캠페인 디렉터리 생성
│   ├── generate.mjs            # 채널별 draft 생성 (provider 호출 + 가디언)
│   ├── preview.mjs             # draft 콘솔 렌더링
│   ├── approve.mjs             # 발행 대기로 승격
│   └── reject.mjs              # 거절 + 피드백 기록
├── src/content-engine/
│   ├── provider.mjs            # Provider 인터페이스 (JSDoc 타입)
│   ├── registry.mjs            # CONTENT_ENGINE_PROVIDER 로 선택, mock 폴백
│   ├── brand-guardian.mjs      # 채널 룰 + 회사 금기 검사 (결정론적)
│   └── providers/
│       ├── mock.mjs            # 결정론적 카피·SVG (오프라인 동작)
│       ├── openai-images.mjs   # BYO OPENAI_API_KEY (chat + gpt-image-1)
│       └── inhouse.mjs         # 자사 게이트웨이 stub (Phase 4+)
├── docs/ARCHITECTURE.md
├── schemas/                    # company-profile / campaign-brief / draft
├── examples/
├── skills/onboard-company/     # Claude Skill
├── agents/                     # copywriter / image-director / brand-guardian
├── commands/                   # /onboard /campaign-new /generate /preview /approve /reject /status
├── channels/
│   ├── threads/                # ✅ Reference (Threads Graph API)
│   └── linkedin/               # ✅ Reference (UGC API, OAuth)
└── statusline/
```

## 단계 (현재: Phase 5 + 4.1 진행중)

- [x] Phase 1 — 전략 팩 스펙 + Threads reference + 온보딩 skill 초안
- [x] Phase 2 — 스키마 검증기, /onboard update·show, /campaign new, LinkedIn reference
- [x] Phase 3 — 콘텐츠 엔진 어댑터(mock/openai/inhouse-stub) + brand-guardian + /generate /preview /approve /reject + copywriter·image-director·brand-guardian subagent 정의
- [x] Phase 4 — Publisher (Threads/LinkedIn 어댑터, dry-run 기본, /publish /auth, publisher subagent). 텍스트 발행만
- [x] Phase 5 — 칸반 보드 (`bin/board.mjs`) + statusline 색상·진행바 + `/status --watch`
- [x] Phase 4.1 — 이미지 업로드 (fal.ai → CDN URL → 발행) + 자동 재시도
- [x] Phase 4.2 — 카드뉴스 캐러셀 (Threads CAROUSEL · LinkedIn multi-image) + cadence별 자동 카드 수
- [ ] Phase 6 — 사내 패키징·배포

## Provider 선택

```bash
# .env.local
CONTENT_ENGINE_PROVIDER=openai      # mock | openai | inhouse
OPENAI_API_KEY=sk-...
```

healthcheck 실패 시 자동으로 `mock` 으로 폴백 (offline·CI 안전).

## 보안

- SNS 자격증명·BYO API 키는 **로컬에만 저장** (`.env.local` 또는 OS 키체인, 자사 서버 무보관)
- 자동 발행 금지 — **휴먼 승인 게이트 필수** (`/preview` → `/approve`)
- 가디언 차단된 draft는 `/approve` 거부됨

## 라이선스

Proprietary — Totaro Inc. 사내·계약 고객사 전용. 외부 배포 금지.
