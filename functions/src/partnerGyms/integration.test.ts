import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as admin from 'firebase-admin';
import type { CallableRequest } from 'firebase-functions/v2/https';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
let db: admin.firestore.Firestore;
let schedule: typeof import('./schedule');
let bookings: typeof import('./bookings');
let spaces: typeof import('../venues/spaces');
const req = (uid: string, data: unknown) => ({ auth: { uid, token: {} }, data }) as CallableRequest;
const input = { venueId: 'gym', locationId: 'main', roomId: 'studio', instructorId: 'coach',
  title: 'Pilates', description: '', startDate: '2099-10-12', startTime: '18:00', endTime: '19:00',
  recurrence: 'none', weekdays: [], capacity: 1, regularPriceCents: 1500,
  cancellationHours: 24, status: 'published', requestId: 'first' };

beforeAll(async () => {
  for (const app of admin.apps) if (app) await app.delete();
  admin.initializeApp({ projectId: 'demo-vfit-partner-gyms' });
  db = admin.firestore();
  schedule = await import('./schedule');
  bookings = await import('./bookings');
  spaces = await import('../venues/spaces');
});

beforeEach(async () => {
  for (const name of ['gymSessions', 'gymBookings', 'gymSeries', 'gymScheduleLocks', 'gymSessionMembers', 'gymNotifications',
    'venues', 'venueStaff', 'users', 'instructors']) await db.recursiveDelete(db.collection(name));
  await db.doc('venues/gym').set({ name: 'Partner Gym', type: 'gym', isActive: true, ownerId: 'owner',
    partnerStatus: 'active', memberDiscountPercent: 10, partnerInstructorExtraPercent: 5 });
  await db.doc('venues/gym/locations/main').set({ name: 'Centro', city: 'Roma', address: 'Via Roma',
    timezone: 'Europe/Rome', isActive: true });
  for (const room of ['studio', 'other']) await db.doc(`venues/gym/locations/main/rooms/${room}`)
    .set({ name: room, isActive: true });
  for (const coach of ['coach', 'coach2']) {
    await db.doc(`instructors/${coach}`).set({ fullName: coach, venueId: 'gym', isActive: true,
      applicationStatus: 'approved', partnerStatus: coach === 'coach' ? 'active' : 'pending',
      providerProfile: { isVerified: true } });
  }
  for (const uid of ['owner', 'staff', 'u', 'v']) await db.doc(`users/${uid}`).set({
    role: uid === 'owner' ? 'provider' : 'customer', isActive: true, fullName: uid });
  await db.doc('venueStaff/staff').set({ venueId: 'gym', isActive: true });
});

async function create(patch: Record<string, unknown> = {}) {
  return (await schedule.saveGymSchedule.run(req('staff', { ...input, ...patch }))).sessionIds[0];
}

describe('partner gym bookings', () => {
  it('publishes idempotently and admits only one customer for the last seat', async () => {
    const sessionId = await create();
    expect((await schedule.saveGymSchedule.run(req('staff', input))).sessionIds).toEqual([sessionId]);
    const price = await bookings.quoteGymBooking.run(req('u', { sessionId }));
    expect(price).toMatchObject({ regularPriceCents: 1500, discountCents: 225,
      finalPriceCents: 1275, availablePlaces: 1 });
    const attempts = await Promise.allSettled(['u', 'v'].map(uid => bookings.bookGymClass.run(req(uid,
      { sessionId, expectedFinalPriceCents: 1275, expectedRevision: 1, requestId: 'first-booking' }))));
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((await db.doc(`gymSessions/${sessionId}`).get()).data()?.booked).toBe(1);
    expect((await db.collection('gymBookings').get()).size).toBe(1);
    const winner = attempts[0].status === 'fulfilled' ? 'u' : 'v';
    const retry = await bookings.bookGymClass.run(req(winner, { sessionId,
      expectedFinalPriceCents: 1275, expectedRevision: 1, requestId: 'first-booking' }));
    expect(retry.state).toBe('confirmed');
    await expect(bookings.bookGymClass.run(req(winner, { sessionId,
      expectedFinalPriceCents: 1275, expectedRevision: 1, requestId: 'different-request' }))).rejects.toThrow('already_booked');
  });

  it('keeps verification and partnership separate and rejects stale reviewed prices', async () => {
    const sessionId = await create({ instructorId: 'coach2' });
    const price = await bookings.quoteGymBooking.run(req('u', { sessionId }));
    expect(price.finalPriceCents).toBe(1350);
    await expect(bookings.bookGymClass.run(req('u', { sessionId, expectedFinalPriceCents: 1500, expectedRevision: 1, requestId: 'stale' })))
      .rejects.toThrow('price_changed_review_again');
    await db.doc('venues/gym').update({ partnerStatus: 'suspended' });
    await expect(bookings.bookGymClass.run(req('u', { sessionId, expectedFinalPriceCents: 1350, expectedRevision: 1, requestId: 'suspended' })))
      .rejects.toThrow('active_partner_gym_required');
  });

  it('prevents room and instructor overlaps and lets staff edit one occurrence', async () => {
    const sessionId = await create();
    await expect(create({ requestId: 'room-conflict', instructorId: 'coach2' })).rejects.toThrow('room_conflict');
    await expect(create({ requestId: 'coach-conflict', roomId: 'other' })).rejects.toThrow('instructor_conflict');
    const other = await create({ requestId: 'allowed', roomId: 'other', instructorId: 'coach2' });
    await schedule.updateGymSession.run(req('staff', { sessionId, requestId: 'edit', title: 'Pilates avanzato',
      description: '', locationId: 'main', roomId: 'studio', instructorId: 'coach',
      startDate: '2099-10-12', startTime: '18:00', endTime: '19:00', capacity: 2,
      regularPriceCents: 0, cancellationHours: 24, status: 'published', reason: '' }));
    expect((await db.doc(`gymSessions/${sessionId}`).get()).data()).toMatchObject({
      title: 'Pilates avanzato', capacity: 2, regularPriceCents: 0 });
    expect((await db.doc(`gymSessions/${other}`).get()).data()?.title).toBe('Pilates');
    await expect(bookings.bookGymClass.run(req('u', { sessionId, expectedFinalPriceCents: 1275,
      expectedRevision: 1, requestId: 'stale-session' }))).rejects.toThrow('session_changed_review_again');
  });

  it('creates weekly occurrences atomically and returns the same IDs on retry', async () => {
    await create();
    const weekday = new Date('2099-10-12T12:00:00Z').getUTCDay();
    const weekly = { ...input, recurrence: 'weekly', weekdays: [weekday], endDate: '2099-10-26',
      requestId: 'weekly', roomId: 'other', instructorId: 'coach2' };
    const first = await schedule.saveGymSchedule.run(req('staff', weekly));
    expect(first.sessionIds).toHaveLength(3);
    expect((await schedule.saveGymSchedule.run(req('staff', weekly))).sessionIds).toEqual(first.sessionIds);
    await expect(schedule.saveGymSchedule.run(req('staff', { ...weekly, requestId: 'conflict',
      roomId: 'studio' }))).rejects.toThrow('room_conflict');
    expect((await db.collection('gymSessions').get()).size).toBe(4);
  });

  it('releases a seat once and records direct-payment refund obligations', async () => {
    const sessionId = await create();
    const booked = await bookings.bookGymClass.run(req('u', { sessionId, expectedFinalPriceCents: 1275,
      expectedRevision: 1, requestId: 'first-booking' }));
    await bookings.recordGymPayment.run(req('staff', { bookingId: booked.bookingId, method: 'cash' }));
    await bookings.cancelGymBooking.run(req('u', { bookingId: booked.bookingId }));
    await expect(bookings.cancelGymBooking.run(req('v', { bookingId: booked.bookingId })))
      .rejects.toThrow('gym_staff_required');
    await bookings.cancelGymBooking.run(req('u', { bookingId: booked.bookingId }));
    expect((await db.doc(`gymSessions/${sessionId}`).get()).data()?.booked).toBe(0);
    expect((await db.doc(`gymBookings/${booked.bookingId}`).get()).data()).toMatchObject({
      state: 'cancelled', refundDueCents: 1275 });
    await bookings.confirmGymRefund.run(req('staff', { bookingId: booked.bookingId }));
    expect((await db.doc(`gymBookings/${booked.bookingId}`).get()).data()?.refundDueCents).toBe(0);
    const rebooked = await bookings.bookGymClass.run(req('u', { sessionId,
      expectedFinalPriceCents: 1275, expectedRevision: 1, requestId: 'second-booking' }));
    expect(rebooked.bookingId).not.toBe(booked.bookingId);
    expect((await db.doc(`gymSessions/${sessionId}`).get()).data()?.booked).toBe(1);
  });
});

describe('venue types that host a timetable', () => {
  const asType = (type: string) => db.doc('venues/gym').update({ type });

  it.each(['school', 'studio'])('lets the owner of a %s publish and customers book', async (type) => {
    await asType(type);
    const sessionId = (await schedule.saveGymSchedule.run(req('owner', input))).sessionIds[0];
    const quote = await bookings.quoteGymBooking.run(req('u', { sessionId }));
    expect(quote.availablePlaces).toBe(1);
    const booked = await bookings.bookGymClass.run(req('u', { sessionId,
      expectedFinalPriceCents: quote.finalPriceCents, expectedRevision: 1, requestId: `book-${type}` }));
    expect(booked.state).toBe('confirmed');
  });

  it('lets an admin link a verified instructor to a school', async () => {
    await asType('school');
    await db.doc('users/admin').set({ role: 'admin', isActive: true, fullName: 'admin' });
    await expect(spaces.configureGymInstructor.run(req('admin', { venueId: 'gym', instructorId: 'coach2',
      partnerStatus: 'active', isActive: true }))).resolves.toEqual({ success: true });
    expect((await db.doc('instructors/coach2').get()).data()?.partnerStatus).toBe('active');
  });

  it('still refuses venues that do not host a timetable (spa), for staff and for the admin link', async () => {
    await asType('spa');
    await db.doc('users/admin').set({ role: 'admin', isActive: true, fullName: 'admin' });
    await expect(schedule.saveGymSchedule.run(req('owner', input))).rejects.toThrow('gym_not_found');
    await expect(spaces.configureGymInstructor.run(req('admin', { venueId: 'gym', instructorId: 'coach2',
      partnerStatus: 'active', isActive: true }))).rejects.toThrow('verified_instructor_required');
  });

  it('does not take bookings at an inactive-type venue even if it was once a school', async () => {
    await asType('school');
    const sessionId = (await schedule.saveGymSchedule.run(req('owner', input))).sessionIds[0];
    await asType('spa');
    await expect(bookings.quoteGymBooking.run(req('u', { sessionId }))).rejects.toThrow('active_partner_gym_required');
  });
});
