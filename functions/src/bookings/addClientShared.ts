/**
 * Server helpers shared by the "trainer adds a client" callables — addClientByEmail,
 * inviteClientToPlatform (./addClientByEmail) and createClientAccount,
 * resendClientAccountEmail (./createClientAccount).
 *
 * Deliberately NOT re-exported from index.ts: it defines no Cloud Functions.
 */

import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, type Firestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { getUserRoleInfo } from "../utils/roles";
import { isBookableInstructor } from "../availability/validate";
import { sendPushToUser } from "../notifications";
import { buildClientAddedMessage } from "../notifications/clientMessages";
import { syncClientRoster } from "./clientRoster";
import { pickRosterDoc, type ExistingClientDoc, type RosterWrite } from "./clientRosterCore";
import {
  MANUAL_ROSTER_SOURCE,
  addClientRateLimitDocId,
  decideRateLimit,
  normalizeClientEmail,
} from "./addClientByEmailCore";

export async function findUserIdByEmail(email: string): Promise<string | null> {
  try {
    return (await getAuth().getUserByEmail(email)).uid;
  } catch (err) {
    if ((err as { code?: string })?.code !== "auth/user-not-found") throw err;
  }
  // Fallback: a profile whose Auth email differs in case, or an Auth record looked up by a
  // provider (phone) that has no email on it.
  const snap = await getFirestore().collection("users").where("email", "==", email).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

export interface AuthorizedTrainer {
  trainerId: string;
  trainerEmail: string | null;
  trainerName: string | null;
  trainerLocale: unknown;
}

/**
 * Shared gate for every add-client callable: signed in, (when an email is involved) not the
 * caller's own address, an active account with a bookable instructor doc (the
 * createBookingAsTrainer bar), and one call's worth of the shared rate limit — consumed
 * BEFORE any lookup, account creation or email. Payload validation is the caller's job.
 */
export async function authorizeTrainer(
  req: CallableRequest<unknown>,
  clientEmail: string | null,
): Promise<AuthorizedTrainer> {
  const trainerId = req.auth?.uid;
  if (!trainerId) throw new HttpsError("unauthenticated", "Must be authenticated");

  const trainerEmail = normalizeClientEmail(req.auth?.token?.email);
  if (clientEmail && trainerEmail === clientEmail) {
    throw new HttpsError("invalid-argument", "self");
  }

  const db = getFirestore();
  const roleInfo = await getUserRoleInfo(trainerId);
  if (!roleInfo || roleInfo.isActive === false) {
    throw new HttpsError("permission-denied", "Account is deactivated");
  }
  const [instructorSnap, trainerUserSnap] = await Promise.all([
    db.collection("instructors").doc(trainerId).get(),
    db.collection("users").doc(trainerId).get(),
  ]);
  const instructor = instructorSnap.data();
  if (!instructor) throw new HttpsError("permission-denied", "Providers only");
  if (!isBookableInstructor(instructor)) throw new HttpsError("failed-precondition", "instructor_not_bookable");

  const limitRef = db.collection("rateLimits").doc(addClientRateLimitDocId(trainerId));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(limitRef);
    const decision = decideRateLimit(snap.get("calls"), Date.now());
    if (!decision.allowed) {
      throw new HttpsError("resource-exhausted", "rate_limited", { retryAfterMs: decision.retryAfterMs });
    }
    tx.set(limitRef, { calls: decision.calls, updatedAt: FieldValue.serverTimestamp() });
  });

  const trainerUser = trainerUserSnap.data() ?? {};
  const trainerName = (instructor.fullName as string | undefined) ||
    (instructor.displayName as string | undefined) ||
    (trainerUser.fullName as string | undefined) || null;
  return { trainerId, trainerEmail, trainerName, trainerLocale: trainerUser.preferredLanguage };
}

/** The pair's roster doc, found the way the planner finds it. */
export async function findRosterDoc(
  db: Firestore,
  trainerId: string,
  clientUserId: string,
): Promise<ExistingClientDoc | null> {
  const snap = await db.collection("clients")
    .where("providerId", "==", trainerId)
    .where("userId", "==", clientUserId)
    .get();
  return pickRosterDoc(snap.docs.map((d) => ({ id: d.id, data: d.data() })), {
    instructorId: trainerId,
    userId: clientUserId,
  });
}

/**
 * Creates (or reuses) the pair's roster doc through the SAME planner the booking trigger uses
 * (syncClientRoster with `ensure`). `createFields` are set only when the doc is created.
 */
export async function ensureRosterDoc(
  db: Firestore,
  trainerId: string,
  clientUserId: string,
  createFields: Record<string, unknown> = {},
): Promise<{ write: RosterWrite | null; doc: ExistingClientDoc }> {
  const write = await syncClientRoster(db, { instructorId: trainerId, userId: clientUserId }, {
    ensure: true,
    createFields: { source: MANUAL_ROSTER_SOURCE, ...createFields },
  });
  const doc = await findRosterDoc(db, trainerId, clientUserId);
  if (!doc) throw new HttpsError("internal", "roster_write_failed");
  return { write, doc };
}

/** Push + in-app "a trainer added you" to an existing account, in the client's language. */
export async function notifyClientAdded(
  clientUserId: string,
  clientLocale: unknown,
  trainerId: string,
  trainerName: string | null,
): Promise<void> {
  const db = getFirestore();
  const message = buildClientAddedMessage(clientLocale, trainerName);
  const link = "/bookings";
  const results = await Promise.allSettled([
    sendPushToUser(clientUserId, {
      title: message.title,
      body: message.body,
      data: { type: "client_added", link, trainerId },
    }),
    db.collection("users").doc(clientUserId).collection("notifications").add({
      title: message.title,
      body: message.body,
      type: "client_added",
      data: { trainerId, link },
      imageUrl: null,
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    }),
  ]);
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      logger.warn("[addClient] notification channel failed", {
        channel: ["push", "in-app"][i],
        reason: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  });
}

/**
 * An EXISTING account joins the trainer's roster; only a new relationship is news to the
 * client (re-adding someone is silent). Returns the roster doc and whether it already was one.
 */
export async function addExistingUserToRoster(
  trainer: AuthorizedTrainer,
  clientUserId: string,
): Promise<{ doc: ExistingClientDoc; alreadyClient: boolean }> {
  const db = getFirestore();
  const client = (await db.collection("users").doc(clientUserId).get()).data();
  if (!client || client.isDeleted === true) throw new HttpsError("not-found", "client_not_found");

  const { write, doc } = await ensureRosterDoc(db, trainer.trainerId, clientUserId);
  if (write?.kind === "create") {
    await notifyClientAdded(clientUserId, client.preferredLanguage, trainer.trainerId, trainer.trainerName);
  }
  return { doc, alreadyClient: write?.kind !== "create" };
}
