import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, RulesTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-vfit-test',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: '127.0.0.1', port: 8080,
    },
  });
});

afterAll(async () => { await testEnv.cleanup(); });

beforeEach(async () => { await testEnv.clearFirestore(); });

describe('users/{uid} self-update — profile fields', () => {
  it('owner can update socialLinks', async () => {
    const uid = 'owner-1';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('users').doc(uid).set({
        uid, role: 'customer', email: 'a@b.c',
      });
    });
    const ctx = testEnv.authenticatedContext(uid);
    await assertSucceeds(
      ctx.firestore().collection('users').doc(uid).update({
        socialLinks: { instagram: 'https://instagram.com/foo' },
      })
    );
  });

  it('owner can update notificationSettings + privacySettings', async () => {
    const uid = 'owner-2';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('users').doc(uid).set({ uid, role: 'customer' });
    });
    const ctx = testEnv.authenticatedContext(uid);
    await assertSucceeds(
      ctx.firestore().collection('users').doc(uid).update({
        notificationSettings: { push: { booking: true, promotion: false, system: true, chat: true } },
        privacySettings: { profileVisibility: 'public', showEmail: false, showPhone: false, allowDirectMessages: true, shareAnalytics: true },
      })
    );
  });

  it('non-owner cannot update', async () => {
    const owner = 'owner-3'; const other = 'other-3';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('users').doc(owner).set({ uid: owner, role: 'customer' });
    });
    const ctx = testEnv.authenticatedContext(other);
    await assertFails(
      ctx.firestore().collection('users').doc(owner).update({
        socialLinks: { instagram: 'https://instagram.com/foo' },
      })
    );
  });

  it('owner cannot update role via this path', async () => {
    const uid = 'owner-4';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('users').doc(uid).set({ uid, role: 'customer' });
    });
    const ctx = testEnv.authenticatedContext(uid);
    await assertFails(
      ctx.firestore().collection('users').doc(uid).update({ role: 'admin' })
    );
  });
});
