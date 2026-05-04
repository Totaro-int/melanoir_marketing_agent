// BYO OpenAI provider — uses OPENAI_API_KEY from env (or .env.local).
// Image: gpt-image-1. Copy is handled by the copywriter subagent.
// Stub-safe: if no key is set, healthcheck returns ok:false and the registry skips it.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import { assertProvider } from '../provider.mjs';

const ROOT = resolve(new URL('.', import.meta.url).pathname, '../../../..');
const KEY = () => process.env.OPENAI_API_KEY ?? '';
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1';
const IMAGE_QUALITY = process.env.OPENAI_IMAGE_QUALITY ?? 'high';

export const provider = assertProvider({
  id: 'openai',
  byok: true,

  async generateCopy() {
    throw new Error(
      'openai provider 는 카피 생성을 지원하지 않습니다. ' +
      'generate.mjs 가 copy-spec.json 을 작성하면 copywriter 에이전트가 처리합니다.'
    );
  },

  async generateImage(req) {
    const t0 = Date.now();
    const size =
      req.aspect === 'portrait'  ? '1024x1536' :
      req.aspect === 'landscape' ? '1536x1024' :
      req.aspect === 'story'     ? '1024x1536' :
                                   '1024x1024';
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY()}` },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt: req.prompt,
        size,
        quality: IMAGE_QUALITY,
        background: 'opaque',
        n: req.count ?? 1,
        response_format: 'b64_json',
      }),
    });
    if (!res.ok) throw new Error(`OpenAI image failed: ${res.status} ${await res.text()}`);
    const json = await res.json();
    const dir = resolve(ROOT, 'out/openai-images');
    mkdirSync(dir, { recursive: true });
    const paths = [];
    for (const [i, item] of (json.data ?? []).entries()) {
      const buf = Buffer.from(item.b64_json, 'base64');
      const file = resolve(dir, `${Date.now()}-${i}.png`);
      writeFileSync(file, buf);
      paths.push(file.replace(ROOT + '/', ''));
    }
    return { paths, meta: { provider: 'openai', model: IMAGE_MODEL, latencyMs: Date.now() - t0 } };
  },

  healthcheck() {
    if (!KEY()) return { ok: false, reason: 'OPENAI_API_KEY not set' };
    return { ok: true };
  },
});

