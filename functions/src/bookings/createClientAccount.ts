/**
 * createClientAccount — the trainer adds a client who has NO VFit account yet: the account is
 * created for them and they confirm it by email.
 *
 * Offered after addClientByEmail answered `not_found` (AddClientByEmail.tsx). Flow:
 *
 * 1. Same gate and shared rate limit as addClientByEmail (./addClientShared).
 * 2. The address may have registered since the lookup → it is simply added to the roster,
 *    exactly like addClientByEmail → `{ status: "added", alreadyExisted: true, client }`.
 * 3. Otherwise an Auth user is created with NO credential (Admin SDK: no blocking functions
 *    run) and `users/{uid}` is written in the registration shape
 *    (users/customerProfile.buildInvitedCustomerProfile) plus `createdBy` and
 *    `accountStatus: "invited"`. There is no Auth onCreate trigger in this codebase, and
 *    initializeUserProfile only ever fills a MISSING doc, so nothing overwrites it; the
 *    users write trigger (onUserWriteAdminIndex) only adds derived admin-index fields.
 * 4. On staging only (stagingAllowlistEnabled) the address is put on the login allowlist, or
 *    the invitee's first sign-in would be refused by stagingBeforeUserSignedIn.
 * 5. The roster doc is created through the booking trigger's planner, with
 *    `accountStatus: "invited"` denormalized for the trainer's badge.
 * 6. A password-reset link (setting a password proves the address is theirs) is emailed in
 *    the trainer's language. If link or email fails the account is KEPT and the trainer can
 *    resend (resendClientAccountEmail) → `{ status: "created", emailSent: false, client }`.
 *
 * The account flips to "active" on its first sign-in: see users/invitedAccount.ts.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { EMAIL_SECRETS, sendEmail } from "../lib/email";
import { region } from "../lib/runtimeOptions";
import { resolveLocale } from "../notifications/bookingMessages";
import { buildClientAccountEmail } from "../notifications/clientMessages";
import {
  STAGING_ALLOWLIST_COLLECTION,
  stagingAllowlistEnabled,
} from "../staging/allowlist";
import {
  ACCOUNT_STATUS_INVITED,
  buildInvitedCustomerProfile,
  isInvitedAccountClaimed,
} from "../users/customerProfile";
import { activateInvitedAccount } from "../users/invitedAccount";
import { addedClientFrom } from "./addClientByEmailCore";
import {
  addExistingUserToRoster,
  authorizeTrainer,
  ensureRosterDoc,
  findRosterDoc,
  findUserIdByEmail,
  type AuthorizedTrainer,
} from "./addClientShared";
import {
  accountConfirmContinueUrl,
  stagingAllowlistNote,
  validateCreateClientAccountRequest,
  validateResendRequest,
} from "./createClientAccountCore";

/**
 * Emails the "confirm your account" link. Never throws: false when the link could not be
 * generated or the email not sent (the caller decides what that means).
 */
async function sendAccountConfirmation(
  email: string,
  clientName: string,
  locale: unknown,
  trainerName: string | null,
): Promise<boolean> {
  let link: string;
  try {
    link = await getAuth().generatePasswordResetLink(email, { url: accountConfirmContinueUrl() });
  } catch (err) {
    logger.error("[createClientAccount] could not generate the confirmation link", {
      reason: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
  const message = buildClientAccountEmail(locale, trainerName, clientName);
  return sendEmail({
    to: email,
    subject: message.subject,
    body: message.body,
    action: { label: message.actionLabel, url: link },
  });
}

/** Staging only: without an allowlist entry the invitee's first sign-in is blocked. */
async function allowOnStaging(email: string, trainer: AuthorizedTrainer): Promise<void> {
  if (!stagingAllowlistEnabled()) return;
  try {
    await getFirestore().collection(STAGING_ALLOWLIST_COLLECTION).doc(email).set({
      email,
      note: stagingAllowlistNote(trainer.trainerName, trainer.trainerId),
      addedBy: trainer.trainerEmail || trainer.trainerId,
      addedByUid: trainer.trainerId,
      addedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    logger.warn("[createClientAccount] staging allowlist write failed", {
      email,
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}

async function addExisting(trainer: AuthorizedTrainer, clientUserId: string) {
  if (clientUserId === trainer.trainerId) throw new HttpsError("invalid-argument", "self");
  const { doc, alreadyClient } = await addExistingUserToRoster(trainer, clientUserId);
  logger.info("[createClientAccount] address already had an account", {
    trainerId: trainer.trainerId, clientId: doc.id, alreadyClient,
  });
  return {
    status: "added" as const,
    alreadyExisted: true as const,
    alreadyClient,
    client: addedClientFrom(doc.id, doc.data),
  };
}

export const createClientAccount = onCall({ region, secrets: EMAIL_SECRETS }, async (req) => {
  if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Must be authenticated");
  const { email, fullName, phone } = validateCreateClientAccountRequest(req.data);
  const trainer = await authorizeTrainer(req, email);
  const db = getFirestore();

  const existingId = await findUserIdByEmail(email);
  if (existingId) return addExisting(trainer, existingId);

  let uid: string;
  try {
    uid = (await getAuth().createUser({ email, displayName: fullName, emailVerified: false, disabled: false })).uid;
  } catch (err) {
    // Registered between the lookup and now.
    if ((err as { code?: string })?.code === "auth/email-already-exists") {
      const raceId = await findUserIdByEmail(email);
      if (raceId) return addExisting(trainer, raceId);
    }
    throw err;
  }

  const preferredLanguage = resolveLocale(trainer.trainerLocale);
  try {
    await db.collection("users").doc(uid).create(buildInvitedCustomerProfile({
      uid,
      email,
      fullName,
      phone,
      preferredLanguage,
      createdBy: trainer.trainerId,
    }, FieldValue.serverTimestamp()));
  } catch (err) {
    // No profile → no usable account: undo the Auth user so the address stays free.
    await getAuth().deleteUser(uid).catch((e) =>
      logger.error("[createClientAccount] rollback of the Auth user failed", { uid, reason: String(e) }));
    logger.error("[createClientAccount] users doc write failed", {
      uid, reason: err instanceof Error ? err.message : String(err),
    });
    throw new HttpsError("internal", "account_create_failed");
  }

  await allowOnStaging(email, trainer);

  const { doc } = await ensureRosterDoc(db, trainer.trainerId, uid, { accountStatus: ACCOUNT_STATUS_INVITED });

  const emailSent = await sendAccountConfirmation(email, fullName, preferredLanguage, trainer.trainerName);
  logger.info("[createClientAccount] created", { trainerId: trainer.trainerId, uid, clientId: doc.id, emailSent });
  return {
    status: "created" as const,
    emailSent,
    client: addedClientFrom(doc.id, doc.data),
  };
});

/**
 * resendClientAccountEmail — "Reinvia email" on an invited client's detail page. Only for an
 * account this trainer created that is still `invited` and on their roster. Counts toward the
 * shared rate limit. An account whose owner has meanwhile signed in is flipped to active
 * instead → `{ status: "already_active" }`.
 */
export const resendClientAccountEmail = onCall({ region, secrets: EMAIL_SECRETS }, async (req) => {
  if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Must be authenticated");
  const { userId } = validateResendRequest(req.data);
  const trainer = await authorizeTrainer(req, null);
  const db = getFirestore();

  const [userSnap, rosterDoc] = await Promise.all([
    db.collection("users").doc(userId).get(),
    findRosterDoc(db, trainer.trainerId, userId),
  ]);
  const user = userSnap.data();
  if (!user || !rosterDoc || user.createdBy !== trainer.trainerId) {
    throw new HttpsError("permission-denied", "not_your_client");
  }
  if (user.accountStatus !== ACCOUNT_STATUS_INVITED) {
    await activateInvitedAccount(userId); // clears a stale roster badge, if any
    return { status: "already_active" as const };
  }

  const record = await getAuth().getUser(userId);
  if (isInvitedAccountClaimed(record)) {
    await activateInvitedAccount(userId);
    return { status: "already_active" as const };
  }
  const email = typeof user.email === "string" ? user.email : record.email;
  if (!email) throw new HttpsError("failed-precondition", "no_email");

  const sent = await sendAccountConfirmation(
    email,
    typeof user.fullName === "string" && user.fullName ? user.fullName : email,
    user.preferredLanguage,
    trainer.trainerName,
  );
  logger.info("[resendClientAccountEmail] resent", { trainerId: trainer.trainerId, userId, sent });
  if (!sent) throw new HttpsError("unavailable", "email_failed");
  return { status: "sent" as const };
});
