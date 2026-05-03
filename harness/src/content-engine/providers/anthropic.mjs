// Anthropic Claude provider — copy generation only.
// Image generation is not supported; callers should pair this with fal.mjs for images.
//
// Env: ANTHROPIC_API_KEY (required), ANTHROPIC_COPY_MODEL (default claude-haiku-4-5-20251001)

import { assertProvider } from '../provider.mjs';

const KEY = () => process.env.ANTHROPIC_API_KEY ?? '';
const COPY_MODEL = () => process.env.ANTHROPIC_COPY_MODEL ?? 'claude-haiku-4-5-20251001';

const GOAL_DESC = {
  awareness:          '브랜드 인지도 확대 — 처음 보는 사람도 기억에 남도록',
  engagement:         '반응·대화 유도 — 댓글·공유·저장을 끌어내도록',
  conversion:         '전환 유도 — 링크 클릭·가입·구매로 이어지도록',
  retention:          '기존 고객 유지 — 신뢰와 관계를 강화하도록',
  recruitment:        '채용 — 함께 일하고 싶은 사람을 끌어오도록',
  thought_leadership: '업계 오피니언 리더십 확보 — 통찰을 나눠 신뢰를 쌓도록',
};

const ANGLE_DESC = {
  data_story:         '수치·데이터로 이야기 — 구체적 숫자가 주인공',
  counter_intuitive:  '역발상 — 독자가 당연하다고 여기는 것을 뒤집기',
  empathy:            '공감 — 독자의 고통을 먼저 이야기하고 해법 제시',
  declaration:        '선언 — 우리의 관점·신념을 직설적으로 표명',
  behind_the_scenes:  '비하인드 — 만들면서 겪은 실제 과정·실패·결정',
};

const FORMAT_LABELS = {
  single_punchline: '한 줄 임팩트 (짧고 강렬)',
  narrative_thread: '스토리텔링 (기승전결)',
  data_driven:      '수치·근거 중심',
  question_hook:    '질문으로 시작',
  listicle:         '리스트형 (3가지, 5가지)',
};

// goal + cadence + channel → 어떤 템플릿 ID를 쓸지 결정
function pickTemplateId(goal, cadence, channel) {
  const isLinkedIn = channel === 'linkedin';
  const p = isLinkedIn ? 'L' : 'T';

  if (cadence === 'series-3' || cadence === 'series-5') return `${p}2`;
  if (cadence === 'thread') return 'T5';

  const map = {
    awareness:          '1',
    engagement:         '1',
    thought_leadership: '1',
    conversion:         '3',
    retention:          '3',
    recruitment:        '4',
  };
  return `${p}${map[goal] ?? '1'}`;
}

// 템플릿 파일에서 특정 ID 섹션만 추출 (## T1. ~ 다음 ## 전까지)
function extractTemplateSection(templates, templateId) {
  if (!templates) return null;
  const lines = templates.split('\n');
  const startIdx = lines.findIndex((l) => new RegExp(`^## ${templateId}[.\\s]`).test(l));
  if (startIdx === -1) return null;
  const endIdx = lines.findIndex((l, i) => i > startIdx && /^## [TL]\d/.test(l));
  return lines.slice(startIdx, endIdx === -1 ? undefined : endIdx).join('\n').trim();
}

function buildSystemPrompt(profile, channel, channelDocs, goal, cadence) {
  const w    = profile?.writing ?? {};
  const tone = profile?.tone ?? {};

  const sentenceLengthNote = { short: '짧고 끊기는 호흡', medium: '보통 길이', long: '긴 서술형' }[w.sentenceLength] ?? '';
  const ctaNote   = { direct: '직접적 CTA ("지금 시작하세요")', soft: '제안형 CTA ("한번 살펴보세요")', implicit: 'CTA 없이 궁금증만 남김' }[w.ctaStyle] ?? '';
  const emojiNote = { none: '이모지 없음', minimal: '강조용 이모지 1~2개만', moderate: '이모지 자연스럽게 여러 개' }[w.emojiUsage] ?? '';

  const writingLines = [
    w.formats?.length   ? `선호 포맷: ${w.formats.map((f) => FORMAT_LABELS[f] ?? f).join(' / ')}` : '',
    sentenceLengthNote  ? `문장 길이: ${sentenceLengthNote}` : '',
    ctaNote             ? `CTA 방식: ${ctaNote}` : '',
    emojiNote           ? `이모지: ${emojiNote}` : '',
  ].filter(Boolean);

  const audiences = profile?.targetAudience ?? [];
  const audienceSection = audiences.length
    ? audiences.map((a) => {
        const lines = [`• ${a.segment ?? a.name ?? '타겟'}`];
        if (a.painPoints?.length) lines.push(`  고통: ${a.painPoints.join(', ')}`);
        if (a.desires?.length)    lines.push(`  욕구: ${a.desires.join(', ')}`);
        return lines.join('\n');
      }).join('\n')
    : '';

  const sampleSection = tone.sampleSentences?.length
    ? `참고 문장 (이 호흡으로 작성):\n${tone.sampleSentences.map((s, i) => `[${i + 1}] ${s}`).join('\n')}`
    : '';

  const refPostsSection = w.referencePosts?.length
    ? `참고 포스트 (이 스타일을 모방):\n${w.referencePosts.map((p, i) => `[예시 ${i + 1}]\n${p}`).join('\n\n')}`
    : '';

  // goal+cadence+channel에 맞는 템플릿 1개만 전달
  const templateId = pickTemplateId(goal, cadence, channel);
  const templateSection = extractTemplateSection(channelDocs?.templates, templateId);

  return [
    `당신은 ${profile.brand?.name ?? '브랜드'}의 SNS 카피라이터입니다.`,
    `채널: ${channel}.`,
    profile.brand?.description ? `브랜드 소개: ${profile.brand.description}` : '',
    tone.voiceNotes             ? `톤 가이드:\n${tone.voiceNotes}` : '',
    sampleSection,
    writingLines.length         ? `글쓰기 스타일:\n${writingLines.join('\n')}` : '',
    audienceSection             ? `타겟 오디언스:\n${audienceSection}` : '',
    refPostsSection,
    profile.banned?.words?.length  ? `절대 사용 금지 단어: ${profile.banned.words.join(', ')}` : '',
    profile.banned?.claims?.length ? `절대 사용 금지 표현: ${profile.banned.claims.join(', ')}` : '',
    channelDocs?.strategy  ? `채널 전략:\n${truncate(channelDocs.strategy, 2000)}` : '',
    templateSection        ? `사용할 템플릿 구조 (${templateId}):\n${templateSection}` : '',
    [
      '규칙:',
      '- 오직 완성된 본문만 출력. 설명·제목·메모 없음.',
      '- 첫 줄은 반드시 80자(한국어 기준) 이내 — 피드에서 이 줄만 보임.',
      '- 해시태그는 본문 끝 줄바꿈 후 채널 규칙에 맞게.',
      '- 템플릿 {괄호} 문장은 그대로 쓰지 말 것 — 회사 톤으로 재해석.',
    ].join('\n'),
  ].filter(Boolean).join('\n\n');
}

function buildUserPrompt(brief, { cardRole, cardIndex, cardTotal } = {}) {
  const goalDesc = GOAL_DESC[brief.goal] ?? brief.goal;
  const cadenceLabel = { single: '단일 포스트', 'series-3': '카드뉴스 3장', 'series-5': '카드뉴스 5장', thread: '텍스트 스레드' }[brief.cadence] ?? brief.cadence;

  const lines = [
    `주제: ${brief.topic}`,
    `목표: ${goalDesc}`,
    `형식: ${cadenceLabel}`,
  ];

  if (cardTotal > 1) {
    const roleLabel = { hook: '도입 — 스크롤을 멈추게 하는 첫 카드', body: '본문 — 핵심 내용 전달', cta: '마무리 — 행동 유도' }[cardRole] ?? cardRole;
    lines.push(`\n[시리즈 카드 ${cardIndex}/${cardTotal}: ${roleLabel}]`);
    lines.push('이 카드 하나의 텍스트만 작성. 앞뒤 카드 내용을 요약·반복하지 말 것.');
  }

  if (brief.keyMessage) lines.push(`\n핵심 메시지: ${brief.keyMessage}`);
  if (brief.contentPoints?.length) {
    lines.push(`소재·데이터 (반드시 활용):\n${brief.contentPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}`);
  }
  if (brief.angle) {
    lines.push(`각도: ${ANGLE_DESC[brief.angle] ?? brief.angle}`);
  }
  if (brief.notes) lines.push(`추가 지시: ${brief.notes}`);

  return lines.join('\n');
}

function cadenceDesc(c) {
  return { single: '단일 포스트', 'series-3': '카드뉴스 3장', 'series-5': '카드뉴스 5장', thread: '텍스트 스레드' }[c] ?? c;
}

function truncate(s, n) { return (s ?? '').slice(0, n); }

export const provider = assertProvider({
  id: 'anthropic',
  byok: true,

  async generateCopy(req) {
    const t0 = Date.now();
    const sys  = buildSystemPrompt(req.profile, req.channel, req.channelDocs, req.brief.goal, req.brief.cadence);
    const user = buildUserPrompt(req.brief, {
      cardRole:  req.cardRole,
      cardIndex: req.cardIndex,
      cardTotal: req.cardTotal,
    });

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
