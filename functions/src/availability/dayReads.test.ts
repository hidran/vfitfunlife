import { describe, it, expect } from "vitest";
import { bookingReadWindow, readDayDocs } from "./dayReads";
import type { Firestore } from "firebase-admin/firestore";
import { romeDayBounds } from "./slots";

describe("bookingReadWindow", () => {
  it("starts 24h before the day and ends where the day ends, so a booking spilling over from the previous day is not missed", () => {
    const day = romeDayBounds("2026-09-21");
    const read = bookingReadWindow("2026-09-21");
    expect(read.end.getTime()).toBe(day.end.getTime());
    expect(read.start.getTime()).toBe(day.start.getTime() - 24 * 60 * 60 * 1000);
  });

  it("still widens by a flat 24h across the spring-forward day (23 real hours)", () => {
    const day = romeDayBounds("2026-03-29");
    const read = bookingReadWindow("2026-03-29");
    expect(read.start.getTime()).toBe(day.start.getTime() - 24 * 60 * 60 * 1000);
    expect(read.end.getTime()).toBe(day.end.getTime());
  });
});

/**
 * The smallest stand-in for the three reads readDayDocs makes: it only has to prove the
 * booking ids survive, so no emulator is involved.
 */
function fakeDb(bookings: { id: string; data: Record<string, unknown> }[]): Firestore {
  const query = {
    where: () => query,
    orderBy: () => query,
    get: async () => ({ docs: bookings.map((b) => ({ id: b.id, data: () => b.data })) }),
  };
  const empty = { get: async () => ({ data: () => undefined }) };
  const instructorRef = {
    get: async () => ({ data: () => ({ availabilitySchedule: [] }) }),
    collection: () => ({ doc: () => empty }),
  };
  return {
    collection: (name: string) => (name === "bookings" ? query : { doc: () => instructorRef }),
  } as unknown as Firestore;
}

describe("readDayDocs", () => {
  it("keeps each booking's document id, so a caller can exclude one of them", async () => {
    const db = fakeDb([
      { id: "b1", data: { status: "accepted" } },
      { id: "b2", data: { status: "requested" } },
    ]);
    const docs = await readDayDocs(db, "i1", "2026-09-21");
    expect(docs.bookings).toEqual([
      { id: "b1", status: "accepted" },
      { id: "b2", status: "requested" },
    ]);
  });

  it("prefers the real document id over a stored `id` field (seeded bookings carry both)", async () => {
    const db = fakeDb([{ id: "b1", data: { id: "stale", status: "accepted" } }]);
    const docs = await readDayDocs(db, "i1", "2026-09-21");
    expect(docs.bookings[0].id).toBe("b1");
  });
});
