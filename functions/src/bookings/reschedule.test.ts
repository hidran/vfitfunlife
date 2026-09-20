import { describe, it, expect, vi } from "vitest";

// ./reschedule pulls in ./notify, which touches admin.firestore() at import time. The guards
// under test are pure, so the fan-out is stubbed rather than initialising an app for it.
vi.mock("./notify", () => ({ notifyTransition: vi.fn() }));

import {
  checkReschedulable,
  counterpartUids,
  rescheduleActorRole,
  rescheduledWindow,
  validateRescheduleRequest,
} from "./reschedule";

const NOW = new Date("2026-09-20T10:00:00Z");
const ts = (iso: string) => ({ toDate: () => new Date(iso) });

const booking = (over: Record<string, unknown> = {}) => ({
  userId: "client-1",
  instructorId: "trainer-1",
  status: "accepted",
  scheduledAt: ts("2026-09-25T09:00:00Z"),
  ...over,
});

describe("checkReschedulable", () => {
  it("lets the booking's client, its trainer and staff move it", () => {
    expect(checkReschedulable(booking(), { uid: "client-1", isStaff: false }, NOW)).toEqual({ ok: true });
    expect(checkReschedulable(booking(), { uid: "trainer-1", isStaff: false }, NOW)).toEqual({ ok: true });
    expect(checkReschedulable(booking(), { uid: "someone-else", isStaff: true }, NOW)).toEqual({ ok: true });
  });

  it("refuses anyone who is neither a participant nor staff", () => {
    expect(checkReschedulable(booking(), { uid: "stranger", isStaff: false }, NOW))
      .toEqual({ ok: false, reason: "permission_denied" });
  });

  it("refuses a booking that is no longer live", () => {
    for (const status of ["declined", "cancelled_by_client", "cancelled_by_trainer", "completed", "no_show"]) {
      expect(checkReschedulable(booking({ status }), { uid: "client-1", isStaff: false }, NOW))
        .toEqual({ ok: false, reason: "not_reschedulable" });
    }
  });

  it("refuses a paid session: it is done, there is nothing left to move", () => {
    expect(checkReschedulable(booking({ status: "payment_confirmed" }), { uid: "client-1", isStaff: false }, NOW))
      .toEqual({ ok: false, reason: "not_reschedulable" });
  });

  it("still moves bookings left on the legacy pre-migration statuses", () => {
    for (const status of ["requested", "pending", "confirmed", "in_progress"]) {
      expect(checkReschedulable(booking({ status }), { uid: "trainer-1", isStaff: false }, NOW))
        .toEqual({ ok: true });
    }
  });

  it("refuses a booking whose own start has already passed, whoever asks", () => {
    const past = booking({ scheduledAt: ts("2026-09-20T09:59:00Z") });
    expect(checkReschedulable(past, { uid: "client-1", isStaff: false }, NOW))
      .toEqual({ ok: false, reason: "past_booking" });
    expect(checkReschedulable(past, { uid: "staff", isStaff: true }, NOW))
      .toEqual({ ok: false, reason: "past_booking" });
  });

  it("refuses a booking with no readable start rather than guessing it is still ahead", () => {
    expect(checkReschedulable(booking({ scheduledAt: undefined }), { uid: "client-1", isStaff: false }, NOW))
      .toEqual({ ok: false, reason: "not_reschedulable" });
  });

  it("checks who is asking before it says anything about the booking's state", () => {
    expect(checkReschedulable(booking({ status: "completed" }), { uid: "stranger", isStaff: false }, NOW))
      .toEqual({ ok: false, reason: "permission_denied" });
  });
});

describe("rescheduleActorRole", () => {
  it("reads a participant as themselves even when they are also staff", () => {
    expect(rescheduleActorRole(booking(), { uid: "client-1", isStaff: true })).toBe("client");
    expect(rescheduleActorRole(booking(), { uid: "trainer-1", isStaff: true })).toBe("trainer");
  });

  it("reads an outsider with the staff flag as staff, and anyone else as nobody", () => {
    expect(rescheduleActorRole(booking(), { uid: "ops", isStaff: true })).toBe("staff");
    expect(rescheduleActorRole(booking(), { uid: "stranger", isStaff: false })).toBeNull();
  });
});

describe("counterpartUids", () => {
  it("notifies the other side of the booking, and both sides when staff moved it", () => {
    expect(counterpartUids(booking(), "client")).toEqual(["trainer-1"]);
    expect(counterpartUids(booking(), "trainer")).toEqual(["client-1"]);
    expect(counterpartUids(booking(), "staff")).toEqual(["client-1", "trainer-1"]);
  });
});

describe("rescheduledWindow", () => {
  it("ends exactly durationMinutes after the new start", () => {
    const start = new Date("2026-09-25T09:00:00Z");
    expect(rescheduledWindow({ durationMinutes: 45 }, start))
      .toEqual({ durationMinutes: 45, end: new Date("2026-09-25T09:45:00Z") });
  });

  it("falls back to a legacy `duration`, then to 60 minutes", () => {
    const start = new Date("2026-09-25T09:00:00Z");
    expect(rescheduledWindow({ duration: 90 }, start).durationMinutes).toBe(90);
    expect(rescheduledWindow({ duration: 90 }, start).end).toEqual(new Date("2026-09-25T10:30:00Z"));
    expect(rescheduledWindow({}, start).durationMinutes).toBe(60);
    expect(rescheduledWindow({ durationMinutes: "45" }, start).durationMinutes).toBe(60);
  });
});

describe("validateRescheduleRequest", () => {
  it("accepts a document id and an ISO instant in the future", () => {
    expect(validateRescheduleRequest({ bookingId: "b1", startsAt: "2026-09-25T09:00:00.000Z" }, NOW))
      .toEqual({ bookingId: "b1", startsAt: new Date("2026-09-25T09:00:00.000Z") });
  });

  it("rejects a missing or path-like bookingId", () => {
    expect(() => validateRescheduleRequest({ startsAt: "2026-09-25T09:00:00Z" }, NOW)).toThrow(/bookingId/);
    expect(() => validateRescheduleRequest({ bookingId: "a/b", startsAt: "2026-09-25T09:00:00Z" }, NOW))
      .toThrow(/bookingId/);
    expect(() => validateRescheduleRequest({ bookingId: "x".repeat(129), startsAt: "2026-09-25T09:00:00Z" }, NOW))
      .toThrow(/bookingId/);
  });

  it("rejects a startsAt that is not an instant, or is not ahead of now", () => {
    expect(() => validateRescheduleRequest({ bookingId: "b1", startsAt: "domani alle 9" }, NOW))
      .toThrow(/startsAt/);
    expect(() => validateRescheduleRequest({ bookingId: "b1", startsAt: 1790000000000 }, NOW)).toThrow(/startsAt/);
    expect(() => validateRescheduleRequest({ bookingId: "b1", startsAt: "2026-09-20T09:59:00Z" }, NOW))
      .toThrow(/startsAt/);
  });

  it("rejects a payload that is not an object", () => {
    expect(() => validateRescheduleRequest(null, NOW)).toThrow(/payload/);
  });
});
