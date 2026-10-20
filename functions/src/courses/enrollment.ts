import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { region } from "../lib/runtimeOptions";
import { readPaymentSettings } from "../payments/paymentSettingsCallables";
import { checkoutActive } from "./core";
import { db, safeId, uidOf, domainError } from "./store";
import { enrollInTx, EnrollInput } from "./enrollTx";

async function enroll(req: CallableRequest, byProvider = false) {
  const actor = uidOf(req.auth);
  const uid = byProvider ? safeId(req.data.userId) : actor;
  const courseId = safeId(req.data.courseId);
  const requestId = safeId(req.data.requestId);
  const paymentMode = req.data.paymentMode ?? "direct";
  if (byProvider && paymentMode !== "direct") throw new HttpsError("invalid-argument", "direct_payment_required");
  const scope = req.data.scope;
  if (!["lesson", "series"].includes(scope) || !["direct", "stripe"].includes(paymentMode)) {
    throw new HttpsError("invalid-argument", "invalid_booking_option");
  }
  if (paymentMode === "stripe" && !checkoutActive(await readPaymentSettings())) {
    throw new HttpsError("failed-precondition", "Online course payments are not enabled");
  }
  const input: EnrollInput = {
    actor, uid, courseId, scope, paymentMode, requestId, byProvider, sessionId: req.data.sessionId,
    checkoutOn: paymentMode === "stripe",
  };
  try {
    return await db.runTransaction(async (tx) => {
      const { result, commit } = await enrollInTx(tx, input);
      commit();
      return result;
    });
  } catch (error) {
    return domainError(error);
  }
}
export const enrollInCourse = onCall({ region }, (req) => enroll(req));
export const enrollCourseParticipant = onCall({ region }, (req) => enroll(req, true));
