import { describe, it, expect } from "vitest";
import { planPaymentResponse, SERVICE_RECEIVED_XP, type RespondableBooking } from "./serviceReceived";

const pending: RespondableBooking = {
  userId: "client-1",
  status: "payment_confirmed",
  paymentConfirmation: { clientResponse: null },
};

describe("planPaymentResponse", () => {
  it("awards the service-received XP when the client confirms", () => {
    const plan = planPaymentResponse({
      booking: pending, uid: "client-1", response: "confirmed", user: { xp: 380 },
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(SERVICE_RECEIVED_XP).toBe(50);
    expect(plan.xpAward).toEqual({ delta: 50, xp: 430, level: 2, xpToNextLevel: 470 });
    expect(plan.bookingPatch).toEqual({
      "paymentConfirmation.clientResponse": "confirmed",
      "paymentConfirmation.xpAwarded": 50,
    });
  });

  it("treats a user without xp as 0", () => {
    const plan = planPaymentResponse({
      booking: pending, uid: "client-1", response: "confirmed", user: {},
    });
    expect(plan.ok && plan.xpAward?.xp).toBe(50);
  });

  it("still awards after a 48h auto-confirm (clientResponse stays null)", () => {
    const plan = planPaymentResponse({
      booking: { ...pending, paymentConfirmation: { clientResponse: null, autoConfirmed: true } as never },
      uid: "client-1",
      response: "confirmed",
      user: { xp: 0 },
    });
    expect(plan.ok && plan.xpAward?.delta).toBe(50);
  });

  it("awards nothing on a dispute and flags admin review", () => {
    const plan = planPaymentResponse({
      booking: pending, uid: "client-1", response: "disputed", disputeReason: "Mai svolta", user: { xp: 0 },
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.xpAward).toBeNull();
    expect(plan.bookingPatch).toEqual({
      "paymentConfirmation.clientResponse": "disputed",
      "paymentConfirmation.disputeReason": "Mai svolta",
      "needsAdminReview": true,
    });
  });

  it("refuses a second response, so XP cannot be collected twice", () => {
    const plan = planPaymentResponse({
      booking: { ...pending, paymentConfirmation: { clientResponse: "confirmed", xpAwarded: 50 } },
      uid: "client-1",
      response: "confirmed",
      user: { xp: 50 },
    });
    expect(plan).toMatchObject({ ok: false, code: "failed-precondition" });
  });

  it("never pays twice even if the flag survives without a response", () => {
    const plan = planPaymentResponse({
      booking: { ...pending, paymentConfirmation: { clientResponse: null, xpAwarded: 50 } },
      uid: "client-1",
      response: "confirmed",
      user: { xp: 50 },
    });
    expect(plan.ok && plan.xpAward).toBeNull();
  });

  it("records the confirmation but skips XP when the user doc is missing", () => {
    const plan = planPaymentResponse({
      booking: pending, uid: "client-1", response: "confirmed", user: null,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.xpAward).toBeNull();
    expect(plan.bookingPatch).toEqual({ "paymentConfirmation.clientResponse": "confirmed" });
  });

  it("only the booking's client may respond", () => {
    expect(planPaymentResponse({
      booking: pending, uid: "trainer-1", response: "confirmed", user: {},
    })).toMatchObject({ ok: false, code: "permission-denied" });
  });

  it("requires the trainer to have recorded the payment first", () => {
    expect(planPaymentResponse({
      booking: { ...pending, status: "completed" }, uid: "client-1", response: "confirmed", user: {},
    })).toMatchObject({ ok: false, code: "failed-precondition" });
  });

  it("reports a missing booking", () => {
    expect(planPaymentResponse({
      booking: undefined, uid: "client-1", response: "confirmed", user: {},
    })).toMatchObject({ ok: false, code: "not-found" });
  });
});
