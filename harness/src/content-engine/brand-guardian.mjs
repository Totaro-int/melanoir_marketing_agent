// Brand guardian — runs the channel checklist + global banned-word checks against a draft.
// Returns a structured report. Phase 4 publisher refuses to upload when severity == 'block'.
//
// 강화 (글 퀄리티):
// - 한국 광고법 (약사법/표시광고법/식약처) 흔한 위반 패턴 내장
// - AEO 패턴 검증 (FAQ Q.N/A., 표, 헤딩 구조)
// - 자료 인용 검증 (sourceMaterials 있으면 [참고] 섹션 있어야)
// - 톤 일관성 (정중체 ↔ 친근체 혼용 검출)

// ─── 한국 광고법 자동 패턴 ──────────────────────────────────────
// 모든 캠페인에 자동 적용 (profile.banned 따로 등록 안 해도 됨).
// 화장품·반영구·식약처·식약처 광고 가이드라인 기반.
const KOREAN_AD_LAW = {
  // 의학적 효능 단정 — 광고법 위반 명확 (block)
  block: [
    { pat: /(?<!세포\s*안전성\s*)치료(?:해|합니다|효과|효능)/g, code: 'ad_law.medical_claim', detail: '의학적 치료 단정 — 약사법 위반 가능' },
    { pat: /의학적\s*(?:효능|효과)/g, code: 'ad_law.medical_efficacy' },
    { pat: /효과\s*보장|보장된\s*효과/g, code: 'ad_law.guarantee' },
    { pat: /부작용\s*(?:없음|0|제로)/g, code: 'ad_law.no_side_effect' },
    { pat: /100\s*%\s*(?:안전|순수|천연|자연)/g, code: 'ad_law.100_percent' },
    { pat: /(?:최고의|유일한|완벽한|기적의|영구적)\s*[가-힣]/g, code: 'ad_law.absolute_term' },
    { pat: /즉각적(?:인|으로)\s*(?:효과|개선)/g, code: 'ad_law.instant_effect' },
  ],
  // 영업 톤 — 가이드 위반 (warn, block 아님)
  warn: [
    { pat: /지금\s*바로\s*(?:시작|구매|만나)/g, code: 'sales_tone.urgency' },
    { pat: /놓치지\s*마세요/g, code: 'sales_tone.fomo' },
    { pat: /곧\s*마감|마감\s*임박|한정\s*수량/g, code: 'sales_tone.scarcity' },
    { pat: /클릭(?:만\s*하면)?\s*[가-힣]+\s*즉시/g, code: 'sales_tone.click_bait' },
  ],
};

// 톤 — 친근체 어미 (정중체 글에 섞이면 warn)
const CASUAL_ENDINGS = /(?:해요|이에요|예요|거든요|잖아요)(?:[.!?]|$)/gm;
const FORMAL_ENDINGS = /(?:합니다|됩니다|입니다|있습니다)(?:[.!?]|$)/gm;

// AI-스러운 패턴 (style-guide 의 "bad" 예시)
const AI_PATTERNS = [
  { pat: /혁신적(?:인|이|을|의)/g, code: 'ai_tone.cliche', detail: '추상 형용사 "혁신적"' },
  { pat: /획기적(?:인|이|을|의)/g, code: 'ai_tone.cliche', detail: '"획기적"' },
  { pat: /강력한\s*[가-힣]/g, code: 'ai_tone.cliche', detail: '"강력한"' },
  { pat: /다양한\s*[가-힣]+(?:들|과)/g, code: 'ai_tone.cliche', detail: '"다양한"' },
  { pat: /효율적(?:인|으로|이)/g, code: 'ai_tone.cliche', detail: '"효율적"' },
  { pat: /\n첫째[,.]?[\s\S]{1,200}\n둘째[,.]?[\s\S]{1,200}\n셋째/g, code: 'ai_tone.list_pattern', detail: '"첫째/둘째/셋째" 패턴 — AI 흔적' },
];

// AEO 패턴 (블로그 채널 정보성 글에서 권장)
const AEO_PATTERNS = {
  faq:         /(?:^|\n)Q\.\s*\d+/m,
  faqAnswer:   /(?:^|\n)A\.\s/m,
  table:       /\n\|.+\|\n\|[\s\-:|]+\|\n/,
  headings:    /(?:^|\n)##\s/m,
  numericData: /\d+\s*(?:%|nm|mg|SPF|UVA|UVB|회|장|일|주|개월)/i,
};

const BLOG_CHANNELS = ['naver-blog', 'tistory', 'brunch'];

// 채널별 권장 분량 (style-guide §11)
const CHANNEL_LENGTH = {
  'naver-blog': { min: 2000, max: 4500, label: '네이버 블로그' },
  'tistory':    { min: 1500, max: 3500, label: 'Tistory' },
  'brunch':     { min: 2000, max: 5000, label: '브런치' },
  'instagram':  { min: 300,  max: 540,  label: 'Instagram' },
  'threads':    { min: 200,  max: 300,  label: 'Threads' },
  'linkedin':   { min: 500,  max: 1200, label: 'LinkedIn' },
};


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

export function inspect({ channel, text, hashtags = [], profile, brief = null, sourceMaterials = null }) {
  const rules = CHANNEL_RULES[channel] ?? {};
  const findings = [];
  const banned = profile?.banned ?? {};

  // Banned content (사용자 등록 — hard block).
  for (const w of banned.words ?? []) {
    if (text.includes(w)) findings.push({ severity: 'block', code: 'banned.word', detail: w });
  }
  for (const c of banned.claims ?? []) {
    if (text.includes(c)) findings.push({ severity: 'block', code: 'banned.claim', detail: c });
  }

  // ─── 한국 광고법 자동 검증 (코드 내장 — block) ──
  for (const rule of KOREAN_AD_LAW.block) {
    const m = text.match(rule.pat);
    if (m) {
      findings.push({
        severity: 'block',
        code: rule.code,
        detail: rule.detail || `광고법 위반: "${m[0]}"`,
        match: m[0],
      });
    }
  }
  for (const rule of KOREAN_AD_LAW.warn) {
    const m = text.match(rule.pat);
    if (m) {
      findings.push({
        severity: 'warn',
        code: rule.code,
        detail: `영업 톤: "${m[0]}"`,
        match: m[0],
      });
    }
  }

  // ─── AI-스러운 표현 ──
  for (const rule of AI_PATTERNS) {
    const matches = text.match(rule.pat);
    if (matches && matches.length) {
      findings.push({
        severity: 'warn',
        code: rule.code,
        detail: rule.detail + ` (${matches.length}회)`,
      });
    }
  }

  // ─── 톤 일관성 검증 (style-guide 의 정중체 통일) ──
  const tonePreset = brief?.tonePreset || 'relate-kr';
  const casualMatches = text.match(CASUAL_ENDINGS) || [];
  const formalMatches = text.match(FORMAL_ENDINGS) || [];
  if (['relate-kr', 'b2b', 'informational'].includes(tonePreset)) {
    // 정중체 강제 톤 — 친근체 1개 이상 = warn
    if (casualMatches.length >= 1 && formalMatches.length >= 3) {
      findings.push({
        severity: 'warn',
        code: 'tone.mix_casual_in_formal',
        detail: `${tonePreset} 정중체 톤인데 친근체 ${casualMatches.length}회 사용 (${casualMatches.slice(0, 3).join(', ')})`,
      });
    }
  } else if (tonePreset === 'friendly') {
    // 친근체 톤인데 정중체만 = warn (선택적 — 너무 빡빡 X)
    if (formalMatches.length > 5 && casualMatches.length === 0) {
      findings.push({
        severity: 'info',
        code: 'tone.too_formal_in_friendly',
        detail: `friendly 톤인데 친근체 어미 0개 — 정중체 ${formalMatches.length}회만`,
      });
    }
  }

  // ─── 블로그 채널 — AEO + 자료 인용 + 분량 ──
  if (BLOG_CHANNELS.includes(channel)) {
    // 분량
    const lengthRule = CHANNEL_LENGTH[channel];
    if (lengthRule) {
      const len = text.replace(/[\s#]/g, '').length;  // 공백/해시 제외 글자
      if (len < lengthRule.min) {
        findings.push({
          severity: 'warn',
          code: 'length.too_short',
          detail: `${lengthRule.label} ${len}자 < 권장 ${lengthRule.min}자`,
        });
      } else if (len > lengthRule.max * 1.5) {
        // 너무 길면 info — 일부러 긴 글일 수도
        findings.push({
          severity: 'info',
          code: 'length.over',
          detail: `${lengthRule.label} ${len}자 > 권장 ${lengthRule.max}자 1.5배`,
        });
      }
    }

    // AEO 친화 — informational/relate-kr 톤에서만 권장
    if (['informational', 'relate-kr'].includes(tonePreset)) {
      const aeoMissing = [];
      if (!AEO_PATTERNS.faq.test(text)) aeoMissing.push('FAQ (Q.N 패턴)');
      if (!AEO_PATTERNS.table.test(text) && !AEO_PATTERNS.headings.test(text)) aeoMissing.push('표 또는 H2 헤딩');
      if (!AEO_PATTERNS.numericData.test(text)) aeoMissing.push('정량 수치');
      if (aeoMissing.length >= 2) {
        findings.push({
          severity: 'info',
          code: 'aeo.weak_structure',
          detail: `AEO 친화 약함 — 누락: ${aeoMissing.join(', ')} (informational/relate-kr 톤은 검색엔진 답변 친화 권장)`,
        });
      }
      // FAQ 가 있는데 답변 형식 없음 = warn
      if (AEO_PATTERNS.faq.test(text) && !AEO_PATTERNS.faqAnswer.test(text)) {
        findings.push({
          severity: 'warn',
          code: 'aeo.faq_missing_answer_prefix',
          detail: 'Q.N 패턴 있지만 A. 접두 없음 — style-guide §6 위반',
        });
      }
    }

    // 자료 인용 검증 — sourceMaterials.texts 있으면 [참고] 또는 출처 섹션 필수
    const refs = sourceMaterials?.texts || brief?.sourceMaterials?.texts || [];
    if (refs.length > 0) {
      const hasRefsSection = /\[참고\]|##\s*참고|참고\s*문헌|##\s*출처|references|##\s*References/i.test(text);
      if (!hasRefsSection) {
        findings.push({
          severity: 'warn',
          code: 'references.missing_section',
          detail: `sourceMaterials 에 ${refs.length}개 자료 있는데 본문에 [참고]/출처/##\\s*참고 섹션 없음 (E-E-A-T 약화)`,
        });
      }
    }

    // mustInclude — brief.constraints.mustInclude 키워드 본문에 있는지
    const mustInclude = brief?.constraints?.mustInclude || [];
    for (const kw of mustInclude) {
      if (!text.includes(kw)) {
        findings.push({
          severity: 'warn',
          code: 'mustInclude.missing',
          detail: `필수 키워드 "${kw}" 본문에 없음`,
        });
      }
    }

    // mustExclude — brief.constraints.mustExclude 위반시 block
    const mustExclude = brief?.constraints?.mustExclude || [];
    for (const kw of mustExclude) {
      if (text.includes(kw)) {
        findings.push({
          severity: 'block',
          code: 'mustExclude.found',
          detail: `금지 키워드 "${kw}" 본문 발견`,
        });
      }
    }
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
  const infos = findings.filter((f) => f.severity === 'info');
  return {
    ok: blocks.length === 0,
    severity: blocks.length ? 'block' : warns.length ? 'warn' : 'ok',
    findings,
    summary: { blocks: blocks.length, warns: warns.length, info: infos.length },
  };
}
