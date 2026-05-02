#!/usr/bin/env node
// Pretty-print a summary of company-profile.yaml.
// Usage:
//   node bin/profile-show.mjs                # ./company-profile.yaml
//   node bin/profile-show.mjs <path>

import pc from 'picocolors';
import { PATHS, readYaml, ui } from './_lib.mjs';

const target = process.argv[2] ?? PATHS.profile;

let p;
try {
  p = readYaml(target);
} catch (e) {
  if (e.code === 'ENOENT_YAML') {
    ui.err(`프로필 파일이 없습니다: ${target}`);
    ui.info('먼저 /sns-onboard 를 실행하세요.');
    process.exit(2);
  }
  throw e;
}

const line = (k, v) => console.log(`  ${pc.dim(k.padEnd(14))} ${v ?? pc.dim('—')}`);

console.log();
console.log(pc.bold(pc.cyan(`📇 ${p.brand?.name ?? '(이름 없음)'}`)));
console.log(`  ${pc.italic(p.taglineOneLine ?? '(한 줄 소개 없음)')}`);
console.log();

line('산업', p.industry);
line('톤 프리셋', p.tone?.preset);
line('주간 발행', p.campaigns?.cadencePerWeek ? `${p.campaigns.cadencePerWeek}회` : null);
line('광고표기', p.legal?.adDisclosureRequired ? `필수 (${p.legal.adHashtag ?? '#광고'})` : '꺼짐');

console.log();
console.log(pc.bold('  타겟'));
for (const [i, t] of (p.targetAudience ?? []).entries()) {
  console.log(`    ${i + 1}. ${t.persona}`);
  for (const pp of t.painPoints ?? []) console.log(pc.dim(`       · ${pp}`));
}

console.log();
console.log(pc.bold('  금기'));
const ban = p.banned ?? {};
line('  단어', (ban.words ?? []).join(', '));
line('  주제', (ban.topics ?? []).join(', '));
line('  표현', (ban.claims ?? []).join(', '));

if (p.hashtags?.always?.length) {
  console.log();
  console.log(pc.bold('  해시태그(상시)'));
  console.log(`    ${p.hashtags.always.join(' ')}`);
}

if (p.competitors?.length) {
  console.log();
  console.log(pc.bold('  경쟁사'));
  for (const c of p.competitors) console.log(`    · ${c.name}${c.notes ? pc.dim(' — ' + c.notes) : ''}`);
}

console.log();
ui.dim(`source: ${target}`);
console.log();
