// Anthropic Claude provider — copy generation only.
// Image generation is not supported; callers should pair this with fal.mjs for images.
//
// Env: ANTHROPIC_API_KEY (required), ANTHROPIC_COPY_MODEL (default claude-haiku-4-5-20251001)

import { assertProvider } from '../provider.mjs';

const KEY = () => process.env.ANTHROPIC_API_KEY ?? '';
const COPY_MODEL = () => process.env.ANTHROPIC_COPY_MODEL ?? 'claude-haiku-4-5-20251001';

const GOAL_DESC = {
  awareness:   '브랜드 인지도 확대 — 처음 보는 사람도 기억에 남도록',
  engagement:  '반응·대화 유도 — 댓글·공유·저장을 끌어내도록',
  conversion:  '전환 유도 — 링크 클릭·가입·구매로 이어지도록',
  retention:   '기존 고객 유지 — 신뢰와 관계를 강화하도록',
  recruitment: '채용 — 함께 일하고 싶은 사람을 끌어오도록',
  thought_leadership: '업계 오피니언 리더십 확보 — 통찰을 나눠 신뢰를 쌓도록',
};

const FORMAT_LABELS = {
  single_punchline: '한 줄 임팩트 (짧고 강렬)',
  narrative_thread: '스토리텔링 (기승전결)',
  data_driven:      '수치·근거 중심',
  question_hook:    '질문으로 시작',
  listicle:         '리스트형 (3가지, 5가지)',
};

function buildSystemPrompt(profile, channel, channelDocs) {
  const w   = profile?.writing ?? {};
  const tone = profile?.tone ?? {};

  // 글쓰기 스타일
  const sentenceLengthNote = { short: '짧고 끊기는 호흡', medium: '보통 길이', long: '긴 서술형' }[w.sentenceLength] ?? '';
  const ctaNote  = { direct: '직접적 CTA ("지금 시작하세요")', soft: '제안형 CTA ("한번 살펴보세요")', implicit: 'CTA 없이 궁금증만 남김' }[w.ctaStyle] ?? '';
  const emojiNote = { none: '이모지 없음', minimal: '강조용 이모지 1~2개만', moderate: '이모지 자연스럽게 여러 개' }[w.emojiUsage] ?? '';

  const writingLines = [
    w.formats?.length        ? `선호 포맷: ${w.formats.map((f) => FORMAT_LABELS[f] ?? f).join(' / ')}` : '',
    sentenceLengthNote       ? `문장 길이: ${sentenceLengthNote}` : '',
    ctaNote                  ? `CTA 방식: ${ctaNote}` : '',
    emojiNote                ? `이모지: ${emojiNote}` : '',
  ].filter(Boolean);

  // 타겟 오디언스
  const audiences = profile?.targetAudience ?? [];
  const audienceSection = audiences.length
    ? audiences.map((a) => {
        const lines = [`• ${a.segment ?? a.name ?? '타겟'}`];
        if (a.painPoints?.length) lines.push(`  고통: ${a.painPoints.join(', ')}`);
        if (a.desires?.length)    lines.push(`  욕구: ${a.desires.join(', ')}`);
        return lines.join('\n');
      }).join('\n')
    : '';

  // 샘플 문장 (톤 학습용)
  const sampleSection = tone.sampleSentences?.length
    ? `참고 문장 스타일 (이 호흡으로 작성):\n${tone.sampleSentences.map((s, i) => `[${i + 1}] ${s}`).join('\n')}`
    : '';

  // 과거 포스트 레퍼런스
  const refPostsSection = w.referencePosts?.length
    ? `참고 포스트 (이 스타일을 모방):\n${w.referencePosts.map((p, i) => `[예시 ${i + 1}]\n${p}`).join('\n\n')}`
    : '';

  return [
    `당신은 ${profile.brand?.name ?? '브랜드'}의 SNS 카피라이터입니다.`,
    `채널: ${channel}.`,
    profile.brand?.description ? `브랜드 소개: ${profile.brand.description}` : '',
    tone.voiceNotes              ? `톤 가이드:\n${tone.voiceNotes}` : '',
    sampleSection,
    writingLines.length          ? `글쓰기 스타일:\n${writingLines.join('\n')}` : '',
    audienceSection              ? `타겟 오디언스:\n${audienceSection}` : '',
    refPostsSection,
    profile.banned?.words?.length  ? `절대 사용 금지 단어: ${profile.banned.words.join(', ')}` : '',
    profile.banned?.claims?.length ? `절대 사용 금지 표현: ${profile.banned.claims.join(', ')}` : '',
    channelDocs?.strategy  ? `채널 전략:\n${truncate(channelDocs.strategy, 2000)}` : '',
    channelDocs?.templates ? `템플릿 구조 (참고용):\n${truncate(channelDocs.templates, 1500)}` : '',
    [
      '규칙:',
      '- 오직 완성된 본문만 출력. 설명·제목·메모 없음.',
      '- 해시태그는 본문 끝 줄바꿈 후 채널 규칙에 맞게.',
      '- 템플릿 문장을 그대로 쓰지 말 것 — 회사 톤으로 재해석.',
    ].join('\n'),
  ].filter(Boolean).join('\n\n');
}

function buildUserPrompt(brief) {
  const goalDesc = GOAL_DESC[brief.goal] ?? brief.goal;
  const lines = [
    `주제: ${brief.topic}`,
    `목표: ${goalDesc}`,
    `형식: ${cadenceDesc(brief.cadence)}`,
  ];
  if (brief.notes) lines.push(`추가 지시: ${brief.notes}`);
  return lines.join('\n');
}

function cadenceDesc(cadence) {
  return {
    single:   '단일 포스트 1개',
    'series-3': '카드뉴스 3장 시리즈 (도입 → 본문 → 마무리)',
    'series-5': '카드뉴스 5장 시리즈',
    thread:   '텍스트 스레드 (이미지 없음)',
  }[cadence] ?? cadence;
}

function truncate(s, n) { return (s ?? '').slice(0, n); }

export const provider = assertProvider({
  id: 'anthropic',
  byok: true,

  async generateCopy(req) {
    const t0 = Date.now();
    const sys  = buildSystemPrompt(req.profile, req.channel, req.channelDocs);
    const user = buildUserPrompt(req.brief);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': KEY(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: COPY_MODEL(),
        max_tokens: 1024,
        system: sys,
        messages: [{ role: 'user', content: user }],
      }),
    });

    if (!res.ok) throw new Error(`Anthropic copy failed: ${res.status} ${await res.text()}`);
    const json = await res.json();
    const text = json.content?.[0]?.text?.trim() ?? '';

    return {
      text,
      hashtags: extractHashtags(text),
      meta: {
        provider: 'anthropic',
        model: COPY_MODEL(),
        latencyMs: Date.now() - t0,
        tokensIn: json.usage?.input_tokens,
        tokensOut: json.usage?.output_tokens,
      },
    };
  },

  async generateImage() {
    throw new Error('anthropic provider는 이미지 생성을 지원하지 않습니다. CONTENT_ENGINE_PROVIDER=fal 또는 openai 로 설정하세요.');
  },

  healthcheck() {
    if (!KEY()) return { ok: false, reason: 'ANTHROPIC_API_KEY not set' };
    return { ok: true };
  },
});

function extractHashtags(text) {
  return Array.from(new Set((text.match(/#[^\s#]+/g) ?? [])));
}
