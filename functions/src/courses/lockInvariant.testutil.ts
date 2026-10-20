import type { Firestore } from "firebase-admin/firestore";
import { expect } from "vitest";
import { lockPaths, slotsOf } from "./locks";

/**
 * A lock slot exists iff its course is published and its session is scheduled (future sessions only).
 * A slot that names no room and no instructor has no lock document, so it is not expected either.
 */
export async function assertLockInvariant(db: Firestore): Promise<void> {
  const now = Date.now();
  const expected = new Set<string>();
  for (const course of (await db.collection("courses").get()).docs) {
    const data = course.data();
    const sessions = (await course.ref.collection("sessions").get()).docs
      .map((doc) => ({ id: doc.id, data: doc.data() as Parameters<typeof slotsOf>[2][number]["data"] }));
    for (const slot of slotsOf(course.id, { state: data.state, name: data.name }, sessions)) {
      if (slot.startsAt.getTime() > now && lockPaths(slot).length) expected.add(slot.id);
    }
  }
  const stored = new Set<string>();
  for (const doc of (await db.collection("courseScheduleLocks").get()).docs) {
    for (const [id, slot] of Object.entries((doc.data().slots ?? {}) as Record<string, { start: number }>)) {
      if (slot.start > now) stored.add(id);
    }
  }
  expect([...stored].sort()).toEqual([...expected].sort());
}
