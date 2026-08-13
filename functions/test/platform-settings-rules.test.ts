/**
 * Firestore rules for platform/settings.
 *
 * Requires the emulator: `firebase emulators:start --only firestore`
 *
 * This document had NO rule at all, so deny-by-default meant /admin/settings could neither
 * load nor save — a settings screen wired to a document nobody could touch. These pin the
 * replacement: readable by any admin (commission and currency describe how the platform
 * bills, and /admin surfaces them), writable only by a superadmin, because changing them
 * is a financial act.
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
    // Per-file project id: the emulator namespaces data by project, and every rules
    // file calls clearFirestore() in beforeEach. Sharing one id let a file wipe
    // another's seed data mid-test whenever vitest ran them in parallel.
    projectId: 'demo-vfit-platform-rules',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => { await testEnv.cleanup(); });

beforeEach(async () => { await testEnv.clearFirestore(); });

async function seedUser(uid: string, role: string) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('users').doc(uid).set({ uid, role, email: `${uid}@vfit.test` });
  });
}

const SETTINGS = { platformName: 'VFit', commissionPercentage: 15, currency: 'EUR' };

describe('platform/settings', () => {
  it('superadmin can create it when it does not exist yet', async () => {
    // The live document genuinely did not exist, so the first save is a create, not an
    // update — which is why the client had to move from updateDoc to setDoc/merge.
    await seedUser('su-1', 'superadmin');
    await assertSucceeds(
      testEnv.authenticatedContext('su-1').firestore()
        .doc('platform/settings').set(SETTINGS)
    );
  });

  it('superadmin can update it', async () => {
    await seedUser('su-2', 'superadmin');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('platform/settings').set(SETTINGS);
    });
    await assertSucceeds(
      testEnv.authenticatedContext('su-2').firestore()
        .doc('platform/settings').update({ commissionPercentage: 20 })
    );
  });

  it('admin can read it', async () => {
    await seedUser('admin-1', 'admin');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('platform/settings').set(SETTINGS);
    });
    await assertSucceeds(
      testEnv.authenticatedContext('admin-1').firestore().doc('platform/settings').get()
    );
  });

  it('admin cannot write it — commission is a financial setting', async () => {
    await seedUser('admin-2', 'admin');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('platform/settings').set(SETTINGS);
    });
    await assertFails(
      testEnv.authenticatedContext('admin-2').firestore()
        .doc('platform/settings').update({ commissionPercentage: 0 })
    );
  });

  it('a provider can neither read nor write it', async () => {
    await seedUser('prov-1', 'provider');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('platform/settings').set(SETTINGS);
    });
    const fs2 = testEnv.authenticatedContext('prov-1').firestore();
    await assertFails(fs2.doc('platform/settings').get());
    await assertFails(fs2.doc('platform/settings').update({ commissionPercentage: 0 }));
  });

  it('a signed-out visitor cannot read it', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('platform/settings').set(SETTINGS);
    });
    await assertFails(
      testEnv.unauthenticatedContext().firestore().doc('platform/settings').get()
    );
  });
});
