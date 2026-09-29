import { describe, it, expect, vi, beforeEach } from "vitest";

// Any Firestore access from the booking branch of the webhook is a regression (B5).
const firestoreCalls = vi.hoisted(() => [] as string[]);
vi.mock("firebase-admin", () => {
  const collection = vi.fn((name: string) => {
    firestoreCalls.push(name);
    throw new Error(`unexpected Firestore access: ${name}`);
  });
  const firestore = Object.assign(() => ({ collection }), {
    FieldValue: { serverTimestamp: vi.fn(), increment: vi.fn() },
    Timestamp: { fromMillis: vi.fn() },
  });
  return { firestore, apps: [{}], initializeApp: vi.fn() };
});

const info = vi.hoisted(() => vi.fn());
vi.mock("firebase-functions", () => ({ logger: { info, warn: vi.fn(), error: vi.fn() } }));

import { handleBookingPaymentIntent } from "./index";

describe("stripeWebhook — booking payment intents (off-platform payments)", () => {
  beforeEach(() => {
    firestoreCalls.length = 0;
    info.mockClear();
  });

  it.each(["succeeded", "failed"] as const)(
    "logs a %s booking intent and writes nothing (no legacy `confirmed` status)",
    (outcome) => {
      handleBookingPaymentIntent(outcome, {
        id: "pi_1",
        amount: 5000,
        metadata: { bookingId: "b-1", userId: "u-1", isDeposit: "false" },
      });
      expect(firestoreCalls).toEqual([]);
      expect(info).toHaveBeenCalledTimes(1);
      expect(info.mock.calls[0][1]).toMatchObject({ outcome, bookingId: "b-1" });
    }
  );

  it("ignores intents that are not for a booking", () => {
    handleBookingPaymentIntent("succeeded", { id: "pi_2", amount: 100, metadata: {} });
    expect(info).not.toHaveBeenCalled();
    expect(firestoreCalls).toEqual([]);
  });
});
