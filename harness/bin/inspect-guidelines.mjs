#!/usr/bin/env node
// Re-inspect a generated draft against user-defined guidelines (slot meta + brand profile + channel rules).
// 결정론적 체크 8종 + LLM 보조 검증을 위한 ambiguous spec 산출.
//
// Usage:
//   node bin/inspect-guidelines.mjs <slug> --channel=<ch>            # 결과 인쇄 (사람 읽기용)
//   node bin/inspect-guidelines.mjs <slug> --channel=<ch> --json     # JSON stdout (queue-tick 용)
//   node bin/inspect-guidelines.mjs <slug> --channel=<ch> --spec     # LLM용 spec.json 작성 (subagent 입력)
//   node bin/inspect-guidelines.mjs <slug> --channel=<ch> --merge-llm # subagent가 만든 result.json 머지
//
// Output 파일:
//   posts/campaigns/<slug>/<ch>/guideline-spec-<ts>.json   (--spec)
//   posts/campaigns/<slug>/<ch>/guideline-check-<ts>.json  (기본/--merge-llm)
//
// brief.yaml 패치:
//   brief.inspection[<ch>] = { ok, score, max, ts, blocking, deterministic, ambiguous }

import { resolve } from 'node:path';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import {
  PATHS, readYaml, writeYaml, findCampaignDir, latestDraftYaml,
  nowKstIso, nowKstFilename, ui,
} from './_lib.mjs';

const argv = process.argv.slice(2);
const slug = argv.find((a) => !a.startsWith('--'));
const channel = argv.find((a) => a.startsWith('--channel='))?.split('=')[1];
const jsonOut = argv.includes('--json');
const specOut = argv.includes('--spec');
const mergeLlm = argv.includes('--merge-llm');

if (!slug || !channel) {
  ui.err('사용법: inspect-guidelines.mjs <slug> --channel=<ch> [--json|--spec|--merge-llm]');
  process.exit(2);
}

const dir = findCampaignDir(slug);
const briefPath = resolve(dir, 'brief.yaml');
const brief = readYaml(briefPath);
const draftPath = latestDraftYaml(resolve(dir, channel));
if (!draftPath) {
  fail(`draft 없음: ${resolve(dir, channel)}/`);
}
const draft = readYaml(draftPath);

const profile = existsSync(PATHS.profile) ? readYaml(PATHS.profile) : {};

const slot = findSlotForBrief(brief);
const draftText = String(draft.text ?? '');
const draftHashtags = Array.isArray(draft.hashtags) ? draft.hashtags : [];

const channelRules = (profile?.channels?.[channel]) ?? {};
const maxLen = channelRules.maxLength ?? defaultMaxLen(channel);
const hashtagMin = channelRules.hashtagMin ?? 0;

const det = {};
const blocking = [];

// 1) topic_keywords
{
  const tokens = tokenize(brief.topic);
  if (!tokens.length) {
    det.topic_keywords = { ok: true, detail: '주제 토큰 없음 — 검사 스킵' };
  } else {
    const hit = tokens.filter((t) => draftText.includes(t));
    const ok = hit.length > 0;
    det.topic_keywords = {
      ok,
      detail: `${hit.length}/${tokens.length} 키워드 일치` + (ok ? '' : ` — [${tokens.join(', ')}] 중 0`),
    };
    if (!ok) blocking.push('topic_keywords');
  }
}

// 2) key_message
if (brief.keyMessage && String(brief.keyMessage).trim()) {
  const km = String(brief.keyMessage);
  const tokens = tokenize(km).filter((t) => t.length >= 2);
  if (!tokens.length) {
    det.key_message = { ok: true, detail: '토큰 없음 — 스킵' };
  } else {
    const hit = tokens.filter((t) => draftText.includes(t));
    const ratio = hit.length / tokens.length;
    const ok = ratio >= 0.5;
    det.key_message = {
      ok,
      detail: `${hit.length}/${tokens.length} 토큰 일치 (${(ratio * 100).toFixed(0)}%)` + (ok ? '' : ` — keyMessage "${km.slice(0, 40)}..." 의 절반 이상이 draft에 없음`),
    };
    if (!ok) blocking.push('key_message');
  }
} else {
  det.key_message = { ok: true, detail: '정의 없음 — 스킵' };
}

// 3) content_points
{
  const points = Array.isArray(brief.contentPoints) ? brief.contentPoints.filter(Boolean) : [];
  if (!points.length) {
    det.content_points = { ok: true, detail: '정의 없음 — 스킵' };
  } else {
    const covered = points.filter((p) => {
      const ts = tokenize(p).filter((t) => t.length >= 2);
      return ts.some((t) => draftText.includes(t));
    });
    const ratio = covered.length / points.length;
    const ok = ratio >= 0.7;
    det.content_points = {
      ok,
      detail: `${covered.length}/${points.length} 포인트 반영 (${(ratio * 100).toFixed(0)}%)`,
    };
    if (!ok) blocking.push('content_points');
  }
}

// 4) banned_words
{
  const words = profile?.banned?.words ?? [];
  const hits = words.filter((w) => w && draftText.includes(w));
  det.banned_words = {
    ok: hits.length === 0,
    detail: hits.length ? `금지어 발견: ${hits.join(', ')}` : '없음',
  };
  if (hits.length) blocking.push('banned_words');
}

// 5) banned_claims
{
  const claims = profile?.banned?.claims ?? [];
  const hits = claims.filter((c) => c && draftText.includes(c));
  det.banned_claims = {
    ok: hits.length === 0,
    detail: hits.length ? `금지표현 발견: ${hits.join(', ')}` : '없음',
  };
  if (hits.length) blocking.push('banned_claims');
}

// 6) length
{
  const len = draftText.length;
  const ok = !maxLen || len <= maxLen;
  det.length = {
    ok,
    detail: `${len}/${maxLen ?? '∞'}자` + (ok ? '' : ' — 길이 초과'),
  };
  if (!ok) blocking.push('length');
}

// 7) hashtag_min
{
  if (!hashtagMin) {
    det.hashtag_min = { ok: true, detail: '최소값 정의 없음 — 스킵' };
  } else {
    const count = countHashtags(draftText, draftHashtags);
    const ok = count >= hashtagMin;
    det.hashtag_min = {
      ok,
      detail: `해시태그 ${count}개 (최소 ${hashtagMin})`,
    };
    if (!ok) blocking.push('hashtag_min');
  }
}

// 8) series_title (시리즈 슬롯에 매칭되고 titles[i] 가 정의돼 있을 때만)
{
  const seriesTitle = pickSeriesTitle(slot, brief.topic);
  if (!seriesTitle) {
    det.series_title = { ok: true, detail: '시리즈 미해당 — 스킵' };
  } else {
    const tokens = tokenize(seriesTitle).filter((t) => t.length >= 2);
    const hit = tokens.filter((t) => draftText.includes(t));
    const ok = tokens.length === 0 || hit.length > 0;
    det.series_title = {
      ok,
      detail: `시리즈 회차 "${seriesTitle}"` + (ok ? ` — ${hit.length}/${tokens.length} 토큰 반영` : ' — 토큰 0개 반영'),
    };
    if (!ok) blocking.push('series_title');
  }
}

// 점수
const detKeys = Object.keys(det);
const okCount = detKeys.filter((k) => det[k].ok).length;
const score = okCount;
const max = detKeys.length;

// ambiguous (LLM 검토 후보)
const ambiguous = [];
if ((profile?.banned?.topics ?? []).length) {
  ambiguous.push({
    code: 'banned_topics',
    items: profile.banned.topics,
    instruction: '이 주제들 중 draft 본문이 의미상 위반하는 것이 있는지 판정 (직접 언급 + 암시 + 비교/비방 형태 모두 포함)',
  });
}
if (profile?.tone?.preset || profile?.tone?.voiceNotes) {
  ambiguous.push({
    code: 'voice_tone',
    expected: {
      preset: profile?.tone?.preset ?? null,
      voiceNotes: profile?.tone?.voiceNotes ?? null,
      sampleSentences: profile?.tone?.sampleSentences ?? null,
    },
    instruction: '이 톤 가이드와 draft 본문의 어조가 일치하는지 판정 (불일치 시 어떤 문장이 어긋나는지 명시)',
  });
}
if (brief.angle && String(brief.angle).trim()) {
  ambiguous.push({
    code: 'angle',
    expected: brief.angle,
    instruction: '이 앵글 의도가 draft에 반영됐는지 판정',
  });
}

const result = {
  version: 1,
  slug,
  channel,
  ts: nowKstIso(),
  draftPath,
  briefTopic: brief.topic ?? null,
  ok: blocking.length === 0,
  score,
  max,
  blocking,
  deterministic: det,
  ambiguous,
  needsLlmReview: ambiguous.length > 0,
};

if (specOut) {
  // LLM 서브에이전트 입력 spec
  const spec = {
    version: 1,
    slug,
    channel,
    ts: result.ts,
    draftPath,
    draftText,
    briefTopic: brief.topic ?? null,
    briefKeyMessage: brief.keyMessage ?? null,
    briefContentPoints: brief.contentPoints ?? null,
    briefAngle: brief.angle ?? null,
    profile: {
      brand: profile?.brand?.name ?? null,
      tone: profile?.tone ?? null,
      bannedTopics: profile?.banned?.topics ?? [],
    },
    deterministicResult: result,
    ambiguousChecks: ambiguous,
    outputPath: resolve(dir, channel, `guideline-check-${nowKstFilename()}.json`),
    expectedSchema: {
      version: 1,
      ok: 'bool',
      score: 'int (0..max from spec.deterministicResult.max)',
      max: 'int',
      blocking: 'string[]',
      deterministic: 'object — 그대로 spec.deterministicResult.deterministic 복사',
      ambiguous: 'object[] with {code, ok, detail}',
      llmRanAt: 'ISO string',
    },
  };
  const specPath = resolve(dir, channel, `guideline-spec-${nowKstFilename()}.json`);
  writeFileSync(specPath, JSON.stringify(spec, null, 2));
  if (jsonOut) console.log(JSON.stringify({ ok: true, specPath }));
  else { ui.ok(`spec 작성: ${specPath}`); ui.dim('  → guideline-reviewer 서브에이전트로 처리'); }
  process.exit(0);
}

if (mergeLlm) {
  // 가장 최근의 guideline-check-*.json (LLM이 작성) 을 읽어 brief에 반영
  const latest = findLatestCheck(resolve(dir, channel));
  if (!latest) fail('guideline-check-*.json 없음 — LLM 단계 미완료');
  const llmResult = JSON.parse(readFileSync(latest, 'utf8'));
  patchBriefInspection(brief, channel, llmResult);
  writeYaml(briefPath, brief);
  if (jsonOut) console.log(JSON.stringify(llmResult));
  else printResult(llmResult);
  process.exit(llmResult.ok ? 0 : 1);
}

// 기본: deterministic 결과를 파일로 저장 + brief 패치
const checkPath = resolve(dir, channel, `guideline-check-${nowKstFilename()}.json`);
writeFileSync(checkPath, JSON.stringify({ ...result, llmRanAt: null }, null, 2));
patchBriefInspection(brief, channel, result);
writeYaml(briefPath, brief);

if (jsonOut) {
  console.log(JSON.stringify(result));
} else {
  printResult(result);
  if (result.needsLlmReview) {
    ui.dim('  → 의미론 항목 추가 검증: --spec 으로 spec 작성 후 guideline-reviewer 서브에이전트 실행');
  }
}
process.exit(result.ok ? 0 : 1);

// ---- helpers ----

function tokenize(text) {
  if (!text) return [];
  // 한글/영숫자 토큰 추출 + 흔한 조사 제거
  const raw = String(text).match(/[\p{L}\p{N}]+/gu) ?? [];
  const particles = new Set([
    '을', '를', '이', '가', '은', '는', '의', '에', '에서', '에게',
    '도', '만', '와', '과', '하고', '으로', '로', '까지', '부터', '의해',
    '및', '및의', '그리고', '그러나', '및', '및에',
    'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for',
  ]);
  const out = [];
  for (const t of raw) {
    if (t.length < 2) continue;
    if (particles.has(t.toLowerCase())) continue;
    // 한글 단어 끝의 1자 조사 제거 (을/를/이/가/은/는/의 등)
    let trimmed = t;
    const tail = t.charAt(t.length - 1);
    if (t.length >= 3 && /[을를이가은는의에도만과와로]/.test(tail)) {
      trimmed = t.slice(0, -1);
    }
    if (trimmed.length >= 2 && !out.includes(trimmed)) out.push(trimmed);
  }
  return out;
}

function countHashtags(text, hashtags) {
  const inText = (text.match(/#[^\s#]+/g) ?? []).length;
  return inText + (hashtags?.length ?? 0);
}

function defaultMaxLen(ch) {
  return ({ threads: 500, x: 280, linkedin: 3000, instagram: 2200 })[ch] ?? null;
}

function findSlotForBrief(brief) {
  const slotsPath = resolve(PATHS.campaignsDir, '..', 'slots.yaml');
  if (!existsSync(slotsPath)) return null;
  let data;
  try { data = readYaml(slotsPath); } catch { return null; }
  const slots = Array.isArray(data?.slots) ? data.slots : [];
  const norm = (s) => (s ?? '').trim().toLowerCase();
  const briefTopic = norm(brief.topic);
  // 1) topic 동일
  for (const s of slots) {
    if (norm(s.topic) === briefTopic) return s;
  }
  // 2) 시리즈: titles[] 에 brief.topic 포함
  for (const s of slots) {
    if (s.kind === 'series' && Array.isArray(s.titles)) {
      if (s.titles.some((t) => norm(t) === briefTopic)) return s;
    }
  }
  return null;
}

function pickSeriesTitle(slot, briefTopic) {
  if (!slot || slot.kind !== 'series') return null;
  if (!Array.isArray(slot.titles) || !slot.titles.length) return null;
  const norm = (s) => (s ?? '').trim().toLowerCase();
  const found = slot.titles.find((t) => norm(t) === norm(briefTopic));
  return found ?? null;
}

function patchBriefInspection(brief, ch, result) {
  brief.inspection = brief.inspection ?? {};
  brief.inspection[ch] = {
    ok: result.ok,
    score: result.score ?? null,
    max: result.max ?? null,
    ts: result.ts ?? nowKstIso(),
    blocking: result.blocking ?? [],
    needsLlmReview: result.needsLlmReview ?? false,
    llmRanAt: result.llmRanAt ?? null,
  };
  brief.meta = { ...(brief.meta ?? {}), updatedAt: nowKstIso() };
}

function findLatestCheck(channelDir) {
  if (!existsSync(channelDir)) return null;
  const files = readdirSync(channelDir)
    .filter((f) => /^guideline-check-\d{8}-\d{6}\.json$/.test(f))
    .sort();
  if (!files.length) return null;
  return resolve(channelDir, files[files.length - 1]);
}

function fail(msg) {
  if (jsonOut) console.log(JSON.stringify({ ok: false, error: msg }));
  else ui.err(msg);
  process.exit(1);
}

function printResult(r) {
  console.log();
  console.log(`📋 가이드라인 재검수 — ${slug} [${channel}]`);
  console.log(`   ${r.ok ? '✅ 통과' : '❌ 미준수'}  ${r.score}/${r.max}`);
  console.log();
  for (const [k, v] of Object.entries(r.deterministic ?? {})) {
    const mark = v.ok ? '✅' : '❌';
    console.log(`   ${mark} ${k.padEnd(18)} ${v.detail ?? ''}`);
  }
  if (r.ambiguous?.length) {
    console.log();
    console.log(`   ⓘ 의미론 검증 후보 ${r.ambiguous.length}건: ${r.ambiguous.map((a) => a.code).join(', ')}`);
  }
  console.log();
}
