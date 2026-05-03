// BYO OpenAI provider — uses OPENAI_API_KEY from env (or .env.local).
// Copy: chat completions (gpt-4o-mini default). Image: gpt-image-1.
// Stub-safe: if no key is set, healthcheck returns ok:false and the registry skips it.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import { assertProvider } from '../provider.mjs';

const ROOT = resolve(new URL('.', import.meta.url).pathname, '../../../..');
const KEY = () => process.env.OPENAI_API_KEY ?? '';
const COPY_MODEL = process.env.OPENAI_COPY_MODEL ?? 'gpt-4o-mini';
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1';
const IMAGE_QUALITY = process.env.OPENAI_IMAGE_QUALITY ?? 'high';

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
  id: 'openai',
  byok: true,

  async generateCopy(req) {
    const t0 = Date.now();
    const sys = buildSystemPrompt(req.profile, req.channel, req.channelDocs);
    const user = `캠페인 주제: ${req.brief.topic}\n목표: ${req.brief.goal}\ncadence: ${req.brief.cadence}`;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY()}` },
      body: JSON.stringify({
        model: COPY_MODEL,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        temperature: 0.7,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI copy failed: ${res.status} ${await res.text()}`);
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content?.trim() ?? '';
    return {
      text,
      hashtags: extractHashtags(text),
      meta: {
        provider: 'openai',
        model: COPY_MODEL,
        latencyMs: Date.now() - t0,
        tokensIn: json.usage?.prompt_tokens,
        tokensOut: json.usage?.completion_tokens,
      },
    };
  },

  async generateImage(req) {
    const t0 = Date.now();
    const size =
      req.aspect === 'portrait'  ? '1024x1536' :
      req.aspect === 'landscape' ? '1536x1024' :
      req.aspect === 'story'     ? '1024x1536' :
                                   '1024x1024';
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY()}` },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt: req.prompt,
        size,
        quality: IMAGE_QUALITY,
        background: 'opaque',
        n: req.count ?? 1,
        response_format: 'b64_json',
      }),
    });
    if (!res.ok) throw new Error(`OpenAI image failed: ${res.status} ${await res.text()}`);
    const json = await res.json();
    const dir = resolve(ROOT, 'out/openai-images');
    mkdirSync(dir, { recursive: true });
    const paths = [];
    for (const [i, item] of (json.data ?? []).entries()) {
      const buf = Buffer.from(item.b64_json, 'base64');
      const file = resolve(dir, `${Date.now()}-${i}.png`);
      writeFileSync(file, buf);
      paths.push(file.replace(ROOT + '/', ''));
    }
    return { paths, meta: { provider: 'openai', model: IMAGE_MODEL, latencyMs: Date.now() - t0 } };
  },

  healthcheck() {
    if (!KEY()) return { ok: false, reason: 'OPENAI_API_KEY not set' };
    return { ok: true };
  },
});

function extractHashtags(text) {
  return Array.from(new Set((text.match(/#[^\s#]+/g) ?? [])));
}
