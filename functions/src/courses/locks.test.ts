import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { diffSlots, lockPaths, MAX_LOCKED_SESSIONS, slotsOf, updateScheduleLocks, type LockSlot } from "./locks";
import { assertLockInvariant } from "./lockInvariant.testutil";

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";

const slot = (over: Partial<LockSlot> & { start: string; end: string }): LockSlot => {
  const { start, end, ...rest } = over;
  return { id: "c1_s1", courseName: "Karate", venueId: "v", locationId: "l", roomId: "r", instructorId: "i",
    startsAt: new Date(start), endsAt: new Date(end), ...rest };
};

describe("lockPaths", () => {
  it("gives one room and one instructor key for an 18:00-19:00 Rome slot", () => {
    const paths = lockPaths(slot({ start: "2099-10-12T16:00:00Z", end: "2099-10-12T17:00:00Z" }));
    expect(paths).toEqual(["courseScheduleLocks/room_v_l_r_2099-10-12", "courseScheduleLocks/instructor_i_2099-10-12"]);
  });

  it("gives two days each when the slot crosses UTC midnight", () => {
    const paths = lockPaths(slot({ start: "2099-10-12T23:30:00Z", end: "2099-10-13T00:30:00Z" }));
    expect(paths).toHaveLength(4);
    expect(paths).toContain("courseScheduleLocks/room_v_l_r_2099-10-12");
    expect(paths).toContain("courseScheduleLocks/room_v_l_r_2099-10-13");
    expect(paths).toContain("courseScheduleLocks/instructor_i_2099-10-12");
    expect(paths).toContain("courseScheduleLocks/instructor_i_2099-10-13");
  });

  it("does not touch the next day when the slot ends exactly at 00:00 UTC", () => {
    const paths = lockPaths(slot({ start: "2099-10-12T23:00:00Z", end: "2099-10-13T00:00:00Z" }));
    expect(paths).toEqual(["courseScheduleLocks/room_v_l_r_2099-10-12", "courseScheduleLocks/instructor_i_2099-10-12"]);
  });

  it("omits the room key without a room, venue or location", () => {
    const base = { start: "2099-10-12T16:00:00Z", end: "2099-10-12T17:00:00Z" };
    expect(lockPaths(slot({ ...base, roomId: null }))).toEqual(["courseScheduleLocks/instructor_i_2099-10-12"]);
    expect(lockPaths(slot({ ...base, venueId: null }))).toEqual(["courseScheduleLocks/instructor_i_2099-10-12"]);
    expect(lockPaths(slot({ ...base, locationId: null }))).toEqual(["courseScheduleLocks/instructor_i_2099-10-12"]);
  });

  it("omits the instructor key without an instructor", () => {
    expect(lockPaths(slot({ start: "2099-10-12T16:00:00Z", end: "2099-10-12T17:00:00Z", instructorId: null })))
      .toEqual(["courseScheduleLocks/room_v_l_r_2099-10-12"]);
  });

  it("keys a DST-change day slot (2026-10-25 02:00-03:00 Rome) by UTC days", () => {
    // 02:00 CEST = 00:00Z; the ambiguous 02:30 wall time exists twice, the slot ends 03:00 CET = 02:00Z.
    const paths = lockPaths(slot({ start: "2026-10-25T00:00:00Z", end: "2026-10-25T02:00:00Z" }));
    expect(paths).toEqual(["courseScheduleLocks/room_v_l_r_2026-10-25", "courseScheduleLocks/instructor_i_2026-10-25"]);
  });

  it("keys the evening of the spring DST-change day by UTC days", () => {
    const paths = lockPaths(slot({ start: "2026-03-29T22:30:00Z", end: "2026-03-30T00:30:00Z" }));
    expect(paths.filter((p) => p.includes("/room_"))).toEqual([
      "courseScheduleLocks/room_v_l_r_2026-03-29", "courseScheduleLocks/room_v_l_r_2026-03-30"]);
  });

  it("returns no key for an interval that ends on an earlier day than it starts", () => {
    expect(lockPaths(slot({ start: "2099-10-13T16:00:00Z", end: "2099-10-12T16:00:00Z" }))).toEqual([]);
  });
});

describe("diffSlots", () => {
  const a = slot({ id: "c_a", start: "2099-10-12T16:00:00Z", end: "2099-10-12T17:00:00Z" });
  const b = slot({ id: "c_b", start: "2099-10-13T16:00:00Z", end: "2099-10-13T17:00:00Z" });

  it("ignores identical slots (compared by value, not reference)", () => {
    const copy = { ...a, startsAt: new Date(a.startsAt), endsAt: new Date(a.endsAt) };
    expect(diffSlots([a, b], [copy, b])).toEqual({ remove: [], add: [] });
  });

  it("reports a moved slot in both lists", () => {
    const moved = { ...a, startsAt: new Date("2099-10-12T17:00:00Z"), endsAt: new Date("2099-10-12T18:00:00Z") };
    expect(diffSlots([a, b], [moved, b])).toEqual({ remove: [a], add: [moved] });
  });

  it("reports a room or instructor change as moved", () => {
    expect(diffSlots([a], [{ ...a, roomId: "r2" }])).toEqual({ remove: [a], add: [{ ...a, roomId: "r2" }] });
    expect(diffSlots([a], [{ ...a, instructorId: "i2" }]).add).toHaveLength(1);
  });

  it("removes slots that disappear and adds new ones", () => {
    expect(diffSlots([a], [b])).toEqual({ remove: [a], add: [b] });
  });
});

describe("slotsOf", () => {
  const ts = (iso: string) => Timestamp.fromDate(new Date(iso));
  const session = (id: string, iso: string, extra: Record<string, unknown> = {}) => ({ id, data: {
    startsAt: ts(iso), endsAt: ts(new Date(Date.parse(iso) + 3600_000).toISOString()), state: "scheduled" as const,
    venueId: "v", locationId: "l", roomId: "r", instructorId: "i", ...extra } });

  it("returns nothing unless the course is published", () => {
    for (const state of ["draft", "archived"]) {
      expect(slotsOf("c", { state, name: "Karate" }, [session("s1", "2099-10-12T16:00:00Z")])).toEqual([]);
    }
  });

  it("includes only scheduled sessions and keys them courseId_sessionId from the session snapshot", () => {
    const slots = slotsOf("c", { state: "published", name: "Karate" }, [
      session("s1", "2099-10-12T16:00:00Z"),
      session("s2", "2099-10-13T16:00:00Z", { state: "cancelled" }),
      session("s3", "2099-10-14T16:00:00Z", { state: "completed" }),
      session("s4", "2099-10-15T16:00:00Z", { roomId: "r9", instructorId: null }),
    ]);
    expect(slots.map((s) => s.id)).toEqual(["c_s1", "c_s4"]);
    expect(slots[0]).toMatchObject({ courseName: "Karate", venueId: "v", locationId: "l", roomId: "r", instructorId: "i" });
    expect(slots[0].startsAt).toEqual(new Date("2099-10-12T16:00:00Z"));
    expect(slots[1]).toMatchObject({ roomId: "r9", instructorId: null });
  });

  it("treats missing snapshot fields as null", () => {
    const [only] = slotsOf("c", { state: "published", name: "Karate" }, [{ id: "s", data: {
      startsAt: ts("2099-10-12T16:00:00Z"), endsAt: ts("2099-10-12T17:00:00Z"), state: "scheduled" } }]);
    expect(only).toMatchObject({ venueId: null, locationId: null, roomId: null, instructorId: null });
  });

  it("exports the session cap", () => {
    expect(MAX_LOCKED_SESSIONS).toBe(400);
  });
});

describe("updateScheduleLocks (emulator)", () => {
  let db: admin.firestore.Firestore;
  const run = (remove: LockSlot[], add: LockSlot[]) => db.runTransaction((tx) => updateScheduleLocks(tx, remove, add));
  const room = (id: string, start: string, end: string, over: Partial<LockSlot> = {}) =>
    slot({ id, start, end, courseName: id, ...over });
  const day = "2099-10-12";

  beforeAll(async () => {
    for (const app of admin.apps) if (app) await app.delete();
    admin.initializeApp({ projectId: "demo-vfit-course-locks" });
    db = admin.firestore();
  });
  beforeEach(async () => {
    await db.recursiveDelete(db.collection("courseScheduleLocks"));
    await db.recursiveDelete(db.collection("courses"));
  });

  it("rejects an overlapping room slot with the first slot's name and time", async () => {
    await run([], [room("c1_s1", `${day}T16:00:00Z`, `${day}T17:00:00Z`)]);
    const err = await run([], [room("c2_s1", `${day}T16:30:00Z`, `${day}T17:30:00Z`, { instructorId: "other" })])
      .catch((e) => e);
    expect(err.message).toBe("room_overlap");
    expect(err.code).toBe("failed-precondition");
    expect(err.details).toEqual({ courseName: "c1_s1", startsAt: `${day}T16:00:00.000Z`, endsAt: `${day}T17:00:00.000Z` });
    expect((await db.doc(`courseScheduleLocks/room_v_l_r_${day}`).get()).data()?.slots).not.toHaveProperty("c2_s1");
  });

  it("writes nothing when a later path of the same add conflicts", async () => {
    await run([], [room("c1_s1", `${day}T23:30:00Z`, `2099-10-13T00:30:00Z`)]);
    await expect(run([], [room("c2_s1", `2099-10-13T00:00:00Z`, `2099-10-13T01:00:00Z`, { instructorId: "x" })]))
      .rejects.toThrow("room_overlap");
    expect((await db.doc("courseScheduleLocks/instructor_x_2099-10-13").get()).exists).toBe(false);
  });

  it("allows touching slots (end equals start)", async () => {
    await run([], [room("c1_s1", `${day}T16:00:00Z`, `${day}T17:00:00Z`)]);
    await run([], [room("c2_s1", `${day}T17:00:00Z`, `${day}T18:00:00Z`)]);
    expect(Object.keys((await db.doc(`courseScheduleLocks/room_v_l_r_${day}`).get()).data()!.slots).sort())
      .toEqual(["c1_s1", "c2_s1"]);
  });

  it("rejects the same instructor in two rooms with instructor_overlap", async () => {
    await run([], [room("c1_s1", `${day}T16:00:00Z`, `${day}T17:00:00Z`)]);
    const err = await run([], [room("c2_s1", `${day}T16:00:00Z`, `${day}T17:00:00Z`, { roomId: "r2" })]).catch((e) => e);
    expect(err.message).toBe("instructor_overlap");
    expect(err.details.courseName).toBe("c1_s1");
  });

  it("enforces the room lock without any instructor and the instructor lock without any room", async () => {
    await run([], [room("c1_s1", `${day}T16:00:00Z`, `${day}T17:00:00Z`, { instructorId: null })]);
    await expect(run([], [room("c2_s1", `${day}T16:00:00Z`, `${day}T17:00:00Z`, { instructorId: null })]))
      .rejects.toThrow("room_overlap");
    await run([], [room("c3_s1", `${day}T16:00:00Z`, `${day}T17:00:00Z`, { venueId: null, locationId: null, roomId: null, instructorId: "solo" })]);
    await expect(run([], [room("c4_s1", `${day}T16:30:00Z`, `${day}T17:30:00Z`, { venueId: null, locationId: null, roomId: null, instructorId: "solo" })]))
      .rejects.toThrow("instructor_overlap");
  });

  it("catches an overlap on the second UTC day of a midnight-crossing slot", async () => {
    await run([], [room("c1_s1", `${day}T23:30:00Z`, `2099-10-13T00:30:00Z`)]);
    await expect(run([], [room("c2_s1", `2099-10-13T00:15:00Z`, `2099-10-13T01:00:00Z`, { instructorId: "x" })]))
      .rejects.toThrow("room_overlap");
  });

  it("remove then add of the same id in one call never self-conflicts, and moves the slot", async () => {
    const before = room("c1_s1", `${day}T16:00:00Z`, `${day}T17:00:00Z`);
    const after = room("c1_s1", `${day}T16:30:00Z`, `${day}T17:30:00Z`);
    await run([], [before]);
    await run([before], [after]);
    const slots = (await db.doc(`courseScheduleLocks/room_v_l_r_${day}`).get()).data()!.slots;
    expect(slots.c1_s1.start).toBe(after.startsAt.getTime());
  });

  it("adding an id that is already stored overwrites it instead of conflicting with itself", async () => {
    const s = room("c1_s1", `${day}T16:00:00Z`, `${day}T17:00:00Z`);
    await run([], [s]);
    await run([], [s]);
  });

  it("removing frees the slot for another course and deletes empty day documents", async () => {
    const first = room("c1_s1", `${day}T16:00:00Z`, `${day}T17:00:00Z`);
    await run([], [first]);
    await run([first], []);
    expect((await db.doc(`courseScheduleLocks/room_v_l_r_${day}`).get()).exists).toBe(false);
    await run([], [room("c2_s1", `${day}T16:00:00Z`, `${day}T17:00:00Z`)]);
  });

  it("removing a slot that was never stored is a no-op", async () => {
    await run([room("ghost", `${day}T16:00:00Z`, `${day}T17:00:00Z`)], []);
    expect((await db.collection("courseScheduleLocks").get()).size).toBe(0);
  });

  it("does nothing for an empty change", async () => {
    await run([], []);
  });

  it("lets exactly one of two concurrent transactions add overlapping slots", async () => {
    const results = await Promise.allSettled([
      run([], [room("c1_s1", `${day}T16:00:00Z`, `${day}T17:00:00Z`, { instructorId: "a" })]),
      run([], [room("c2_s1", `${day}T16:30:00Z`, `${day}T17:30:00Z`, { instructorId: "b" })]),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason.message).toBe("room_overlap");
    expect(Object.keys((await db.doc(`courseScheduleLocks/room_v_l_r_${day}`).get()).data()!.slots)).toHaveLength(1);
  });

  it("keeps concurrent non-overlapping adds on the same day document", async () => {
    await Promise.all([
      run([], [room("c1_s1", `${day}T10:00:00Z`, `${day}T11:00:00Z`, { instructorId: "a" })]),
      run([], [room("c2_s1", `${day}T12:00:00Z`, `${day}T13:00:00Z`, { instructorId: "b" })]),
      run([], [room("c3_s1", `${day}T14:00:00Z`, `${day}T15:00:00Z`, { instructorId: "c" })]),
    ]);
    expect(Object.keys((await db.doc(`courseScheduleLocks/room_v_l_r_${day}`).get()).data()!.slots).sort())
      .toEqual(["c1_s1", "c2_s1", "c3_s1"]);
  });

  it("the invariant oracle accepts matching locks and flags missing or stray ones", async () => {
    const ts = (iso: string) => Timestamp.fromDate(new Date(iso));
    await db.doc("courses/c").set({ name: "Karate", state: "published" });
    const data = { startsAt: ts(`${day}T16:00:00Z`), endsAt: ts(`${day}T17:00:00Z`), state: "scheduled",
      venueId: "v", locationId: "l", roomId: "r", instructorId: "i" };
    await db.doc("courses/c/sessions/s1").set(data);
    await expect(assertLockInvariant(db)).rejects.toThrow();
    await run([], slotsOf("c", { state: "published", name: "Karate" }, [{ id: "s1", data: data as never }]));
    await assertLockInvariant(db);
    await db.doc("courses/c").update({ state: "draft" });
    await expect(assertLockInvariant(db)).rejects.toThrow();
  });
});
