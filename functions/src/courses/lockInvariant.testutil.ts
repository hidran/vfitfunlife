import type { Firestore } from "firebase-admin/firestore";
import { expect } from "vitest";
import { lockPaths, slotsOf } from "./locks";

type Window = { start: number; end: number };

/**
 * A lock slot exists iff its course is published and its session is scheduled and has not ended. The stored
 * start/end and the day document of every slot must match what `lockPaths(slotsOf(...))` derives from the sessions,
 * no elapsed slot may linger, and no two slots of one document may overlap.
 */
export async function assertLockInvariant(db: Firestore): Promise<void> {
  const now = new Date();
  const expected: Record<string, Record<string, Window>> = {};
  for (const course of (await db.collection("courses").get()).docs) {
    const data = course.data();
    const sessions = (await course.ref.collection("sessions").get()).docs
      .map((doc) => ({ id: doc.id, data: doc.data() as Parameters<typeof slotsOf>[2][number]["data"] }));
    for (const slot of slotsOf(course.id, { state: data.state, name: data.name }, sessions, now)) {
      for (const path of lockPaths(slot)) {
        (expected[path] ??= {})[slot.id] = { start: slot.startsAt.getTime(), end: slot.endsAt.getTime() };
      }
    }
  }
  const stored: Record<string, Record<string, Window>> = {};
  const stale: string[] = [];
  const overlaps: string[] = [];
  for (const doc of (await db.collection("courseScheduleLocks").get()).docs) {
    const slots = (doc.data().slots ?? {}) as Record<string, Window>;
    stored[doc.ref.path] = Object.fromEntries(
      Object.entries(slots).map(([id, { start, end }]) => [id, { start, end }]));
    const ordered = Object.entries(slots).sort((a, b) => a[1].start - b[1].start);
    for (const [id, slot] of ordered) if (slot.end <= now.getTime()) stale.push(`${doc.ref.path} ${id}`);
    for (let i = 1; i < ordered.length; i++) {
      if (ordered[i][1].start < ordered[i - 1][1].end) {
        overlaps.push(`${doc.ref.path} ${ordered[i - 1][0]} ${ordered[i][0]}`);
      }
    }
  }
  expect(stale, "elapsed lock slots still stored").toEqual([]);
  expect(overlaps, "overlapping lock slots in one document").toEqual([]);
  expect(stored).toEqual(expected);
}
