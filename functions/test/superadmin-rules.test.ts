import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, RulesTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';

// Kept in sync with PROTECTED_SUPERADMIN_UIDS (functions/src/lib/superadmins.ts) and the
// hardcoded list in firestore.rules — the whole point of these tests is that the three
// lists agree.
const HIDRAN = '7MK6TgATIbhl3BkUksLNdGi7cMg1';
const ADMIN_ACCOUNT = 'KTNK3mIMHqg8JNOQiVyKioulORs1';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-vfit-superadmin-rules',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: '127.0.0.1', port: 8080,
    },
  });
});

afterAll(async () => { await testEnv.cleanup(); });

beforeEach(async () => { await testEnv.clearFirestore(); });

/** Seed user docs with rules off. */
async function seed(users: Record<string, Record<string, unknown>>) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    // ctx.firestore() re-applies settings on every call and throws once the instance has
    // been used, so take it exactly once per context.
    const db = ctx.firestore();
    for (const [uid, data] of Object.entries(users)) {
      await db.collection('users').doc(uid).set({ uid, ...data });
    }
  });
}

const superadmins = {
  [HIDRAN]: { role: 'superadmin', email: 'hidran@gmail.com', fullName: 'Hidran' },
  [ADMIN_ACCOUNT]: { role: 'superadmin', email: 'admin@vfit.com', fullName: 'Admin' },
};

describe('a superadmin account is immutable through the app', () => {
  it('an admin cannot change a superadmin role', async () => {
    await seed({ ...superadmins, 'admin-1': { role: 'admin' } });
    const ctx = testEnv.authenticatedContext('admin-1');
    await assertFails(
      ctx.firestore().collection('users').doc(HIDRAN).update({ role: 'customer' })
    );
  });

  it('an admin cannot suspend a superadmin', async () => {
    await seed({ ...superadmins, 'admin-2': { role: 'admin' } });
    const ctx = testEnv.authenticatedContext('admin-2');
    await assertFails(
      ctx.firestore().collection('users').doc(HIDRAN).update({ isSuspended: true })
    );
  });

  it('an admin cannot edit a superadmin ordinary field either', async () => {
    await seed({ ...superadmins, 'admin-3': { role: 'admin' } });
    const ctx = testEnv.authenticatedContext('admin-3');
    await assertFails(
      ctx.firestore().collection('users').doc(HIDRAN).update({ fullName: 'Renamed' })
    );
  });

  it('the other superadmin cannot change a superadmin role', async () => {
    await seed(superadmins);
    const ctx = testEnv.authenticatedContext(ADMIN_ACCOUNT);
    await assertFails(
      ctx.firestore().collection('users').doc(HIDRAN).update({ role: 'admin' })
    );
  });

  it('a superadmin cannot delete the other superadmin', async () => {
    await seed(superadmins);
    const ctx = testEnv.authenticatedContext(ADMIN_ACCOUNT);
    await assertFails(ctx.firestore().collection('users').doc(HIDRAN).delete());
  });

  it('a superadmin cannot delete their own account', async () => {
    await seed(superadmins);
    const ctx = testEnv.authenticatedContext(HIDRAN);
    await assertFails(ctx.firestore().collection('users').doc(HIDRAN).delete());
  });

  it('a superadmin cannot change their own role, permissions or suspension', async () => {
    await seed(superadmins);
    const ctx = testEnv.authenticatedContext(HIDRAN);
    const ref = ctx.firestore().collection('users').doc(HIDRAN);
    await assertFails(ref.update({ role: 'admin' }));
    await assertFails(ref.update({ permissions: ['everything'] }));
    await assertFails(ref.update({ isSuspended: true }));
    await assertFails(ref.update({ isDeleted: true }));
  });

  it('a superadmin can still edit their own ordinary profile fields', async () => {
    await seed(superadmins);
    const ctx = testEnv.authenticatedContext(HIDRAN);
    await assertSucceeds(
      ctx.firestore().collection('users').doc(HIDRAN).update({
        fullName: 'Hidran Arias',
        preferredLanguage: 'it',
      })
    );
  });
});

describe('only the two designated accounts may hold role superadmin', () => {
  it('a superadmin cannot promote another account to superadmin', async () => {
    await seed({ ...superadmins, 'user-1': { role: 'customer' } });
    const ctx = testEnv.authenticatedContext(HIDRAN);
    await assertFails(
      ctx.firestore().collection('users').doc('user-1').update({ role: 'superadmin' })
    );
  });

  it('a superadmin cannot create a new superadmin account', async () => {
    await seed(superadmins);
    const ctx = testEnv.authenticatedContext(HIDRAN);
    await assertFails(
      ctx.firestore().collection('users').doc('new-boss').set({
        uid: 'new-boss', role: 'superadmin', email: 'boss@example.com',
      })
    );
  });

  it('a self-registering user cannot sign themselves up as superadmin', async () => {
    const ctx = testEnv.authenticatedContext('self-1');
    await assertFails(
      ctx.firestore().collection('users').doc('self-1').set({
        uid: 'self-1', role: 'superadmin', email: 'self@example.com',
        createdAt: new Date(), updatedAt: new Date(),
      })
    );
  });

  it('an allowlisted uid may be (re)created with role superadmin by a superadmin', async () => {
    await seed({ [HIDRAN]: superadmins[HIDRAN] });
    const ctx = testEnv.authenticatedContext(HIDRAN);
    await assertSucceeds(
      ctx.firestore().collection('users').doc(ADMIN_ACCOUNT).set({
        uid: ADMIN_ACCOUNT, role: 'superadmin', email: 'admin@vfit.com',
      })
    );
  });
});

describe('ordinary user administration is unchanged', () => {
  it('a superadmin can still promote a user to admin', async () => {
    await seed({ ...superadmins, 'user-2': { role: 'customer' } });
    const ctx = testEnv.authenticatedContext(HIDRAN);
    await assertSucceeds(
      ctx.firestore().collection('users').doc('user-2').update({ role: 'admin' })
    );
  });

  it('a superadmin can still delete an ordinary user', async () => {
    await seed({ ...superadmins, 'user-3': { role: 'customer' } });
    const ctx = testEnv.authenticatedContext(HIDRAN);
    await assertSucceeds(ctx.firestore().collection('users').doc('user-3').delete());
  });

  it('an admin can still suspend an ordinary user', async () => {
    await seed({ 'admin-4': { role: 'admin' }, 'user-4': { role: 'customer' } });
    const ctx = testEnv.authenticatedContext('admin-4');
    await assertSucceeds(
      ctx.firestore().collection('users').doc('user-4').update({ isSuspended: true })
    );
  });

  it('an owner can still update a legacy doc that has no role field', async () => {
    await seed({ 'legacy-1': { email: 'legacy@example.com' } });
    const ctx = testEnv.authenticatedContext('legacy-1');
    await assertSucceeds(
      ctx.firestore().collection('users').doc('legacy-1').update({ fullName: 'Legacy User' })
    );
  });

  it('a superadmin can still delete a legacy doc that has no role field', async () => {
    await seed({ ...superadmins, 'legacy-2': { email: 'legacy2@example.com' } });
    const ctx = testEnv.authenticatedContext(HIDRAN);
    await assertSucceeds(ctx.firestore().collection('users').doc('legacy-2').delete());
  });
});
