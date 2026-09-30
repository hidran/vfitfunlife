/**
 * addClientByEmail — "+ Nuovo cliente" on /provider/schedule and /provider/clients.
 *
 * A new trainer's roster (`clients`) is empty until someone books them, which left
 * "Aggiungi appuntamento" permanently disabled. This lets the trainer add a client by email:
 *
 * - the address belongs to an account → the pair's roster doc is created (or the existing one
 *   reused) through the SAME planner the booking trigger uses (syncClientRoster with
 *   `ensure`), the client is notified in-app + push in their language → `{ status: "added" }`;
 * - no account → `{ status: "not_found" }`. The trainer then chooses: create the account for
 *   the client (createClientAccount, ./createClientAccount.ts — the client confirms it by
 *   email), or just send an invitation (inviteClientToPlatform, below).
 *
 * All add-client callables share one per-trainer rate limit (rateLimits/addClient_{uid},
 * server-only): the answer tells the caller whether an address has an account, and every
 * email is sent on the trainer's behalf. Shared gate in ./addClientShared, pure rules in
 * ./addClientByEmailCore.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { EMAIL_SECRETS, sendEmail } from "../lib/email";
import { region } from "../lib/runtimeOptions";
import { buildClientInviteEmail } from "../notifications/clientMessages";
import { addedClientFrom, registerUrl, validateAddClientRequest } from "./addClientByEmailCore";
import { addExistingUserToRoster, authorizeTrainer, findUserIdByEmail } from "./addClientShared";

export const addClientByEmail = onCall({ region }, async (req) => {
  if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Must be authenticated");
  const { email } = validateAddClientRequest(req.data);
  const trainer = await authorizeTrainer(req, email);

  const clientUserId = await findUserIdByEmail(email);
  if (clientUserId === trainer.trainerId) throw new HttpsError("invalid-argument", "self");
  if (!clientUserId) return { status: "not_found" as const };

  const { doc, alreadyClient } = await addExistingUserToRoster(trainer, clientUserId);
  logger.info("[addClientByEmail] added", { trainerId: trainer.trainerId, clientId: doc.id, alreadyClient });
  return {
    status: "added" as const,
    alreadyClient,
    client: addedClientFrom(doc.id, doc.data),
  };
});

/**
 * inviteClientToPlatform — the trainer chose "Invita a unirsi a VFit" after addClientByEmail
 * answered `not_found`. Sends the invitation (trainer's language, link to /auth/register);
 * creates nothing. Same gate and shared rate limit as addClientByEmail.
 */
export const inviteClientToPlatform = onCall({ region, secrets: EMAIL_SECRETS }, async (req) => {
  if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Must be authenticated");
  const { email } = validateAddClientRequest(req.data);
  const { trainerId, trainerName, trainerLocale } = await authorizeTrainer(req, email);

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
