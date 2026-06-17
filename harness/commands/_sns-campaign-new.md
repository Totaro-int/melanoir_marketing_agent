---
name: sns-campaign-new
description: 새 캠페인 브리프와 채널 디렉터리만 생성. 카피/이미지 생성은 /sns-generate 또는 /sns-run.
---
> 업데이트 체크: `node harness/bin/check-updates.mjs` 실행 → `OK` 면 진행, `UPDATE_AVAILABLE` 이면 사용자에게 업데이트 여부 질문 후 진행. (상세: `harness/commands/_update-check.md`)

# /sns-campaign-new

캠페인 brief.yaml + 채널별 폴더 skeleton 만 생성. 카피/이미지/발행은 별도 명령.

## 동작 원칙 (Claude 가 따를 것)

`/sns-campaign-new` 호출 시:

1. **주제가 있으면** 바로 다음 실행:
   ```bash
   node harness/bin/campaign-new.mjs "<주제>" [--channels=...] [--goal=...] [--cadence=...]
   ```
2. **주제가 없으면** "주제 한 줄로 알려주세요" 만 묻기. 답 받자마자 위 실행.
3. **추가 정보를 묻지 말 것**. 채널/goal/cadence 는 사용자가 안 정하면:
   - 채널: `profile.channels.enabled` (없으면 11개 전체)
   - goal: `profile.campaigns.defaultGoals[0]` (보통 `awareness`)
   - cadence: `single`

## 사용 예시

```
/sns-campaign-new "신제품 런칭"
/sns-campaign-new "신제품 런칭" --channels=threads,bluesky
/sns-campaign-new "신제품 런칭" --cadence=series-3 --goal=lead
```

## 결과

- `posts/campaigns/<YYYY-MM-DD>-<slug>/brief.yaml` 생성
- `posts/campaigns/<slug>/<채널>/README.md` 채널별 placeholder
- `posts/by-channel/<채널>/<슬롯-slug>/<캠페인-slug>` symlink 자동 동기화 (슬롯 미매칭 시 `_ungrouped/` 로)

## 다음 단계

```
/sns-generate <slug>      카피 + 이미지 생성
/sns-preview <slug>       결과 보기
/sns-approve <slug> --channel=<ch>
# 발행 → 대시보드 [발행] 버튼 · npm run morning · 또는 (크롬 쿠키 로그인 후 [공유] 클릭):
node harness/bin/browser-publish.mjs <slug> --channel=<ch> --attach --pre-publish
```

또는 한 줄로: `/sns-run "<주제>"` (위 단계 자동).

## 직접 실행

```bash
node harness/bin/campaign-new.mjs "신제품 런칭" --channels=threads,bluesky --cadence=series-3
```
