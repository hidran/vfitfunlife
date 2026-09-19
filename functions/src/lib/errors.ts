/** Caps a recorded error at this many characters (audit_logs / adminJobs docs stay small). */
export const MAX_ERROR_LENGTH = 300;

/** Caps a recorded error at MAX_ERROR_LENGTH; prefers "<code>: <message>" when the error has a code. */
export function truncateError(err: unknown): string {
  const message = errorMessage(err);
  return message.length > MAX_ERROR_LENGTH ? `${message.slice(0, MAX_ERROR_LENGTH - 1)}…` : message;
}

function errorMessage(err: unknown): string {
  if (!err || typeof err !== "object") return String(err);
  const e = err as { code?: unknown; message?: unknown; stack?: unknown };
  let message = typeof e.message === "string" ? e.message : String(err);
  // A Firestore BulkWriter failure's own message is just "... failed with: " — the real
  // cause is only in the stack trace. recursiveDelete's actual errors (firebase-admin /
  // @google-cloud/firestore 7.11.6) carry TWO "Caused by" lines: a bare call-site frame
  // first, then the real underlying error — the last one is the one worth keeping.
  if (message.endsWith("failed with: ") && typeof e.stack === "string") {
    const causedByLines = e.stack
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("Caused by"));
    const lastCausedBy = causedByLines.at(-1);
    if (lastCausedBy) message = lastCausedBy;
  }
  return e.code !== undefined ? `${String(e.code)}: ${message}` : message;
}
