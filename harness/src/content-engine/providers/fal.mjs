// BYO fal.ai provider — image generation only.
// Copy/text goes through copywriter agent via copy-spec.json, not here.
//
// Env: FAL_KEY (required), FAL_IMAGE_MODEL (default fal-ai/nano-banana-2)
//
// Supported models:
//   fal-ai/nano-banana-2  — Gemini 3.1 Flash Image. No inference steps, aspect_ratio enum.
//   fal-ai/flux/dev       — Flux Dev. 28 steps, image_size object.
//   fal-ai/flux-pro/v1.1  — Flux Pro. 25 steps, image_size object.
//   fal-ai/flux/schnell   — Flux Schnell (fast/low quality). 4 steps. NOT recommended.
//
// Docs: https://fal.ai/models/fal-ai/nano-banana-2

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import { assertProvider } from '../provider.mjs';

const ROOT = resolve(new URL('.', import.meta.url).pathname, '../../../..');
const KEY = () => process.env.FAL_KEY ?? '';
const IMAGE_MODEL = () => process.env.FAL_IMAGE_MODEL ?? 'fal-ai/nano-banana-2';

// nano-banana-2 uses aspect_ratio enum; flux models use image_size object.
function isNanoBanana(model) {
  return model.includes('nano-banana');
}

// nano-banana-2 aspect_ratio enum values
function aspectRatioEnum(aspect) {
  switch (aspect) {
    case 'portrait':  return '4:5';
    case 'landscape': return '16:9';
    case 'story':     return '9:16';
    default:          return '1:1';
  }
}

// flux image_size: string preset or {width, height}
function fluxImageSize(aspect) {
  switch (aspect) {
    case 'portrait':  return { width: 1080, height: 1350 };
    case 'landscape': return 'landscape_16_9';
    case 'story':     return { width: 1080, height: 1920 };
    default:          return 'square_hd';
  }
}

function fluxInferenceSteps(model) {
  if (model.includes('schnell')) return 4;
  if (model.includes('dev'))     return 28;
  return 25;
}

function buildBody(model, prompt, aspect, count) {
  if (isNanoBanana(model)) {
    return {
      prompt,
      num_images:        count ?? 1,
      aspect_ratio:      aspectRatioEnum(aspect),
      output_format:     'png',
      safety_tolerance:  '4',
      resolution:        '1K',
      limit_generations: true,
    };
  }
  // flux family
  return {
    prompt,
    negative_prompt: 'text, letters, words, numbers, typography, glyphs, characters, writing, inscription, label, caption, watermark, logo, brand name, readable text',
    image_size:           fluxImageSize(aspect),
    num_images:           count ?? 1,
    num_inference_steps:  fluxInferenceSteps(model),
    guidance_scale:       3.5,
    enable_safety_checker: true,
  };
}

export const provider = assertProvider({
  id: 'fal',
  byok: true,

  async generateCopy() {
    throw new Error(
      'fal provider 는 카피 생성을 지원하지 않습니다. ' +
      'generate.mjs 가 copy-spec.json 을 작성하면 copywriter 에이전트가 처리합니다.'
    );
  },

  async generateImage(req) {
    if (!KEY()) throw new Error('FAL_KEY not set');
    const t0    = Date.now();
    // 모델 fallback chain — 권한 401 시 다음 모델로
    // 사용자가 FAL_IMAGE_MODEL 명시했으면 그것만 시도. 명시 안 했으면 chain 시도.
    const userModel = process.env.FAL_IMAGE_MODEL;
    const chain = userModel
      ? [userModel]
      : ['fal-ai/flux/schnell', 'fal-ai/nano-banana-2', 'fal-ai/fast-sdxl'];

    let lastErr = null;
    let model = chain[0];
    let json = null;
    for (const m of chain) {
      try {
        const body = buildBody(m, req.prompt, req.aspect, req.count);
        json = await falQueueGenerate(m, body);
        model = m;
        break;
      } catch (e) {
        lastErr = e;
        if (!String(e.message).includes('401')) throw e; // 401 외 에러는 즉시 실패
        // 401 면 다음 모델 시도
      }
    }
    if (!json) throw new Error(`fal: 모든 모델 401 거부. 마지막: ${lastErr?.message}. .env.local 의 FAL_KEY + FAL_IMAGE_MODEL 확인.`);
    const images = json.images ?? [];
    if (!images.length) throw new Error('fal returned no images: ' + JSON.stringify(json).slice(0, 300));

    const dir = resolve(ROOT, 'out/fal-images');
    mkdirSync(dir, { recursive: true });

    const paths = [];
    const urls  = [];
    for (const [i, img] of images.entries()) {
      urls.push(img.url);
      try {
        const r = await fetch(img.url);
        if (r.ok) {
          const ext  = (img.content_type ?? 'image/png').split('/')[1] ?? 'png';
          const file = resolve(dir, `${Date.now()}-${i}.${ext}`);
          writeFileSync(file, Buffer.from(await r.arrayBuffer()));
          paths.push(file.replace(ROOT + '/', ''));
        }
      } catch {
        // URL is authoritative; local copy is best-effort for preview only.
      }
    }

    return {
      paths,
      urls,
      meta: { provider: 'fal', model, latencyMs: Date.now() - t0 },
    };
  },

  healthcheck() {
    if (!KEY()) return { ok: false, reason: 'FAL_KEY not set' };
    return { ok: true };
  },
});

async function falPost(url, body, attempt = 1) {
  const r = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${KEY()}` },
    body:    JSON.stringify(body),
  });
  if (r.ok) return r.json();

  if (attempt === 1 && (r.status === 429 || r.status >= 500)) {
    await new Promise((res) => setTimeout(res, 1500));
    return falPost(url, body, 2);
  }

  const text = await r.text();
  throw new Error(`fal HTTP ${r.status}: ${text.slice(0, 300)}`);
}

// fal queue 모드 — submit → 폴링 → result. sync 거부되는 모델용.
async function falQueueGenerate(model, body, opts = {}) {
  const { pollIntervalMs = 1500, maxPolls = 80 } = opts;
  // 1. submit
  const subR = await fetch(`https://queue.fal.run/${model}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${KEY()}` },
    body: JSON.stringify(body),
  });
  if (!subR.ok) {
    const t = await subR.text();
    throw new Error(`fal queue submit HTTP ${subR.status}: ${t.slice(0, 300)}`);
  }
  const sub = await subR.json();
  const statusUrl = sub.status_url || `https://queue.fal.run/${model}/requests/${sub.request_id}/status`;
  const responseUrl = sub.response_url || `https://queue.fal.run/${model}/requests/${sub.request_id}`;

  // 2. poll
  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const sR = await fetch(statusUrl, { headers: { Authorization: `Key ${KEY()}` } });
    if (!sR.ok) continue;
    const s = await sR.json();
    if (s.status === 'COMPLETED') {
      const rR = await fetch(responseUrl, { headers: { Authorization: `Key ${KEY()}` } });
      if (!rR.ok) throw new Error(`fal queue result HTTP ${rR.status}`);
      return rR.json();
    }
    if (s.status !== 'IN_QUEUE' && s.status !== 'IN_PROGRESS') {
      throw new Error(`fal queue unexpected status: ${JSON.stringify(s).slice(0, 200)}`);
    }
  }
  throw new Error(`fal queue timeout (${maxPolls} polls × ${pollIntervalMs}ms)`);
}
