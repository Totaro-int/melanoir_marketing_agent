// Brand guardian — runs the channel checklist + global banned-word checks against a draft.
// Returns a structured report. Phase 4 publisher refuses to upload when severity == 'block'.

/**
 * Inspect card visual HTML text for banned words and preferred-term violations.
 * Returns findings[] with severity 'warn' (never 'block' — visual text has more latitude).
 * @param {{ htmlContent: string, profile: object }} opts
 */
export function inspectVisualText({ htmlContent, profile }) {
  // Strip <style> blocks and all tags to get rendered text
  const text = htmlContent
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const findings = [];
  const banned = profile?.banned ?? {};
  const preferredTerms = profile?.tone?.preferredTerms ?? {};

  for (const w of banned.words ?? []) {
    if (text.includes(w)) findings.push({ severity: 'warn', code: 'visual.banned.word', detail: `카드 비주얼: "${w}"` });
  }
  for (const c of banned.claims ?? []) {
    if (text.includes(c)) findings.push({ severity: 'warn', code: 'visual.banned.claim', detail: `카드 비주얼: "${c}"` });
  }

  for (const [abbr, preferred] of Object.entries(preferredTerms)) {
    if (abbr === preferred) continue; // 허용된 고유명사는 스킵
    // 단어 경계로 약어 단독 사용 감지 (한글 경계 포함)
    const re = new RegExp(`(?<![A-Za-z가-힣(])${abbr}(?![A-Za-z가-힣(])`, 'g');
    if (re.test(text)) {
      findings.push({ severity: 'warn', code: 'visual.preferred_term', detail: `"${abbr}" → "${preferred}"` });
    }
  }

  return { findings };
}

const CHANNEL_RULES = {
  threads: {
    maxLen: 500,
    firstLineMax: 80,
    maxHashtags: 3,
    blockExternalLinkInFirstLine: true,
  },
  linkedin: {
    maxLen: 3000,
    first3LinesMax: 220,
    maxHashtags: 5,
    blockExternalLinkInBody: true, // soft warn (link should be in first comment)
  },
};

export function inspect({ channel, text, hashtags = [], profile }) {
  const rules = CHANNEL_RULES[channel] ?? {};
  const findings = [];
  const banned = profile?.banned ?? {};

  // Banned content (hard).
  for (const w of banned.words ?? []) {
    if (text.includes(w)) findings.push({ severity: 'block', code: 'banned.word', detail: w });
  }
  for (const c of banned.claims ?? []) {
    if (text.includes(c)) findings.push({ severity: 'block', code: 'banned.claim', detail: c });
  }

  // Always-on hashtags.
  for (const h of profile?.hashtags?.always ?? []) {
    if (!text.includes(h) && !hashtags.includes(h)) {
      findings.push({ severity: 'block', code: 'missing.hashtag', detail: h });
    }
  }

  // Length.
  if (rules.maxLen && text.length > rules.maxLen) {
    findings.push({ severity: 'block', code: 'too_long', detail: `${text.length} > ${rules.maxLen}` });
  }

  // First line(s).
  const lines = text.split('\n');
  if (rules.firstLineMax && (lines[0]?.length ?? 0) > rules.firstLineMax) {
    findings.push({ severity: 'warn', code: 'first_line_long', detail: `${lines[0].length} > ${rules.firstLineMax}` });
  }
  if (rules.first3LinesMax) {
    const head = lines.slice(0, 3).join('').length;
    if (head > rules.first3LinesMax) {
      findings.push({ severity: 'warn', code: 'first_3_lines_long', detail: `${head} > ${rules.first3LinesMax}` });
    }
  }

  // Hashtag count.
  const tagCount = (text.match(/#[^\s#]+/g) ?? []).length || hashtags.length;
  if (rules.maxHashtags && tagCount > rules.maxHashtags) {
    findings.push({ severity: 'warn', code: 'too_many_hashtags', detail: `${tagCount} > ${rules.maxHashtags}` });
  }

  // External link placement.
  const urlRe = /\bhttps?:\/\/\S+/i;
  if (rules.blockExternalLinkInFirstLine && urlRe.test(lines[0] ?? '')) {
    findings.push({ severity: 'warn', code: 'link_in_first_line' });
  }
  if (rules.blockExternalLinkInBody && urlRe.test(text)) {
    findings.push({ severity: 'warn', code: 'link_in_body', detail: '댓글로 빼는 것이 권장됨' });
  }

  // Ad disclosure.
  if (profile?.legal?.adDisclosureRequired) {
    const tag = profile.legal.adHashtag ?? '#광고';
    if (!text.includes(tag) && !hashtags.includes(tag)) {
      findings.push({ severity: 'info', code: 'ad_disclosure_missing', detail: `${tag} (캠페인이 광고로 분류되면 필수)` });
    }
  }

  const blocks = findings.filter((f) => f.severity === 'block');
  const warns = findings.filter((f) => f.severity === 'warn');
  return {
    ok: blocks.length === 0,
    severity: blocks.length ? 'block' : warns.length ? 'warn' : 'ok',
    findings,
    summary: { blocks: blocks.length, warns: warns.length, info: findings.length - blocks.length - warns.length },
  };
}
