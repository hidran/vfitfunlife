import { describe, it, expect } from "vitest";
import { mapLegacyStatus, isAlreadyMigrated } from "../src/bookings/migrateMapping";
import { BOOKING_STATUSES } from "../src/bookings/types";
import type { LegacyBookingStatus, LegacyCancelledBy } from "../src/bookings/types";

describe("mapLegacyStatus — non-cancellation statuses", () => {
  const cases: Array<[LegacyBookingStatus, string]> = [
    ["pending", "requested"],
    ["confirmed", "accepted"],
    ["in_progress", "accepted"],
    ["completed", "completed"],
    ["no_show", "no_show"],
  ];

  it.each(cases)("maps %s -> %s", (from, to) => {
    expect(mapLegacyStatus(from, null).status).toBe(to);
  });

  it("records actorRole 'system' for statuses with no human attribution", () => {
    for (const [from] of cases) {
      expect(mapLegacyStatus(from, null).actorRole).toBe("system");
    }
  });
});

describe("mapLegacyStatus — cancellations preserve attribution", () => {
  // A uniform actorRole here would erase attribution across the entire backfill and
  // leave P0-2 unable to distinguish an admin cancellation from a trainer's. Spec §7.3.
  const cases: Array<[LegacyCancelledBy, string, string]> = [
    ["user", "cancelled_by_client", "client"],
    ["instructor", "cancelled_by_trainer", "trainer"],
    ["admin", "cancelled_by_trainer", "admin"],
    ["venue", "cancelled_by_trainer", "system"],
    [null, "cancelled_by_trainer", "system"],
  ];

  it.each(cases)("cancelledBy=%s -> %s with actorRole %s", (by, status, role) => {
    const m = mapLegacyStatus("cancelled", by);
    expect(m.status).toBe(status);
    expect(m.actorRole).toBe(role);
  });

  it("does not attribute admin cancellations to the trainer's actorRole", () => {
    expect(mapLegacyStatus("cancelled", "admin").actorRole).not.toBe("trainer");
  });

  it("handles an undefined cancelledBy without throwing", () => {
    expect(mapLegacyStatus("cancelled", undefined).status).toBe("cancelled_by_trainer");
  });
});

describe("idempotency", () => {
  it("recognises every new-vocabulary status as already migrated", () => {
    for (const s of BOOKING_STATUSES) expect(isAlreadyMigrated(s)).toBe(true);
  });

  it("recognises legacy statuses as not yet migrated", () => {
    for (const s of ["pending", "confirmed", "in_progress", "cancelled"]) {
      expect(isAlreadyMigrated(s)).toBe(false);
    }
  });

  it("leaves an already-migrated status unchanged when re-mapped", () => {
    for (const s of BOOKING_STATUSES) {
      expect(mapLegacyStatus(s, null).status).toBe(s);
    }
  });

  it("treats 'completed' and 'no_show' as stable across both vocabularies", () => {
    expect(mapLegacyStatus("completed", null).status).toBe("completed");
    expect(mapLegacyStatus("no_show", null).status).toBe("no_show");
  });
});

describe("mapping output is always a valid status", () => {
  it("never produces a status outside the enum", () => {
    const inputs: LegacyBookingStatus[] = [
      "pending", "confirmed", "in_progress", "completed", "cancelled", "no_show",
    ];
    const cancelledBys: LegacyCancelledBy[] = ["user", "instructor", "venue", "admin", null];

    for (const s of inputs) {
      for (const by of cancelledBys) {
        expect(BOOKING_STATUSES).toContain(mapLegacyStatus(s, by).status);
      }
    }
  });
});
