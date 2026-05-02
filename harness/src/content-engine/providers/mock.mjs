// Mock provider — deterministic, offline. Used when no real provider is configured,
// and as the default in CI/tests. Pulls structure from the channel template + profile,
// so output is plausible enough to validate guardrails and the approval flow.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { assertProvider } from '../provider.mjs';

// harness/src/content-engine/providers/mock.mjs → PROJECT_ROOT 는 ../../../..
const ROOT = resolve(new URL('.', import.meta.url).pathname, '../../../..');

function pickTone(profile) {
  const preset = profile?.tone?.preset ?? 'professional';
  const ending = preset === 'witty' || preset === 'friendly' ? '~합니다' : '~합니다';
  return { preset, ending };
}

function pickHashtags(profile, channel) {
  const always = profile?.hashtags?.always ?? [];
  const pool = profile?.hashtags?.pool ?? [];
  const limits = { threads: 3, linkedin: 5 };
  const max = limits[channel] ?? 3;
  const seen = new Set();
  const out = [];
  for (const h of [...always, ...pool]) {
    if (out.length >= max) break;
    if (!seen.has(h)) { out.push(h); seen.add(h); }
  }
  return out;
}

function copyForThreads(brief, profile) {
  const brand = profile?.brand?.name ?? '브랜드';
  const tagline = profile?.taglineOneLine ?? '한 줄 소개';
  const pain = profile?.targetAudience?.[0]?.painPoints?.[0] ?? '운영의 시간을 잡아먹는 그것';
  return [
    `"${brief.topic}" 발표를 앞두고 다시 정리합니다.`,
    '',
    `${pain}.`,
    `${brand}이 보는 답은 단순합니다 — ${tagline}`,
    '',
    `이번 주, 그 단순함이 어떻게 작동하는지 보여드리겠습니다.`,
  ].join('\n');
}

function copyForLinkedIn(brief, profile) {
  const brand = profile?.brand?.name ?? '브랜드';
  const tagline = profile?.taglineOneLine ?? '한 줄 소개';
  const persona = profile?.targetAudience?.[0]?.persona ?? '의사결정자';
  const pain = profile?.targetAudience?.[0]?.painPoints?.[0] ?? '운영 비효율';
  return [
    `"${brief.topic}".`,
    `${persona}의 책상 위에 올려질 이야기입니다.`,
    `숫자는 일주일 뒤에 공유합니다.`,
    '',
    `우리는 ${pain}를 마주한 ${persona}와 일해 왔습니다.`,
    `같은 통증을 가진 50개 팀의 데이터를 정리해 보면 패턴이 분명합니다.`,
    `대부분의 팀은 도구가 아니라 운영 시간을 사고 있습니다.`,
    '',
    `${brand}은 그 시간을 줄이는 한 가지 방식 — ${tagline}`,
    `이번 발표는 그 첫 번째 결과입니다.`,
    '',
    `여러분의 팀에서는 같은 문제를 어떻게 다루고 계신가요?`,
  ].join('\n');
}

function copyFor(channel, brief, profile) {
  switch (channel) {
    case 'threads':  return copyForThreads(brief, profile);
    case 'linkedin': return copyForLinkedIn(brief, profile);
    default:         return `[${channel}] ${brief.topic}\n\n(mock provider has no template for this channel — falling back to a single line.)`;
  }
}

export const provider = assertProvider({
  id: 'mock',
  byok: false,

  async generateCopy(req) {
    const t0 = Date.now();
    const { brief, profile, channel } = req;
    const text = copyFor(channel, brief, profile);
    const hashtags = pickHashtags(profile, channel);
    return {
      text,
      hashtags,
      meta: { provider: 'mock', model: 'mock-deterministic', latencyMs: Date.now() - t0 },
    };
  },

  async generateImage(req) {
    const t0 = Date.now();
    // Write a deterministic SVG placeholder so downstream code has a real file path.
    const sig = createHash('sha1').update(JSON.stringify(req)).digest('hex').slice(0, 8);
    const dir = resolve(ROOT, 'out/mock-images');
    mkdirSync(dir, { recursive: true });
    const path = resolve(dir, `${sig}.svg`);
    const fg = req.visual?.colors?.accent ?? '#3B82F6';
    const bg = req.visual?.colors?.background ?? '#F8FAFC';
    const fg2 = req.visual?.colors?.primary ?? '#0F172A';
    const w = req.aspect === 'portrait' ? 1080 : req.aspect === 'landscape' ? 1920 : 1080;
    const h = req.aspect === 'portrait' ? 1350 : req.aspect === 'landscape' ? 1080 : 1080;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="${bg}"/>
  <rect x="40" y="40" width="${w - 80}" height="${h - 80}" fill="none" stroke="${fg}" stroke-width="6"/>
  <text x="${w / 2}" y="${h / 2 - 40}" text-anchor="middle" font-family="${req.visual?.fontFamily ?? 'sans-serif'}" font-size="${Math.round(w * 0.045)}" fill="${fg2}">[mock card]</text>
  <text x="${w / 2}" y="${h / 2 + 40}" text-anchor="middle" font-family="${req.visual?.fontFamily ?? 'sans-serif'}" font-size="${Math.round(w * 0.025)}" fill="${fg2}" opacity="0.7">${escape(req.prompt).slice(0, 80)}</text>
</svg>`;
    writeFileSync(path, svg, 'utf8');
    return {
      paths: [path.replace(ROOT + '/', '')],
      meta: { provider: 'mock', model: 'svg-placeholder', latencyMs: Date.now() - t0 },
    };
  },

  healthcheck() {
    return { ok: true };
  },
});

function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
