# posts/ — 결과물 보기

```
posts/
├── campaigns/<date>-<slug>/      ← 캠페인 원본 (brief.yaml + 채널별 draft/asset)
│   ├── brief.yaml
│   ├── threads/  draft.md, assets/...
│   ├── linkedin/ draft.md, ...
│   └── ...
└── by-channel/<채널>/<slug>/     ← 같은 폴더로 향한 symlink (한눈에 보기용)
    ├── threads/2026-05-02-신제품-런칭/   → ../../campaigns/2026-05-02-신제품-런칭/threads
    ├── instagram/...
    └── ...
```

`by-channel/` 은 `harness/bin/sync-posts.mjs` 가 자동으로 갱신함 (campaign-new 시 호출). 손으로 다시 돌리려면:

```
node harness/bin/sync-posts.mjs           # 추가
node harness/bin/sync-posts.mjs --prune   # 사라진 캠페인의 dangling symlink 정리
```

> 이 폴더 안의 모든 파일은 사람이 보는 결과물입니다. 코드는 `../harness/` 에 있습니다.
