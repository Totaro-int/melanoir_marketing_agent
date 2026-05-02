// Single-shot retry with exponential backoff for transient HTTP errors.
// Adapters call this around individual fetch calls so a 429 / 502 / 503 / 504
// from Threads or LinkedIn doesn't surface as a hard failure on the first hiccup.
//
// Intentionally tiny — no jitter, no circuit breaker. Phase 4.2 may swap this for
// p-retry if we see real production noise.

const TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504]);

export async function withRetry(fn, { attempts = 3, baseMs = 600 } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const status = e?.status ?? e?.response?.status ?? 0;
      const isTransient = TRANSIENT.has(status) || /ECONNRESET|ETIMEDOUT|EAI_AGAIN/.test(e?.message ?? '');
      if (!isTransient || i === attempts) throw e;
      const wait = baseMs * 2 ** (i - 1);
      await new Promise((res) => setTimeout(res, wait));
    }
  }
  throw lastErr;
}
