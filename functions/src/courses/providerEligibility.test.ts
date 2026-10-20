import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as admin from "firebase-admin";
import { testProjectId } from "./testProject";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

// Emulator test. The handler body is a plain function, called with a synthetic event the way
// providers/syncBusinessVenueLocation.test.ts calls its own; the instructors document it reads is the real one.
let sync: typeof import("./providerEligibility");
let db: admin.firestore.Firestore;
const APPROVED = { isActive: true, applicationStatus: "approved", providerProfile: { isVerified: true } };
const REJECTED = { ...APPROVED, applicationStatus: "rejected" };
const event = (providerId = "p") => ({ params: { providerId },
  data: { before: { data: () => undefined }, after: { data: () => undefined } } }) as unknown as
  Parameters<typeof sync.syncCourseEligibility>[0];

async function seedCourse(id: string, providerId: string, state: string, eligible: boolean, sessions: number,
  listed: boolean) {
  await db.doc(`courses/${id}`).set({ providerId, state, providerEligible: eligible, name: id });
  const writer = db.bulkWriter();
  for (let i = 0; i < sessions; i++) {
    void writer.set(db.doc(`courses/${id}/sessions/s${String(i).padStart(4, "0")}`),
      { state: "scheduled", listed, venueId: "v", capacity: 5, occupied: 0, n: i });
  }
  await writer.close();
}
const course = async (id: string) => (await db.doc(`courses/${id}`).get()).data() ?? {};
const flag = async (id: string) => (await course(id)).providerEligible;
const unlisted = async (id: string) => (await db.collection(`courses/${id}/sessions`).get()).docs
  .filter((d) => d.get("listed") !== true).length;
const listedOf = async (id: string) => (await db.collection(`courses/${id}/sessions`).get()).docs
  .map((d) => d.get("listed"));

beforeAll(async () => {
  for (const app of admin.apps) if (app) await app.delete();
  admin.initializeApp({ projectId: testProjectId("demo-vfit-course-eligibility") });
  db = admin.firestore();
  sync = await import("./providerEligibility");
});
beforeEach(async () => {
  for (const name of ["courses", "instructors"]) await db.recursiveDelete(db.collection(name));
  await db.doc("instructors/p").set(APPROVED);
  await db.doc("instructors/other").set(APPROVED);
});
afterEach(() => vi.restoreAllMocks());

describe("onCourseProviderEligibility registration", () => {
  it("retries, runs in the shared region and watches instructors", async () => {
    const { region } = await import("../lib/runtimeOptions");
    const endpoint = (sync.onCourseProviderEligibility as unknown as {
      __endpoint: { region: string[]; timeoutSeconds: number;
        eventTrigger: { retry: boolean; eventFilterPathPatterns: Record<string, string> } };
    }).__endpoint;
    expect(endpoint.eventTrigger.retry).toBe(true);
    expect(endpoint.region).toEqual([region]);
    expect(endpoint.timeoutSeconds).toBe(300);
    expect(endpoint.eventTrigger.eventFilterPathPatterns.document).toBe("instructors/{providerId}");
  });
});

describe("syncCourseEligibility", () => {
  it("unlists every course's sessions when the provider is suspended and lists them again on reinstatement", async () => {
    await seedCourse("a", "p", "published", true, 3, true);
    await seedCourse("b", "p", "published", true, 3, true);
    await seedCourse("draft", "p", "draft", true, 3, false);
    await seedCourse("theirs", "other", "published", true, 3, true);
    await db.doc("instructors/p").set(REJECTED);
    await sync.syncCourseEligibility(event());
    for (const id of ["a", "b"]) {
      expect(await flag(id)).toBe(false);
      expect(await listedOf(id)).toEqual([false, false, false]);
    }
    expect(await listedOf("draft")).toEqual([false, false, false]);
    expect(await flag("theirs")).toBe(true);
    expect(await listedOf("theirs")).toEqual([true, true, true]);

    await db.doc("instructors/p").set(APPROVED);
    await sync.syncCourseEligibility(event());
    for (const id of ["a", "b"]) {
      expect(await flag(id)).toBe(true);
      expect(await listedOf(id)).toEqual([true, true, true]);
    }
    // A draft stays unlisted, but its flag follows the provider like any other course.
    expect(await flag("draft")).toBe(true);
    expect(await listedOf("draft")).toEqual([false, false, false]);
    expect(await course("a")).not.toHaveProperty("listingSyncPending");
  });

  it("treats a suspended, pending, unverified, inactive or deleted provider as ineligible", async () => {
    const cases: Array<Record<string, unknown> | null> = [
      { ...APPROVED, applicationStatus: "suspended" }, { ...APPROVED, applicationStatus: "pending" },
      { ...APPROVED, providerProfile: { isVerified: false } }, { ...APPROVED, isActive: false }, null];
    for (const doc of cases) {
      await db.recursiveDelete(db.collection("courses"));
      await seedCourse("a", "p", "published", true, 2, true);
      if (doc) await db.doc("instructors/p").set(doc); else await db.doc("instructors/p").delete();
      await sync.syncCourseEligibility(event());
      expect(await flag("a")).toBe(false);
      expect(await listedOf("a")).toEqual([false, false]);
    }
  });

  it("updates 450 sessions in more than one transaction and finishes with the flag", async () => {
    await seedCourse("long", "p", "published", true, 450, true);
    await db.doc("instructors/p").set(REJECTED);
    const run = vi.spyOn(db, "runTransaction");
    await sync.syncCourseEligibility(event());
    expect(run).toHaveBeenCalledTimes(2);
    expect(await unlisted("long")).toBe(450);
    expect(await flag("long")).toBe(false);
    expect(await course("long")).not.toHaveProperty("listingSyncPending");
  });

  it("is a no-op when nothing disagrees, and on replay", async () => {
    await seedCourse("a", "p", "published", true, 2, true);
    const run = vi.spyOn(db, "runTransaction");
    await sync.syncCourseEligibility(event());
    expect(run).not.toHaveBeenCalled();
    await db.doc("instructors/p").set(REJECTED);
    await sync.syncCourseEligibility(event());
    expect(run).toHaveBeenCalledTimes(1);
    await sync.syncCourseEligibility(event());
    expect(run).toHaveBeenCalledTimes(1);
    expect(await listedOf("a")).toEqual([false, false]);
  });

  it("uses the provider's current state, not the event's: a stale suspension after reinstatement changes nothing", async () => {
    await seedCourse("a", "p", "published", true, 2, true);
    await db.doc("instructors/p").set(REJECTED);
    await db.doc("instructors/p").set(APPROVED);
    const run = vi.spyOn(db, "runTransaction");
    await sync.syncCourseEligibility(event());
    expect(run).not.toHaveBeenCalled();
    expect(await listedOf("a")).toEqual([true, true]);
  });

  it("decides each course from its state inside the transaction, not from the query that found it", async () => {
    // Reinstated provider; the draft is published (as saveCourse would) after the handler's query and before its
    // transaction. Acting on the queried state would unlist the freshly published lessons.
    await seedCourse("late", "p", "draft", false, 3, false);
    const real = db.runTransaction.bind(db);
    vi.spyOn(db, "runTransaction").mockImplementationOnce((async (update: never, options: never) => {
      await db.doc("courses/late").update({ state: "published", providerEligible: true });
      const writer = db.bulkWriter();
      for (const s of (await db.collection("courses/late/sessions").get()).docs) void writer.update(s.ref, { listed: true });
      await writer.close();
      return real(update, options);
    }) as typeof db.runTransaction);
    await sync.syncCourseEligibility(event());
    expect(await listedOf("late")).toEqual([true, true, true]);
    expect(await flag("late")).toBe(true);
  });

  it("leaves the course pending when a chunk fails, throws so the event is retried, and the retry finishes", async () => {
    await seedCourse("long", "p", "published", true, 450, true);
    await seedCourse("ok", "p", "published", true, 2, true);
    await db.doc("instructors/p").set(REJECTED);
    const real = db.runTransaction.bind(db);
    let calls = 0;
    vi.spyOn(db, "runTransaction").mockImplementation(((update: never, options: never) => {
      // Courses go in id order: "long" chunk 1 (call 1) succeeds, chunk 2 (call 2) fails, then "ok" runs.
      if (++calls === 2) return Promise.reject(new Error("boom"));
      return real(update, options);
    }) as typeof db.runTransaction);
    await expect(sync.syncCourseEligibility(event())).rejects.toThrow("course_eligibility_sync_failed:1");
    vi.restoreAllMocks();
    expect(await flag("ok")).toBe(false);
    expect(await flag("long")).toBe(true);
    expect((await course("long")).listingSyncPending).toBe(true);
    expect(await unlisted("long")).toBe(400);
    await sync.syncCourseEligibility(event());
    expect(await flag("long")).toBe(false);
    expect(await unlisted("long")).toBe(450);
    expect(await course("long")).not.toHaveProperty("listingSyncPending");
  });

  it("repairs a half-done pass even when the provider flipped back before the retry", async () => {
    // Suspension unlists the first 400 lessons, then the run dies. The provider is reinstated before the retry: the
    // course flag (still true) now agrees with the provider, so only the pending marker reveals the damage.
    await seedCourse("long", "p", "published", true, 450, true);
    await db.doc("instructors/p").set(REJECTED);
    const real = db.runTransaction.bind(db);
    let calls = 0;
    vi.spyOn(db, "runTransaction").mockImplementation(((update: never, options: never) => {
      if (++calls === 2) return Promise.reject(new Error("boom"));
      return real(update, options);
    }) as typeof db.runTransaction);
    await expect(sync.syncCourseEligibility(event())).rejects.toThrow();
    vi.restoreAllMocks();
    await db.doc("instructors/p").set(APPROVED);
    expect(await flag("long")).toBe(true);
    expect(await unlisted("long")).toBe(400);
    await sync.syncCourseEligibility(event());
    expect(await unlisted("long")).toBe(0);
    expect(await flag("long")).toBe(true);
    expect(await course("long")).not.toHaveProperty("listingSyncPending");
  });

  it("stops when the provider flips between chunks and the next run converges", async () => {
    await seedCourse("long", "p", "published", true, 450, true);
    await db.doc("instructors/p").set(REJECTED);
    const real = db.runTransaction.bind(db);
    let calls = 0;
    vi.spyOn(db, "runTransaction").mockImplementation((async (update: never, options: never) => {
      const result = await real(update, options);
      if (++calls === 1) await db.doc("instructors/p").set(APPROVED);
      return result;
    }) as typeof db.runTransaction);
    await sync.syncCourseEligibility(event());
    // Chunk one unlisted 400 lessons under the suspension; chunk two saw the reinstatement and left everything as is.
    expect(calls).toBe(2);
    expect(await unlisted("long")).toBe(400);
    expect((await course("long")).listingSyncPending).toBe(true);
    vi.restoreAllMocks();
    // The reinstatement's own event finds the pending marker (the flag alone looks settled) and repeats the pass.
    await sync.syncCourseEligibility(event());
    expect(await unlisted("long")).toBe(0);
    expect(await flag("long")).toBe(true);
    expect(await course("long")).not.toHaveProperty("listingSyncPending");
  });

  it("keeps going past a deleted course", async () => {
    await seedCourse("gone", "p", "published", true, 2, true);
    await seedCourse("kept", "p", "published", true, 2, true);
    await db.doc("instructors/p").set(REJECTED);
    const real = db.runTransaction.bind(db);
    let first = true;
    vi.spyOn(db, "runTransaction").mockImplementation((async (update: never, options: never) => {
      if (first) { first = false; await db.recursiveDelete(db.doc("courses/gone")); }
      return real(update, options);
    }) as typeof db.runTransaction);
    await sync.syncCourseEligibility(event());
    expect((await db.doc("courses/gone").get()).exists).toBe(false);
    expect(await listedOf("kept")).toEqual([false, false]);
  });
});
