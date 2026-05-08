// posts/preferences.yaml — 캠페인 approve/reject 시 누적되는 사용자 선호도.
// 학습 모델은 단순 카운팅 + 산술평균 (EMA 변종). 5건 미만은 "초기", 10건 이상은 "강한 선호".
//
// 책임:
//   - PREFS_PATH 로드/저장
//   - 빈 스키마 시드
//   - 신호 추출 (draft text → 길이/이모지/해시태그/톤)
//   - 누적 업데이트 (approve = positive, reject = negative)
//   - 자연어 가이드 직렬화 (에이전트 system prompt 주입용)

import { existsSync, readdirSync, readFileSync, renameSync, copyFileSync, unlinkSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { PATHS, readYaml, writeYaml, ui } from '../bin/_lib.mjs';

export const PREFS_PATH = resolve(PATHS.campaignsDir, '..', 'preferences.yaml');

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu;
const HASHTAG_RE = /(^|\s)#[\w가-힣ㄱ-ㅎㅏ-ㅣ_-]+/g;
const FORMAL_RE = /(습니다|입니다|니다\.|니까\?|세요\.|시오\.)/g;
const CASUAL_RE = /(어요\.|아요\.|네요\.|예요\.|이에요\.|야\.|어\.|지\.)/g;

export function emptyPrefs() {
  return {
    version: 1,
    updatedAt: null,
    sampleCount: 0,
    rejectCount: 0,
    global: {
      tone: { formal: 0, casual: 0 },
      emoji: { avgPerPost: 0 },
      hashtags: { avgCount: 0 },
    },
    channels: {},
    designRefs: {},
    goals: {},
  };
}

export function loadPrefs() {
  if (!existsSync(PREFS_PATH)) return emptyPrefs();
  try {
    const data = readYaml(PREFS_PATH);
    const base = emptyPrefs();
    // deep merge: top-level primitives + global object (so new nested keys survive schema evolution)
    return {
      ...base,
      ...data,
      global: { ...base.global, ...(data?.global ?? {}) },
    };
  } catch (e) {
    ui.warn(`preferences.yaml 파싱 실패, 빈 선호도로 시작합니다: ${e.message}`);
    return emptyPrefs();
  }
}

export function savePrefs(prefs) {
  const tmp = `${PREFS_PATH}.tmp`;
  writeYaml(tmp, { ...prefs, updatedAt: new Date().toISOString() });
  try {
    renameSync(tmp, PREFS_PATH);
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
    copyFileSync(tmp, PREFS_PATH);
    unlinkSync(tmp);
  }
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// 채널 결과물 폴더에서 본문 텍스트 모으기.
//   - copy-output.json 의 cards[].text 우선
//   - 없으면 draft.md fallback (mtime 최신 순)
export function readChannelText(channelDir) {
  const candidates = ['copy-output.json', 'agent-output.json'];
  for (const name of candidates) {
    const p = resolve(channelDir, name);
    if (!existsSync(p)) continue;
    try {
      const data = JSON.parse(readFileSync(p, 'utf8'));
      const cards = Array.isArray(data?.cards) ? data.cards : [];
      const text = cards.map((c) => c?.text ?? '').join('\n').trim();
      if (text) return text;
    } catch {}
  }
  // draft.md 패턴 (channel/<TS>.md 또는 draft.md) — mtime 최신 순
  const mdFiles = safeReaddir(channelDir)
    .filter((f) => f.endsWith('.md') && !/README/i.test(f))
    .sort((a, b) => {
      try { return statSync(resolve(channelDir, b)).mtimeMs - statSync(resolve(channelDir, a)).mtimeMs; }
      catch { return 0; }
    });
  for (const f of mdFiles) {
    try { return readFileSync(resolve(channelDir, f), 'utf8'); } catch {}
  }
  return '';
}

export function extractSignals(text) {
  const t = text ?? '';
  const length = countCodepoints(t);
  const emoji = (t.match(EMOJI_RE) ?? []).length;
  const hashtags = (t.match(HASHTAG_RE) ?? []).length;
  const formalHits = (t.match(FORMAL_RE) ?? []).length;
  const casualHits = (t.match(CASUAL_RE) ?? []).length;
  const total = formalHits + casualHits;
  const tone = total === 0
    ? { formal: 0.5, casual: 0.5, neutral: true }
    : { formal: formalHits / total, casual: casualHits / total, neutral: false };
  return { length, emoji, hashtags, tone };
}

// signal 누적 — 단순 산술평균 갱신.
export function applyApproval(prefs, channel, signals, brief) {
  prefs.sampleCount = (prefs.sampleCount ?? 0) + 1;
  const n = prefs.sampleCount;

  // global tone (neutral 제외)
  if (!signals.tone.neutral) {
    prefs.global.tone.formal = ema(prefs.global.tone.formal, signals.tone.formal, n);
    prefs.global.tone.casual = ema(prefs.global.tone.casual, signals.tone.casual, n);
  }
  prefs.global.emoji.avgPerPost = ema(prefs.global.emoji.avgPerPost, signals.emoji, n);
  prefs.global.hashtags.avgCount = ema(prefs.global.hashtags.avgCount, signals.hashtags, n);

  // per-channel
  const ch = (prefs.channels[channel] ??= {
    sampleCount: 0, avgLength: 0, avgEmojis: 0, avgHashtags: 0, rejected: 0,
  });
  ch.sampleCount += 1;
  ch.avgLength = ema(ch.avgLength, signals.length, ch.sampleCount);
  ch.avgEmojis = ema(ch.avgEmojis, signals.emoji, ch.sampleCount);
  ch.avgHashtags = ema(ch.avgHashtags, signals.hashtags, ch.sampleCount);

  // designRef / goal 빈도
  const designRef = brief?.sourceMaterials?.designRef;
  if (designRef && !FORBIDDEN_KEYS.has(designRef)) {
    prefs.designRefs[designRef] = (prefs.designRefs[designRef] ?? 0) + 1;
  }
  const goal = brief?.goal;
  if (goal && !FORBIDDEN_KEYS.has(goal)) {
    prefs.goals[goal] = (prefs.goals[goal] ?? 0) + 1;
  }
}

export function applyRejection(prefs, channel, reason) {
  prefs.rejectCount = (prefs.rejectCount ?? 0) + 1;
  const ch = (prefs.channels[channel] ??= {
    sampleCount: 0, avgLength: 0, avgEmojis: 0, avgHashtags: 0, rejected: 0,
  });
  ch.rejected = (ch.rejected ?? 0) + 1;
  if (reason) {
    // strip control chars + newlines, cap at 200 chars to prevent prompt injection
    const safe = String(reason).replace(/[\r\n\x00-\x1f\x7f]/g, ' ').trim().slice(0, 200);
    if (safe) ch.recentRejectReasons = (ch.recentRejectReasons ?? []).concat([safe]).slice(-5);
  }
}

// 에이전트 system prompt 에 주입할 자연어 가이드.
// 신뢰도 낮으면 "초기 학습" 표시. 0건이면 빈 문자열.
export function renderGuide(prefs, { channel } = {}) {
  if (!prefs.sampleCount) return '';
  const lines = [];
  const confidence = prefs.sampleCount < 5
    ? '초기 학습 단계 (참고만)'
    : prefs.sampleCount < 10 ? '쌓이는 중' : '강한 선호 패턴';
  lines.push(`[학습된 사용자 선호 — ${prefs.sampleCount}건 승인 기반, ${confidence}]`);

  const t = prefs.global.tone;
  if (t && (t.formal > 0 || t.casual > 0)) {
    const dominant = t.formal > t.casual ? '격식체' : '캐주얼';
    const pct = Math.round(Math.max(t.formal, t.casual) * 100);
    lines.push(`- 톤: ${dominant} 우세 (${pct}%)`);
  }
  if (prefs.global.emoji.avgPerPost > 0) {
    lines.push(`- 이모지 평균 ${prefs.global.emoji.avgPerPost.toFixed(1)}개/포스트`);
  }
  if (prefs.global.hashtags.avgCount > 0) {
    lines.push(`- 해시태그 평균 ${prefs.global.hashtags.avgCount.toFixed(1)}개`);
  }

  if (channel && prefs.channels[channel]) {
    const ch = prefs.channels[channel];
    lines.push(`- ${channel}: 평균 ${Math.round(ch.avgLength)}자 / 이모지 ${ch.avgEmojis.toFixed(1)} / 해시태그 ${ch.avgHashtags.toFixed(1)}` +
      (ch.rejected ? ` / 거절 ${ch.rejected}회` : ''));
    if (ch.recentRejectReasons?.length) {
      lines.push(`  최근 거절 사유: ${ch.recentRejectReasons.slice(-3).map((r) => `"${r}"`).join(', ')}`);
    }
  }

  const topRefs = Object.entries(prefs.designRefs ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (topRefs.length) {
    lines.push(`- 시각 레퍼런스 선호: ${topRefs.map(([k, v]) => `${k}(${v})`).join(', ')}`);
  }

  if (prefs.rejectCount) {
    lines.push(`- 누적 거절 ${prefs.rejectCount}회 (학습 신호로만 사용, 콘텐츠 영향 ×)`);
  }
  return lines.join('\n');
}

function ema(prev, next, n) {
  // 1/n 가중 산술평균 — n=1 이면 next, n>>1 이면 prev에 수렴
  if (!Number.isFinite(prev)) return next;
  return prev + (next - prev) / n;
}

function countCodepoints(s) {
  return [...s].length;
}

function safeReaddir(p) { try { return readdirSync(p); } catch { return []; } }
