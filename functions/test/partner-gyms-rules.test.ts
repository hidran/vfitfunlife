import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds,
  type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-vfit-partner-gyms-rules', firestore: {
    rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await db.doc('venues/gym').set({ type: 'gym', isActive: true, ownerId: 'owner', partnerStatus: 'active' });
    for (const type of ['school', 'studio', 'spa']) {
      await db.doc(`venues/${type}`).set({ type, isActive: true, ownerId: 'owner', partnerStatus: 'active' });
      await db.doc(`gymSessions/${type}`).set({ venueId: type, status: 'published', startsAt: new Date('2099-10-12') });
    }
    await db.doc('venues/gym/locations/main').set({ name: 'Centro', timezone: 'Europe/Rome' });
    await db.doc('venues/gym/locations/main/rooms/studio').set({ name: 'Studio' });
    await db.doc('venueStaff/staff').set({ venueId: 'gym', isActive: true });
    await db.doc('users/admin').set({ role: 'admin', isActive: true });
    await db.doc('gymSessions/published').set({ venueId: 'gym', status: 'published', startsAt: new Date('2099-10-12') });
    await db.doc('gymSessions/draft').set({ venueId: 'gym', status: 'draft', startsAt: new Date('2099-10-12') });
    await db.doc('gymBookings/booking').set({ venueId: 'gym', userId: 'u', paymentStatus: 'pending' });
    await db.doc('instructors/coach').set({ uid: 'coach', providerProfile: { isVerified: true },
      applicationStatus: 'approved', partnerStatus: 'pending' });
  });
});
afterAll(async () => { await env?.cleanup(); });

describe('partner gym security', () => {
  it('shows published sessions at active partners and protects drafts', async () => {
    const publicDb = env.unauthenticatedContext().firestore();
    await assertSucceeds(publicDb.doc('gymSessions/published').get());
    await assertFails(publicDb.doc('gymSessions/draft').get());
    const result = await assertSucceeds(publicDb.collection('gymSessions')
      .where('venueId', '==', 'gym').where('status', '==', 'published').get());
    expect(result.size).toBe(1);
    await assertSucceeds(env.authenticatedContext('staff').firestore().doc('gymSessions/draft').get());
    await env.withSecurityRulesDisabled(async context => context.firestore()
      .doc('venueStaff/inactive').set({ venueId: 'gym', isActive: false }));
    await assertFails(env.authenticatedContext('inactive').firestore().doc('gymSessions/draft').get());
  });

  it('shows published sessions at active school and studio partners, but not at other venue types', async () => {
    const publicDb = env.unauthenticatedContext().firestore();
    await assertSucceeds(publicDb.doc('gymSessions/school').get());
    await assertSucceeds(publicDb.doc('gymSessions/studio').get());
    await assertFails(publicDb.doc('gymSessions/spa').get());
    const result = await assertSucceeds(publicDb.collection('gymSessions')
      .where('venueId', '==', 'school').where('status', '==', 'published').get());
    expect(result.size).toBe(1);
  });

  it('keeps bookings private and all capacity and money writes server-owned', async () => {
    await assertSucceeds(env.authenticatedContext('u').firestore().doc('gymBookings/booking').get());
    await assertSucceeds(env.authenticatedContext('staff').firestore().doc('gymBookings/booking').get());
    await assertFails(env.authenticatedContext('v').firestore().doc('gymBookings/booking').get());
    for (const uid of ['u', 'staff', 'admin']) {
      const db = env.authenticatedContext(uid).firestore();
      await assertFails(db.doc('gymSessions/published').update({ booked: 100 }));
      await assertFails(db.doc('gymBookings/booking').update({ paymentStatus: 'paid' }));
      await assertFails(db.doc('gymScheduleLocks/room_gym_main_studio_2099-10-12').set({ slots: {} }));
      await assertFails(db.doc('gymSessionMembers/private').set({ bookingId: 'booking' }));
    }
  });

  it('keeps instructor partnership separate from provider verification', async () => {
    const coach = env.authenticatedContext('coach').firestore().doc('instructors/coach');
    await assertFails(coach.update({ partnerStatus: 'active' }));
    await assertFails(env.authenticatedContext('rogue').firestore().doc('instructors/rogue').set({
      uid: 'rogue', providerProfile: { isVerified: false }, applicationStatus: 'pending',
      partnerStatus: 'active',
    }));
    await assertSucceeds(env.authenticatedContext('admin').firestore().doc('instructors/coach')
      .update({ partnerStatus: 'active' }));
  });
});
