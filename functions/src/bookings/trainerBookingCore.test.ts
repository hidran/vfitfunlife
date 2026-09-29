import { describe, it, expect } from "vitest";
import {
  decideTrainerStart,
  isTrainersClient,
  trainerScheduledTarget,
  trainerSlotRules,
  validateTrainerBookingRequest,
} from "./trainerBookingCore";
import { dayContextFrom, type DayDocs } from "../availability/dayContext";
import { decideBookingStart } from "../availability/slots";
import { buildMessage, SUPPORTED_LOCALES } from "../notifications/bookingMessages";

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

// Monday 2026-10-05; Rome is UTC+2 (CEST) that day, so 10:00 Rome = 08:00Z.
const NOW = new Date("2026-10-05T06:00:00Z"); // 08:00 in Rome
const at = (romeHHmm: string) => {
  const [h, m] = romeHHmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 9, 5, h - 2, m));
};

function docs(over: Partial<DayDocs> = {}): DayDocs {
  return {
    instructor: {
      availabilitySchedule: [{ dayOfWeek: 1, startTime: "09:00", endTime: "17:00", isAvailable: true }],
      bookingRules: { bufferMinutes: 15, minAdvanceNoticeHours: 24, maxBookingsPerDay: 8 },
    },
    override: undefined,
    bookings: [],
    ...over,
  };
}

const booking = (startRome: string, endRome: string, status = "accepted") => ({
  id: `b-${startRome}`,
  status,
  scheduledAt: ts(at(startRome).toISOString()),
  scheduledEndAt: ts(at(endRome).toISOString()),
});

describe("validateTrainerBookingRequest", () => {
  const good = { clientUserId: "client-1", serviceId: "svc-1", startsAt: at("10:00").toISOString() };

  it("accepts a well-formed request and sanitizes the note", () => {
    expect(validateTrainerBookingRequest({ ...good, note: "  porta i guanti\r\n " }, "trainer-1", NOW))
      .toEqual({ clientUserId: "client-1", serviceId: "svc-1", startsAt: at("10:00"), note: "porta i guanti" });
  });

  it("treats a blank or missing note as none", () => {
    expect(validateTrainerBookingRequest(good, "trainer-1", NOW).note).toBeNull();
    expect(validateTrainerBookingRequest({ ...good, note: "   " }, "trainer-1", NOW).note).toBeNull();
  });

  it.each([
    ["no payload", null, "payload must be an object"],
    ["missing client", { ...good, clientUserId: undefined }, "clientUserId must be a document id"],
    ["path-like client", { ...good, clientUserId: "a/b" }, "clientUserId must be a document id"],
    ["missing service", { ...good, serviceId: "" }, "serviceId must be a document id"],
    ["unparseable start", { ...good, startsAt: "tomorrow" }, "startsAt must be an ISO date-time"],
    ["numeric start", { ...good, startsAt: 123 }, "startsAt must be an ISO date-time"],
    ["non-string note", { ...good, note: 42 }, "note must be a string"],
  ])("refuses %s", (_label, payload, message) => {
    expect(() => validateTrainerBookingRequest(payload, "trainer-1", NOW)).toThrow(message);
  });

  it("refuses a trainer booking themselves", () => {
    expect(() => validateTrainerBookingRequest({ ...good, clientUserId: "trainer-1" }, "trainer-1", NOW))
      .toThrow("cannot_book_yourself");
  });

  it("refuses a start in the past or too far ahead", () => {
    expect(() => validateTrainerBookingRequest({ ...good, startsAt: at("07:00").toISOString() }, "t", NOW))
      .toThrow("past_start");
    const farAway = new Date(NOW.getTime() + 181 * 86_400_000).toISOString();
    expect(() => validateTrainerBookingRequest({ ...good, startsAt: farAway }, "t", NOW))
      .toThrow("startsAt must be within 180 days");
  });
});

describe("trainerSlotRules", () => {
  it("drops only the minimum notice", () => {
    expect(trainerSlotRules({ bufferMinutes: 15, minAdvanceNoticeHours: 24, maxBookingsPerDay: 8 }))
      .toEqual({ bufferMinutes: 15, minAdvanceNoticeHours: 0, maxBookingsPerDay: 8 });
  });
});

describe("decideTrainerStart", () => {
  it("lets the trainer book later today, which the customer notice rule would refuse", () => {
    const d = docs();
    expect(decideTrainerStart(d, at("10:00"), 60, NOW)).toEqual({ ok: true, date: "2026-10-05", time: "10:00" });
    const customer = decideBookingStart({ ...dayContextFrom(d, "2026-10-05"), durationMinutes: 60, now: NOW }, at("10:00"));
    expect(customer.ok).toBe(false);
  });

  it("refuses a start that overlaps an active booking or its buffer", () => {
    const d = docs({ bookings: [booking("10:00", "11:00")] });
    expect(decideTrainerStart(d, at("10:00"), 60, NOW).ok).toBe(false);
    expect(decideTrainerStart(d, at("09:30"), 60, NOW).ok).toBe(false); // ends 10:30
    expect(decideTrainerStart(d, at("11:00"), 60, NOW).ok).toBe(false); // inside the 15' buffer
    expect(decideTrainerStart(d, at("11:30"), 60, NOW).ok).toBe(true);
  });

  it("ignores cancelled and declined bookings", () => {
    const d = docs({ bookings: [booking("10:00", "11:00", "cancelled"), booking("12:00", "13:00", "declined")] });
    expect(decideTrainerStart(d, at("10:00"), 60, NOW).ok).toBe(true);
    expect(decideTrainerStart(d, at("12:00"), 60, NOW).ok).toBe(true);
  });

  it("refuses starts outside the hours, off the grid, or already past", () => {
    const d = docs();
    expect(decideTrainerStart(d, at("16:30"), 60, NOW).ok).toBe(false); // would end 17:30
    expect(decideTrainerStart(d, at("10:10"), 60, NOW).ok).toBe(false);
    expect(decideTrainerStart(d, at("07:30"), 60, NOW).ok).toBe(false);
  });

  it("honours a day off and a blocked range from the date override", () => {
    expect(decideTrainerStart(docs({ override: { isAvailable: false, windows: [] } }), at("10:00"), 60, NOW).ok)
      .toBe(false);
    const blocked = docs({
      override: { isAvailable: true, windows: [{ start: "09:00", end: "12:00" }, { start: "14:00", end: "17:00" }] },
    });
    expect(decideTrainerStart(blocked, at("12:00"), 60, NOW).ok).toBe(false);
    expect(decideTrainerStart(blocked, at("14:00"), 60, NOW).ok).toBe(true);
  });

  it("still applies the provider's daily cap", () => {
    const d = docs({
      instructor: { ...docs().instructor, bookingRules: { bufferMinutes: 0, minAdvanceNoticeHours: 24, maxBookingsPerDay: 1 } },
      bookings: [booking("15:00", "16:00")],
    });
    expect(decideTrainerStart(d, at("10:00"), 60, NOW).ok).toBe(false);
  });
});

describe("isTrainersClient", () => {
  it("needs a roster entry or a previous booking together", () => {
    expect(isTrainersClient({ rosterDocs: 1, priorBookings: 0 })).toBe(true);
    expect(isTrainersClient({ rosterDocs: 0, priorBookings: 1 })).toBe(true);
    expect(isTrainersClient({ rosterDocs: 0, priorBookings: 0 })).toBe(false);
  });
});

describe("trainerScheduledTarget", () => {
  it("notifies the client with the session context", () => {
    expect(trainerScheduledTarget("bk-1", {
      userId: "client-1",
      instructorName: "Marco",
      serviceName: "Personal training",
      scheduledAt: at("10:00"),
    })).toEqual({
      recipientUid: "client-1",
      event: "scheduled_by_trainer",
      bookingId: "bk-1",
      context: { serviceName: "Personal training", trainerName: "Marco", startsAt: at("10:00") },
    });
  });

  it("renders in every locale without leaking undefined", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const full = buildMessage("scheduled_by_trainer", locale, { trainerName: "Marco", startsAt: at("10:00") });
      expect(full.body).toContain("Marco");
      const bare = buildMessage("scheduled_by_trainer", locale, {});
      expect(`${bare.title} ${bare.body}`).not.toMatch(/undefined|null/);
    }
    expect(buildMessage("scheduled_by_trainer", "it", { trainerName: "Marco" }).body)
      .toBe("Marco ha fissato una sessione. La trovi tra le tue prenotazioni.");
  });
});
