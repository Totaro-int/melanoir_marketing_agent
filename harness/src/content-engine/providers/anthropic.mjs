// Anthropic Claude provider — copy generation only.
// Image generation is not supported; callers should pair this with fal.mjs for images.
//
// Env: ANTHROPIC_API_KEY (required), ANTHROPIC_COPY_MODEL (default claude-haiku-4-5-20251001)

import { assertProvider } from '../provider.mjs';
import { provider as mock } from './mock.mjs';

const KEY = () => process.env.ANTHROPIC_API_KEY ?? '';
const COPY_MODEL = () => process.env.ANTHROPIC_COPY_MODEL ?? 'claude-haiku-4-5-20251001';

function buildSystemPrompt(profile, channel, channelDocs) {
  const w = profile?.writing ?? {};

  const formatLabels = {
    single_punchline: '한 줄 임팩트 (짧고 강렬)',
    narrative_thread: '스토리텔링 (기승전결)',
    data_driven: '수치·근거 중심',
    question_hook: '질문으로 시작',
    listicle: '리스트형 (3가지, 5가지)',
  };
  const sentenceLengthNote = { short: '짧고 끊기는 호흡', medium: '보통 길이', long: '긴 서술형' }[w.sentenceLength] ?? '';
  const ctaNote = { direct: '직접적 CTA ("지금 시작하세요")', soft: '제안형 CTA ("한번 살펴보세요")', implicit: 'CTA 없이 궁금증만 남김' }[w.ctaStyle] ?? '';
  const emojiNote = { none: '이모지 없음', minimal: '강조용 이모지 1~2개만', moderate: '이모지 자연스럽게 여러 개' }[w.emojiUsage] ?? '';

  const writingLines = [
    w.formats?.length ? `선호 포맷: ${w.formats.map((f) => formatLabels[f] ?? f).join(' / ')}` : '',
    sentenceLengthNote ? `문장 길이: ${sentenceLengthNote}` : '',
    ctaNote ? `CTA 방식: ${ctaNote}` : '',
    emojiNote ? `이모지: ${emojiNote}` : '',
  ].filter(Boolean);

  const refPostsSection = w.referencePosts?.length
    ? `참고 포스트 스타일 예시 (이 스타일을 참고해 작성):\n${w.referencePosts.map((p, i) => `[예시 ${i + 1}]\n${p}`).join('\n\n')}`
    : '';

  return [
    `당신은 ${profile.brand?.name ?? ''}의 SNS 카피라이터입니다.`,
    `대상 채널: ${channel}.`,
    profile.tone?.voiceNotes ? `톤 가이드:\n${profile.tone.voiceNotes}` : '',
    writingLines.length ? `글쓰기 스타일:\n${writingLines.join('\n')}` : '',
    refPostsSection,
    profile.banned?.words?.length ? `금기어: ${profile.banned.words.join(', ')}` : '',
    profile.banned?.claims?.length ? `금기 표현: ${profile.banned.claims.join(', ')}` : '',
    `채널 전략 요약:\n${truncate(channelDocs?.strategy, 1500)}`,
    `템플릿 가이드:\n${truncate(channelDocs?.templates, 1500)}`,
    '오직 본문만 출력하세요. 해시태그는 본문 끝에 줄바꿈 후 1~5개 (채널에 맞게).',
  ].filter(Boolean).join('\n\n');
}

function truncate(s, n) { return (s ?? '').slice(0, n); }

export const provider = assertProvider({
  id: 'anthropic',
  byok: true,

  async generateCopy(req) {
    const t0 = Date.now();
    const sys = buildSystemPrompt(req.profile, req.channel, req.channelDocs);
    const user = `캠페인 주제: ${req.brief.topic}\n목표: ${req.brief.goal}\ncadence: ${req.brief.cadence}`;

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

  async generateImage(req) {
    return mock.generateImage(req);
  },

  healthcheck() {
    if (!KEY()) return { ok: false, reason: 'ANTHROPIC_API_KEY not set' };
    return { ok: true };
  },
});

function extractHashtags(text) {
  return Array.from(new Set((text.match(/#[^\s#]+/g) ?? [])));
}
