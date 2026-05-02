#!/usr/bin/env node
// Validate company-profile.yaml against schemas/company-profile.schema.yaml.
// Usage:
//   node bin/profile-validate.mjs                # validate ./company-profile.yaml
//   node bin/profile-validate.mjs <path>         # validate given file
//   npm run validate:example

import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { PATHS, readYaml, ui } from './_lib.mjs';

const target = process.argv[2] ?? PATHS.profile;

let schema, profile;
try {
  schema = readYaml(PATHS.schema);
} catch (e) {
  ui.err(`스키마 로드 실패: ${e.message}`);
  process.exit(2);
}

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
