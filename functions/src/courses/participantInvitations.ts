import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { region } from "../lib/runtimeOptions";
import { EMAIL_SECRETS, sendEmail } from "../lib/email";
import {
  buildClientAccountEmail, buildClientAddedMessage, buildClientInviteEmail,
} from "../notifications/clientMessages";
import { appBaseUrl } from "../bookings/addClientByEmailCore";
import { findRosterDoc } from "../bookings/addClientShared";
import { accountConfirmContinueUrl, normalizePhone } from "../bookings/createClientAccountCore";
import { db, safeId, uidOf, eligibleProvider, nowStamp, Course } from "./store";
import { canManageCourse } from "./authority";

export const notifyCourseParticipant = onCall({ region, secrets: EMAIL_SECRETS }, async (req) => {
  const caller = uidOf(req.auth);
  const courseId = safeId(req.data.courseId);
  const userId = safeId(req.data.userId);
  const channel = req.data.channel;
  if (!["email", "phone"].includes(channel)) throw new HttpsError("invalid-argument", "invalid_channel");
  const course = (await db.doc(`courses/${courseId}`).get()).data() as Course | undefined;
  if (!course) throw new HttpsError("not-found", "course_not_found");
  await canManageCourse(caller, course);
  // The course owner is the provider of record: staff act on the owner's roster and rate limit.
  const providerId = course.providerId;
  const provider = await db.runTransaction((tx) => eligibleProvider(providerId, tx));
  const relation = await findRosterDoc(db, providerId, userId);
  if (!relation) throw new HttpsError("permission-denied", "provider_client_required");
  const user = (await db.doc(`users/${userId}`).get()).data();
  if (!user || user.isActive === false || ["suspended", "deleted"].includes(user.accountStatus)) {
    throw new HttpsError("failed-precondition", "account_inactive");
  }
  // Separate from account-lookup rate limits: sending to known roster clients reveals no unknown accounts.
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`rateLimits/participantNotifications_${providerId}`);
    const data = (await tx.get(ref)).data();
    const recent = data?.windowStartedAt > Date.now() - 3600000;
    const count = recent ? data?.count ?? 0 : 0;
    if (count >= 100) throw new HttpsError("resource-exhausted", "rate_limited");
    tx.set(ref, { windowStartedAt: recent ? data?.windowStartedAt : Date.now(), count: count + 1 });
  });
  const name = String(provider.fullName ?? provider.name ?? "");
  const locale = user.preferredLanguage;
  const invited = user.accountStatus === "invited";
  const email = user.email;
  if (typeof email !== "string" || !email) throw new HttpsError("failed-precondition", "email_required");
  // This landing link carries no Auth credential: setup is sent privately to the participant's email.
  const url = invited ? `${appBaseUrl()}/auth/participant?email=${encodeURIComponent(email)}` :
    `${appBaseUrl()}/courses?tab=bookings`;
  if (channel === "phone") {
    const phone = normalizePhone(relation.data.phone || user.phone);
    if (!phone) throw new HttpsError("failed-precondition", "phone_required");
    const body = invited ? buildClientInviteEmail(locale, name).body :
      buildClientAddedMessage(locale, name).body;
    const message = `${body}\n${url}`;
    return { status: "ready", url, message, smsUrl: `sms:${phone}?body=${encodeURIComponent(message)}`,
      whatsAppUrl: phone.startsWith("+") ?
        `https://wa.me/${phone.slice(1)}?text=${encodeURIComponent(message)}` : null };
  }
  let sent: boolean;
  if (invited) {
    const link = await getAuth().generatePasswordResetLink(email, { url: accountConfirmContinueUrl() });
    const message = buildClientAccountEmail(locale, name, user.fullName);
    sent = await sendEmail({ to: email, subject: message.subject, body: message.body,
      action: { label: message.actionLabel, url: link } });
  } else {
    const message = buildClientAddedMessage(locale, name);
    sent = await sendEmail({ to: email, subject: message.title, body: message.body,
      action: { label: "VFit", url } });
  }
  await db.collection("participantInvitationDeliveries").add({ providerId, userId, channel,
    status: sent ? "sent" : "failed", createdAt: nowStamp() });
  return { status: sent ? "sent" : "failed" };
});
