import { beforeAll, describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";

// waitlist.ts also holds the callables, whose store import needs the Firebase app test/setup.ts creates in beforeAll.
type Waitlist = typeof import("./waitlist");
let isFull: Waitlist["isFull"]; let joinDecision: Waitlist["joinDecision"];
let promotionWindowOpen: Waitlist["promotionWindowOpen"]; let renumber: Waitlist["renumber"];
let WAITLIST_MAX: Waitlist["WAITLIST_MAX"];
beforeAll(async () => {
  ({ isFull, joinDecision, promotionWindowOpen, renumber, WAITLIST_MAX } = await import("./waitlist"));
});

const now = new Date("2099-10-12T08:00:00Z");
const hours = (n: number) => new Date(now.getTime() + n * 3600000);
const course = { state: "published" as const, enrollmentClosed: false, capacity: 2, bookingNoticeHours: 2,
  waitlistEnabled: true };
const full = { state: "scheduled" as const, occupied: 2, held: 0, startsAt: hours(10) };
const ok = { course, session: full, now, hasParticipant: false, hasEntry: false, waitlisted: 0 };

describe("isFull", () => {
  it("counts occupied and held against the lesson capacity, falling back to the course's", () => {
    expect(isFull({ occupied: 1, held: 1 }, course)).toBe(true);
    expect(isFull({ occupied: 1, held: 0 }, course)).toBe(false);
    expect(isFull({ occupied: 2, held: 0, capacity: 3 }, course)).toBe(false);
    expect(isFull({ occupied: 3, held: 0, capacity: 3 }, course)).toBe(true);
  });
});

describe("promotionWindowOpen", () => {
  it("is open only strictly beyond the notice window, for dates and timestamps", () => {
    expect(promotionWindowOpen({ startsAt: hours(2.01) }, course, now)).toBe(true);
    expect(promotionWindowOpen({ startsAt: hours(2) }, course, now)).toBe(false);
    expect(promotionWindowOpen({ startsAt: hours(1) }, course, now)).toBe(false);
    expect(promotionWindowOpen({ startsAt: Timestamp.fromDate(hours(3)) }, course, now)).toBe(true);
    expect(promotionWindowOpen({ startsAt: hours(1) }, { bookingNoticeHours: 0 }, now)).toBe(true);
  });
});

describe("joinDecision", () => {
  it("caps a lesson's waitlist at 100 entries", () => expect(WAITLIST_MAX).toBe(100));
  it("lets a customer onto the waitlist of a full, scheduled lesson outside the notice window", () => {
    expect(joinDecision(ok)).toBeNull();
    expect(joinDecision({ ...ok, waitlisted: WAITLIST_MAX - 1 })).toBeNull();
  });
  it.each([
    ["waitlist disabled", { course: { ...course, waitlistEnabled: false } }, "waitlist_disabled"],
    ["session cancelled", { session: { ...full, state: "cancelled" as const } }, "waitlist_not_open"],
    ["session completed", { session: { ...full, state: "completed" as const } }, "waitlist_not_open"],
    ["a free seat", { session: { ...full, occupied: 1 } }, "waitlist_not_open"],
    ["a free seat counted by the lesson's own capacity", { session: { ...full, capacity: 3 } }, "waitlist_not_open"],
    ["inside the notice window", { session: { ...full, startsAt: hours(1) } }, "waitlist_not_open"],
    ["exactly at the notice boundary", { session: { ...full, startsAt: hours(2) } }, "waitlist_not_open"],
    ["enrollment closed", { course: { ...course, enrollmentClosed: true } }, "waitlist_not_open"],
    ["course in draft", { course: { ...course, state: "draft" as const } }, "waitlist_not_open"],
    ["course archived", { course: { ...course, state: "archived" as const } }, "waitlist_not_open"],
    ["already a participant", { hasParticipant: true }, "already_enrolled"],
    ["already waitlisted", { hasEntry: true }, "already_waitlisted"],
    ["list at the cap", { waitlisted: 100 }, "waitlist_full"],
    ["list above the cap", { waitlisted: 105 }, "waitlist_full"],
  ])("refuses: %s", (_name, override, code) => {
    expect(joinDecision({ ...ok, ...override })).toBe(code);
  });
  it("treats a course without the waitlistEnabled flag as enabled (legacy)", () => {
    const legacy: Partial<typeof course> = { ...course };
    delete legacy.waitlistEnabled;
    expect(joinDecision({ ...ok, course: legacy as typeof course })).toBeNull();
  });
  it("reports a disabled waitlist before anything else, and membership before the rest", () => {
    expect(joinDecision({ ...ok, course: { ...course, waitlistEnabled: false }, hasParticipant: true }))
      .toBe("waitlist_disabled");
    expect(joinDecision({ ...ok, hasParticipant: true, hasEntry: true, waitlisted: WAITLIST_MAX }))
      .toBe("already_enrolled");
  });
});

describe("renumber", () => {
  const list = [{ id: "a", position: 1 }, { id: "b", position: 2 }, { id: "c", position: 3 }];
  it("closes the gap and keeps the order", () => {
    expect(renumber(list, ["a"])).toEqual([{ id: "b", position: 1 }, { id: "c", position: 2 }]);
    expect(renumber(list, ["b"])).toEqual([{ id: "a", position: 1 }, { id: "c", position: 2 }]);
    expect(renumber(list, ["a", "c"])).toEqual([{ id: "b", position: 1 }]);
    expect(renumber(list, list.map((e) => e.id))).toEqual([]);
  });
  it("ignores an unknown id and repairs a gappy list", () => {
    expect(renumber(list, ["zzz"])).toEqual([{ id: "a", position: 1 }, { id: "b", position: 2 },
      { id: "c", position: 3 }]);
    expect(renumber([{ id: "a", position: 4 }, { id: "b", position: 9 }], [])).toEqual([
      { id: "a", position: 1 }, { id: "b", position: 2 }]);
  });
});
