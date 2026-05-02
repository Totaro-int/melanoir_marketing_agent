// Publisher registry — picks the adapter for a channel and decides whether to
// short-circuit into dry-run mode (env: PUBLISHER_DRY_RUN=true OR --dry-run flag).

import { adapter as threads } from './adapters/threads.mjs';
import { adapter as linkedin } from './adapters/linkedin.mjs';

const ADAPTERS = { threads, linkedin };

export function getAdapter(channel) {
  const a = ADAPTERS[channel];
  if (!a) throw new Error(`No publisher adapter for channel "${channel}". Known: ${Object.keys(ADAPTERS).join(', ')}`);
  return a;
}

export function isDryRun({ flagDryRun = false } = {}) {
  if (flagDryRun) return true;
  const v = (process.env.PUBLISHER_DRY_RUN ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
