#!/usr/bin/env node
// 마케팅 소스 자동 수집 — architecture doc Phase 0 의 input 자동화.
//
//   node bin/source-collect.mjs                  # marketing-sources.yaml 의 enabled 소스 모두
//   node bin/source-collect.mjs --source=<id>    # 특정 소스만
//   node bin/source-collect.mjs --json           # JSON stdout (sns-start 등에서 파이프)
//   node bin/source-collect.mjs --since=7        # 최근 N일치만 (기본: 소스별 sinceDays, 없으면 14)
//
// 입력: <ROOT>/marketing-sources.yaml (gitignored, 사용자별)
// 출력: out/source-candidates-<ts>.json  +  --json 플래그 시 stdout
//
// 어댑터 인터페이스: { id, type, fetch(config) → candidate[] }
// 현재: rss 어댑터만. PostHog/뉴스 API 등은 같은 인터페이스로 추가.

import { resolve } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { ROOT, readYaml, nowKstIso, nowKstFilename, ui } from './_lib.mjs';

const MAX_FEED_BYTES = 5 * 1024 * 1024; // 5MB — 정상 RSS/Atom 피드는 보통 100KB 미만.

const argv = process.argv.slice(2);
const onlySource = argv.find((a) => a.startsWith('--source='))?.split('=')[1];
const jsonOut = argv.includes('--json');
const sinceFlag = argv.find((a) => a.startsWith('--since='))?.split('=')[1];
const sinceDaysOverride = sinceFlag ? Number(sinceFlag) : null;

const configPath = resolve(ROOT, 'marketing-sources.yaml');
if (!existsSync(configPath)) {
  ui.err(`marketing-sources.yaml 없음: ${configPath}`);
  ui.dim('  예시: harness/examples/marketing-sources.example.yaml 복사 후 편집');
  process.exit(2);
}
const config = readYaml(configPath);
const sources = (config?.sources ?? []).filter((s) => s.enabled !== false);
if (!sources.length) {
  ui.warn('enabled 소스 없음 — marketing-sources.yaml 확인');
  process.exit(0);
}

const ADAPTERS = {
  rss: rssFetch,
};

const candidates = [];
const errors = [];

for (const src of sources) {
  if (onlySource && src.id !== onlySource) continue;
  const adapter = ADAPTERS[src.type];
  if (!adapter) {
    errors.push({ sourceId: src.id, error: `unsupported type: ${src.type}` });
    continue;
  }
  try {
    const sinceDays = sinceDaysOverride ?? src.sinceDays ?? 14;
    const sinceMs = Date.now() - sinceDays * 86_400_000;
    const items = await adapter(src);
    const filtered = items
      .filter((it) => !it.pubDate || Date.parse(it.pubDate) >= sinceMs)
      .slice(0, src.maxItems ?? 10)
      .map((it) => ({ ...it, sourceId: src.id }));
    candidates.push(...filtered);
    if (!jsonOut) ui.ok(`[${src.id}] ${filtered.length}건 수집 (최근 ${sinceDays}일)`);
  } catch (e) {
    errors.push({ sourceId: src.id, error: e.message });
    if (!jsonOut) ui.err(`[${src.id}] 실패: ${e.message}`);
  }
}

const result = {
  version: 1,
  generatedAt: nowKstIso(),
  candidates,
  errors,
  sourceCount: sources.length,
};

const outDir = resolve(ROOT, 'out');
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, `source-candidates-${nowKstFilename()}.json`);
writeFileSync(outPath, JSON.stringify(result, null, 2));

if (jsonOut) {
  console.log(JSON.stringify(result));
} else {
  ui.ok(`총 ${candidates.length}건 후보 → ${outPath}`);
  if (candidates.length) {
    console.log();
    for (const c of candidates.slice(0, 10)) {
      ui.dim(`  · [${c.sourceId}] ${c.title}`);
    }
    if (candidates.length > 10) ui.dim(`  ... 외 ${candidates.length - 10}건`);
  }
}
process.exit(errors.length && !candidates.length ? 1 : 0);

// ────────────────────────────────────────────────────────────── adapters ──

async function rssFetch(src) {
  if (!src.url) throw new Error('url 미지정');
  const res = await fetch(src.url, {
    headers: { 'User-Agent': 'marketing-agent/source-collect (+RSS)' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  // Content-Length 가 명시되어 있으면 즉시 거부 (대부분 케이스)
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared && declared > MAX_FEED_BYTES) {
    throw new Error(`response too large: ${declared} bytes > ${MAX_FEED_BYTES}`);
  }
  // chunked 등 헤더 없는 케이스: 스트림 누적하면서 임계값 초과 시 abort.
  const xml = await readBounded(res, MAX_FEED_BYTES);
  return parseRss(xml);
}

async function readBounded(res, maxBytes) {
  const reader = res.body?.getReader();
  if (!reader) return res.text(); // 스트림 미지원 환경 fallback
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      reader.cancel();
      throw new Error(`response exceeds ${maxBytes} bytes (streamed)`);
    }
    chunks.push(value);
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}

// 의존성 없는 미니 RSS/Atom 파서.
// RSS 2.0: <item> with <title>/<link>/<description>/<pubDate>
// Atom:    <entry> with <title>/<link href>/<summary|content>/<published|updated>
function parseRss(xml) {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blockTag = isAtom ? 'entry' : 'item';
  const blocks = matchAll(xml, new RegExp(`<${blockTag}[\\s>][\\s\\S]*?</${blockTag}>`, 'gi'));
  const items = [];
  for (const block of blocks) {
    const title = decode(stripTags(extract(block, 'title')));
    const link = isAtom
      ? (block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] ?? '')
      : extract(block, 'link');
    const summary = decode(stripTags(
      extract(block, isAtom ? 'summary' : 'description') ||
      extract(block, 'content') || ''
    ));
    const pubDate = extract(block, isAtom ? 'published' : 'pubDate') ||
                    extract(block, 'updated') || '';
    items.push({
      title: title.slice(0, 200),
      link: link.trim(),
      summary: summary.slice(0, 500),
      pubDate: pubDate.trim(),
    });
  }
  return items;
}

function extract(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m) return '';
  // CDATA 제거
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function matchAll(s, re) {
  const out = [];
  let m;
  while ((m = re.exec(s)) !== null) out.push(m[0]);
  return out;
}

function stripTags(s) {
  return String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function decode(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
