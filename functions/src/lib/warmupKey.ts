/**
 * Shared warm-up key for the keepWarm scheduler and its target callables.
 *
 * `keepWarm` (scheduled/keepWarm.ts) POSTs
 * `{ data: { __warmup: true, __warmup_key: <WARMUP_KEY> } }` to a latency-sensitive
 * callable every 5 minutes. The target short-circuits before any auth or Firestore work,
 * so the ping only keeps a Cloud Run instance alive — no minInstances, no idle billing.
 *
 * The key is what stops an unauthenticated caller from earning a 200 response by sending
 * `__warmup: true` themselves. It is a `defineString` (not a secret): the value is
 * low-sensitivity — the worst it buys someone is keeping our functions warm — and the
 * empty default means a deploy never blocks on a prompt.
 *
 * FAIL CLOSED: when `WARMUP_KEY` is unset/empty the short-circuit is disabled and the
 * ping falls through to normal auth. A wrong key must not raise a special error either:
 * probing stays indistinguishable from any other unauthenticated call.
 */
import { defineString } from "firebase-functions/params";
import { timingSafeEqual } from "crypto";

export const WARMUP_KEY = defineString("WARMUP_KEY", { default: "" });

/**
 * Constant-time comparison of a provided warm-up key against the configured one.
 * Returns false (warm-up disabled) when the configured key is empty.
 *
 * Length mismatch short-circuits — safe, because the expected length comes from our own
 * config rather than from the value being probed a byte at a time.
 */
export function warmupKeyMatches(configured: string, provided: unknown): boolean {
  if (!configured || typeof provided !== "string" || provided.length === 0) {
    return false;
  }
  if (configured.length !== provided.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(configured, "utf8"), Buffer.from(provided, "utf8"));
  } catch {
    return false;
  }
}

/**
 * True only for the `{ __warmup: true, __warmup_key }` envelope carrying the configured
 * key. Targets call this as the first statement of the handler and fall through to the
 * normal path when it returns false.
 */
export function isAuthorizedWarmupPing(data: unknown): boolean {
  const payload = data as { __warmup?: unknown; __warmup_key?: unknown } | undefined | null;
  if (payload?.__warmup !== true) return false;
  return warmupKeyMatches(WARMUP_KEY.value(), payload.__warmup_key);
}
