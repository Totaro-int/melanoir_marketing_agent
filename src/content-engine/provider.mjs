// Provider interface (JSDoc typed) for the content engine.
// Concrete providers live in providers/<id>.mjs and export the same shape.

/**
 * @typedef {Object} CopyRequest
 * @property {object} brief        Loaded campaigns/<slug>/brief.yaml
 * @property {object} profile      Loaded company-profile.yaml
 * @property {string} channel      Channel id (e.g. "threads", "linkedin")
 * @property {object} channelDocs  { strategy, checklist, templates } as raw markdown strings
 * @property {string} [variant]    Optional template variant id (e.g. "T1", "L2")
 */

/**
 * @typedef {Object} CopyResult
 * @property {string} text         Final copy ready for human review
 * @property {string[]} hashtags   Hashtags to append (already deduped)
 * @property {object} meta         { provider, model, latencyMs, costEstimateUsd?, tokensIn?, tokensOut? }
 */

/**
 * @typedef {Object} ImageRequest
 * @property {string} prompt
 * @property {object} visual       profile.visual snapshot (colors, logoPath, fontFamily)
 * @property {"square"|"portrait"|"landscape"|"story"} aspect
 * @property {number} [count]      Default 1
 */

/**
 * @typedef {Object} ImageResult
 * @property {string[]} paths      Local file paths (relative to repo root) of generated images
 * @property {object} meta         Same shape as CopyResult.meta
 */

/**
 * @typedef {Object} Provider
 * @property {string} id
 * @property {boolean} byok        True if this provider needs a user-supplied key
 * @property {(req: CopyRequest) => Promise<CopyResult>} generateCopy
 * @property {(req: ImageRequest) => Promise<ImageResult>} generateImage
 * @property {() => { ok: boolean, reason?: string }} healthcheck
 */

export const REQUIRED = ['id', 'byok', 'generateCopy', 'generateImage', 'healthcheck'];

/** Throws if a provider object doesn't satisfy the interface. */
export function assertProvider(p) {
  for (const k of REQUIRED) {
    if (!(k in p)) throw new Error(`Provider missing required field: ${k}`);
  }
  if (typeof p.generateCopy !== 'function') throw new Error('generateCopy must be a function');
  if (typeof p.generateImage !== 'function') throw new Error('generateImage must be a function');
  if (typeof p.healthcheck !== 'function') throw new Error('healthcheck must be a function');
  return p;
}
