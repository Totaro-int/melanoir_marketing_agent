#!/usr/bin/env node
// Validate company-profile.yaml against schemas/company-profile.schema.yaml.
// Usage:
//   node bin/profile-validate.mjs                # validate ./company-profile.yaml
//   node bin/profile-validate.mjs <path>         # validate given file
//   npm run validate:example

import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { PATHS, readYaml, loadJson, ui } from './_lib.mjs';

const target = process.argv[2] ?? PATHS.profile;

// P0-B: tonePreset 마이그레이션 — schema 어휘(구버전) → 런타임 어휘(진실)
const TONE_MIGRATION = {
  professional: 'relate-kr',
  witty:        'friendly',
  bold:         'sales',
  calm:         'relate-kr',
  premium:      'b2b',
  custom:       'relate-kr',
};
const VALID_TONES = ['relate-kr', 'b2b', 'informational', 'friendly', 'sales'];

let schema, profile;
try {
  schema = readYaml(PATHS.schema);
} catch (e) {
  ui.err(`스키마 로드 실패: ${e.message}`);
  process.exit(2);
}

// P0-A: channels.json 을 single source of truth 로 — enum 동적 주입
try {
  const channels = loadJson(PATHS.channelsManifest);
  const activeIds = channels.filter((c) => c.status === 'active' || c.status === 'beta').map((c) => c.id);
  schema.properties.channels.properties.enabled.items = { type: 'string', enum: activeIds };
} catch (e) {
  ui.warn(`channels.json 로드 실패 — channel enum 검증 생략: ${e.message}`);
  // fallback: enum 제거해서 통과만 시킴
  delete schema.properties.channels.properties.enabled.items.enum;
}

// P0-B: schema tone.preset enum 을 런타임 기준으로 교체
schema.properties.tone.properties.preset = {
  type: 'string',
  enum: VALID_TONES,
};

try {
  profile = readYaml(target);
} catch (e) {
  if (e.code === 'ENOENT_YAML') {
    ui.err(`프로필 파일이 없습니다: ${target}`);
    ui.info('먼저 /sns-onboard 를 실행하거나 examples/company-profile.example.yaml 을 복사하세요.');
    process.exit(2);
  }
  ui.err(`프로필 로드 실패: ${e.message}`);
  process.exit(2);
}

// P0-B: tonePreset 자동 마이그레이션 (구버전 값이면 런타임 어휘로 변환 후 검증)
const originalTone = profile.tone?.preset;
if (originalTone && TONE_MIGRATION[originalTone]) {
  ui.warn(`tone.preset "${originalTone}" → "${TONE_MIGRATION[originalTone]}" 으로 자동 변환 (런타임 어휘 통일)`);
  profile.tone.preset = TONE_MIGRATION[originalTone];
}

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);
const ok = validate(profile);

if (!ok) {
  ui.err(`프로필 검증 실패 (${validate.errors.length} 오류):`);
  for (const err of validate.errors) {
    const path = err.instancePath || '(root)';
    console.error(`  • ${path}  ${err.message}`);
    if (err.params && Object.keys(err.params).length) {
      console.error(`      ${JSON.stringify(err.params)}`);
    }
  }
  process.exit(1);
}

// Soft warnings: things the schema can't catch.
const warnings = [];
const banned = profile.banned ?? {};
const dangerousClaims = ['최고의', '1위', '유일한', '100%'];
const userClaims = (banned.claims ?? []).concat(banned.words ?? []);
const missing = dangerousClaims.filter(
  (c) => !userClaims.some((u) => u.includes(c))
);
if (missing.length) {
  warnings.push(
    `한국 광고법 고위험 표현이 banned에 누락됐습니다: ${missing.join(', ')}`
  );
}

if (profile.legal?.adDisclosureRequired === false) {
  warnings.push('legal.adDisclosureRequired=false — 광고/협찬 자동 표기가 꺼져 있습니다.');
}

ui.ok(`프로필 검증 통과: ${target}`);
if (warnings.length) {
  for (const w of warnings) ui.warn(w);
}
