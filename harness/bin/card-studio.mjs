#!/usr/bin/env node
// card-studio.mjs — 인스타 카드레터 스튜디오. 배경 이미지 업로드 + 그 위에 정보성 텍스트 오버레이 → 카드뉴스 carousel.
//
// "업로드한 것처럼" 퀄리티 = 검증된 insight-card.mjs(사진 풀블리드 + 스크림 + 텍스트, Playwright 렌더)를 백엔드로 그대로 쓴다.
// 라이브 미리보기는 같은 레이아웃 replica(WYSIWYG), [생성]은 insight-card 가 실제 PNG 를 굽는다.
//
// Usage:  node harness/bin/card-studio.mjs [--port=7799]   → http://localhost:7799
//   업로드 → 카드별 제목/서브/카테고리 입력 → 미리보기 → [PNG 생성] → 다운로드.
//   브랜드(핸들·워드마크·폰트·컬러)는 company-profile.yaml 에서 자동.

import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, HARNESS_ROOT, PATHS, readYaml, ui } from './_lib.mjs';

const argv = process.argv.slice(2);
const port = Number(argv.find((a) => a.startsWith('--port='))?.split('=')[1] ?? 7799);

let profile = {};
try { if (existsSync(PATHS.profile)) profile = readYaml(PATHS.profile) || {}; } catch {}
const BRAND = {
  name: profile.brand?.name || 'Brand',
  wordmark: String(profile.brand?.name || 'BRAND').toUpperCase(),
  handle: '@' + String(profile.brand?.name || 'brand').toLowerCase().replace(/[^a-z0-9_.]/g, ''),
  font: profile.visual?.fonts?.heading || '"Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif',
  base: profile.visual?.colors?.secondary || profile.visual?.colors?.primary || '#0a0a0c',
};

const OUT = resolve(ROOT, 'out', 'studio');
mkdirSync(OUT, { recursive: true });

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${port}`);

  // 카드 1장 PNG 생성 — insight-card.mjs 호출 (검증된 렌더)
  if (req.method === 'POST' && u.pathname === '/api/card') {
    let body = '';
    for await (const c of req) body += c;
    try {
      const { image, title, subtitle, category, handle, index = 1 } = JSON.parse(body);
      if (!title || !String(title).trim()) throw new Error('제목(title)이 필요합니다');
      const photoArg = [];
      if (image && image.startsWith('data:image/')) {
        const m = image.match(/^data:image\/([\w+]+);base64,(.+)$/);
        if (m) {
          const ext = m[1] === 'jpeg' ? 'jpg' : m[1].replace(/[^a-z0-9]/gi, '') || 'png';
          const p = resolve(OUT, `_up-${index}.${ext}`);
          writeFileSync(p, Buffer.from(m[2], 'base64'));
          photoArg.push(`--photo=${p}`);
        }
      }
      const outPng = resolve(OUT, `card-${index}.png`);
      const args = [
        resolve(HARNESS_ROOT, 'bin/insight-card.mjs'),
        `--title=${title}`, `--subtitle=${subtitle || ''}`, `--category=${category || ''}`,
        `--out=${outPng}`, ...photoArg,
      ];
      if (handle) args.push(`--handle=${handle}`);
      execFileSync('node', args, { stdio: 'pipe' });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, url: `/out/card-${index}.png?t=${process.hrtime.bigint()}` }));
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  if (u.pathname.startsWith('/out/')) {
    const f = resolve(OUT, decodeURIComponent(u.pathname.slice(5).split('?')[0]));
    if (f.startsWith(OUT) && existsSync(f)) { res.writeHead(200, { 'content-type': 'image/png' }); res.end(readFileSync(f)); return; }
    res.writeHead(404); res.end('not found'); return;
  }
  if (u.pathname === '/health') { res.writeHead(200); res.end('ok'); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(studioHtml());
});
server.listen(port, '127.0.0.1', () => {
  console.log('');
  ui.ok(`카드레터 스튜디오: http://localhost:${port}`);
  ui.dim(`  배경 업로드 + 텍스트 오버레이 → [PNG 생성] (insight-card 렌더, 브랜드: ${BRAND.name}). Ctrl+C 종료`);
});

function studioHtml() {
  const B = JSON.stringify(BRAND);
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>카드레터 스튜디오</title>
<link rel="stylesheet" crossorigin href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css">
<style>
  :root{--bg:#f7f8fa;--panel:#fff;--line:#e6e8ec;--ink:#1d1d1f;--dim:#86868b;--accent:#1d1d1f;--card-base:${BRAND.base}}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font-family:Pretendard,"Apple SD Gothic Neo",sans-serif}
  .top{display:flex;align-items:center;gap:10px;padding:16px 22px;border-bottom:1px solid var(--line);background:var(--panel)}
  .top h1{font-size:17px;margin:0;font-weight:700} .top p{margin:0;font-size:12px;color:var(--dim)}
  .wrap{max-width:1080px;margin:0 auto;padding:24px;display:flex;gap:28px;flex-wrap:wrap;justify-content:center}
  .stage{display:flex;flex-direction:column;align-items:center;gap:14px}
  /* 카드레터 미리보기 — insight-card 레이아웃 1080x1350 을 0.34 스케일 */
  .frame{width:367px;height:459px;border-radius:14px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.12)}
  .card{position:relative;width:1080px;height:1350px;transform:scale(.34);transform-origin:top left;overflow:hidden;color:#fff;font-family:${BRAND.font};
        background:radial-gradient(120% 120% at 30% 18%, #2a2a30 0%, var(--card-base) 70%);background-size:cover;background-position:center}
  .card .scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.30) 0%,rgba(0,0,0,0) 32%,rgba(0,0,0,.78) 100%)}
  .card .pad{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;padding:72px 72px 80px}
  .card .handle{font-weight:700;letter-spacing:.10em;text-transform:uppercase;font-size:32px;text-shadow:0 2px 8px rgba(0,0,0,.55)}
  .card .foot{display:flex;flex-direction:column;gap:18px}
  .card .eyebrow{align-self:flex-start;font-size:26px;font-weight:600;letter-spacing:.06em;padding:8px 18px;border-radius:10px;background:rgba(255,255,255,.16);text-shadow:0 1px 4px rgba(0,0,0,.4)}
  .card .title{font-size:88px;font-weight:800;line-height:1.18;letter-spacing:-.02em;text-shadow:0 3px 14px rgba(0,0,0,.6);word-break:keep-all}
  .card .title.long{font-size:76px} .card .title.xlong{font-size:64px}
  .card .sub{font-size:34px;font-weight:500;line-height:1.4;opacity:.94;text-shadow:0 2px 8px rgba(0,0,0,.55)}
  .card .mark{position:absolute;left:0;right:0;bottom:34px;text-align:center;font-size:22px;letter-spacing:.34em;font-weight:600;opacity:.62;text-transform:uppercase}
  .thumbs{display:flex;gap:7px;flex-wrap:wrap;justify-content:center;max-width:380px}
  .thumb{width:34px;height:34px;border-radius:7px;border:1px solid var(--line);background:var(--panel);font-size:12px;cursor:pointer;color:var(--dim)}
  .thumb.active{background:var(--accent);color:#fff;border-color:var(--accent)} .thumb.add{font-size:16px}
  .panel{width:360px;display:flex;flex-direction:column;gap:12px}
  label{font-size:12px;color:var(--dim);display:block;margin-bottom:4px}
  input[type=text],textarea{width:100%;border:1px solid var(--line);border-radius:9px;padding:10px;font:14px/1.5 inherit;background:var(--panel);color:var(--ink)}
  textarea{resize:vertical;min-height:54px}
  .up{display:block;border:1.5px dashed var(--line);border-radius:10px;padding:14px;text-align:center;color:var(--dim);font-size:13px;cursor:pointer;background:var(--panel)}
  .up input{display:none}
  button{border:0;border-radius:9px;padding:11px 16px;font-size:14px;font-weight:700;cursor:pointer}
  .gen{background:var(--accent);color:#fff} .ghost{background:#eceef1;color:var(--ink)}
  .row{display:flex;gap:8px} .row>*{flex:1}
  .result{margin-top:8px;font-size:13px;color:var(--dim)} .result a{color:var(--accent)}
  .result img{width:100%;border-radius:10px;border:1px solid var(--line);margin-top:8px}
</style></head><body>
  <div class="top"><div><h1>📸 카드레터 스튜디오</h1><p>배경 이미지 + 정보성 텍스트 → 인스타 카드뉴스 (브랜드: ${BRAND.name})</p></div></div>
  <div class="wrap">
    <div class="stage">
      <div class="frame"><div class="card" id="card">
        <div class="scrim"></div>
        <div class="pad">
          <div class="handle" id="pv-handle">${BRAND.handle}</div>
          <div class="foot">
            <span class="eyebrow" id="pv-eyebrow" hidden></span>
            <h1 class="title" id="pv-title">제목을 입력하세요</h1>
            <p class="sub" id="pv-sub" hidden></p>
          </div>
        </div>
        <div class="mark">${BRAND.wordmark}</div>
      </div></div>
      <div class="thumbs" id="thumbs"></div>
    </div>
    <div class="panel">
      <label class="up">배경 사진 올리기 (선택 — 없으면 모노톤)
        <input type="file" id="bg" accept="image/*">
      </label>
      <div><label>카테고리 (상단 작은 라벨)</label><input type="text" id="eyebrow" placeholder="예: 소재 인사이트"></div>
      <div><label>제목 (큰 글씨)</label><textarea id="title" placeholder="이미지 위에 올릴 핵심 한 줄"></textarea></div>
      <div><label>서브 (보조 설명)</label><textarea id="sub" placeholder="한 줄 보조 설명 (선택)"></textarea></div>
      <div class="row">
        <button class="ghost" onclick="addCard()">+ 카드 추가</button>
        <button class="gen" id="genBtn" onclick="genCard()">이 카드 PNG 생성</button>
      </div>
      <div class="result" id="result"></div>
    </div>
  </div>
<script>
const BRAND = ${B};
let cards = [{ eyebrow:'', title:'', sub:'', image:null, png:null }];
let active = 0;
const $ = (id)=>document.getElementById(id);
function syncFromInputs(){ const c=cards[active]; c.eyebrow=$('eyebrow').value; c.title=$('title').value; c.sub=$('sub').value; }
function renderInputs(){ const c=cards[active]; $('eyebrow').value=c.eyebrow; $('title').value=c.title; $('sub').value=c.sub; renderPreview(); renderThumbs(); $('result').innerHTML = c.png?('생성됨 · <a href="'+c.png+'" download="card'+(active+1)+'.png">다운로드</a><img src="'+c.png+'">'):''; }
function renderPreview(){
  const c=cards[active];
  $('pv-eyebrow').hidden=!c.eyebrow; $('pv-eyebrow').textContent=c.eyebrow;
  const t=$('pv-title'); t.textContent=c.title||'제목을 입력하세요'; t.className='title'+( (c.title||'').length>28?' xlong':(c.title||'').length>16?' long':'');
  $('pv-sub').hidden=!c.sub; $('pv-sub').textContent=c.sub;
  $('card').style.backgroundImage = c.image ? "url('"+c.image+"')" : '';
  $('card').style.background = c.image ? "center/cover no-repeat url('"+c.image+"')" : '';
}
function renderThumbs(){
  let h=''; cards.forEach((c,i)=>h+='<button class="thumb'+(i===active?' active':'')+'" onclick="go('+i+')">'+(i+1)+'</button>');
  h+='<button class="thumb add" onclick="addCard()">+</button>'; $('thumbs').innerHTML=h;
}
function go(i){ syncFromInputs(); active=i; renderInputs(); }
function addCard(){ syncFromInputs(); cards.push({eyebrow:'',title:'',sub:'',image:null,png:null}); active=cards.length-1; renderInputs(); }
['eyebrow','title','sub'].forEach(id=>$(id).addEventListener('input',()=>{ syncFromInputs(); renderPreview(); }));
$('bg').addEventListener('change',(e)=>{ const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=()=>{ cards[active].image=r.result; renderPreview(); }; r.readAsDataURL(f); });
async function genCard(){
  syncFromInputs(); const c=cards[active];
  if(!c.title.trim()){ alert('제목을 입력하세요'); return; }
  const btn=$('genBtn'); const o=btn.textContent; btn.textContent='생성 중…'; btn.disabled=true;
  try{
    const r=await fetch('/api/card',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:c.image,title:c.title,subtitle:c.sub,category:c.eyebrow,index:active+1})});
    const j=await r.json();
    if(j.ok){ c.png=j.url; $('result').innerHTML='✅ 생성됨 (실제 렌더) · <a href="'+j.url+'" download="card'+(active+1)+'.png">다운로드</a><img src="'+j.url+'">'; }
    else $('result').innerHTML='❌ '+j.error;
  }catch(e){ $('result').innerHTML='❌ '+e.message; }
  btn.textContent=o; btn.disabled=false;
}
renderInputs();
</script></body></html>`;
}
