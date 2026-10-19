import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, RulesTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    // Per-file project id: the emulator namespaces data by project, and every rules
    // file calls clearFirestore() in beforeEach. Sharing one id let a file wipe
    // another's seed data mid-test whenever vitest ran them in parallel.
    projectId: 'demo-vfit-profile-rules',
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
      host: '127.0.0.1', port: 8080,
    },
  });
});

afterAll(async () => { await testEnv.cleanup(); });

beforeEach(async () => { await testEnv.clearFirestore(); });

describe('users/{uid} self-update — profile fields', () => {
  it('owner cannot mark their own email verified', async () => {
    const uid = 'owner-unverified';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection('users').doc(uid).set({
        uid, role: 'customer', email: 'a@b.c', emailVerified: false,
      });
    });
    const ctx = testEnv.authenticatedContext(uid);
    await assertFails(
      ctx.firestore().collection('users').doc(uid).update({ emailVerified: true })
    );
  });

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

/**
 * socialLinks.* (users and instructors): absent/null/'' , an http(s) URL or an @handle, at most
 * 200 characters. Only keys that change are checked, so a doc carrying an older odd value keeps
 * accepting unrelated edits.
 */
describe.each(['users', 'instructors'] as const)('%s/{uid} socialLinks rules', (collection) => {
  const seed = async (uid: string, extra: Record<string, unknown> = {}) => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const base = collection === 'users'
        ? { uid, role: 'customer', email: 'a@b.c' }
        : { uid, applicationStatus: 'pending', providerProfile: { isVerified: false }, bio: 'x' };
      await ctx.firestore().collection(collection).doc(uid).set({ ...base, ...extra });
    });
  };
  const doc = (uid: string) => testEnv.authenticatedContext(uid).firestore().collection(collection).doc(uid);

  it('accepts an https URL, an http URL and an @handle', async () => {
    await seed('s1');
    await assertSucceeds(doc('s1').update({ socialLinks: { website: 'https://example.com/me', instagram: '@anna.verdi' } }));
    await assertSucceeds(doc('s1').update({ 'socialLinks.facebook': 'HTTP://facebook.com/anna' }));
  });

  it('accepts clearing a link with null or an empty string', async () => {
    await seed('s2', { socialLinks: { website: 'https://example.com', instagram: '@a' } });
    await assertSucceeds(doc('s2').update({ 'socialLinks.website': null }));
    await assertSucceeds(doc('s2').update({ 'socialLinks.instagram': '' }));
  });

  it('refuses javascript:, data:, a bare word and other schemes', async () => {
    await seed('s3');
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', 'ftp://example.com', 'example.com', 'anna', '@', '@a/b', 'https://']) {
      await assertFails(doc('s3').update({ socialLinks: { website: bad } }));
    }
    await assertFails(doc('s3').update({ 'socialLinks.instagram': 'javascript:alert(1)' }));
  });

  it('refuses a non-string value, an unknown key and a non-map socialLinks', async () => {
    await seed('s4');
    await assertFails(doc('s4').update({ socialLinks: { website: 42 } }));
    await assertFails(doc('s4').update({ socialLinks: { website: ['https://a.it'] } }));
    await assertFails(doc('s4').update({ socialLinks: { myspace: 'https://a.it' } }));
    await assertFails(doc('s4').update({ socialLinks: 'https://a.it' }));
  });

  it('caps a value at 200 characters', async () => {
    await seed('s5');
    const url = (n: number) => `https://example.com/${'a'.repeat(n - 'https://example.com/'.length)}`;
    await assertSucceeds(doc('s5').update({ socialLinks: { website: url(200) } }));
    await assertFails(doc('s5').update({ socialLinks: { website: url(201) } }));
  });

  it('does not lock out an unrelated update on a doc that already holds a legacy bad value', async () => {
    await seed('s6', { socialLinks: { website: 'javascript:legacy', linkedin: 'linkedin.com/in/anna' } });
    await assertSucceeds(doc('s6').update({ bio: 'new bio', 'socialLinks.instagram': '@ok' }));
    await assertSucceeds(doc('s6').update({ bio: 'another bio' }));
    // ...but the bad value cannot be rewritten to another bad one, and a good one replaces it.
    await assertFails(doc('s6').update({ 'socialLinks.website': 'javascript:other' }));
    await assertSucceeds(doc('s6').update({ 'socialLinks.website': 'https://fixed.example' }));
  });

  it('a non-owner still cannot write socialLinks', async () => {
    await seed('s7');
    await assertFails(testEnv.authenticatedContext('stranger').firestore().collection(collection).doc('s7')
      .update({ socialLinks: { website: 'https://example.com' } }));
  });
});

describe('instructors/{uid} create — socialLinks', () => {
  it('a self-created pending profile may carry safe links but not a javascript: one', async () => {
    const mk = (uid: string, socialLinks: unknown) =>
      testEnv.authenticatedContext(uid).firestore().collection('instructors').doc(uid).set({
        uid, applicationStatus: 'pending', providerProfile: { isVerified: false }, socialLinks,
      });
    await assertSucceeds(mk('c1', { website: 'https://example.com', instagram: '@anna' }));
    await assertFails(mk('c2', { website: 'javascript:alert(1)' }));
  });
});
