// generate.mjs 에서 분리됨
import { resolve } from 'node:path';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  HARNESS_ROOT, ui,
} from './_lib.mjs';
import { renderGuide } from '../src/preferences.mjs';

// B2B/SaaS 카테고리별 디자인 레퍼런스 풀 — 함수보다 먼저 선언해야 TDZ 오류 없음
export const DESIGN_REF_POOLS = {
  saas:       ['stripe', 'linear.app', 'vercel', 'supabase', 'notion', 'airtable', 'cal', 'resend'],
  ai:         ['claude', 'x.ai', 'mistral.ai', 'cohere', 'cursor', 'warp', 'elevenlabs'],
  enterprise: ['ibm', 'hashicorp', 'mongodb', 'clickhouse', 'intercom', 'zapier', 'sentry'],
  fintech:    ['stripe', 'wise', 'revolut', 'coinbase', 'mastercard'],
  editorial:  ['wired', 'theverge', 'figma', 'framer', 'miro', 'webflow'],
  premium:    ['apple', 'tesla', 'ferrari', 'spacex', 'nvidia'],
  default:    ['stripe', 'linear.app', 'vercel', 'notion', 'cursor', 'figma', 'supabase', 'wired', 'ibm', 'wise'],
};

export function sanitizeKeywordItem(v) {
  if (typeof v !== 'string') return null;
  const trimmed = v.replace(/[\r\n\t]/g, ' ').trim();
  return trimmed.length > 0 && trimmed.length <= 80 ? trimmed : null;
}

export function sanitizeChannelKeywords(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const sanitize = (arr) =>
    Array.isArray(arr) ? arr.map(sanitizeKeywordItem).filter(Boolean) : [];
  return {
    keywords: sanitize(raw.keywords),
    hashtags: sanitize(raw.hashtags),
    angle:    typeof raw.angle === 'string' ? raw.angle.replace(/[\r\n]/g, ' ').trim().slice(0, 120) : null,
    watchOut: sanitize(raw.watchOut),
  };
}

export function loadKeywordsMap(dir, slug) {
  const p = resolve(dir, 'keywords.json');
  if (!existsSync(p)) return null;
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8'));
    if (parsed.slug && parsed.slug !== slug) {
      ui.warn(`keywords.json slug 불일치 (${parsed.slug} ≠ ${slug}) — 키워드 무시`);
      return null;
    }
    const channels = parsed.channels ?? {};
    return Object.fromEntries(
      Object.entries(channels).map(([ch, v]) => [ch, sanitizeChannelKeywords(v)])
    );
  } catch {
    ui.warn('keywords.json 파싱 실패 — 키워드 없이 진행');
    return null;
  }
}

export function autoPickDesignRef(profile) {
  const industry = (profile?.industry ?? '').toLowerCase();
  const name     = (profile?.brand?.name ?? '').toLowerCase();

  let pool = DESIGN_REF_POOLS.default;
  if (/ai|llm|gpt/.test(industry + name))             pool = DESIGN_REF_POOLS.ai;
  else if (/fin|payment|결제|금융/.test(industry))     pool = DESIGN_REF_POOLS.fintech;
  else if (/enterprise|기업|erp/.test(industry))       pool = DESIGN_REF_POOLS.enterprise;
  else if (/premium|luxury|프리미엄/.test(industry))   pool = DESIGN_REF_POOLS.premium;
  else if (/media|editorial|잡지|미디어/.test(industry)) pool = DESIGN_REF_POOLS.editorial;
  else if (/saas|b2b|software/.test(industry))         pool = DESIGN_REF_POOLS.saas;

  // 캠페인 실행마다 다른 ref — 존재하지 않는 항목은 건너뛰고 다음 후보 시도
  const startIdx = Math.floor(Date.now() / 1000) % pool.length;
  for (let offset = 0; offset < pool.length; offset++) {
    const brand = pool[(startIdx + offset) % pool.length];
    const p     = resolve(HARNESS_ROOT, 'design-refs', brand, 'DESIGN.md');
    if (existsSync(p)) {
      ui.info(`🎨 auto design-ref: ${brand} (pool: ${pool.length}개 중 선택)`);
      return { brand, path: p };
    }
  }
  ui.warn('auto design-ref: 풀 내 모든 레퍼런스 없음 — _default 폴백');
  return null;
}

export function loadDesignRef(brief, profile) {
  const brand = brief.sourceMaterials?.designRef;
  if (brand) {
    const p = resolve(HARNESS_ROOT, 'design-refs', brand, 'DESIGN.md');
    if (!existsSync(p)) {
      ui.warn(`design-refs/${brand}/DESIGN.md 없음 — 자동 선택 시도`);
    } else {
      return { brand, path: p };
    }
  }
  // designRef 미지정이면 업종/브랜드 기반으로 자동 선택
  const auto = autoPickDesignRef(profile);
  if (auto) return auto;

  // 최종 폴백: _default
  const defaultPath = resolve(HARNESS_ROOT, 'design-refs', '_default', 'DESIGN.md');
  if (existsSync(defaultPath)) {
    return { brand: '_default', path: defaultPath };
  }
  return null;
}

// ── 학습된 사용자 선호 → spec 주입용 ────────────────────────────────────
// approve/reject 시 누적된 posts/preferences.yaml 을 카피/이미지 spec 에 형태별로 부착.
// 신뢰도 낮으면 (sampleCount < 3) 빈 객체를 반환해 spec 을 깨끗하게 유지.

export function buildLearnedPrefsForCopy(prefs, channel) {
  if (!prefs?.sampleCount || prefs.sampleCount < 3) return null;
  const ch = prefs.channels?.[channel];
  return {
    guide: renderGuide(prefs, { channel }),
    sampleCount: prefs.sampleCount,
    confidence: prefs.sampleCount < 5 ? 'initial' : prefs.sampleCount < 10 ? 'building' : 'strong',
    targets: (ch && ch.sampleCount >= 3) ? {
      avgLength: Math.round(ch.avgLength),
      avgEmojis: round1(ch.avgEmojis),
      avgHashtags: round1(ch.avgHashtags),
    } : null,
    tone: prefs.global?.tone ?? null,
    recentRejectReasons: ch?.recentRejectReasons?.slice(-3) ?? [],
  };
}

export function buildLearnedPrefsForImage(prefs, channel) {
  if (!prefs?.sampleCount || prefs.sampleCount < 3) return null;
  // designRef 빈도 상위 3개만 — image-director 가 시각 톤 결정에 활용
  const topRefs = Object.entries(prefs.designRefs ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([brand, count]) => ({ brand, count }));
  if (!topRefs.length) return null;
  return {
    sampleCount: prefs.sampleCount,
    preferredDesignRefs: topRefs,
    guide: `[학습된 시각 선호] 자주 승인된 designRef: ${topRefs.map((r) => `${r.brand}(${r.count})`).join(', ')} — 새 designRef 미지정 시 우선 후보.`,
  };
}

export function round1(n) { return Math.round((n ?? 0) * 10) / 10; }

// Promise.allSettled 결과에서 rejected 항목만 ui.warn 으로 출력.
// 개별 채널 실패가 다른 채널 결과와 writeYaml 을 막지 않도록 allSettled 를 사용.
export function logSettledErrors(results, channels) {
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      ui.warn(`[${channels[i]}] 예기치 않은 오류: ${r.reason?.message ?? r.reason}`);
    }
  });
}

export function extractHashtags(text) {
  return Array.from(new Set((text.match(/#[^\s#]+/g) ?? [])));
}

export function mergeHashtags(text, fromProvider, profile) {
  const fromText = (text.match(/#[^\s#]+/g) ?? []);
  const set = new Set([...fromText, ...fromProvider, ...(profile?.hashtags?.always ?? [])]);
  // Strip existing tags from end of text and re-append unique sorted line.
  const stripped = text.replace(/(\n+#[^\s#]+(\s+#[^\s#]+)*\s*)$/u, '').trimEnd();
  const tagsLine = Array.from(set).join(' ');
  const finalText = tagsLine ? `${stripped}\n\n${tagsLine}` : stripped;
  return { text: finalText, hashtags: Array.from(set) };
}

export function imagesFor(cadence, override) {
  if (override) {
    const n = parseInt(override, 10);
    return Number.isFinite(n) && n >= 0 && n <= 10 ? n : 1;
  }
  switch (cadence) {
    case 'series-3': return 3;
    case 'series-5': return 5;
    case 'thread':   return 1; // text series + 리드 카드 1장 (스레드 이미지 첨부용)
    case 'single':
    default:         return 1;
  }
}

export function roleFor(index, total) {
  if (total <= 1) return 'single';
  if (index === 0) return 'hook';
  if (index === total - 1) return 'cta';
  return 'body';
}

export const CHANNEL_URLS = {
  threads:      'https://www.threads.net/',
  linkedin:     'https://www.linkedin.com/',
  instagram:    'https://www.instagram.com/',
  'naver-blog': 'https://blog.naver.com/',
  tistory:      'https://www.tistory.com/',
  brunch:       'https://brunch.co.kr/',
  facebook:     'https://www.facebook.com/',
  x:            'https://x.com/',
  reddit:       'https://www.reddit.com/',
  bluesky:      'https://bsky.app/',
  mastodon:     'https://mastodon.social/',
  pinterest:    'https://www.pinterest.com/',
};

export function openInChrome(targets) {
  const items = (targets ?? []).filter((p) => {
    if (!p) return false;
    return p.startsWith('http') || existsSync(p);
  });
  if (!items.length) return;
  try {
    const { platform } = process;
    if (platform === 'darwin') {
      spawnSync('open', ['-a', 'Google Chrome', ...items], { stdio: 'ignore' });
    } else if (platform === 'linux') {
      for (const p of items) spawnSync('xdg-open', [p], { stdio: 'ignore' });
    } else if (platform === 'win32') {
      spawnSync('cmd', ['/c', 'start', '', ...items], { stdio: 'ignore' });
    }
    ui.dim(`  브라우저 오픈: ${items.length}개`);
  } catch {}
}

export function renderDraftMd(d) {
  const findings = d.guardian.findings.length
    ? d.guardian.findings.map((f) => `- **${f.severity}** \`${f.code}\`${f.detail ? ` — ${f.detail}` : ''}`).join('\n')
    : '_(없음)_';
  return [
    `# ${d.slug} / ${d.channel}`,
    ``,
    `> generated ${d.generatedAt} · provider \`${d.provider?.provider ?? 'unknown'}\` (${d.provider?.model ?? '-'}) · image \`${d.image?.provider ?? 'unknown'}\` (${d.image?.model ?? '-'})`,
    ``,
    `## Copy`,
    ``,
    '```',
    d.text,
    '```',
    ``,
    `## Hashtags`,
    ``,
    d.hashtags.length ? d.hashtags.join(' ') : '_(없음)_',
    ``,
    `## Assets`,
    ``,
    d.assets.length ? d.assets.map((p) => `- \`${p}\``).join('\n') : '_(없음)_',
    ``,
    `## Brand Guardian`,
    ``,
    `severity: **${d.guardian.severity}** · blocks ${d.guardian.summary.blocks} · warns ${d.guardian.summary.warns}`,
    ``,
    findings,
    ``,
  ].join('\n');
}

