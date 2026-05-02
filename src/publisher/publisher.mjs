// Publisher interface and shared types.
//
// Adapters live in adapters/<channel>.mjs and export an object satisfying:
//
//   {
//     id: 'threads',
//     async publish({ draft, credentials, opts }) -> { ok, externalId, url, raw, attempts }
//     async healthcheck(credentials)              -> { ok, reason? }
//     buildPayload({ draft })                     -> object   (used by dry-run)
//   }

export const REQUIRED = ['id', 'publish', 'healthcheck', 'buildPayload'];

export function assertAdapter(a) {
  for (const k of REQUIRED) {
    if (!(k in a)) throw new Error(`Publisher adapter missing field: ${k}`);
  }
  return a;
}
