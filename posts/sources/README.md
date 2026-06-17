# posts/sources/ — 브랜드 지침을 여기에 넣으세요

마케팅 에이전트가 **브랜드 지침을 참고해서 돌아가게** 하는 입력 폴더입니다.
여기 넣은 브랜드 자료를 `/sns-onboard` 가 읽어 `company-profile.yaml`(브랜드 DNA)로 정리하고,
그 profile 을 **카피 생성·브랜드 검수·인사이트 카드**가 전부 참조합니다.

## 무엇을 넣나
- **브랜드북 / 브랜드 가이드** (PDF, .md, .txt) — 태그라인, 컬러 HEX, 폰트, 브랜드 보이스, 금기어, 미학
- (선택) 제품 소개서, 톤앤매너 문서, 보도자료 등 톤·메시지의 근거가 되는 자료

> 이 폴더의 실제 자료는 **git 에 커밋되지 않습니다**(개인/브랜드 데이터). 이 README 만 추적됩니다.

## 반영하는 법 (한 번)
```bash
# 1) PDF 면 텍스트 추출 (md/txt 면 생략)
node harness/bin/parse-pdf.mjs "posts/sources/브랜드북.pdf" --out=posts/sources/brandbook.md

# 2) 온보딩 — posts/sources/ 를 읽어 company-profile.yaml 로 distill
/sns-onboard
```

→ 이후 모든 생성이 그 브랜드의 톤·금기어·컬러·폰트를 따릅니다.
인사이트 카드도 핸들·워드마크·폰트·컬러를 이 profile 에서 자동으로 가져옵니다.

## 관련 폴더
- `posts/insight-photos/` — 인사이트 카드(카드레터) 배경에 쓸 **브랜드 사진**을 여기 넣으세요. (gitignore)
- 자세한 인사이트 카드 운영: `harness/docs/INSIGHT-CARDS.md`
