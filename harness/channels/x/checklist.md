# X (Twitter) 발행 전 체크리스트

## 자동 점검

### 텍스트
- [ ] 본문 길이 ≤ 280자 (한국어 ~140자, 권장 ~200자)
- [ ] 해시태그 1~2개 (도배 금지)
- [ ] `banned.words / claims / topics` 미포함
- [ ] `hashtags.always` 포함 (1~2개 한도 안)
- [ ] (광고 분류 시) `legal.adHashtag` 포함
- [ ] 줄바꿈 1~2개 이하 (X는 한 호흡)

### 이미지
- [ ] 0~4장 범위
- [ ] 16:9 또는 1:1 aspect
- [ ] Hero stat 150~200px (X는 수치 거대화)
- [ ] 텍스트 점유 30% 이하 (white space 우선)

### thread (시리즈)
- [ ] 첫 트윗이 단독으로 가치 있는가?
- [ ] 각 트윗 ≤ 280자

## 수동 점검
- [ ] 첫 줄이 retweet 가치 있는가?
- [ ] 광고 톤 X?
- [ ] 수치·사실 확인
- [ ] 회사 톤(`tone.voiceNotes`)에 맞춰 punchy 변환됐는가?

## 실패 시
- 자동: 어느 룰 깨졌는지 표시
- 수동 reject: copywriter 재생성 (X는 짧을수록 좋다 강조)
