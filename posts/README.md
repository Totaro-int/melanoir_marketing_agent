# posts/ — 결과물 보기

```
posts/
├── slots.yaml                                  ← 반복용 캠페인 슬롯 (최대 5개)
├── campaigns/<날짜>-<주제-슬러그>/             ← 캠페인 원본 (단일 진실의 출처)
│   ├── brief.yaml                              ← topic / channels / slotTopic / ...
│   ├── threads/   draft.md, assets/, ...
│   ├── linkedin/  draft.md, assets/, ...
│   └── ...
└── by-channel/<채널>/<슬롯-슬러그>/<캠페인>/   ← 채널·슬롯별 한눈 보기 (campaigns 로 향한 symlink)
    ├── instagram/
    │   ├── 신제품-런칭/2026-05-03-신제품-런칭/   → ../../../campaigns/.../instagram
    │   ├── 신제품-런칭/2026-05-10-신제품-런칭-v2/
    │   ├── 주간-업데이트/...
    │   └── _ungrouped/2026-05-03-테스트/        ← 슬롯과 매칭 안 된 일회성/테스트
    ├── threads/
    └── ...
```

## 매칭 우선순위 (campaign → 슬롯 폴더)

1. `brief.slotTopic` — 살아있는 슬롯과 매칭되면 그 슬롯 폴더로
2. `brief.topic` ↔ `slot.topic` 정규화 일치 (legacy/소급)
3. 그 외 → `_ungrouped/`

슬롯이 삭제되면 그 슬롯의 모든 캠페인은 다음 sync 때 `_ungrouped/` 로 이동합니다 (이력은 `brief.slotTopic` 메타에 남음).

## 자동 동기화

`harness/bin/sync-posts.mjs` 가 매 실행마다 by-channel 전체를 wipe-and-rebuild 합니다 (= 슬롯 추가/삭제·이름변경 자동 반영). `campaign-new` 종료 시 자동 호출.

손으로 다시 돌리려면:

```
node harness/bin/sync-posts.mjs           # 동기화
node harness/bin/sync-posts.mjs --prune   # 비어버린 슬롯 폴더까지 정리
```

> 이 폴더 안의 모든 파일은 사람이 보는 결과물입니다. 코드는 `../harness/` 에 있습니다.
