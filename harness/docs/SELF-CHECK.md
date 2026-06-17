# self-check — 자가 점검·자동 수정 (납품/운영 전 안심 1커맨드)

`doctor` 가 못 잡는 **보안·git 위생·런타임** 사고를 점검하고, 안전한 건 자동으로 고친다.
이번 납품에서 실제로 터졌던 사고들(브랜드 프로필 공개 노출, gitignore 갭, Playwright 미설치)을 그대로 검사한다.

```bash
npm run self-check        # 점검만 (읽기 전용) + 고칠 명령 안내
npm run self-check:fix    # 안전한 자동 수정 적용
```

`setup.mjs` 끝에서 자동 1회 실행되므로, 새로 설치하면 바로 결과를 본다.

## 무엇을 검사하나

| 영역 | 검사 | 자동 수정(`--fix`) |
|---|---|---|
| 보안·git | `.gitignore` 가 민감 경로(`company-profile.yaml`·`auth/`·`.env`·`posts/sources`·`posts/insight-photos`)를 실제로 막는지 (`git check-ignore`) | ✅ 누락 줄 자동 추가 |
| 보안·git | 이미 **추적(커밋)된 민감파일** — 공개 노출 | ✅ `git rm --cached`(로컬 보존) + 경고 |
| 보안·git | 레포 PUBLIC 여부 (gh) — 민감파일 추적 중이면 🚨 치명 | ⚠ 수동 (`gh repo edit … --visibility private`) |
| 런타임 | Playwright Chromium 바이너리 (fresh 머신 발행 깨짐) | ✅ `npx playwright install chromium` |
| 런타임 | node_modules 존재 | ⚠ 수동 (`npm install`) |
| 일관성 | `company-profile.yaml` 존재 · 발행 가능 채널만 enabled · 예시 프로필 검증 | ⚠ 수동 |

## 종료 코드
- `0` = 정상 또는 경고만
- `2` = **미수정 치명(CRITICAL)** 존재 (민감파일 노출 등) — CI/morning 게이트로 사용 가능

## 자동 수정의 안전 경계
- **자동(`--fix`)**: 멱등·비파괴만 — gitignore 줄 추가, 추적 해제(로컬 파일 보존), Chromium 설치.
- **수동으로 남김**: 레포 비공개 전환(접근권한), 히스토리 재작성(force-push), 프로필 내용 편집 — 사람이 판단.
- ⚠ 추적 해제 후 **기존 클론**은 `pull` 시 그 파일이 삭제됨 → pull 전 백업 또는 재생성. 과거 커밋 히스토리엔 남는다.
