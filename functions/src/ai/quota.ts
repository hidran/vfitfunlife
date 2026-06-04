import * as admin from "firebase-admin";

export function usageDocPath(uid: string, now: Date): string {
  const day = now.toISOString().slice(0, 10); // UTC date — resets at midnight UTC (~01:00–02:00 Italian time)
  return `users/${uid}/ai_usage/${day}`;
}

export function nextCountOrThrow(current: number, quota: number): number {
  if (current >= quota) {
    const err = new Error("Daily message quota exceeded");
    (err as any).code = "quota-exceeded";
    throw err;
  }
  return current + 1;
}

/** Atomically reserve one message against the daily quota. Throws {code:'quota-exceeded'}. */
export async function reserveQuota(uid: string, quota: number, now: Date): Promise<void> {
  const ref = admin.firestore().doc(usageDocPath(uid, now));
  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const raw = snap.exists ? snap.data()?.count : undefined;
    const current = typeof raw === "number" ? raw : 0;
    const next = nextCountOrThrow(current, quota);
    tx.set(ref, { count: next, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  });
}

/**
 * Record token usage after a completed request (best-effort).
 * Must only be called after a successful reserveQuota for the same uid+now.
 */
export async function recordTokens(uid: string, now: Date, inTok: number, outTok: number): Promise<void> {
  const ref = admin.firestore().doc(usageDocPath(uid, now));
  await ref.set(
    {
      tokensIn: admin.firestore.FieldValue.increment(Number.isFinite(inTok) ? inTok : 0),
      tokensOut: admin.firestore.FieldValue.increment(Number.isFinite(outTok) ? outTok : 0),
    },
    { merge: true },
  ).catch((e) => console.error("[ai] recordTokens failed", e));
}
