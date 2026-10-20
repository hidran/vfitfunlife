import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { testProjectId } from '../src/courses/testProject';

// Rules for venue-linked courses (unified courses plan, Group F). Every query below must be provable from its own
// constraints, so each allowed query has a sibling that drops one constraint and must fail.
let env: RulesTestEnvironment;
const as = (uid: string) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const MANAGERS = ['owner', 'staff', 'admin'];
const OUTSIDERS = ['inactive', 'otherStaff', 'stranger'];

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: testProjectId('demo-vfit-unified-rules'), firestore: {
    rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await db.doc('users/admin').set({ role: 'admin', isActive: true });
    await db.doc('venues/v').set({ type: 'gym', isActive: true, ownerId: 'owner', partnerStatus: 'active' });
    await db.doc('venues/w').set({ type: 'gym', isActive: true, ownerId: 'owner2', partnerStatus: 'active' });
    await db.doc('venueStaff/staff').set({ venueId: 'v', isActive: true });
    await db.doc('venueStaff/inactive').set({ venueId: 'v', isActive: false });
    await db.doc('venueStaff/otherStaff').set({ venueId: 'w', isActive: true });
    await db.doc('venues/v/staff/anyone').set({ name: 'legacy' });
    // Venue-linked published and draft courses, plus an unlinked legacy course of the same provider.
    await db.doc('courses/c').set({ providerId: 'p', venueId: 'v', state: 'published', providerEligible: true });
    await db.doc('courses/d').set({ providerId: 'p', venueId: 'v', state: 'draft', providerEligible: true });
    await db.doc('courses/legacy').set({ providerId: 'p', state: 'draft', providerEligible: true });
    for (const course of ['c', 'd', 'legacy']) {
      await db.doc(`courses/${course}/sessions/s`).set({ occupied: 1, state: 'scheduled' });
      await db.doc(`courses/${course}/sessions/s/participants/u`).set({ userId: 'u' });
      await db.doc(`courses/${course}/customers/u`).set({ userId: 'u' });
    }
    await db.doc('courseEnrollments/e').set({ userId: 'u', providerId: 'p', venueId: 'v', courseId: 'c' });
    await db.doc('courseEnrollments/e2').set({ userId: 'u2', providerId: 'p', venueId: 'v', courseId: 'd' });
    await db.doc('courseEnrollments/old').set({ userId: 'u', providerId: 'p', courseId: 'legacy' });
    await db.doc('courseRefunds/r').set({ userId: 'u', providerId: 'p', venueId: 'v', courseId: 'c', enrollmentId: 'e' });
    await db.doc('courseRefunds/oldRefund').set({ userId: 'u', providerId: 'p', enrollmentId: 'old' });
    await db.doc('courseScheduleLocks/x').set({ slots: {} });
    await db.doc('courseSweepState/waitlist').set({ cursor: 'a' });
  });
});
afterAll(async () => { await env?.cleanup(); });

describe('venue managers read their courses, rosters and refunds', () => {
  it('lets the owner, active staff and admin read a draft course and its roster, and nobody else', async () => {
    for (const uid of MANAGERS) {
      await assertSucceeds(as(uid).doc('courses/d').get());
      await assertSucceeds(as(uid).doc('courses/d/sessions/s').get());
      await assertSucceeds(as(uid).collection('courses/d/sessions/s/participants').get());
      await assertSucceeds(as(uid).doc('courses/d/customers/u').get());
      await assertSucceeds(as(uid).collection('courses/d/customers').get());
    }
    for (const uid of OUTSIDERS) {
      await assertFails(as(uid).doc('courses/d').get());
      await assertFails(as(uid).doc('courses/d/sessions/s').get());
      await assertFails(as(uid).collection('courses/d/sessions/s/participants').get());
      await assertFails(as(uid).doc('courses/d/customers/u').get());
    }
    await assertFails(anon().doc('courses/d').get());
    await assertSucceeds(as('p').doc('courses/d').get());
    // A customer who booked keeps reading the course, whatever its state.
    await assertSucceeds(as('u').doc('courses/d').get());
  });

  it('lists a venue\'s courses (drafts included) only with the venueId constraint', async () => {
    for (const uid of MANAGERS) {
      const result = await assertSucceeds(as(uid).collection('courses').where('venueId', '==', 'v').get());
      expect(result.docs.map(d => d.id).sort()).toEqual(['c', 'd']);
    }
    for (const uid of OUTSIDERS) await assertFails(as(uid).collection('courses').where('venueId', '==', 'v').get());
    // The constraint names the venue the viewer manages: another venue's id is not provable.
    await assertFails(as('staff').collection('courses').where('venueId', '==', 'w').get());
    await assertFails(as('staff').collection('courses').get());
    await assertFails(as('owner').collection('courses').where('state', '==', 'draft').get());
  });

  it('lists published venue courses publicly only with state and providerEligible (R17)', async () => {
    const q = () => anon().collection('courses').where('venueId', '==', 'v').where('state', '==', 'published');
    const result = await assertSucceeds(q().where('providerEligible', '==', true).get());
    expect(result.docs.map(d => d.id)).toEqual(['c']);
    await assertFails(q().get());
    await assertFails(anon().collection('courses').where('venueId', '==', 'v').get());
  });

  it('opens courseEnrollments and courseRefunds by venueId to managers, and only with that constraint', async () => {
    for (const col of ['courseEnrollments', 'courseRefunds']) {
      for (const uid of MANAGERS) {
        const result = await assertSucceeds(as(uid).collection(col).where('venueId', '==', 'v').get());
        expect(result.size).toBeGreaterThan(0);
      }
      for (const uid of [...OUTSIDERS, 'u']) await assertFails(as(uid).collection(col).where('venueId', '==', 'v').get());
      await assertFails(as('anyone').collection(col).where('venueId', '==', 'v').get());
      await assertFails(anon().collection(col).where('venueId', '==', 'v').get());
      // Without the venueId constraint nothing proves the venue, so even the owner and staff are refused.
      await assertFails(as('owner').collection(col).get());
      await assertFails(as('staff').collection(col).get());
      await assertFails(as('staff').collection(col).where('venueId', '==', 'w').get());
    }
    await assertSucceeds(as('owner').doc('courseEnrollments/e2').get());
    await assertSucceeds(as('staff').doc('courseRefunds/r').get());
    await assertFails(as('inactive').doc('courseEnrollments/e2').get());
    await assertFails(as('otherStaff').doc('courseRefunds/r').get());
  });

  it('keeps the customer and provider queries working', async () => {
    await assertSucceeds(as('u').collection('courseEnrollments').where('userId', '==', 'u').get());
    await assertSucceeds(as('p').collection('courseEnrollments').where('providerId', '==', 'p').get());
    await assertSucceeds(as('u').collection('courseRefunds').where('userId', '==', 'u').get());
    await assertSucceeds(as('p').collection('courseRefunds').where('providerId', '==', 'p').get());
    await assertFails(as('u').collection('courseEnrollments').where('userId', '==', 'u2').get());
    await assertSucceeds(as('admin').doc('courseRefunds/r').get());
  });

  it('keeps an unlinked (legacy) course visible to its provider but not to venue staff', async () => {
    await assertSucceeds(as('p').doc('courses/legacy').get());
    await assertSucceeds(as('p').doc('courses/legacy/sessions/s/participants/u').get());
    await assertSucceeds(as('admin').doc('courses/legacy').get());
    for (const uid of ['owner', 'staff']) {
      await assertFails(as(uid).doc('courses/legacy').get());
      await assertFails(as(uid).doc('courses/legacy/sessions/s').get());
      await assertFails(as(uid).collection('courses/legacy/sessions/s/participants').get());
      await assertFails(as(uid).doc('courses/legacy/customers/u').get());
      await assertFails(as(uid).doc('courseEnrollments/old').get());
      await assertFails(as(uid).doc('courseRefunds/oldRefund').get());
    }
    // The legacy rows fall back to providerId and userId.
    await assertSucceeds(as('p').doc('courseEnrollments/old').get());
    await assertSucceeds(as('u').doc('courseRefunds/oldRefund').get());
  });

  it('denies every client write to the course collections, managers and admin included', async () => {
    for (const uid of [...MANAGERS, 'p', 'u', 'stranger']) {
      const db = as(uid);
      await assertFails(db.doc('courses/c').update({ name: 'x' }));
      await assertFails(db.doc('courses/new').set({ providerId: uid, venueId: 'v' }));
      await assertFails(db.doc('courses/c/sessions/s').update({ occupied: 99 }));
      await assertFails(db.doc('courses/c/sessions/new').set({ state: 'scheduled' }));
      await assertFails(db.doc('courses/c/sessions/s/participants/u').delete());
      await assertFails(db.doc('courses/c/sessions/s/participants/x').set({ userId: 'x' }));
      await assertFails(db.doc('courses/c/customers/u').update({ noShows: 0 }));
      await assertFails(db.doc('courseEnrollments/e').update({ paymentStatus: 'paid' }));
      await assertFails(db.doc('courseEnrollments/new').set({ userId: uid, venueId: 'v' }));
      await assertFails(db.doc('courseRefunds/r').update({ state: 'refunded' }));
      await assertFails(db.doc('courseRefunds/new').set({ userId: uid, venueId: 'v' }));
    }
  });

  it('keeps courseScheduleLocks and courseSweepState closed to everyone, admin included', async () => {
    for (const uid of [...MANAGERS, 'p', 'stranger']) {
      for (const path of ['courseScheduleLocks/x', 'courseSweepState/waitlist']) {
        await assertFails(as(uid).doc(path).get());
        await assertFails(as(uid).doc(path).set({ slots: {} }));
        await assertFails(as(uid).doc(path).delete());
      }
      await assertFails(as(uid).collection('courseScheduleLocks').get());
    }
    await assertFails(anon().doc('courseScheduleLocks/x').get());
  });

  it('has no venues/{v}/staff rule any more (U4)', async () => {
    for (const uid of ['staff', 'admin', 'owner']) {
      await assertFails(as(uid).doc('venues/v/staff/anyone').get());
      await assertFails(as(uid).doc('venues/v/staff/anyone').set({ name: 'x' }));
      await assertFails(as(uid).doc('venues/v/staff/new').set({ name: 'x' }));
    }
  });
});
