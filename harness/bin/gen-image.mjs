// gen-image.mjs — slide 배경용 이미지를 fal로 생성해 PNG로 저장한다.
// Usage:
//   node harness/bin/gen-image.mjs --prompt="abstract fintech" --aspect=portrait --out=/tmp/card1.png

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { Buffer } from 'node:buffer';
import { ROOT } from './_lib.mjs';
import { provider } from '../src/content-engine/providers/fal.mjs';

// Parse --key=value flags from argv
const args = {};
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([a-zA-Z][a-zA-Z0-9_-]*)=(.*)$/s);
  if (m) args[m[1]] = m[2];
}

const prompt = args['prompt'];
const aspect = args['aspect'] ?? 'portrait';
const outPath = args['out'];

if (!prompt || !outPath) {
  process.stderr.write(
    'Usage: node harness/bin/gen-image.mjs --prompt="..." --aspect=portrait --out=/abs/path/card.png\n' +
    'Required: --prompt, --out\n'
  );
  process.exit(2);
}

try {
  const result = await provider.generateImage({ prompt, aspect, count: 1 });

  let imageBytes;
  if (result.paths.length > 0) {
    imageBytes = readFileSync(resolve(ROOT, result.paths[0]));
  } else if (result.urls.length > 0) {
    const r = await fetch(result.urls[0]);
    if (!r.ok) throw new Error(`Failed to download image: HTTP ${r.status}`);
    imageBytes = Buffer.from(await r.arrayBuffer());
  } else {
    throw new Error('fal returned no paths and no urls');
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, imageBytes);
  console.log(outPath);
  process.exit(0);
} catch (err) {
  process.stderr.write('gen-image: fal error — ' + err.message + '\n');
  process.exit(1);
}
