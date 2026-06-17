# 인사이트 카드 (카드레터) — 매일 발행 가이드

브랜드 사진 1장 + 인사이트 텍스트 한 줄 → **카드레터 이미지**(사진 풀블리드 + 텍스트 오버레이).
매일 1장씩 ① 클라이언트 웹사이트 인사이트 페이지 + ② 인스타그램에 발행한다.

> 이미지 소스 = **클라가 제공한 사진 풀**. 에이전트는 텍스트만 올린다(생성 이미지 아님).
> 레이아웃 고정 = 결정론적. LLM/서브에이전트 불필요 → cron 으로 바로 돌릴 수 있다.

---

## 1) 한 번만 준비 (설치 시)

**(a) 사진 풀** — 클라가 찍은 브랜드 사진을 한 폴더에 모은다 (기본 경로):

```
posts/insight-photos/        ← 여기에 .jpg/.png/.webp 를 쭉 넣는다 (gitignore, 커밋 안 됨)
```

날짜로 자동 회전(매일 다음 사진). 사진이 없으면 모노톤 그라디언트로 폴백.

**(b) 토픽 목록** — 예시를 복사해서 편집:

```bash
cp harness/examples/insights-topics.example.txt insights-topics.txt
```

한 줄 = 한 인사이트, `카테고리 | 제목 | 서브타이틀`. 날짜로 순환(매일 다음 줄).

```
소재 인사이트 | 색소 안전성은 '검출 안 됨' 데이터로 증명한다 | 28종 불검출 · 무균 시험 적합
멜라닌 과학 | 자연이 설계한 가장 안전한 블랙, 멜라닌 | 피부가 본래 쓰는 광보호 분자를 색소로
```

**(c) 웹사이트 경로** — 인사이트 페이지가 있는 정적 사이트 레포의 insights 디렉토리:

```
<melanoir-recruitment 클론>/web/site/insights
```

---

## 2) 카드 1장만 — `insight:card`

```bash
npm run insight:card -- --title="색소 안전성은 데이터로 증명한다" \
  --subtitle="28종 유해물질 불검출" --category="소재 인사이트" \
  --photo-dir=posts/insight-photos
# → out/insight-<날짜>.png (1080x1350, IG 4:5)
```

`--photo=<경로>` 로 특정 사진을 직접 지정할 수도 있다. `--website=<...>/web/site/insights` 를 주면 그 사이트에도 바로 발행.

## 3) 매일 자동 발행 — `insight:daily` (권장)

토픽 + 사진을 날짜로 골라 카드 생성 → 웹 발행 → IG 캡션 작성 → 웹 레포 커밋까지 한 번에.

```bash
npm run insight:daily -- \
  --photo-dir=posts/insight-photos \
  --website="/path/to/melanoir-recruitment/web/site/insights" \
  --commit --push
```

| 플래그 | 동작 |
|---|---|
| (기본) | `insights-topics.txt` + `posts/insight-photos` 사용, `out/` 에 카드만 |
| `--website=<insights경로>` | 그 사이트 `cards/<날짜>.png` + `cards.json` 갱신 (페이지가 읽어 렌더) |
| `--commit` | 웹 레포에 커밋 (`web/site/insights` 만) |
| `--push` | 커밋 후 푸시 → Vercel 자동배포 |
| `--date=YYYY-MM-DD` | 특정 날짜로(테스트/백필) |
| `--dry-run` | 어떤 토픽·사진이 뽑히는지만 확인 |

산출물:
- `cards/<날짜>.png` — 카드레터 이미지 (사이트 + IG 공용)
- `cards.json` — 사이트가 읽는 목록 (맨 앞에 오늘 항목 추가, 같은 날 재실행 시 교체)
- `cards/<날짜>.caption.txt` — IG 캡션 (제목+서브+브랜드 해시태그, company-profile 에서 자동)

## 4) cron 으로 매일 (선택)

매일 아침 한 줄 발행을 자동화하려면 (예: 매일 08:10):

```cron
10 8 * * *  cd /path/to/melanoir_marketing_agent && npm run insight:daily -- --website="/path/to/melanoir-recruitment/web/site/insights" --commit --push >> logs/insight-daily.log 2>&1
```

`--push` 권한이 없으면 빼고 돌린 뒤(로컬 커밋만) 사람이 push.

## 5) 인스타그램 발행

`insight:daily` 가 만든 **카드 PNG + 캡션**으로 인스타에 단일 이미지 포스트:
- 손쉬운 길: 대시보드/`browser-publish` 의 단일 이미지 포스트로 카드 PNG 첨부 + 캡션 붙여넣기 → [공유] 클릭.
- 카드는 4:5(1080x1350) 포트레이트라 IG 피드에 바로 맞는다.

> IG 자동 포스트(morning 루틴에 카드레터를 IG 이미지로 끼우기)는 §0 동결 파이프라인
> (`posts/campaigns/`)을 건드려야 해서 별도 승인 작업으로 분리. 현재는 카드+캡션이
> **IG-ready** 상태로 나오고, 발행은 기존 browser-publish/대시보드 경로를 쓴다.

---

## 웹 페이지 쪽 (참고)

정적 사이트의 `web/site/insights/` 가 `cards.json` 을 읽어 카드 그리드를 렌더한다.
기존 사이트 구조는 건드리지 않는 **추가 페이지**. 계약은 그 레포의 `insights/README.md` 참조.
