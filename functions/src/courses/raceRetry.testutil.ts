/**
 * The Firestore emulator ends a transaction it aborted under contention with INVALID_ARGUMENT "Transaction is invalid
 * or closed". Real Firestore says ABORTED (or "transaction has expired"), which the SDK retries; the emulator's wording
 * is not recognised, so the error reaches the caller although the aborted attempt wrote nothing. Race tests wrap their
 * calls in this helper so that emulator noise is retried while every real failure (a domain refusal, an assertion)
 * still surfaces. `emulatorAborts()` says how often it fired, for flakiness reports.
 *
 * Every attempt also runs under a hard timeout: a call that never settles fails that attempt with a RaceTimeout that
 * names the stalled step, instead of waiting for the whole test to hit its (minutes long) vitest timeout. A timeout is
 * never retried: a hang is a finding, not noise.
 */
const EMULATOR_ABORT = /Transaction is invalid or closed/;
let aborts = 0;

export const emulatorAborts = () => aborts;

export const STEP_TIMEOUT_MS = 30_000;

export class RaceTimeout extends Error {
  constructor(readonly label: string, readonly ms: number) {
    super(`race step stalled after ${ms} ms: ${label}`);
    this.name = "RaceTimeout";
  }
}

/** Rejects with a RaceTimeout naming `label` if `promise` has not settled within `ms` (it keeps running). */
export function withTimeout<T>(label: string, promise: Promise<T>, ms = STEP_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const stalled = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RaceTimeout(label, ms)), ms);
  });
  return Promise.race([promise, stalled]).finally(() => clearTimeout(timer));
}

/** Runs a FRESH call (`run` is invoked again on every retry) under a per-attempt timeout. */
export async function retryEmulatorAbort<T>(run: () => Promise<T>, attempts = 8, label = "race call",
  ms = STEP_TIMEOUT_MS): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await withTimeout(`${label} (attempt ${attempt})`, Promise.resolve().then(run), ms);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= attempts || !EMULATOR_ABORT.test(message)) throw error;
      aborts++;
    }
  }
}
