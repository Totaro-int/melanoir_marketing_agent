# 발행 런북 — 천연 자외선 차단/멜라닌 (멜라누아 · 네이버)

> 회사: 멜라누아(Melanoir) · 채널: naver-blog · 모드: ai-briefing(AEO) · 정보성
> 본문(텍스트+구조)은 Mac에서 검증 완료. **남은 것 = 이미지 4장 + 최종 발행.**
> 윈도우(FAL_KEY + 네이버 로그인 보유)에서 아래대로 이어서 진행.

## 적용된 에이전트 수정 (이 커밋에 포함)
- `browser-publish.mjs`: 네이버 **로그인 대기**(미로그인 시 창에서 로그인할 때까지 polling) + **붙여넣기 ⌘V/Ctrl+V 자동 감지**(Mac 호환)
- `copywriter.md`: relate.kr 에디토리얼 구조(목차·H2 넘버링·요약 인용구·굵은 리드 불릿·점 구분)
- `image-director.md`: 블로그 이미지 `fast-sdxl` 금지 → `gen-image.mjs`(기본 `nano-banana-2`)
- draft 파일명은 `YYYYMMDD-HHMMSS.yaml` 규칙(= `latestDraftYaml`이 인식하는 형식)

## 1) pull
```bash
git pull
```

## 2) 이미지 4장 생성 (흑백 프리미엄 · FAL_KEY 필요)
> 출력 파일명 반드시 `img1.png ~ img4.png` (publisher가 `img{N}` 패턴으로 수집 → 본문 IMAGE_PLACEHOLDER 1~4에 순서대로 삽입). nano-banana 막히면 `set FAL_IMAGE_MODEL=fal-ai/flux/dev`.

```bash
node harness/bin/gen-image.mjs --aspect=landscape --out=posts/campaigns/2026-05-29-melanoir-천연자외선차단-멜라닌/naver-blog/img1.png --prompt="Editorial black and white photography, soft sunlight rays passing through to reveal abstract skin-like surface texture, dramatic chiaroscuro lighting, deep shadows, pure monochrome, minimalist science-beauty magazine aesthetic, generous negative space, ultra clean, high detail, no text"

node harness/bin/gen-image.mjs --aspect=square --out=posts/campaigns/2026-05-29-melanoir-천연자외선차단-멜라닌/naver-blog/img2.png --prompt="Minimalist black and white still life, three abstract glass elements arranged in a row on white seamless background, scientific yet elegant, soft gradient shadows, monochrome, editorial cosmetic ingredient photography, lots of negative space, high detail, no text"

node harness/bin/gen-image.mjs --aspect=landscape --out=posts/campaigns/2026-05-29-melanoir-천연자외선차단-멜라닌/naver-blog/img3.png --prompt="Macro black and white photography of dark fine powder material in a clean laboratory glass dish, single light source, deep blacks against white surface, premium research aesthetic, monochrome, shallow depth of field, editorial, high detail, no text"

node harness/bin/gen-image.mjs --aspect=landscape --out=posts/campaigns/2026-05-29-melanoir-천연자외선차단-멜라닌/naver-blog/img4.png --prompt="Minimalist black and white close-up of a cosmetic ingredient label detail, soft directional light, premium editorial mood, monochrome, clean negative space, calm trustworthy tone, high detail, no text"
```

## 3) 발행 (로그인 + 이미지 + 본문)
```bash
node harness/bin/browser-publish.mjs 2026-05-29-melanoir-천연자외선차단-멜라닌 --channel=naver-blog
```
- 창에서 네이버 로그인(이미 돼 있으면 자동 진행) → 제목·본문·이미지 자동 입력 → 모달에서 (원하면 비공개) → `[Y]` 발행
- 실패 시 status가 `failed`로 바뀜 → 재시도 전 `brief.yaml`의 `naver-blog: approved`로 되돌리기

> 참고: Mac에서 텍스트본을 이미 발행했다면 이미지본은 새 글로 올라감 → 텍스트본은 비공개/삭제.
