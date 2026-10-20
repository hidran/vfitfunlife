/**
 * The Firestore emulator ends a transaction it aborted under contention with INVALID_ARGUMENT "Transaction is invalid
 * or closed". Real Firestore says ABORTED (or "transaction has expired"), which the SDK retries; the emulator's wording
 * is not recognised, so the error reaches the caller although the aborted attempt wrote nothing. Race tests wrap their
 * calls in this helper so that emulator noise is retried while every real failure (a domain refusal, an assertion)
 * still surfaces. `emulatorAborts()` says how often it fired, for flakiness reports.
 */
const EMULATOR_ABORT = /Transaction is invalid or closed/;
let aborts = 0;

export const emulatorAborts = () => aborts;

export async function retryEmulatorAbort<T>(run: () => Promise<T>, attempts = 8): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= attempts || !EMULATOR_ABORT.test(message)) throw error;
      aborts++;
    }
  }
}
