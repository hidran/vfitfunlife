import * as admin from "firebase-admin";

export function usageDocPath(uid: string, now: Date): string {
  const day = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
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
    const current = (snap.exists ? (snap.data()?.count as number) : 0) ?? 0;
    const next = nextCountOrThrow(current, quota);
    tx.set(ref, { count: next, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  });
}

/** Record token usage after a completed request (best-effort). */
export async function recordTokens(uid: string, now: Date, inTok: number, outTok: number): Promise<void> {
  const ref = admin.firestore().doc(usageDocPath(uid, now));
  await ref.set(
    {
      tokensIn: admin.firestore.FieldValue.increment(inTok || 0),
      tokensOut: admin.firestore.FieldValue.increment(outTok || 0),
    },
    { merge: true },
  ).catch((e) => console.error("[ai] recordTokens failed", e));
}
