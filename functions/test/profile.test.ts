import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import functionsTest from 'firebase-functions-test';
import * as admin from 'firebase-admin';
import { defaultNotificationSettings, defaultPrivacySettings } from '../src/types';

const testEnv = functionsTest({ projectId: 'demo-vfit-test' });

// Lazy import after env init
let profileModule: typeof import('../src/users/profile');

beforeEach(async () => {
  vi.resetModules();
  profileModule = await import('../src/users/profile');
});

afterEach(() => {
  testEnv.cleanup();
});

describe('updateNotificationSettings', () => {
  it('writes the provided settings to the user doc and returns success', async () => {
    const uid = 'user-1';
    // Seed user
    await admin.firestore().collection('users').doc(uid).set({
      uid,
      email: 'u@example.com',
      fullName: 'Test User',
      role: 'customer',
    });

    const wrapped = testEnv.wrap(profileModule.updateNotificationSettings);
    const result = await wrapped({
      data: { settings: defaultNotificationSettings },
      auth: { uid, token: {} as admin.auth.DecodedIdToken },
    });

    expect(result).toEqual({ success: true });
    const after = await admin.firestore().collection('users').doc(uid).get();
    expect(after.data()?.notificationSettings).toEqual(defaultNotificationSettings);
  });

  it('rejects unauthenticated calls', async () => {
    const wrapped = testEnv.wrap(profileModule.updateNotificationSettings);
    await expect(
      wrapped({ data: { settings: defaultNotificationSettings }, auth: undefined as any })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects invalid shape', async () => {
    const uid = 'user-2';
    await admin.firestore().collection('users').doc(uid).set({ uid, role: 'customer' });
    const wrapped = testEnv.wrap(profileModule.updateNotificationSettings);
    await expect(
      wrapped({
        data: { settings: { push: { booking: 'yes' } } as any },
        auth: { uid, token: {} as admin.auth.DecodedIdToken },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('migrates legacy notificationsEnabled on first write', async () => {
    const uid = 'user-3';
    await admin.firestore().collection('users').doc(uid).set({
      uid,
      role: 'customer',
      notificationsEnabled: true,
    });
    const wrapped = testEnv.wrap(profileModule.updateNotificationSettings);
    await wrapped({
      data: { settings: defaultNotificationSettings },
      auth: { uid, token: {} as admin.auth.DecodedIdToken },
    });
    const after = await admin.firestore().collection('users').doc(uid).get();
    expect(after.data()?.notificationSettings).toEqual(defaultNotificationSettings);
    expect(after.data()?.notificationsEnabled).toBeUndefined();
  });

  it('writes one auditLogs entry per successful call', async () => {
    const uid = 'user-4';
    await admin.firestore().collection('users').doc(uid).set({ uid, role: 'customer' });
    const wrapped = testEnv.wrap(profileModule.updateNotificationSettings);
    await wrapped({
      data: { settings: defaultNotificationSettings },
      auth: { uid, token: {} as admin.auth.DecodedIdToken },
    });
    const logs = await admin.firestore()
      .collection('auditLogs')
      .where('uid', '==', uid)
      .where('action', '==', 'profile.notifications.update')
      .get();
    expect(logs.size).toBe(1);
  });
});

describe('updatePrivacySettings', () => {
  it('writes the provided settings and logs audit', async () => {
    const uid = 'priv-1';
    await admin.firestore().collection('users').doc(uid).set({ uid, role: 'customer' });
    const wrapped = testEnv.wrap(profileModule.updatePrivacySettings);
    await wrapped({
      data: { settings: defaultPrivacySettings },
      auth: { uid, token: {} as admin.auth.DecodedIdToken },
    });
    const after = await admin.firestore().collection('users').doc(uid).get();
    expect(after.data()?.privacySettings).toEqual(defaultPrivacySettings);

    const logs = await admin.firestore()
      .collection('auditLogs')
      .where('uid', '==', uid)
      .where('action', '==', 'profile.privacy.update')
      .get();
    expect(logs.size).toBe(1);
  });

  it('rejects invalid profileVisibility', async () => {
    const uid = 'priv-2';
    await admin.firestore().collection('users').doc(uid).set({ uid, role: 'customer' });
    const wrapped = testEnv.wrap(profileModule.updatePrivacySettings);
    await expect(
      wrapped({
        data: { settings: { ...defaultPrivacySettings, profileVisibility: 'invalid' } as any },
        auth: { uid, token: {} as admin.auth.DecodedIdToken },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects unauthenticated', async () => {
    const wrapped = testEnv.wrap(profileModule.updatePrivacySettings);
    await expect(
      wrapped({ data: { settings: defaultPrivacySettings }, auth: undefined as any })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });
});

describe('updateSocialLinks', () => {
  it('writes valid social links', async () => {
    const uid = 'soc-1';
    await admin.firestore().collection('users').doc(uid).set({ uid, role: 'customer' });
    const wrapped = testEnv.wrap(profileModule.updateSocialLinks);
    const links = {
      instagram: 'https://instagram.com/test_user',
      twitter: 'https://x.com/test_user',
      website: 'https://example.com',
    };
    await wrapped({
      data: { socialLinks: links },
      auth: { uid, token: {} as admin.auth.DecodedIdToken },
    });
    const after = await admin.firestore().collection('users').doc(uid).get();
    expect(after.data()?.socialLinks).toEqual(links);
  });

  it('rejects invalid instagram URL', async () => {
    const uid = 'soc-2';
    await admin.firestore().collection('users').doc(uid).set({ uid, role: 'customer' });
    const wrapped = testEnv.wrap(profileModule.updateSocialLinks);
    await expect(
      wrapped({
        data: { socialLinks: { instagram: 'not-a-url' } },
        auth: { uid, token: {} as admin.auth.DecodedIdToken },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('treats empty string as clear', async () => {
    const uid = 'soc-3';
    await admin.firestore().collection('users').doc(uid).set({
      uid, role: 'customer',
      socialLinks: { instagram: 'https://instagram.com/old_handle' },
    });
    const wrapped = testEnv.wrap(profileModule.updateSocialLinks);
    await wrapped({
      data: { socialLinks: { instagram: '' } },
      auth: { uid, token: {} as admin.auth.DecodedIdToken },
    });
    const after = await admin.firestore().collection('users').doc(uid).get();
    expect(after.data()?.socialLinks).toEqual({ instagram: '' });
  });
});
