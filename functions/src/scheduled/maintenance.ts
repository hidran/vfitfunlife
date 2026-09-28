/**
 * Injectable logic behind the scheduled/trigger functions in ./index.ts, split out so it can
 * be unit-tested without the Functions runtime.
 */
import * as admin from "firebase-admin";

type Firestore = admin.firestore.Firestore;
type DocRef = admin.firestore.DocumentReference;

// ─── Notification cleanup ────────────────────────────────────────────────────────────────

export interface PaginatedCleanupDeps<D> {
  /** Next page of candidates strictly after `cursor` (null = first page), at most `limit` long. */
  fetchPage(cursor: D | null, limit: number): Promise<D[]>;
  /** Whether a candidate may be deleted (lets the caller narrow a collection-group query). */
  isEligible(doc: D): boolean;
  /** Queue a delete. Nothing is awaited until `flush`. */
  enqueueDelete(doc: D): void;
  /** Wait for every queued delete to land. */
  flush(): Promise<void>;
  /** Milliseconds clock, injectable for tests. */
  now(): number;
}

export interface PaginatedCleanupResult {
  deleted: number;
  pages: number;
  /** True when the last page came back short, i.e. nothing is left to delete. */
  exhausted: boolean;
}

/**
 * Walk a query page by page, deleting each eligible document, until the query runs dry or
 * `deadlineMs` passes. Pages are cursor-paginated (not re-queried from the top) so an
 * ineligible document can never pin the loop onto the same page forever.
 */
export async function runPaginatedCleanup<D>(
  deps: PaginatedCleanupDeps<D>,
  opts: { pageSize: number; deadlineMs: number }
): Promise<PaginatedCleanupResult> {
  let cursor: D | null = null;
  let deleted = 0;
  let pages = 0;
  let exhausted = false;

  while (deps.now() < opts.deadlineMs) {
    const page = await deps.fetchPage(cursor, opts.pageSize);
    pages++;
    for (const doc of page) {
      if (!deps.isEligible(doc)) continue;
      deps.enqueueDelete(doc);
      deleted++;
    }
    await deps.flush();

    if (page.length < opts.pageSize) {
      exhausted = true;
      break;
    }
    cursor = page[page.length - 1];
  }

  return { deleted, pages, exhausted };
}

/**
 * `notifications` is also the id of the top-level admin collection and of the (legacy)
 * providers/{id}/notifications subcollection; the cleanup only ever owned the per-user inbox.
 */
export function isUserInboxNotification(ref: { path: string }): boolean {
  const parts = ref.path.split("/");
  return parts.length === 4 && parts[0] === "users" && parts[2] === "notifications";
}

// ─── Challenge progress ──────────────────────────────────────────────────────────────────

interface StatusCarrier {
  status?: unknown;
}

/** The one transition updateChallengeProgress acts on. Every other booking update is a no-op. */
export function isCompletionTransition(
  before: StatusCarrier | undefined,
  after: StatusCarrier | undefined
): boolean {
  if (!before || !after) return false;
  return before.status !== "completed" && after.status === "completed";
}

export interface UserChallengeState {
  id: string;
  challengeId: string;
  currentProgress: number;
}

export interface ChallengeDef {
  id: string;
  title: string;
  challengeType: string;
  targetValue: number;
  pointsReward: number;
}

export interface ChallengeProgressUpdate {
  userChallengeId: string;
  newProgress: number;
  completed: boolean;
  challenge: ChallengeDef;
}

/** Pure: how one completed booking moves each in-progress challenge. */
export function computeChallengeProgress(
  userChallenges: UserChallengeState[],
  challenges: Map<string, ChallengeDef>
): ChallengeProgressUpdate[] {
  const updates: ChallengeProgressUpdate[] = [];
  for (const uc of userChallenges) {
    const challenge = challenges.get(uc.challengeId);
    if (!challenge) continue;

    let newProgress = uc.currentProgress || 0;
    switch (challenge.challengeType) {
    case "total_classes":
    case "streak": // streak logic would need date tracking; counts like total_classes for now
      newProgress += 1;
      break;
    }

    updates.push({
      userChallengeId: uc.id,
      newProgress,
      completed: newProgress >= challenge.targetValue,
      challenge,
    });
  }
  return updates;
}

/**
 * Ledger of bookings already applied to a user's challenges. One doc per booking, written
 * in the same transaction as the progress, so a retried or duplicated trigger delivery
 * finds it and does nothing. Lives under users/{uid}, so deleteUserCascade's
 * recursiveDelete takes it along.
 */
export const CHALLENGE_LEDGER = "challengeBookingsApplied";

export interface ApplyChallengeProgressResult {
  alreadyApplied: boolean;
  completed: ChallengeDef[];
  updated: number;
}

/**
 * Apply one completed booking to the user's in-progress challenges, exactly once.
 * Reads are batched (one query + one getAll), writes land atomically with the ledger entry.
 * Pushes are the caller's job, after commit, for the returned `completed` list only.
 */
export async function applyChallengeProgress(
  db: Firestore,
  params: { userId: string; bookingId: string; eventId?: string }
): Promise<ApplyChallengeProgressResult> {
  const userRef = db.collection("users").doc(params.userId);
  const ledgerRef = userRef.collection(CHALLENGE_LEDGER).doc(params.bookingId);
  const userChallengesQuery = userRef.collection("userChallenges").where("status", "==", "in_progress");

  return db.runTransaction(async (tx) => {
    const ledger = await tx.get(ledgerRef);
    if (ledger.exists) {
      return { alreadyApplied: true, completed: [], updated: 0 };
    }

    const ucSnap = await tx.get(userChallengesQuery);
    const userChallenges: UserChallengeState[] = ucSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        challengeId: String(data.challengeId ?? ""),
        currentProgress: Number(data.currentProgress ?? 0),
      };
    });

    const challengeIds = [...new Set(userChallenges.map((uc) => uc.challengeId).filter(Boolean))];
    const challenges = new Map<string, ChallengeDef>();
    if (challengeIds.length > 0) {
      const refs: DocRef[] = challengeIds.map((id) => db.collection("challenges").doc(id));
      const snaps = await tx.getAll(...refs);
      for (const snap of snaps) {
        const data = snap.data();
        if (!data) continue;
        challenges.set(snap.id, {
          id: String(data.id ?? snap.id),
          title: String(data.title ?? ""),
          challengeType: String(data.challengeType ?? ""),
          targetValue: Number(data.targetValue ?? 0),
          pointsReward: Number(data.pointsReward ?? 0),
        });
      }
    }

    const updates = computeChallengeProgress(userChallenges, challenges);
    if (updates.length === 0) {
      // Nothing to double-count, so no ledger entry either.
      return { alreadyApplied: false, completed: [], updated: 0 };
    }
    const completed = updates.filter((u) => u.completed);

    // All reads must precede writes in a transaction.
    let balance = 0;
    if (completed.length > 0) {
      const userSnap = await tx.get(userRef);
      balance = Number(userSnap.data()?.pointsBalance ?? 0);
    }

    const ucCollection = userRef.collection("userChallenges");
    let totalReward = 0;
    for (const u of updates) {
      const ucRef = ucCollection.doc(u.userChallengeId);
      if (!u.completed) {
        tx.update(ucRef, { currentProgress: u.newProgress });
        continue;
      }
      tx.update(ucRef, {
        currentProgress: u.newProgress,
        status: "completed",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      totalReward += u.challenge.pointsReward;
      balance += u.challenge.pointsReward;
      tx.set(userRef.collection("pointsTransactions").doc(), {
        points: u.challenge.pointsReward,
        type: "bonus",
        source: "challenge",
        sourceId: u.challenge.id,
        description: `Sfida completata: ${u.challenge.title}`,
        balanceAfter: balance,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    if (totalReward > 0) {
      tx.update(userRef, {
        pointsBalance: admin.firestore.FieldValue.increment(totalReward),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    tx.set(ledgerRef, {
      bookingId: params.bookingId,
      eventId: params.eventId ?? null,
      challengesUpdated: updates.length,
      challengesCompleted: completed.map((u) => u.challenge.id),
      appliedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      alreadyApplied: false,
      completed: completed.map((u) => u.challenge),
      updated: updates.length,
    };
  });
}
