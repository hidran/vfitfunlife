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

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-vfit-provider-services-rules',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => { await testEnv.cleanup(); });
beforeEach(async () => { await testEnv.clearFirestore(); });

async function seedUser(uid: string, role: string, providerStatus?: string) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('users').doc(uid).set({
      uid,
      role,
      ...(providerStatus ? { providerStatus } : {}),
    });
  });
}

const service = { name: 'Personal training', price: 50, durationMinutes: 60, isActive: true };

describe('instructors/{uid}/services', () => {
  it('allows a provider to add a service even when the legacy instructor uid is missing', async () => {
    const uid = 'provider-1';
    await seedUser(uid, 'provider', 'verified');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('instructors').doc(uid).set({ name: 'Legacy provider' });
    });

    const db = testEnv.authenticatedContext(uid).firestore();
    await assertSucceeds(
      db.collection('instructors').doc(uid).collection('services').doc('service-1').set({
        name: 'Personal training',
        price: 50,
        durationMinutes: 60,
        isActive: true,
      })
    );
  });

  it('does not allow a provider to write another provider’s services', async () => {
    await seedUser('provider-1', 'provider', 'verified');
    await seedUser('provider-2', 'provider', 'verified');

    const db = testEnv.authenticatedContext('provider-1').firestore();
    await assertFails(
      db.collection('instructors').doc('provider-2').collection('services').doc('service-1').set({
        name: 'Unauthorized',
        price: 1,
        durationMinutes: 30,
        isActive: true,
      })
    );
  });

  it('does not allow a pending customer to write services', async () => {
    const uid = 'customer-1';
    await seedUser(uid, 'customer');
    const db = testEnv.authenticatedContext(uid).firestore();

    await assertFails(
      db.collection('instructors').doc(uid).collection('services').doc('service-1').set({
        name: 'Not approved',
        price: 1,
        durationMinutes: 30,
        isActive: true,
      })
    );
  });

  // Anyone can create their own users doc with role 'provider' (firestore.rules users
  // create rule), so role alone must not grant service writes — only a superadmin
  // approval (providerStatus 'verified', which clients cannot self-set) does.
  it.each([
    ['pending', 'pending'],
    ['rejected', 'rejected'],
    ['without a providerStatus', undefined],
  ])('does not allow a role=provider user %s to write services', async (_label, status) => {
    const uid = 'self-made-provider';
    await seedUser(uid, 'provider', status);
    const db = testEnv.authenticatedContext(uid).firestore();

    await assertFails(
      db.collection('instructors').doc(uid).collection('services').doc('service-1').set(service)
    );
  });

  it('does not let a self-registered provider promote itself to verified', async () => {
    const uid = 'self-promoter';
    const db = testEnv.authenticatedContext(uid).firestore();

    await assertSucceeds(
      db.collection('users').doc(uid).set({
        uid,
        email: 'x@example.com',
        fullName: 'Self Promoter',
        role: 'provider',
        providerStatus: 'pending',
      })
    );
    await assertFails(db.collection('users').doc(uid).update({ providerStatus: 'verified' }));
    await assertFails(
      db.collection('instructors').doc(uid).collection('services').doc('service-1').set(service)
    );
  });
});
