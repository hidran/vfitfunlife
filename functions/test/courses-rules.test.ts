import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-vfit-courses-rules', firestore: {
    rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await db.doc('courses/pub').set({ state: 'published', providerEligible: true, providerId: 'p' });
    await db.doc('courses/draft').set({ state: 'draft', providerId: 'p' });
    await db.doc('courses/pub/sessions/s').set({ occupied: 1 });
    await db.doc('courses/pub/sessions/s/participants/u').set({ userId: 'u' });
    await db.doc('courseEnrollments/e').set({ userId: 'u', providerId: 'p' });
    await db.doc('users/admin').set({ role: 'admin', isActive: true });
    await db.doc('clients/p_u').set({ providerId: 'p', userId: 'u', name: 'Participant' });
  });
});
afterAll(async () => { await env?.cleanup(); });
describe('course privacy and authority', () => {
  it('protects relationship identities and isolates each provider/user pair', async () => {
    const owner = env.authenticatedContext('p').firestore().doc('clients/p_u');
    await assertSucceeds(owner.update({ name: 'Updated contact' }));
    await assertFails(owner.update({ userId: 'v' }));
    await assertFails(env.authenticatedContext('v').firestore().doc('clients/p_u').update({ providerId: 'v' }));
    await assertFails(env.authenticatedContext('p').firestore().doc('clients/fake').set({ providerId: 'p', userId: 'v' }));
    await assertSucceeds(env.authenticatedContext('u').firestore().doc('clients/p_u').get());
    await assertFails(env.authenticatedContext('stranger').firestore().doc('clients/p_u').get());
  });
  it('exposes only published courses to visitors', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(db.doc('courses/pub').get());
    await assertFails(db.doc('courses/draft').get());
  });
  it('permits course discovery with a published filter', async () => {
    const result = await assertSucceeds(env.unauthenticatedContext().firestore().collection('courses').where('state', '==', 'published').where('providerEligible', '==', true).get());
    expect(result.size).toBe(1);
  });
  it('keeps rosters private and provider-readable', async () => {
    await assertFails(env.unauthenticatedContext().firestore().doc('courses/pub/sessions/s/participants/u').get());
    await assertFails(env.authenticatedContext('stranger').firestore().doc('courses/pub/sessions/s/participants/u').get());
    await assertSucceeds(env.authenticatedContext('p').firestore().collection('courses/pub/sessions/s/participants').get());
  });
  it('scopes enrollment queries to customers/providers', async () => {
    await assertSucceeds(env.authenticatedContext('u').firestore().collection('courseEnrollments').where('userId', '==', 'u').get());
    await assertSucceeds(env.authenticatedContext('p').firestore().collection('courseEnrollments').where('providerId', '==', 'p').get());
    await assertFails(env.authenticatedContext('stranger').firestore().doc('courseEnrollments/e').get());
  });
  it('denies provider and admin client writes to seats and payments', async () => {
    for (const uid of ['p', 'u', 'admin']) {
      const db = env.authenticatedContext(uid).firestore();
      await assertFails(db.doc('courses/pub/sessions/s').update({ occupied: 500 }));
      await assertFails(db.doc('courseEnrollments/e').update({ paymentStatus: 'paid' }));
    }
  });
});
