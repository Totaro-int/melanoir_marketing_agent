# marketing_ai

업플로우 사내·고객사 SNS 마케팅 자동화 하네스 (Claude Code 플러그인).

## 무엇

- Claude Code를 실행 엔진으로 쓰는 SNS 마케팅 자동화 도구
- GitHub 한 개로 배포되는 **채널별 전략 팩** + **회사 프로필 온보딩** + **콘텐츠 생성 어댑터** + **Publisher** + **CLI 진행 보드**
- B2B 내부 운영툴 (사내·고객사 전용, 비공개)

## 빠른 시작

```bash
# 1) Claude Code 플러그인으로 로드 (개발 모드)
cd /path/to/your/project
ln -s /Users/songseungju/upflow/marketing_ai .claude/plugins/marketing_ai

# 2) Claude Code 안에서
/onboard           # 회사 프로필 인터뷰
/campaign new      # 새 캠페인 브리프 작성
/status            # 채널별 진행 보드
```

## 디렉터리

```
marketing_ai/
├── plugin.json                 # Claude Code 플러그인 매니페스트
├── docs/ARCHITECTURE.md        # 아키텍처
├── schemas/                    # 회사 프로필·캠페인 스키마
├── examples/                   # 샘플 회사 프로필
├── skills/                     # Claude Skills (온보딩·카피라이팅 등)
├── commands/                   # /onboard, /campaign new, /status
├── channels/                   # 채널별 전략·템플릿·체크리스트
│   ├── threads/                # ✅ Reference 채널 (Phase 1 완성)
│   └── linkedin/               # ⏳ 다음 채널
└── statusline/                 # Claude Code statusline 스크립트
```

## 단계 (현재: Phase 1)

- [x] Phase 1 — 전략 팩 스펙 + Threads reference + 온보딩 skill 초안
- [ ] Phase 2 — 회사 프로필 검증·업데이트 명령
- [ ] Phase 3 — Content Engine (BYO 키 어댑터 우선, 자사 API stub)
- [ ] Phase 4 — Publisher (Threads / LinkedIn 공식 API)
- [ ] Phase 5 — CLI 칸반 보드 (statusline + Ink 보조창)
- [ ] Phase 6 — 사내 패키징·배포

## 보안

- SNS 자격증명·BYO API 키는 **로컬에만 저장** (OS 키체인 권장, 자사 서버 무보관)
- 자동 발행 금지 — **휴먼 승인 게이트 필수**
- 상세: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## 라이선스

Proprietary — Upflow Inc. 사내·계약 고객사 전용. 외부 배포 금지.
