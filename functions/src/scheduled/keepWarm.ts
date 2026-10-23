import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { region } from "../lib/runtimeOptions";
import { WARMUP_KEY } from "../lib/warmupKey";

/**
 * Periodic keep-warm pings for the latency-sensitive callables.
 *
 * Instead of `minInstances` (which bills idle instance time 24/7), this pings each target
 * every 5 minutes with `{ data: { __warmup: true, __warmup_key: <WARMUP_KEY> } }`. Each
 * target short-circuits on an authorized ping BEFORE auth or Firestore work, so the ping
 * only keeps a Cloud Run instance alive for the ~100ms the request takes.
 *
 * Targets must implement the short-circuit via `isAuthorizedWarmupPing()` and must use
 * `hotCallableOptions()` (lib/runtimeOptions.ts) so the warm list and the callable options
 * stay paired. The list is production-tuned: `getProviderSlots` is the hot read on every
 * calendar/date pick; the other three were kept warm for p95 latency in the pilot.
 *
 * If `WARMUP_KEY` is unset (functions/.env), the targets fail closed and pings would only
 * return unauthenticated errors — so this skips with a warning instead.
 */
export const KEEP_WARM_PING_TIMEOUT_MS = 30_000;

export const WARM_TARGETS = [
  "createBooking",
  "getProviderSlots",
  "chatWithAssistant",
  "applyAsProvider",
] as const;

/** The callable URL Firebase maps to an exported function name. */
export function keepWarmUrl(projectId: string, name: string): string {
  return `https://${region}-${projectId}.cloudfunctions.net/${name}`;
}

export const keepWarm = onSchedule(
  {
    region,
    schedule: "every 5 minutes",
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async () => {
    const projectId = process.env.GCLOUD_PROJECT;
    if (!projectId) {
      logger.warn("keepWarm: project id unavailable; skipping");
      return;
    }

    const warmupKey = WARMUP_KEY.value();
    if (!warmupKey) {
      logger.warn("keepWarm: WARMUP_KEY is not configured; skipping pings (targets fail closed)");
      return;
    }

    await Promise.all(
      WARM_TARGETS.map(async (name) => {
        try {
          const res = await fetch(keepWarmUrl(projectId, name), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: { __warmup: true, __warmup_key: warmupKey } }),
            // Bound each ping so one hung target cannot hold the whole job.
            signal: AbortSignal.timeout(KEEP_WARM_PING_TIMEOUT_MS),
          });
          if (!res.ok) {
            logger.warn("keepWarm ping returned non-OK status", { name, status: res.status });
          } else {
            logger.debug("keepWarm pinged", { name, status: res.status });
          }
        } catch (error) {
          logger.warn("keepWarm ping failed", { name, error });
        }
      })
    );
  }
);
