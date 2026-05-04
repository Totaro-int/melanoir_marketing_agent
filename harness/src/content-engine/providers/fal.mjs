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
    const model = IMAGE_MODEL();
    const body  = buildBody(model, req.prompt, req.aspect, req.count);

    const json   = await falPost(`https://fal.run/${model}`, body);
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
