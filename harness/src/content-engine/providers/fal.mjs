// BYO fal.ai provider — image generation only (text/copy still goes through openai/mock).
// Returns BOTH a public CDN URL (used by the publisher to post images) and a local
// path (downloaded for /sns-preview).
//
// Env: FAL_KEY (required), FAL_IMAGE_MODEL (default fal-ai/flux/schnell)
// Docs: https://fal.ai/models  ·  https://docs.fal.ai/

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import { provider as mock } from './mock.mjs';
import { assertProvider } from '../provider.mjs';

const ROOT = resolve(new URL('.', import.meta.url).pathname, '../../../..');
const KEY = () => process.env.FAL_KEY ?? '';
const IMAGE_MODEL = () => process.env.FAL_IMAGE_MODEL ?? 'fal-ai/flux/schnell';

function imageSize(aspect) {
  switch (aspect) {
    case 'portrait':  return 'portrait_4_3';
    case 'landscape': return 'landscape_16_9';
    case 'story':     return 'portrait_16_9';
    default:          return 'square_hd';
  }
}

export const provider = assertProvider({
  id: 'fal',
  byok: true,

  // fal.ai is image-first; for copy we delegate to mock so end-to-end keeps working
  // when CONTENT_ENGINE_PROVIDER=fal but no openai key is set. Real LLM copy comes
  // from the openai provider or a Claude subagent.
  async generateCopy(req) {
    return mock.generateCopy(req);
  },

  async generateImage(req) {
    if (!KEY()) throw new Error('FAL_KEY not set');
    const t0 = Date.now();
    const model = IMAGE_MODEL();

    const body = {
      prompt: req.prompt,
      image_size: imageSize(req.aspect),
      num_images: req.count ?? 1,
      enable_safety_checker: true,
    };

    const json = await falPost(`https://fal.run/${model}`, body);

    // Response shape: { images: [{ url, width, height, content_type, file_name }], ... }
    const images = json.images ?? [];
    if (!images.length) throw new Error('fal returned no images: ' + JSON.stringify(json).slice(0, 300));

    const dir = resolve(ROOT, 'out/fal-images');
    mkdirSync(dir, { recursive: true });

    const paths = [];
    const urls  = [];
    for (const [i, img] of images.entries()) {
      const url = img.url;
      urls.push(url);
      // Download a local copy so /sns-preview can show something even when offline later.
      try {
        const r = await fetch(url);
        if (r.ok) {
          const ext = (img.content_type ?? 'image/png').split('/')[1] ?? 'png';
          const file = resolve(dir, `${Date.now()}-${i}.${ext}`);
          writeFileSync(file, Buffer.from(await r.arrayBuffer()));
          paths.push(file.replace(ROOT + '/', ''));
        }
      } catch {
        // If the download fails the URL is still authoritative; preview just won't have a local path.
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
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${KEY()}` },
    body: JSON.stringify(body),
  });
  if (r.ok) return r.json();

  // Retry once on 429 / 5xx with linear backoff. fal occasionally cold-starts.
  if (attempt === 1 && (r.status === 429 || r.status >= 500)) {
    await new Promise((res) => setTimeout(res, 1500));
    return falPost(url, body, 2);
  }

  const text = await r.text();
  throw new Error(`fal HTTP ${r.status}: ${text.slice(0, 300)}`);
}
