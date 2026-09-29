/**
 * Firestore rules for stagingAllowlist/{emailLowercase}.
 *
 * Requires the emulator: `firebase emulators:start --only firestore`
 *
 * Superadmins manage the list; any other signed-in user may `get` exactly their own entry
 * (the client gate on staging reads it to decide whether to sign them out) and nothing else.
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
    // Per-file project id: see platform-settings-rules.test.ts.
    projectId: 'demo-vfit-staging-allowlist-rules',
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

async function seedEntry(email: string) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('stagingAllowlist').doc(email).set({
      email, addedBy: 'seed', addedAt: new Date(),
    });
  });
}

const ENTRY = { email: 'new@vfit.test', note: 'QA', addedBy: 'su', addedAt: new Date() };

describe('stagingAllowlist', () => {
  it('superadmin can list, create, update and delete entries', async () => {
    await seedUser('su-1', 'superadmin');
    await seedEntry('someone@vfit.test');
    const db = testEnv.authenticatedContext('su-1', { email: 'su-1@vfit.test' }).firestore();
    await assertSucceeds(db.collection('stagingAllowlist').get());
    await assertSucceeds(db.doc('stagingAllowlist/new@vfit.test').set(ENTRY));
    await assertSucceeds(db.doc('stagingAllowlist/new@vfit.test').update({ note: 'changed' }));
    await assertSucceeds(db.doc('stagingAllowlist/someone@vfit.test').delete());
  });

  it('a user can get their own entry, matched on the lowercased token email', async () => {
    await seedUser('cust-1', 'customer');
    await seedEntry('mixed.case@vfit.test');
    const db = testEnv.authenticatedContext('cust-1', { email: 'Mixed.Case@VFit.test' }).firestore();
    await assertSucceeds(db.doc('stagingAllowlist/mixed.case@vfit.test').get());
  });

  it('a user can get their own id even when no entry exists (so the gate can see "not allowed")', async () => {
    await seedUser('cust-2', 'customer');
    const db = testEnv.authenticatedContext('cust-2', { email: 'absent@vfit.test' }).firestore();
    await assertSucceeds(db.doc('stagingAllowlist/absent@vfit.test').get());
  });

  it("a user cannot get someone else's entry", async () => {
    await seedUser('cust-3', 'customer');
    await seedEntry('other@vfit.test');
    const db = testEnv.authenticatedContext('cust-3', { email: 'cust-3@vfit.test' }).firestore();
    await assertFails(db.doc('stagingAllowlist/other@vfit.test').get());
  });

  it('a non-superadmin cannot list the collection', async () => {
    await seedUser('admin-1', 'admin');
    await seedEntry('admin-1@vfit.test');
    const db = testEnv.authenticatedContext('admin-1', { email: 'admin-1@vfit.test' }).firestore();
    await assertFails(db.collection('stagingAllowlist').get());
  });

  it('an admin cannot add themselves or anyone else', async () => {
    await seedUser('admin-2', 'admin');
    const db = testEnv.authenticatedContext('admin-2', { email: 'admin-2@vfit.test' }).firestore();
    await assertFails(db.doc('stagingAllowlist/admin-2@vfit.test').set({ ...ENTRY, email: 'admin-2@vfit.test' }));
    await assertFails(db.doc('stagingAllowlist/new@vfit.test').set(ENTRY));
  });

  it('a user cannot modify or delete their own entry', async () => {
    await seedUser('cust-4', 'customer');
    await seedEntry('cust-4@vfit.test');
    const db = testEnv.authenticatedContext('cust-4', { email: 'cust-4@vfit.test' }).firestore();
    await assertFails(db.doc('stagingAllowlist/cust-4@vfit.test').update({ note: 'mine' }));
    await assertFails(db.doc('stagingAllowlist/cust-4@vfit.test').delete());
  });

  it('a token without an email (e.g. phone auth) cannot read anything', async () => {
    await seedUser('phone-1', 'customer');
    await seedEntry('phone-1@vfit.test');
    const db = testEnv.authenticatedContext('phone-1').firestore();
    await assertFails(db.doc('stagingAllowlist/phone-1@vfit.test').get());
  });

  it('a signed-out visitor cannot read', async () => {
    await seedEntry('anyone@vfit.test');
    await assertFails(
      testEnv.unauthenticatedContext().firestore().doc('stagingAllowlist/anyone@vfit.test').get()
    );
  });
});
