#!/usr/bin/env node
// copy-deck.mjs — 로컬 "복사 붙여넣기 덱". 발행은 사람이 하되, 채널별 완성 카피를 한 페이지에서 [복사]→[붙여넣기].
//
// 왜: 브라우저 자동 발행은 봇으로 의심받는다. 이건 자동화 0 — 사람이 직접 플랫폼에 붙여넣고 올린다.
//     로컬에 채널별 글쓰기 칸(복사 버튼 + 첨부 이미지)을 띄워주는 게 전부.
//
// Usage:
//   node harness/bin/copy-deck.mjs [<slug>] [--port=7788]
//     <slug> 없으면 가장 최근 draft 있는 캠페인 자동 선택.
//
// 브라우저에서 http://localhost:7788 → 채널별 [복사] → 플랫폼 열기 → 붙여넣기 → 이미지 첨부 → 게시.

import http from 'node:http';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, basename, extname } from 'node:path';
import { ROOT, PATHS, readYaml, findCampaignDir, latestDraftYaml, isBlogChannel, ui } from './_lib.mjs';

const argv = process.argv.slice(2);
const slugArg = argv.find((a) => !a.startsWith('--'));
const port = Number(argv.find((a) => a.startsWith('--port='))?.split('=')[1] ?? 7788);

const CH = {
  instagram:    { label: 'Instagram',    url: 'https://www.instagram.com',       tip: '새 게시물 → 이미지 첨부 → 캡션 붙여넣기' },
  threads:      { label: 'Threads',      url: 'https://www.threads.net',         tip: '새 스레드 → 붙여넣기 → 이미지 첨부' },
  linkedin:     { label: 'LinkedIn',     url: 'https://www.linkedin.com/feed/',  tip: '게시물 작성 → 붙여넣기 → 이미지 첨부' },
  'naver-blog': { label: '네이버 블로그', url: 'https://blog.naver.com',          tip: '글쓰기 → 본문 붙여넣기 → 이미지 섹션 순서대로 첨부' },
  tistory:      { label: '티스토리',      url: 'https://www.tistory.com/manage',  tip: '글쓰기 → 붙여넣기' },
  brunch:       { label: '브런치',        url: 'https://brunch.co.kr',            tip: '글쓰기 → 붙여넣기' },
};
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

// ── 캠페인 선택: slug 명시 or 가장 최근 draft 있는 캠페인 ────────────────────────
function pickCampaign() {
  if (slugArg) { const d = findCampaignDir(slugArg); if (!d) { ui.err(`캠페인 없음: ${slugArg}`); process.exit(2); } return d; }
  const base = PATHS.campaignsDir;
  if (!existsSync(base)) { ui.err(`캠페인 폴더 없음: ${base}`); process.exit(2); }
  const dirs = readdirSync(base).map((n) => resolve(base, n)).filter((p) => statSync(p).isDirectory());
  const withDraft = dirs.filter((d) => readdirSync(d).some((ch) => CH[ch] && latestDraftYaml(resolve(d, ch))));
  if (!withDraft.length) { ui.err('draft 있는 캠페인 없음 — 먼저 generate/finalize 하세요.'); process.exit(2); }
  withDraft.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return withDraft[0];
}

function collectChannels(dir) {
  const out = [];
  for (const ch of readdirSync(dir)) {
    if (!CH[ch]) continue;
    const dp = latestDraftYaml(resolve(dir, ch));
    if (!dp) continue;
    let draft; try { draft = readYaml(dp); } catch { continue; }
    const assets = (draft.assets ?? []).filter((p) => p && existsSync(resolve(ROOT, p)));
    out.push({ ch, draft, assets, blog: isBlogChannel(ch) });
  }
  // 표시 순서: 블로그 먼저(긴 글), 그다음 소셜
  return out.sort((a, b) => (b.blog - a.blog) || a.ch.localeCompare(b.ch));
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function render(campaignDir, items) {
  const slug = basename(campaignDir);
  const cards = items.map((it, i) => {
    const meta = CH[it.ch];
    const tags = Array.isArray(it.draft.hashtags) ? it.draft.hashtags : [];
    const body = String(it.draft.title ? `${it.draft.title}\n\n` : '') + String(it.draft.text ?? '');
    // 해시태그가 본문에 이미 없으면 덧붙임
    const hasTag = tags.length && body.includes(tags[0]);
    const full = (tags.length && !hasTag) ? `${body}\n\n${tags.join(' ')}` : body;
    const imgs = it.assets.map((p, k) => {
      const q = encodeURIComponent(p);
      return `<a class="img" href="/img?p=${q}" target="_blank" download title="이미지 ${k + 1} 저장/열기"><img src="/img?p=${q}" loading="lazy"/><span>이미지 ${k + 1}${it.blog ? ` (섹션 ${k + 1})` : ''}</span></a>`;
    }).join('');
    return `
    <section class="card">
      <header>
        <h2>${esc(meta.label)} <span class="kind">${it.blog ? '블로그(본문)' : '소셜'}</span></h2>
        <a class="open" href="${meta.url}" target="_blank">플랫폼 열기 ↗</a>
      </header>
      <p class="tip">${esc(meta.tip)}</p>
      <textarea id="t${i}" readonly>${esc(full)}</textarea>
      <div class="row">
        <button class="copy" data-t="t${i}">📋 본문 복사</button>
        <span class="len">${full.length}자</span>
        ${tags.length ? `<button class="copy2" data-tags="${esc(tags.join(' '))}">#태그만 복사</button>` : ''}
      </div>
      ${imgs ? `<div class="imgs"><div class="imgs-h">첨부 이미지 ${it.assets.length}장 (클릭=저장)</div><div class="imgs-row">${imgs}</div></div>` : '<p class="noimg">첨부 이미지 없음</p>'}
    </section>`;
  }).join('');

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>복붙 덱 — ${esc(slug)}</title><style>
  :root{--bg:#0b0b0d;--card:#15151a;--line:#26262e;--ink:#f2f2f4;--dim:#9a9aa5;--ok:#16a34a;--accent:#3b82f6}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font-family:Pretendard,"Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;padding:24px}
  .head{max-width:920px;margin:0 auto 18px} .head h1{margin:0 0 4px;font-size:22px} .head p{margin:0;color:var(--dim);font-size:14px}
  .wrap{max-width:920px;margin:0 auto;display:flex;flex-direction:column;gap:18px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px}
  .card header{display:flex;align-items:center;justify-content:space-between;gap:12px}
  .card h2{margin:0;font-size:18px} .kind{font-size:12px;color:var(--dim);font-weight:400;margin-left:6px}
  .open{color:var(--accent);text-decoration:none;font-size:14px;white-space:nowrap} .open:hover{text-decoration:underline}
  .tip{color:var(--dim);font-size:13px;margin:6px 0 10px}
  textarea{width:100%;min-height:140px;background:#0e0e12;color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:12px;font:14px/1.6 inherit;resize:vertical}
  .row{display:flex;align-items:center;gap:10px;margin-top:10px}
  button{background:var(--accent);color:#fff;border:0;border-radius:9px;padding:9px 16px;font-size:14px;font-weight:600;cursor:pointer}
  button.copy2{background:#2a2a33} button.done{background:var(--ok)}
  .len{color:var(--dim);font-size:13px;margin-left:auto}
  .imgs{margin-top:14px} .imgs-h{color:var(--dim);font-size:13px;margin-bottom:8px}
  .imgs-row{display:flex;gap:10px;flex-wrap:wrap}
  .img{display:flex;flex-direction:column;align-items:center;gap:4px;text-decoration:none;color:var(--dim);font-size:12px}
  .img img{width:90px;height:112px;object-fit:cover;border-radius:8px;border:1px solid var(--line)}
  .noimg{color:var(--dim);font-size:13px;margin-top:10px}
</style></head><body>
  <div class="head"><h1>📋 복사 붙여넣기 덱 <span style="color:var(--dim);font-weight:400">— ${esc(slug)}</span></h1>
  <p>자동 발행 아님. 채널별 [복사] → 플랫폼 열기 → 붙여넣기 → 이미지 첨부 → 직접 게시. (봇 의심 0)</p></div>
  <div class="wrap">${cards || '<div class="card">draft 없음</div>'}</div>
<script>
  document.querySelectorAll('button.copy').forEach(b=>b.onclick=async()=>{
    const ta=document.getElementById(b.dataset.t);
    try{await navigator.clipboard.writeText(ta.value)}catch{ta.select();document.execCommand('copy')}
    const o=b.textContent;b.textContent='✓ 복사됨';b.classList.add('done');setTimeout(()=>{b.textContent=o;b.classList.remove('done')},1400);
  });
  document.querySelectorAll('button.copy2').forEach(b=>b.onclick=async()=>{
    try{await navigator.clipboard.writeText(b.dataset.tags)}catch{}
    const o=b.textContent;b.textContent='✓';setTimeout(()=>b.textContent=o,1200);
  });
</script></body></html>`;
}

// ── 서버 ────────────────────────────────────────────────────────────────────
const campaignDir = pickCampaign();
const items = collectChannels(campaignDir);

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://localhost:${port}`);
  if (u.pathname === '/img') {
    // 로컬 이미지 서빙 — ROOT 하위 + draft.assets 에 등록된 것만 (경로 검증)
    const p = u.searchParams.get('p') || '';
    const abs = resolve(ROOT, p);
    const allowed = items.some((it) => it.assets.some((a) => resolve(ROOT, a) === abs));
    if (!allowed || !existsSync(abs)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[extname(abs).toLowerCase()] || 'application/octet-stream' });
    res.end(readFileSync(abs));
    return;
  }
  if (u.pathname === '/health') { res.writeHead(200); res.end('ok'); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(render(campaignDir, items));
});
server.listen(port, () => {
  console.log('');
  ui.ok(`복붙 덱: http://localhost:${port}`);
  ui.dim(`  캠페인: ${basename(campaignDir)}  ·  채널 ${items.length}개 (${items.map((i) => i.ch).join(', ')})`);
  ui.dim('  브라우저에서 채널별 [복사] → 플랫폼에 붙여넣기. (Ctrl+C 로 종료)');
});
