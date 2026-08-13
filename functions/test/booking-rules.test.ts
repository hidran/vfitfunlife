/**
 * Firestore rules for bookings.
 *
 * Requires the emulator: `firebase emulators:start --only firestore`
 *
 * These assert the deny-by-default posture from P0-1 §10 — every transition runs through a
 * callable using the Admin SDK, so no client may write status, amounts, or the payment
 * confirmation.
 */

import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';

let testEnv: RulesTestEnvironment;

// Each test uses its own uids: authenticatedContext() caches an app per uid, and reusing
// one across tests re-triggers Firestore settings on an already-started instance.
let n = 0;
interface Fixture { client: string; trainer: string; outsider: string; booking: string }

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    // Per-file project id: the emulator namespaces data by project, and every rules
    // file calls clearFirestore() in beforeEach. Sharing one id let a file wipe
    // another's seed data mid-test whenever vitest ran them in parallel.
    projectId: 'demo-vfit-booking-rules',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => { await testEnv.cleanup(); });

beforeEach(async () => { await testEnv.clearFirestore(); });

/** Seeded per test rather than in beforeEach — see test/profile-rules.test.ts. */
async function seed(): Promise<Fixture> {
  n += 1;
  const f: Fixture = {
    client: `client-${n}`, trainer: `trainer-${n}`,
    outsider: `outsider-${n}`, booking: `booking-${n}`,
  };
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    // ctx.firestore() must be called ONCE per context: each call re-applies settings to an
    // already-started Firestore instance and throws failed-precondition.
    const adminDb = ctx.firestore();
    await adminDb.collection('users').doc(f.client).set({ uid: f.client, role: 'customer' });
    await adminDb.collection('users').doc(f.trainer).set({ uid: f.trainer, role: 'provider' });
    await adminDb.collection('bookings').doc(f.booking).set({
      userId: f.client,
      instructorId: f.trainer,
      status: 'requested',
      statusHistory: [],
      finalPrice: 45,
      paymentStatus: 'pending',
      userNotes: null,
    });
  });
  return f;
}

describe('bookings — create', () => {
  it('denies a client creating a booking directly (it must go through the callable)', async () => {
    const f = await seed();
    const ctx = testEnv.authenticatedContext(f.client);
    await assertFails(
      ctx.firestore().collection('bookings').doc(`new-${f.booking}`).set({
        userId: f.client, instructorId: f.trainer, status: 'requested', finalPrice: 45,
      })
    );
  });

  it('denies the zero-price booking the old allowlist permitted', async () => {
    const f = await seed();
    const ctx = testEnv.authenticatedContext(f.client);
    await assertFails(
      ctx.firestore().collection('bookings').doc(`new2-${f.booking}`).set({
        userId: f.client, instructorId: f.trainer, status: 'requested', finalPrice: 0,
      })
    );
  });
});

describe('bookings — client update', () => {
  it('allows the owner to update their own notes', async () => {
    const f = await seed();
    const ctx = testEnv.authenticatedContext(f.client);
    await assertSucceeds(
      ctx.firestore().collection('bookings').doc(f.booking).update({
        userNotes: 'Please bring resistance bands',
        updatedAt: new Date(),
      })
    );
  });

  it('denies the client writing status', async () => {
    const f = await seed();
    const ctx = testEnv.authenticatedContext(f.client);
    await assertFails(
      ctx.firestore().collection('bookings').doc(f.booking).update({ status: 'accepted' })
    );
  });

  it('denies the client writing the price', async () => {
    const f = await seed();
    const ctx = testEnv.authenticatedContext(f.client);
    await assertFails(
      ctx.firestore().collection('bookings').doc(f.booking).update({ finalPrice: 0 })
    );
  });

  it('denies the client self-confirming a payment', async () => {
    const f = await seed();
    const ctx = testEnv.authenticatedContext(f.client);
    await assertFails(
      ctx.firestore().collection('bookings').doc(f.booking).update({
        paymentConfirmation: { method: 'cash', amount: 45, clientResponse: 'confirmed' },
      })
    );
  });

  it('denies the client appending to statusHistory', async () => {
    const f = await seed();
    const ctx = testEnv.authenticatedContext(f.client);
    await assertFails(
      ctx.firestore().collection('bookings').doc(f.booking).update({
        statusHistory: [{ status: 'completed', actorUid: f.client, actorRole: 'client' }],
      })
    );
  });
});

describe('bookings — trainer update', () => {
  it('denies the assigned trainer writing status directly', async () => {
    const f = await seed();
    const ctx = testEnv.authenticatedContext(f.trainer);
    await assertFails(
      ctx.firestore().collection('bookings').doc(f.booking).update({ status: 'accepted' })
    );
  });

  it('denies the trainer self-confirming a payment for an arbitrary amount', async () => {
    const f = await seed();
    const ctx = testEnv.authenticatedContext(f.trainer);
    await assertFails(
      ctx.firestore().collection('bookings').doc(f.booking).update({
        status: 'payment_confirmed',
        paymentConfirmation: { method: 'cash', amount: 9999 },
      })
    );
  });

  it('denies the trainer writing internal notes directly', async () => {
    const f = await seed();
    const ctx = testEnv.authenticatedContext(f.trainer);
    await assertFails(
      ctx.firestore().collection('bookings').doc(f.booking).update({ internalNotes: 'x' })
    );
  });
});

describe('bookings — read access', () => {
  it('allows the owner to read', async () => {
    const f = await seed();
    const ctx = testEnv.authenticatedContext(f.client);
    await assertSucceeds(ctx.firestore().collection('bookings').doc(f.booking).get());
  });

  it('allows the assigned trainer to read', async () => {
    const f = await seed();
    const ctx = testEnv.authenticatedContext(f.trainer);
    await assertSucceeds(ctx.firestore().collection('bookings').doc(f.booking).get());
  });

  it('denies an unrelated user', async () => {
    const f = await seed();
    const ctx = testEnv.authenticatedContext(f.outsider);
    await assertFails(ctx.firestore().collection('bookings').doc(f.booking).get());
  });

  it('denies an unauthenticated reader', async () => {
    const f = await seed();
    const ctx = testEnv.unauthenticatedContext();
    await assertFails(ctx.firestore().collection('bookings').doc(f.booking).get());
  });
});

describe('bookings — delete', () => {
  it('denies a client deleting their own booking', async () => {
    const f = await seed();
    const ctx = testEnv.authenticatedContext(f.client);
    await assertFails(ctx.firestore().collection('bookings').doc(f.booking).delete());
  });

  it('denies the assigned trainer deleting', async () => {
    const f = await seed();
    const ctx = testEnv.authenticatedContext(f.trainer);
    await assertFails(ctx.firestore().collection('bookings').doc(f.booking).delete());
  });
});
