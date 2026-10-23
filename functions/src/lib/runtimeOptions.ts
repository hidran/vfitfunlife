import type { CallableOptions } from "firebase-functions/v2/https";

export const region = process.env.FIREBASE_REGION || "europe-west1";

/**
 * Options for the latency-sensitive callables the keep-warm scheduler pings.
 *
 * These functions intentionally set NO `minInstances`. A warm instance bills
 * idle instance time 24/7 (roughly $8 per instance per month at 1 vCPU /
 * 256MiB), which is by far the largest Cloud Run cost in this project; at the
 * current traffic level it bought a handful of avoided cold starts a month.
 * Instead, `scheduled/keepWarm.ts` pings each target every 5 minutes with a
 * `WARMUP_KEY`-gated payload, and the callable returns before doing any work —
 * keeping one instance alive for ~100ms of billed time per ping.
 *
 * Every callable listed in `WARM_TARGETS` (scheduled/keepWarm.ts) must use
 * these options and must start its handler with `isAuthorizedWarmupPing()`.
 */
export function hotCallableOptions<T = unknown>(
  options: CallableOptions<T> = {}
): CallableOptions<T> {
  return {
    region,
    ...options,
  };
}
