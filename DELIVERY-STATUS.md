# 납품 상태 (Melanoir) — 자율 점검 결과

> 밤사이 /loop 자율 점검·수정 결과. **"코드만 보지 말고 직접 실행"** 원칙대로
> 실제 실행으로 검증한 것만 ✅. 내일 클라이언트와 해야 하는 것은 🧑.

## 한 줄 요약

**내일 `git clone` → `node harness/bin/setup.mjs` → 가이드(PHASE 0~9) 따라가면 설치 완료.**
멜라누아 레포에 모든 작업 + 동작하는 setup + 프로필 + 30일 주제까지 들어있음.

---

## ✅ 자율로 실행 검증 완료

| 항목 | 검증 방법 | 결과 |
|------|----------|------|
| **clone → setup** | 실제 fresh clone 에서 setup.mjs 실행 | npm install(13pkg) → 디렉토리 → green |
| setup 부트스트랩 버그 | (발견·수정) picocolors import 로 fresh clone 즉사 | zero-dep 재작성, 검증 |
| **profile validate** | `profile-validate.mjs` | 멜라누아 프로필 통과 (enum 9개 오류 수정함) |
| **doctor** | `doctor.mjs --quick` | runtime/profile/env/content-engine 전부 green |
| **seed-calendar → 30일** | `seed-calendar.mjs --topics topics.txt` | 30 캠페인 + 브랜드 DNA 자동 주입 |
| **블로그 생성 품질** | copywriter 실제 디스패치 | AEO 블로그(H2 5·표·FAQ·인용) + **이미지 섹션별 인라인 배치** |
| 절대표현 guardian-block | (발견·수정) "유일한 근거"가 ad_law block 유발 | copywriter 규칙 강화 |
| **이미지 API(fal)** | fal balance 실 ping | HTTP 200, 키 유효 |
| **self-update** | check-updates.mjs 양쪽 경로 | synced→OK, 뒤처짐→UPDATE_AVAILABLE + pull 흐름 |
| **모니터링 서버** | /api/today, /api/channels, /api/calendar, /api/env | 전부 응답 |
| **쿠키 지속성** | cookie-store save/restore (전 세션) | 스냅샷 7채널, 복원 안전(현재 로그인 안 덮음) |
| **로그인 상태 캐시** | (전 세션 수정) 5분 stale → 20초 적응형 TTL | checkedAt 갱신 확인 |
| **아침 자동기동** | install-morning-cron 트리거 확인 | AtLogon(전원) + Daily 09:00, 태스크 Ready |
| **morning 루틴** | `morning-routine --dry-run` | collectWork→generate skip→pre-publish 시뮬 exit 0 |

## 🧑 내일 클라이언트와 (자율 불가 — 계정/실발행 필요)

| 항목 | 왜 내일 |
|------|---------|
| **이미지 API 키 발급** | 클라이언트 계정 로그인 필요 (fal.ai 권장). Chrome MCP로 콘솔 열기 → 로그인 → 키 → 대시보드 검증/저장 (PHASE 4) |
| **SNS 채널 로그인** | 사장님이 직접 로그인 (naver-blog/instagram/threads/linkedin). 대시보드 🔌 마법사 |
| **실제 발행** | 공개 포스팅이라 라이브로만. 발행 직전까지 자동, [공유]는 사람이 |
| **네이버 블로그 발행 인터리브** | 코드는 segment paste(text→image→text) 구현됨. 라이브 SmartEditor 최종 확인은 현장 |

## 내일 설치 순서 (가이드: harness/docs/CLAUDE-CODE-INSTALL.md)

```
0. Node20+/Git/Chrome 확인
1. node harness/bin/setup.mjs        # 의존성·폴더 (키 0개)
2. node harness/bin/doctor.mjs       # green 확인
3. 브랜드 DNA — company-profile.yaml 이미 레포에 포함 (브랜드북 PDF로 보강 가능)
4. 이미지 API 키 — Chrome MCP로 콘솔 → 로그인 → 키 → 검증/저장  🧑
5. scripts/start-demo.ps1            # Chrome 9222 + 대시보드
6. 채널 로그인 (대시보드 마법사)        🧑
7. seed-calendar (topics.txt 포함됨) → 30일
8. install-morning-cron.ps1 -Time 09:00
9. npm run morning                   # 리허설 → 발행 직전 탭
```

## 알려진 한계 / 주의

- **이미지**: 카드(인스타·스레드·링크드인)=Claude HTML(키 0). 블로그=AI 이미지 API(fal). 한글은 이미지에 안 그림 → 본문 텍스트로.
- **⚠ 블로그 이미지는 `/sns-start` 정상 플로우로 생성** — copywriter(본문+imageSlots) → image-director Blog Mode(슬롯별 fal 생성 + 본문 인라인 치환). 기존 블로그가 fal 이미지 4장 섹션별 인라인 = 검증됨. **수동 `--provider=fal --finalize` 는 소셜카드 경로라 블로그엔 부적합**(이미지 1장·인터리브 X). 검수 시 블로그는 /sns-start 로 생성해 인라인 배치 확인.
- **copywriter 가디언 정합 확인됨**: 절대표현("유일한 근거")·자가검열 메모("100%안전 미사용")를 본문에서 빼면 가디언 block→warn 으로 통과 (실행 확인). 두 규칙 copywriter.md §5 반영 완료.
- **네이버 쿠키**: 세션 만료 잦음 → morning preflight 가 만료 시 로그인창 자동 + 알림.
- **Chrome 먹통 시**: stop-demo → start-demo (쿠키 보존 + 복원).
- 자율 점검은 생성/구조/설정까지. 실발행 10회 반복은 현장에서.

## 레포 상태

- melanoir 레포 = 템플릿 전체 작업 동기화 + setup-fix + topics + PHASE4 + copywriter 정밀화.
- self-update: 토타로가 melanoir 에 푸시하면 클라이언트가 스킬 쓸 때 감지+업데이트 제안.
