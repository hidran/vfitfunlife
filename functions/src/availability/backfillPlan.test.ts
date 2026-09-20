import { describe, it, expect } from "vitest";
import { cleanSchedule, planAvailabilityBackfill } from "./backfillPlan";

const weekdayMap = {
  monday: { isAvailable: true, slots: [{ start: "09:00", end: "12:00" }, { start: "11:00", end: "13:00" }] },
  tuesday: { isAvailable: false, slots: [{ start: "09:00", end: "12:00" }] },
  saturday: { isAvailable: true, slots: [{ start: "10:00", end: "09:00" }, { start: "10:00", end: "12:30" }] },
};

describe("cleanSchedule", () => {
  it("keeps available windows, drops invalid ones and merges overlaps", () => {
    expect(cleanSchedule(weekdayMap)).toEqual([
      { dayOfWeek: 1, startTime: "09:00", endTime: "13:00", isAvailable: true },
      { dayOfWeek: 6, startTime: "10:00", endTime: "12:30", isAvailable: true },
    ]);
  });

  it("gives nothing for garbage or an all-off week", () => {
    expect(cleanSchedule(null)).toEqual([]);
    expect(cleanSchedule({ monday: { isAvailable: false, slots: [{ start: "09:00", end: "10:00" }] } })).toEqual([]);
  });
});

describe("planAvailabilityBackfill", () => {
  const instructor = { availabilitySchedule: [{ dayOfWeek: 1, startTime: "09:00", endTime: "12:00" }] };

  it("copies a provider-chosen schedule over the seeded default", () => {
    const plan = planAvailabilityBackfill({ providerProfile: { availabilitySchedule: weekdayMap } }, instructor);
    expect(plan).toEqual({ kind: "copy", schedule: cleanSchedule(weekdayMap) });
  });

  it("only clears the users-side field when nothing in it is bookable", () => {
    const user = { providerProfile: { availabilitySchedule: null } };
    expect(planAvailabilityBackfill(user, instructor)).toEqual({ kind: "clear", reason: "nothing_to_copy" });
  });

  it("never overwrites hours saved on the new availability page", () => {
    const user = { providerProfile: { availabilitySchedule: weekdayMap } };
    const saved = { ...instructor, availabilityUpdatedAt: { seconds: 1 } };
    expect(planAvailabilityBackfill(user, saved)).toEqual({ kind: "clear", reason: "kept_newer" });
  });

  it("skips users without the field, deleted users and users with no instructor doc", () => {
    expect(planAvailabilityBackfill({ providerProfile: {} }, instructor))
      .toEqual({ kind: "skip", reason: "not_a_candidate" });
    expect(planAvailabilityBackfill({ isDeleted: true, providerProfile: { availabilitySchedule: weekdayMap } }, instructor))
      .toEqual({ kind: "skip", reason: "deleted" });
    expect(planAvailabilityBackfill({ providerProfile: { availabilitySchedule: weekdayMap } }, undefined))
      .toEqual({ kind: "skip", reason: "no_instructor" });
  });
});
