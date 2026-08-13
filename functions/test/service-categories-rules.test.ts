/**
 * Firestore rules for serviceCategories.
 *
 * Requires the emulator: `firebase emulators:start --only firestore`
 *
 * The catalogue is read by signed-out visitors (the booking chips render before login) and
 * written only by admins. These pin both halves, because a publicly writable taxonomy
 * would let anyone reclassify every provider on the platform.
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

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    // Per-file project id: every rules file calls clearFirestore() in beforeEach, and a
    // shared id let one file wipe another's seed data under vitest's parallel execution.
    projectId: 'demo-vfit-categories-rules',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => { await testEnv.cleanup(); });
beforeEach(async () => { await testEnv.clearFirestore(); });

const CATEGORY = {
  parentId: 'combat',
  names: { it: 'Boxe', en: 'Boxing', es: 'Boxeo', fr: 'Boxe', de: 'Boxen' },
  icon: '🥊',
  sections: ['fit'],
  order: 31,
  isActive: true,
};

async function seedUser(uid: string, role: string) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('users').doc(uid).set({ uid, role });
  });
}

async function seedCategory() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc('serviceCategories/boxing').set(CATEGORY);
  });
}

describe('serviceCategories', () => {
  it('is readable signed-out — the booking chips render before login', async () => {
    await seedCategory();
    await assertSucceeds(
      testEnv.unauthenticatedContext().firestore().doc('serviceCategories/boxing').get()
    );
  });

  it('is readable by a customer', async () => {
    await seedCategory();
    await seedUser('cust-1', 'customer');
    await assertSucceeds(
      testEnv.authenticatedContext('cust-1').firestore().doc('serviceCategories/boxing').get()
    );
  });

  it('lets an admin create and update', async () => {
    await seedUser('admin-1', 'admin');
    const fs2 = testEnv.authenticatedContext('admin-1').firestore();
    await assertSucceeds(fs2.doc('serviceCategories/boxing').set(CATEGORY));
    await assertSucceeds(fs2.doc('serviceCategories/boxing').update({ isActive: false }));
  });

  it('refuses a customer write — otherwise anyone could reclassify every provider', async () => {
    await seedCategory();
    await seedUser('cust-2', 'customer');
    await assertFails(
      testEnv.authenticatedContext('cust-2').firestore()
        .doc('serviceCategories/boxing').update({ isActive: false })
    );
  });

  it('refuses a provider write', async () => {
    await seedCategory();
    await seedUser('prov-1', 'provider');
    await assertFails(
      testEnv.authenticatedContext('prov-1').firestore()
        .doc('serviceCategories/boxing').update({ names: { it: 'Pugilato' } })
    );
  });

  it('refuses a signed-out write', async () => {
    await seedCategory();
    await assertFails(
      testEnv.unauthenticatedContext().firestore()
        .doc('serviceCategories/new-one').set(CATEGORY)
    );
  });
});
