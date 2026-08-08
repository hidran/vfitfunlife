import { describe, it, expect } from "vitest";
import {
  canTransition,
  isLateCancellation,
  type TransitionArgs,
} from "../src/bookings/transitions";
import type { BookingStatus } from "../src/bookings/types";

const booking = {
  userId: "client1",
  instructorId: "trainer1",
  scheduledAt: new Date("2026-08-10T10:00:00Z"),
  scheduledEndAt: new Date("2026-08-10T11:00:00Z"),
};

const beforeSession = new Date("2026-08-09T09:00:00Z");
const afterSession = new Date("2026-08-10T12:00:00Z");

function attempt(over: Partial<TransitionArgs>): ReturnType<typeof canTransition> {
  return canTransition({
    from: "requested",
    to: "accepted",
    actorRole: "trainer",
    actorUid: "trainer1",
    booking,
    now: beforeSession,
    ...over,
  } as TransitionArgs);
}

describe("canTransition — trainer actions", () => {
  it("lets the assigned trainer accept a requested booking", () => {
    expect(attempt({}).ok).toBe(true);
  });

  it("lets the assigned trainer decline a requested booking", () => {
    expect(attempt({ to: "declined" }).ok).toBe(true);
  });

  it("refuses a trainer who is not the one assigned", () => {
    const r = attempt({ actorUid: "someone_else" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/assigned/);
  });

  it("refuses completion before the session has ended", () => {
    const r = attempt({ from: "accepted", to: "completed", now: beforeSession });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not ended/);
  });

  it("allows completion once the end time has passed", () => {
    expect(attempt({ from: "accepted", to: "completed", now: afterSession }).ok).toBe(true);
  });

  it("allows no_show only once the end time has passed", () => {
    expect(attempt({ from: "accepted", to: "no_show", now: beforeSession }).ok).toBe(false);
    expect(attempt({ from: "accepted", to: "no_show", now: afterSession }).ok).toBe(true);
  });
});

describe("canTransition — payment", () => {
  it("allows payment confirmation from completed", () => {
    expect(attempt({ from: "completed", to: "payment_confirmed", now: afterSession }).ok).toBe(true);
  });

  it("refuses payment confirmation from a booking that is not completed", () => {
    const r = attempt({ from: "accepted", to: "payment_confirmed", now: afterSession });
    expect(r.ok).toBe(false);
  });
});

describe("canTransition — client actions", () => {
  it("lets a client cancel their own booking", () => {
    expect(attempt({ to: "cancelled_by_client", actorRole: "client", actorUid: "client1" }).ok).toBe(true);
  });

  it("refuses a client cancelling someone else's booking", () => {
    const r = attempt({ to: "cancelled_by_client", actorRole: "client", actorUid: "client2" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/owner/);
  });

  it("refuses a client attempting a trainer transition", () => {
    const r = attempt({ to: "accepted", actorRole: "client", actorUid: "client1" });
    expect(r.ok).toBe(false);
  });

  it("refuses a client confirming their own payment", () => {
    const r = attempt({
      from: "completed", to: "payment_confirmed",
      actorRole: "client", actorUid: "client1", now: afterSession,
    });
    expect(r.ok).toBe(false);
  });
});

describe("canTransition — terminal states", () => {
  const terminal: BookingStatus[] = [
    "declined", "cancelled_by_client", "cancelled_by_trainer", "no_show", "payment_confirmed",
  ];

  it("refuses every transition out of a terminal state, even for admin", () => {
    for (const from of terminal) {
      const r = canTransition({
        from, to: "accepted", actorRole: "admin",
        actorUid: "admin1", booking, now: afterSession,
      });
      expect(r.ok, `${from} should be terminal`).toBe(false);
    }
  });
});

describe("canTransition — invalid edges", () => {
  it("refuses skipping completion", () => {
    expect(attempt({ from: "requested", to: "payment_confirmed", now: afterSession }).ok).toBe(false);
  });

  it("refuses reverting completed back to accepted", () => {
    expect(attempt({ from: "completed", to: "accepted", now: afterSession }).ok).toBe(false);
  });
});

describe("isLateCancellation", () => {
  const slot = new Date("2026-08-10T10:00:00Z");

  it("flags a cancellation inside the 24h window", () => {
    expect(isLateCancellation(slot, new Date("2026-08-09T10:00:01Z"))).toBe(true);
  });

  it("does not flag a cancellation outside the 24h window", () => {
    expect(isLateCancellation(slot, new Date("2026-08-09T09:59:59Z"))).toBe(false);
  });

  it("treats exactly 24h as not late", () => {
    expect(isLateCancellation(slot, new Date("2026-08-09T10:00:00Z"))).toBe(false);
  });
});
