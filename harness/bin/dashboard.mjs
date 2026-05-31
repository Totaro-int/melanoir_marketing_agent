#!/usr/bin/env node
// Marketing Agent Dashboard — local Node http server.
// Reads posts/campaigns/*/brief.yaml + <channel>/result.json
// and serves a single-page dashboard at http://localhost:7777
//
// Usage:
//   node harness/bin/dashboard.mjs            # default port 7777
//   node harness/bin/dashboard.mjs --port=8080
//   node harness/bin/dashboard.mjs --no-open  # don't auto-open browser

import { createServer } from 'node:http';
import {
  readFileSync, existsSync, readdirSync, statSync, writeFileSync, mkdirSync,
  watchFile, unwatchFile, openSync, readSync, closeSync,
} from 'node:fs';
import { resolve, basename, dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import YAML from 'yaml';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const CAMPAIGNS = resolve(ROOT, 'posts', 'campaigns');
const SLOTS_FILE = resolve(ROOT, 'posts', 'slots.yaml');
const PROFILE = resolve(ROOT, 'company-profile.yaml');
const AUTH_DIR = resolve(ROOT, 'auth');
const PRODUCTS_DIR = resolve(ROOT, 'assets', 'products');
const DASH_DIR = resolve(__dirname, '..', 'dashboard');

const argv = process.argv.slice(2);
const port = Number(argv.find((a) => a.startsWith('--port='))?.split('=')[1] || 7777);
const noOpen = argv.includes('--no-open');

// ─── data loaders ──────────────────────────────────────────────

function listCampaigns() {
  if (!existsSync(CAMPAIGNS)) return [];
  return readdirSync(CAMPAIGNS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name);
}

function readYaml(path) {
  try {
    return YAML.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return null;
  }
}

function readJsonOrYaml(path) {
  if (!existsSync(path)) return null;
  try {
    const txt = readFileSync(path, 'utf8').trim();
    if (!txt) return null;
    // Try JSON first; fall back to YAML for legacy files written before the format was standardised.
    if (txt.startsWith('{') || txt.startsWith('[')) {
      try { return JSON.parse(txt); } catch { /* fall through */ }
    }
    return YAML.parse(txt);
  } catch (e) {
    return null;
  }
}

function loadCampaign(slug) {
  const dir = resolve(CAMPAIGNS, slug);
  const brief = readYaml(resolve(dir, 'brief.yaml'));
  if (!brief) return null;

  const channels = (brief.channels || []).filter((c) => typeof c === 'string');
  const channelData = {};
  for (const ch of channels) {
    const chDir = resolve(dir, ch);
    if (!existsSync(chDir)) continue;
    const result = readJsonOrYaml(resolve(chDir, 'result.json'));
    // latest draft yaml (YYYYMMDD-HHmmss.yaml)
    const drafts = readdirSync(chDir).filter((f) => /^\d{8}-\d{6}\.yaml$/.test(f)).sort();
    const latestDraft = drafts.length ? drafts[drafts.length - 1] : null;
    let draftMeta = null;
    if (latestDraft) {
      const d = readYaml(resolve(chDir, latestDraft));
      if (d) {
        draftMeta = {
          generatedAt: d.generatedAt,
          provider: d.provider?.provider || d.provider?.model || null,
          textLength: typeof d.text === 'string' ? d.text.length : 0,
        };
      }
    }
    // count images
    const imageFiles = readdirSync(chDir).filter((f) => /\.(jpe?g|png)$/i.test(f));
    channelData[ch] = {
      status: brief.status?.[ch] || 'unknown',
      result,
      latestDraft,
      draftMeta,
      imageCount: imageFiles.length,
    };
  }

  return {
    slug,
    topic: brief.topic,
    goal: brief.goal,
    cadence: brief.cadence,
    blogMode: brief.blogMode || null,
    channels,
    keyMessage: brief.keyMessage,
    profileBrand: brief.meta?.profileBrand || null,
    createdAt: brief.meta?.createdAt,
    updatedAt: brief.meta?.updatedAt,
    channelData,
  };
}

function loadAllCampaigns() {
  return listCampaigns()
    .map((slug) => loadCampaign(slug))
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

function listAuth() {
  if (!existsSync(AUTH_DIR)) return [];
  return readdirSync(AUTH_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const channel = f.replace(/\.json$/, '');
      const path = resolve(AUTH_DIR, f);
      const stat = statSync(path);
      const data = readJsonOrYaml(path) || {};
      return {
        channel,
        configured: Object.keys(data).length > 0,
        modifiedAt: stat.mtime.toISOString(),
        // expose only non-secret hint fields
        hint: data.blogId || data.blogName || data.userId || data.handle || null,
      };
    });
}

// ─── Chrome attach 쿠키로 로그인 검사 ────────────────────────────
// 채널별 "이 쿠키가 있으면 로그인된 것" 매핑.
// 도메인은 endsWith 매칭. 여러 후보 중 하나라도 있으면 OK.
const CHANNEL_LOGIN_COOKIE = {
  'naver-blog': [{ domain: '.naver.com', name: 'NID_AUT' }],
  'tistory':    [{ domain: '.tistory.com', name: 'TSSESSION' }, { domain: '.tistory.com', name: '_T_ANO' }],
  'brunch':     [{ domain: '.kakao.com', name: '_kawlt' }, { domain: '.kakao.com', name: '_karmt' }],
  'instagram':  [{ domain: '.instagram.com', name: 'sessionid' }],
  'threads':    [{ domain: '.threads.com', name: 'sessionid' }, { domain: '.threads.net', name: 'sessionid' }, { domain: '.instagram.com', name: 'sessionid' }],
  'linkedin':   [{ domain: '.linkedin.com', name: 'li_at' }],
  'facebook':   [{ domain: '.facebook.com', name: 'c_user' }],
  'x':          [{ domain: '.x.com', name: 'auth_token' }, { domain: '.twitter.com', name: 'auth_token' }],
  'reddit':     [{ domain: '.reddit.com', name: 'reddit_session' }],
  'bluesky':    [], // bsky 는 localStorage 라 쿠키로 안 됨
  'mastodon':   [{ domain: 'mastodon.social', name: '_session_id' }],
  'pinterest':  [{ domain: '.pinterest.com', name: '_auth' }],
  'tiktok':     [{ domain: '.tiktok.com', name: 'sessionid' }],
  'youtube':    [{ domain: '.google.com', name: 'SID' }, { domain: '.youtube.com', name: 'SID' }],
};

let _chromeAuthCache = { at: 0, data: null };

async function readChromeCookieAuth() {
  // 5분 캐시 — browser-publish 와 race 안 나도록 길게
  if (Date.now() - _chromeAuthCache.at < 5 * 60_000 && _chromeAuthCache.data) {
    return _chromeAuthCache.data;
  }
  let browser = null;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 3000 });
    const ctx = browser.contexts()[0];
    if (!ctx) throw new Error('no chrome context');
    const cookies = await ctx.cookies();
    const result = {};
    for (const [ch, defs] of Object.entries(CHANNEL_LOGIN_COOKIE)) {
      if (!defs || defs.length === 0) { result[ch] = null; continue; }
      let hit = null;
      for (const def of defs) {
        const found = cookies.find((c) =>
          (c.domain === def.domain || c.domain.endsWith(def.domain)) && c.name === def.name
        );
        if (found) { hit = found; break; }
      }
      if (hit) {
        const expiresIso = hit.expires && hit.expires > 0
          ? new Date(hit.expires * 1000).toISOString()
          : null;
        result[ch] = {
          channel: ch,
          configured: true,
          source: 'chrome',
          domain: hit.domain,
          cookie: hit.name,
          expiresAt: expiresIso,
        };
      } else {
        result[ch] = null;
      }
    }
    _chromeAuthCache = { at: Date.now(), data: result };
    return result;
  } catch (e) {
    return { _error: e.message };
  } finally {
    try { await browser?.close(); } catch {}
  }
}

// Channel kinds (from harness/channels.json if exists)
function loadChannelMeta() {
  const path = resolve(ROOT, 'harness', 'channels.json');
  if (existsSync(path)) {
    return readJsonOrYaml(path) || {};
  }
  return {};
}

// ─── publish.log 라인 → 메타 데이터 추출 (UI 비주얼 보드용) ───
function enrichLogLine(line, stream = 'stdout') {
  // ANSI 색 제거
  line = line.replace(/\x1b\[[0-9;]*m/g, '');
  if (!line.trim()) return null;
  // [N/M] label  ← ui.step
  const stepM = line.match(/^\[(\d+)\/(\d+)\]\s+(.+)$/);
  // image P/Q  ← segment paste 진행
  const imgM = line.match(/image\s+(\d+)\/(\d+)/);
  // segment X/Y
  const segM = line.match(/segment\s+(\d+)\/(\d+)/);
  // icon
  let icon = null;
  if (line.startsWith('✅')) icon = 'ok';
  else if (line.startsWith('⚠️')) icon = 'warn';
  else if (line.startsWith('❌')) icon = 'err';
  else if (line.startsWith('ℹ️')) icon = 'info';
  else if (line.startsWith('🛑')) icon = 'stop';
  return {
    t: new Date().toISOString(),
    stream,
    line,
    ...(stepM && { step: { i: +stepM[1], n: +stepM[2], label: stepM[3] } }),
    ...(imgM && { imageProgress: { p: +imgM[1], q: +imgM[2] } }),
    ...(segM && { segmentProgress: { p: +segM[1], q: +segM[2] } }),
    ...(icon && { icon }),
  };
}


// 캠페인 디렉토리에서 가장 최근 draft yaml 찾기
function findLatestDraft(channelDir) {
  if (!existsSync(channelDir)) return null;
  const drafts = readdirSync(channelDir)
    .filter((f) => /^\d{8}-\d{6}\.yaml$/.test(f))
    .sort()
    .reverse();
  return drafts[0] ? resolve(channelDir, drafts[0]) : null;
}

// 캠페인 디렉토리의 이미지 파일 목록
function listCampaignImages(channelDir) {
  if (!existsSync(channelDir)) return [];
  return readdirSync(channelDir)
    .filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f))
    .sort();
}

// ─── routing ────────────────────────────────────────────────────

const handlers = {
  '/api/today': () => {
    const today = new Date().toISOString().slice(0, 10);
    const all = loadAllCampaigns();
    const todayItems = all.filter((c) => {
      // includes campaigns updated today OR created today OR with channels with publishedAt today
      if ((c.updatedAt || '').startsWith(today)) return true;
      if ((c.createdAt || '').startsWith(today)) return true;
      for (const ch of Object.values(c.channelData)) {
        if (ch.result?.publishedAt?.startsWith(today)) return true;
      }
      return false;
    });
    return { date: today, items: todayItems };
  },

  '/api/campaigns': () => ({ campaigns: loadAllCampaigns() }),

  '/api/history': () => {
    const all = loadAllCampaigns();
    const events = [];
    for (const c of all) {
      for (const [ch, d] of Object.entries(c.channelData)) {
        if (d.result?.publishedAt) {
          events.push({
            slug: c.slug,
            topic: c.topic,
            channel: ch,
            url: d.result.url,
            publishedAt: d.result.publishedAt,
            ok: d.result.ok !== false,
            via: d.result.via || 'unknown',
            dryRun: d.result.dryRun === true,
          });
        }
      }
    }
    events.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
    return { events };
  },

  '/api/channels': async (url) => {
    // ?fresh=1 이면 캐시 강제 비움 (수동 로그인 후 바로 확인용)
    if (url?.searchParams?.get('fresh') === '1') {
      _chromeAuthCache = { at: 0, data: null };
    }
    const fileAuth = listAuth();
    const chrome = await readChromeCookieAuth();
    const chromeOk = chrome && !chrome._error;
    // file 쪽 + chrome 쪽 union — 둘 중 하나라도 configured 면 connected
    const merged = {};
    for (const a of fileAuth) merged[a.channel] = a;
    if (chromeOk) {
      for (const [ch, info] of Object.entries(chrome)) {
        if (!info) continue; // null = no cookie
        merged[ch] = { ...(merged[ch] || {}), ...info };
      }
    }
    return {
      auth: Object.values(merged),
      meta: loadChannelMeta(),
      chrome: chromeOk
        ? { ok: true, port: 9222, checkedAt: new Date(_chromeAuthCache.at).toISOString() }
        : { ok: false, error: chrome?._error || 'unknown' },
    };
  },

  // 환경 변수 현재 값 (.env.local 의 키만, value 는 masked)
  '/api/env': () => {
    const envPath = resolve(ROOT, '.env.local');
    if (!existsSync(envPath)) return { keys: {}, exists: false };
    const content = readFileSync(envPath, 'utf8');
    const keys = {};
    for (const raw of content.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const [, k, vRaw] = m;
      const v = vRaw.replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '');
      // mask 보안 — 처음 4자 + 마지막 4자만 표시
      let masked = v;
      if (v && v.length > 12 && !/^(fal-ai\/|claude-|gpt-|inhouse|mock)/i.test(v)) {
        masked = v.slice(0, 4) + '••••' + v.slice(-4);
      }
      keys[k] = { value: masked, raw_length: v.length, is_placeholder: /^(your-|<|placeholder|example|todo|change-?me)/i.test(v) };
    }
    return { keys, exists: true };
  },

  '/api/profile': () => {
    const p = readYaml(PROFILE) || {};
    return {
      brand: p.brand || null,
      tagline: p.taglineOneLine || null,
      industry: p.industry || null,
      colors: p.visual?.colors || null,
      adDisclosure: p.legal?.adDisclosureRequired || false,
    };
  },

  // ── 스케줄 슬롯 (cron 반복 캠페인 큐) ──
  '/api/schedule': () => {
    const slots = existsSync(SLOTS_FILE) ? readYaml(SLOTS_FILE) : null;
    return { slots: slots?.slots || [] };
  },

  // ── 회사 프로필 (전체 — 편집용) ──
  '/api/company': () => {
    const p = readYaml(PROFILE) || {};
    return { profile: p };
  },

  // ── 제품 사진 목록 ──
  '/api/products': () => {
    if (!existsSync(PRODUCTS_DIR)) {
      mkdirSync(PRODUCTS_DIR, { recursive: true });
    }
    const files = readdirSync(PRODUCTS_DIR)
      .filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f))
      .map((f) => {
        const stat = statSync(resolve(PRODUCTS_DIR, f));
        return {
          name: f,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          url: '/static/products/' + encodeURIComponent(f),
        };
      });
    return { products: files, dir: PRODUCTS_DIR };
  },

  // ── 단일 채널 draft 미리뷰 (발행 drawer 용) ──
  '/api/draft': (url) => {
    const slug = url.searchParams.get('slug');
    const channel = url.searchParams.get('channel');
    if (!slug || !channel) throw new Error('slug, channel required');
    const dir = resolve(CAMPAIGNS, slug);
    if (!existsSync(dir)) throw new Error('campaign not found: ' + slug);
    const channelDir = resolve(dir, channel);
    if (!existsSync(channelDir)) throw new Error('channel dir not found: ' + channel);

    const briefPath = resolve(dir, 'brief.yaml');
    const brief = readYaml(briefPath) || {};
    const draftPath = findLatestDraft(channelDir);
    const draft = draftPath ? readYaml(draftPath) : null;
    const images = listCampaignImages(channelDir);
    const resultPath = ['result.json', 'result.yaml']
      .map((f) => resolve(channelDir, f))
      .find((p) => existsSync(p));
    const result = resultPath ? readJsonOrYaml(resultPath) : null;

    return {
      slug,
      channel,
      topic: brief.topic || null,
      keyMessage: brief.keyMessage || null,
      profileBrand: brief.profileBrand || null,
      blogMode: brief.blogMode || draft?.blogMode || null,
      status: brief.status?.[channel] || 'unknown',
      draftFile: draftPath ? basename(draftPath) : null,
      generatedAt: draft?.generatedAt || null,
      provider: draft?.provider || null,
      text: draft?.text || '',
      guardian: draft?.guardian || null,
      images: images.map((name) => ({
        name,
        url: '/static/campaign-image/' + encodeURIComponent(slug) + '/' + encodeURIComponent(channel) + '/' + encodeURIComponent(name),
      })),
      result,
      published: result?.ok && !result?.dryRun ? { url: result.url, at: result.publishedAt } : null,
    };
  },

  '/api/calendar': (url) => {
    const month = url.searchParams.get('month') || new Date().toISOString().slice(0, 7);
    const all = loadAllCampaigns();
    // group by date
    const days = {};
    for (const c of all) {
      const dates = new Set();
      if (c.createdAt?.startsWith(month)) dates.add(c.createdAt.slice(0, 10));
      if (c.updatedAt?.startsWith(month)) dates.add(c.updatedAt.slice(0, 10));
      for (const ch of Object.values(c.channelData)) {
        if (ch.result?.publishedAt?.startsWith(month)) {
          dates.add(ch.result.publishedAt.slice(0, 10));
        }
      }
      for (const d of dates) {
        if (!days[d]) days[d] = [];
        days[d].push({ slug: c.slug, topic: c.topic, channels: c.channels });
      }
    }
    return { month, days };
  },
};

// ─── HTTP server ────────────────────────────────────────────────

// ── Channel 로그인 URL 매핑 ──
const CHANNEL_LOGIN_URL = {
  'naver-blog': 'https://nid.naver.com/nidlogin.login',
  'tistory': 'https://www.tistory.com/auth/login',
  'brunch': 'https://brunch.co.kr/login',
  'instagram': 'https://www.instagram.com/accounts/login/',
  'threads': 'https://www.threads.com/login',
  'linkedin': 'https://www.linkedin.com/login',
  'facebook': 'https://www.facebook.com/login/',
  'x': 'https://x.com/i/flow/login',
  'reddit': 'https://www.reddit.com/login/',
  'bluesky': 'https://bsky.app/',
  'mastodon': 'https://mastodon.social/auth/sign_in',
  'pinterest': 'https://www.pinterest.com/login/',
  'tiktok': 'https://www.tiktok.com/login/',
  'youtube': 'https://accounts.google.com/signin/v2/identifier?service=youtube',
};

// Chrome (--remote-debugging-port=9222) 에 새 탭 띄우기
async function openInChrome(url) {
  let browser = null;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 5000 });
    const ctx = browser.contexts()[0];
    const page = await ctx.newPage();
    // dialog 가 떠도 우리가 죽지 않도록 dismiss 핸들러
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => {});
    await page.bringToFront().catch(() => {});
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    // disconnect 만 (close 는 attach 시 위험)
    try { await browser?.close(); } catch {}
  }
}

// 글로벌 안전망 — 비동기 에러로 서버 죽지 않게
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err?.message || err);
});

// POST body → JSON
async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const buf = Buffer.concat(chunks);
        const txt = buf.toString('utf8');
        if (!txt) return resolve(null);
        try { return resolve(JSON.parse(txt)); } catch {}
        resolve({ raw: buf, text: txt });
      } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const path = url.pathname;

  // CORS for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  // ── POST endpoints ──
  if (req.method === 'POST') {
    try {
      const body = await readBody(req);

      if (path === '/api/channels/connect') {
        const channel = body?.channel;
        if (!channel) { res.writeHead(400).end(JSON.stringify({ error: 'channel required' })); return; }
        const loginUrl = CHANNEL_LOGIN_URL[channel];
        if (!loginUrl) { res.writeHead(400).end(JSON.stringify({ error: 'unknown channel' })); return; }
        try {
          const result = await openInChrome(loginUrl);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Chrome 연결 실패 — :9222 모드로 실행됐는지 확인. ' + e.message }));
        }
        return;
      }

      if (path === '/api/company') {
        const profile = body?.profile;
        if (!profile) { res.writeHead(400).end(JSON.stringify({ error: 'profile required' })); return; }
        // backup before overwrite
        if (existsSync(PROFILE)) {
          writeFileSync(PROFILE + '.bak', readFileSync(PROFILE));
        }
        writeFileSync(PROFILE, YAML.stringify(profile, { lineWidth: 100 }), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, savedAt: new Date().toISOString() }));
        return;
      }

      // ── 환경 변수 (.env.local) 갱신 ──
      if (path === '/api/env') {
        const { keys } = body || {};
        if (!keys || typeof keys !== 'object') {
          res.writeHead(400).end(JSON.stringify({ error: 'keys object required' }));
          return;
        }
        const envPath = resolve(ROOT, '.env.local');
        let content = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
        // backup
        if (existsSync(envPath)) {
          writeFileSync(envPath + '.bak', content);
        }
        // 갱신: 같은 키 존재하면 그 줄만 교체, 없으면 마지막에 append
        const updated = {};
        for (const [k, v] of Object.entries(keys)) {
          if (typeof v !== 'string') continue;
          const re = new RegExp(`^${k}=.*$`, 'm');
          if (re.test(content)) {
            content = content.replace(re, `${k}=${v}`);
            updated[k] = 'updated';
          } else {
            content += (content.endsWith('\n') ? '' : '\n') + `${k}=${v}\n`;
            updated[k] = 'added';
          }
        }
        writeFileSync(envPath, content, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, updated, savedAt: new Date().toISOString() }));
        return;
      }

      // ── 환경 변수 검증 (실 API 호출) ──
      if (path === '/api/env/verify') {
        const { fal, anthropic } = body || {};
        const results = {};

        if (fal) {
          try {
            const r = await fetch('https://rest.alpha.fal.ai/billing/user_balance', {
              headers: { Authorization: `Key ${fal}` },
              signal: AbortSignal.timeout(5000),
            });
            if (r.ok) {
              const j = await r.json().catch(() => null);
              results.fal = { ok: true, balance: typeof j === 'number' ? j : (j?.balance ?? '?') };
            } else {
              results.fal = { ok: false, error: `HTTP ${r.status}` };
            }
          } catch (e) { results.fal = { ok: false, error: e.message }; }
        }

        if (anthropic) {
          try {
            const r = await fetch('https://api.anthropic.com/v1/models', {
              headers: {
                'x-api-key': anthropic,
                'anthropic-version': '2023-06-01',
              },
              signal: AbortSignal.timeout(5000),
            });
            results.anthropic = r.ok
              ? { ok: true, models: 'live' }
              : { ok: false, error: `HTTP ${r.status}` };
          } catch (e) { results.anthropic = { ok: false, error: e.message }; }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ results }));
        return;
      }

      // ── draft 본문 인라인 저장 ──
      if (path === '/api/draft') {
        const { slug, channel, text } = body || {};
        if (!slug || !channel || typeof text !== 'string') {
          res.writeHead(400).end(JSON.stringify({ error: 'slug, channel, text required' }));
          return;
        }
        const dir = resolve(CAMPAIGNS, slug);
        if (!existsSync(dir)) {
          res.writeHead(404).end(JSON.stringify({ error: 'campaign not found' }));
          return;
        }
        const channelDir = resolve(dir, channel);
        if (!existsSync(channelDir)) {
          res.writeHead(404).end(JSON.stringify({ error: 'channel dir not found' }));
          return;
        }
        const draftPath = findLatestDraft(channelDir);
        if (!draftPath) {
          res.writeHead(404).end(JSON.stringify({ error: 'no draft yaml' }));
          return;
        }
        const draft = readYaml(draftPath) || {};
        // 백업 — 처음 편집할 때만 .original 보존
        const origPath = draftPath.replace(/\.yaml$/, '.original.yaml');
        if (!existsSync(origPath)) {
          writeFileSync(origPath, readFileSync(draftPath, 'utf8'), 'utf8');
        }
        // 일반 백업 — 매 저장마다 덮어씀
        writeFileSync(draftPath + '.bak', readFileSync(draftPath, 'utf8'), 'utf8');

        draft.text = text;
        draft.updatedAt = new Date().toISOString();
        draft.editedInDashboard = true;
        writeFileSync(draftPath, YAML.stringify(draft, { lineWidth: 100 }), 'utf8');

        // brief.status 도 preview 로 되돌림 (편집했으니 재검토 의사)
        const briefPath = resolve(dir, 'brief.yaml');
        if (existsSync(briefPath)) {
          const brief = readYaml(briefPath) || {};
          brief.status = brief.status || {};
          // approved 였다면 preview 로 — 다시 발행 누를 때 자동으로 approved 됨
          if (brief.status[channel] === 'approved') brief.status[channel] = 'preview';
          brief.meta = { ...(brief.meta || {}), updatedAt: new Date().toISOString() };
          writeFileSync(briefPath, YAML.stringify(brief, { lineWidth: 100 }), 'utf8');
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          savedAt: new Date().toISOString(),
          draftFile: basename(draftPath),
          backup: basename(draftPath) + '.bak',
          textLength: text.length,
        }));
        return;
      }

      // ── 📂 파일 워치 — 새 발행 시작 전 publish.log 비우기 + 명령 빌드 ──
      if (path === '/api/watch/start') {
        const { slug, channel, dryRun = true } = body || {};
        if (!slug || !channel) {
          res.writeHead(400).end(JSON.stringify({ error: 'slug, channel required' }));
          return;
        }
        const channelDir = resolve(CAMPAIGNS, slug, channel);
        if (!existsSync(channelDir)) {
          res.writeHead(404).end(JSON.stringify({ error: 'channel dir not found' }));
          return;
        }
        // publish.log 초기화 (새 잡 시작)
        const logPath = resolve(channelDir, 'publish.log');
        writeFileSync(logPath, '', 'utf8');

        // 결과 파일도 초기화 (이전 잡 결과 안 보이게)
        // result.json 은 그대로 두고 (이전 발행 URL 등 유지)... 아니 새 잡 시작이니까 지우자? 일단 둠.

        // brief.status approved 로 (UI 에서 검수 봤다는 가정)
        const briefPath = resolve(CAMPAIGNS, slug, 'brief.yaml');
        if (existsSync(briefPath)) {
          const brief = readYaml(briefPath) || {};
          brief.status = brief.status || {};
          if (brief.status[channel] !== 'approved' && brief.status[channel] !== 'published') {
            brief.status[channel] = 'approved';
            brief.meta = { ...(brief.meta || {}), updatedAt: new Date().toISOString() };
            writeFileSync(briefPath, YAML.stringify(brief, { lineWidth: 100 }), 'utf8');
          }
        }

        // 너 채팅창에 붙여넣을 명령어 (자연어 + Bash)
        const channelLabelMap = {
          'naver-blog': '네이버 블로그', 'tistory': 'Tistory', 'brunch': '브런치',
          'instagram': 'Instagram', 'threads': 'Threads', 'linkedin': 'LinkedIn',
          'facebook': 'Facebook', 'x': 'X',
        };
        const chLabel = channelLabelMap[channel] || channel;
        const modeLabel = dryRun ? 'dry-run' : 'LIVE 발행';

        // 슬러그/경로에 한글 있을 수 있어 escape 주의 — 그냥 따옴표로 감쌈
        const cmd = `node harness/bin/browser-publish.mjs "${slug}" --channel=${channel} --attach${dryRun ? ' --dry-run' : ''} --auto-click 2>&1 | tee "posts/campaigns/${slug}/${channel}/publish.log"`;
        const naturalMessage = `[대시보드 모니터링] ${slug} 의 ${chLabel} ${modeLabel}. 다음 명령을 Bash 로 실행해줘 (publish.log 에 stdout 미러링되어야 대시보드가 라이브 모니터함):

\`\`\`bash
${cmd}
\`\`\`

명령이 끝나면 결과 (성공: URL / 실패: 에러 1줄) 만 알려줘. 필요시 셀렉터 깨짐 같은 거 자동으로 고쳐서 1회 재시도해도 됨.`;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          slug,
          channel,
          dryRun: !!dryRun,
          logPath: 'posts/campaigns/' + slug + '/' + channel + '/publish.log',
          command: cmd,
          message: naturalMessage,
        }));
        return;
      }


      res.writeHead(404).end(JSON.stringify({ error: 'POST endpoint not found' }));
      return;
    } catch (e) {
      res.writeHead(500).end(JSON.stringify({ error: e.message }));
      return;
    }
  }

  // ── 📂 파일 워치 SSE 스트림 (max 구독자용 — 너 채팅창 모니터) ──
  if (path === '/api/watch') {
    const slug = url.searchParams.get('slug');
    const channel = url.searchParams.get('channel');
    if (!slug || !channel) {
      res.writeHead(400).end('slug, channel required');
      return;
    }
    const channelDir = resolve(CAMPAIGNS, slug, channel);
    if (!existsSync(channelDir)) {
      res.writeHead(404).end('channel dir not found');
      return;
    }
    const logPath = resolve(channelDir, 'publish.log');
    const resultJson = resolve(channelDir, 'result.json');
    const resultYaml = resolve(channelDir, 'result.yaml');

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 5000\n\n');
    res.write(': stream open\n\n');

    // 기존 publish.log 가 있으면 즉시 모든 라인 전송 (이어보기)
    let logSize = 0;
    if (existsSync(logPath)) {
      const content = readFileSync(logPath, 'utf8');
      logSize = Buffer.byteLength(content, 'utf8');
      for (const raw of content.split('\n')) {
        const stamped = enrichLogLine(raw);
        if (stamped) res.write(`event: log\ndata: ${JSON.stringify(stamped)}\n\n`);
      }
    }

    // 즉시 result 도 한 번 전송 (있으면)
    const initialResultPath = [resultJson, resultYaml].find((p) => existsSync(p));
    let lastResultMtime = 0;
    if (initialResultPath) {
      try { lastResultMtime = statSync(initialResultPath).mtimeMs; } catch {}
      const result = readJsonOrYaml(initialResultPath);
      if (result) {
        res.write(`event: result\ndata: ${JSON.stringify({ result, source: basename(initialResultPath) })}\n\n`);
      }
    }

    // ── 파일 폴링 (Windows fs.watch 신뢰성 이슈 회피) ──
    const POLL_MS = 500;
    const tickHandlers = [];

    // publish.log 폴링
    tickHandlers.push((curr) => {
      const cur = (() => { try { return statSync(logPath); } catch { return null; } })();
      if (!cur) return;
      if (cur.size < logSize) {
        // truncate 됐음 — 새 잡 시작이라 보고 처음부터 다시 보냄
        logSize = 0;
      }
      if (cur.size > logSize) {
        try {
          const fd = openSync(logPath, 'r');
          const buf = Buffer.alloc(cur.size - logSize);
          readSync(fd, buf, 0, buf.length, logSize);
          closeSync(fd);
          logSize = cur.size;
          for (const raw of buf.toString('utf8').split('\n')) {
            const stamped = enrichLogLine(raw);
            if (stamped) {
              try { res.write(`event: log\ndata: ${JSON.stringify(stamped)}\n\n`); } catch {}
            }
          }
        } catch {}
      }
    });

    // result.json/yaml 폴링
    tickHandlers.push(() => {
      const rPath = [resultJson, resultYaml].find((p) => existsSync(p));
      if (!rPath) return;
      try {
        const m = statSync(rPath).mtimeMs;
        if (m > lastResultMtime) {
          lastResultMtime = m;
          const result = readJsonOrYaml(rPath);
          if (result) {
            try { res.write(`event: result\ndata: ${JSON.stringify({ result, source: basename(rPath) })}\n\n`); } catch {}
          }
        }
      } catch {}
    });

    const interval = setInterval(() => {
      for (const h of tickHandlers) { try { h(); } catch {} }
    }, POLL_MS);

    // keepalive
    const ka = setInterval(() => {
      try { res.write(': keepalive\n\n'); } catch {}
    }, 15_000);

    req.on('close', () => {
      clearInterval(interval);
      clearInterval(ka);
    });
    return;
  }

  // ── GET API ──
  if (path.startsWith('/api/')) {
    const handler = handlers[path];
    if (!handler) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    try {
      const data = await handler(url);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ── /static/products/* — 제품 사진 직접 서빙 ──
  if (path.startsWith('/static/products/')) {
    const fn = decodeURIComponent(path.replace('/static/products/', ''));
    const filePath = resolve(PRODUCTS_DIR, fn);
    if (!filePath.startsWith(PRODUCTS_DIR) || !existsSync(filePath)) {
      res.writeHead(404).end('not found');
      return;
    }
    const ext = extname(filePath).slice(1).toLowerCase();
    const types = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(readFileSync(filePath));
    return;
  }

  // ── /static/campaign-image/<slug>/<channel>/<file> — 캠페인 이미지 썸네일 ──
  if (path.startsWith('/static/campaign-image/')) {
    const rest = path.replace('/static/campaign-image/', '').split('/');
    if (rest.length !== 3) {
      res.writeHead(400).end('bad path');
      return;
    }
    const [slugEnc, chEnc, fnEnc] = rest;
    const filePath = resolve(CAMPAIGNS, decodeURIComponent(slugEnc), decodeURIComponent(chEnc), decodeURIComponent(fnEnc));
    if (!filePath.startsWith(CAMPAIGNS) || !existsSync(filePath)) {
      res.writeHead(404).end('not found');
      return;
    }
    if (!/\.(jpe?g|png|webp|gif)$/i.test(filePath)) {
      res.writeHead(403).end('not image');
      return;
    }
    const ext = extname(filePath).slice(1).toLowerCase();
    const types = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=300' });
    res.end(readFileSync(filePath));
    return;
  }

  // ── Serve dashboard files ──
  let filePath = path === '/' ? 'index.html' : path.slice(1);
  filePath = resolve(DASH_DIR, filePath);
  if (!filePath.startsWith(DASH_DIR)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  if (!existsSync(filePath)) {
    res.writeHead(404).end('not found');
    return;
  }
  const ext = filePath.split('.').pop();
  const types = {
    html: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    js: 'application/javascript; charset=utf-8',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    json: 'application/json',
  };
  res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
  res.end(readFileSync(filePath));
});

server.listen(port, '127.0.0.1', () => {
  const url = `http://localhost:${port}`;
  console.log(`\n🌐 Marketing Agent Dashboard\n`);
  console.log(`   ${url}\n`);
  console.log(`   campaigns: ${listCampaigns().length}`);
  console.log(`   port: ${port}`);
  console.log(`\n   Ctrl+C 로 종료\n`);

  if (!noOpen) {
    const cmd = process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    exec(`${cmd} "${url}"`).on('error', () => {});
  }
});
