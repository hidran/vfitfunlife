/**
 * addClientByEmail — "+ Nuovo cliente" on /provider/schedule and /provider/clients.
 *
 * A new trainer's roster (`clients`) is empty until someone books them, which left
 * "Aggiungi appuntamento" permanently disabled. This lets the trainer add a client by email:
 *
 * - the address belongs to an account → the pair's roster doc is created (or the existing one
 *   reused) through the SAME planner the booking trigger uses (syncClientRoster with
 *   `ensure`), the client is notified in-app + push in their language → `{ status: "added" }`;
 * - no account → `{ status: "not_found" }`. Inviting is the trainer's explicit choice: the UI
 *   offers "Invita a unirsi a VFit", which calls inviteClientToPlatform (below) to send the
 *   invitation email in the trainer's language. No user is ever created here.
 *
 * Both callables share one per-trainer rate limit (rateLimits/addClient_{uid}, server-only):
 * the answer tells the caller whether an address has an account, and invitations are email
 * sent on the trainer's behalf. Pure rules in ./addClientByEmailCore.
 */

import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { EMAIL_SECRETS, sendEmail } from "../lib/email";
import { region } from "../lib/runtimeOptions";
import { getUserRoleInfo } from "../utils/roles";
import { isBookableInstructor } from "../availability/validate";
import { sendPushToUser } from "../notifications";
import { buildClientAddedMessage, buildClientInviteEmail } from "../notifications/clientMessages";
import { syncClientRoster } from "./clientRoster";
import { pickRosterDoc } from "./clientRosterCore";
import {
  MANUAL_ROSTER_SOURCE,
  addClientRateLimitDocId,
  addedClientFrom,
  decideRateLimit,
  normalizeClientEmail,
  registerUrl,
  validateAddClientRequest,
} from "./addClientByEmailCore";

async function findUserIdByEmail(email: string): Promise<string | null> {
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

interface AuthorizedTrainer {
  trainerId: string;
  email: string;
  trainerName: string | null;
  trainerLocale: unknown;
}

/**
 * Shared gate for both callables: signed in, valid email that is not the caller's own, an
 * active account with a bookable instructor doc (the createBookingAsTrainer bar), and one
 * call's worth of the shared rate limit — consumed BEFORE any lookup or email.
 */
async function authorizeTrainer(req: CallableRequest<unknown>): Promise<AuthorizedTrainer> {
  const trainerId = req.auth?.uid;
  if (!trainerId) throw new HttpsError("unauthenticated", "Must be authenticated");

  const { email } = validateAddClientRequest(req.data);
  if (normalizeClientEmail(req.auth?.token?.email) === email) {
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
  return { trainerId, email, trainerName, trainerLocale: trainerUser.preferredLanguage };
}

export const addClientByEmail = onCall({ region }, async (req) => {
  const { trainerId, email, trainerName } = await authorizeTrainer(req);
  const db = getFirestore();

  const clientUserId = await findUserIdByEmail(email);
  if (clientUserId === trainerId) throw new HttpsError("invalid-argument", "self");
  if (!clientUserId) return { status: "not_found" as const };

  const clientSnap = await db.collection("users").doc(clientUserId).get();
  const client = clientSnap.data();
  if (!client || client.isDeleted === true) throw new HttpsError("not-found", "client_not_found");

  const pair = { instructorId: trainerId, userId: clientUserId };
  const write = await syncClientRoster(db, pair, {
    ensure: true,
    createFields: { source: MANUAL_ROSTER_SOURCE },
  });

  const rosterSnap = await db.collection("clients")
    .where("providerId", "==", trainerId)
    .where("userId", "==", clientUserId)
    .get();
  const doc = pickRosterDoc(rosterSnap.docs.map((d) => ({ id: d.id, data: d.data() })), pair);
  if (!doc) throw new HttpsError("internal", "roster_write_failed");

  // Only a NEW relationship is news to the client; re-adding someone is silent.
  if (write?.kind === "create") {
    const message = buildClientAddedMessage(client.preferredLanguage, trainerName);
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
        logger.warn("[addClientByEmail] notification channel failed", {
          channel: ["push", "in-app"][i],
          reason: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    });
  }

  logger.info("[addClientByEmail] added", { trainerId, clientId: doc.id, kind: write?.kind ?? "existing" });
  return {
    status: "added" as const,
    alreadyClient: write?.kind !== "create",
    client: addedClientFrom(doc.id, doc.data),
  };
});

/**
 * inviteClientToPlatform — the trainer chose "Invita a unirsi a VFit" after addClientByEmail
 * answered `not_found`. Sends the invitation (trainer's language, link to /auth/register);
 * creates nothing. Same gate and shared rate limit as addClientByEmail.
 */
export const inviteClientToPlatform = onCall({ region, secrets: EMAIL_SECRETS }, async (req) => {
  const { trainerId, email, trainerName, trainerLocale } = await authorizeTrainer(req);

  // The address may have registered since the lookup: then there is nobody to invite.
  if (await findUserIdByEmail(email)) throw new HttpsError("failed-precondition", "already_registered");

  const invite = buildClientInviteEmail(trainerLocale, trainerName);
  const sent = await sendEmail({
    to: email,
    subject: invite.subject,
    body: invite.body,
    action: { label: invite.actionLabel, url: registerUrl() },
  });
  logger.info("[inviteClientToPlatform] invitation", { trainerId, sent });
  if (!sent) throw new HttpsError("unavailable", "email_failed");
  return { status: "invited" as const };
});
