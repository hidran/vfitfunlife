import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import type { EnrollInput } from "./enrollTx";

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";

let db: admin.firestore.Firestore;
let enrollInTx: typeof import("./enrollTx").enrollInTx;
const day = "2099-10-12";

const input = (uid: string, over: Partial<EnrollInput> = {}): EnrollInput => ({
  actor: uid, uid, courseId: "c1", scope: "lesson", sessionId: day, paymentMode: "direct", requestId: `r-${uid}`,
  byProvider: false, checkoutOn: false, ...over,
});
async function book(i: EnrollInput, doCommit = true) {
  return db.runTransaction(async (tx) => {
    const { result, commit } = await enrollInTx(tx, i);
    if (doCommit) commit();
    return result;
  });
}
const session = async () => (await db.doc(`courses/c1/sessions/${day}`).get()).data()!;

beforeAll(async () => {
  for (const app of admin.apps) if (app) await app.delete();
  admin.initializeApp({ projectId: "demo-vfit-enroll-tx" });
  db = admin.firestore();
  ({ enrollInTx } = await import("./enrollTx"));
});
beforeEach(async () => {
  for (const name of ["courses", "courseEnrollments", "courseNotifications", "clients", "users", "instructors"]) {
    await db.recursiveDelete(db.collection(name));
  }
  await db.doc("instructors/p").set({ fullName: "Anna", isActive: true, applicationStatus: "approved", providerProfile: { isVerified: true } });
  for (const uid of ["u", "v"]) await db.doc(`users/${uid}`).set({ fullName: uid, role: "customer", isActive: true });
  const start = new Date(`${day}T16:00:00Z`);
  await db.doc("courses/c1").set({
    name: "Karate", providerId: "p", providerName: "Anna", state: "published", enrollmentClosed: false, capacity: 1,
    bookingNoticeHours: 0, cancellationHours: 24, timezone: "Europe/Rome", lessonPriceCents: 1500,
    seriesPriceCents: 4000, sessionIds: [day], nextSessionId: day, nextAvailableSeats: 1,
    firstStartsAt: Timestamp.fromDate(start), nextStartsAt: Timestamp.fromDate(start),
  });
  await db.doc(`courses/c1/sessions/${day}`).set({
    startsAt: Timestamp.fromDate(start), endsAt: Timestamp.fromDate(new Date(`${day}T17:00:00Z`)), capacity: 1,
    occupied: 0, held: 0, state: "scheduled", location: "Torino", instructor: "Anna",
  });
});

describe("enrollInTx", () => {
  it("seats the first customer on commit and refuses the second with lesson_full", async () => {
    const first = await book(input("u"));
    expect(first).toMatchObject({ state: "confirmed", totalCents: 1500, replay: false });
    expect(await session()).toMatchObject({ occupied: 1, held: 0 });
    expect((await db.doc("courses/c1").get()).data()!.nextAvailableSeats).toBe(0);
    expect((await db.doc(`courses/c1/sessions/${day}/participants/u`).get()).exists).toBe(true);
    expect((await db.doc(`courseEnrollments/${first.enrollmentId}`).get()).data()).toMatchObject({ userId: "u", state: "confirmed" });
    await expect(book(input("v"))).rejects.toThrow("lesson_full");
    expect(await session()).toMatchObject({ occupied: 1 });
  });

  it("writes nothing when commit() is not called", async () => {
    const result = await book(input("u"), false);
    expect(result.replay).toBe(false);
    expect(await session()).toMatchObject({ occupied: 0, held: 0 });
    expect((await db.doc(`courseEnrollments/${result.enrollmentId}`).get()).exists).toBe(false);
    expect((await db.collection("courseNotifications").get()).empty).toBe(true);
    expect((await db.doc("courses/c1").get()).data()!.nextAvailableSeats).toBe(1);
  });

  it("returns the stored enrollment as a replay without writing again", async () => {
    const first = await book(input("u"));
    const again = await book(input("u"));
    expect(again).toEqual({ ...first, replay: true });
    expect(await session()).toMatchObject({ occupied: 1 });
    await expect(book(input("u", { scope: "series" }))).rejects.toThrow("request_id_reused");
  });

  it("counts held seats for stripe bookings", async () => {
    await book(input("u", { paymentMode: "stripe", checkoutOn: true }));
    expect(await session()).toMatchObject({ occupied: 0, held: 1 });
  });

  it("lets a customer into a nominally full lesson when the seat is released in the same transaction", async () => {
    await book(input("u"));
    const released = { [day]: { occupied: 1, held: 0 } };
    const result = await book(input("v", { released }));
    expect(result.state).toBe("confirmed");
    // The offset is only a capacity allowance: the releasing writer owns the matching decrement.
    expect(await session()).toMatchObject({ occupied: 2 });
  });
});
