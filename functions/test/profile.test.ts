import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import functionsTest from 'firebase-functions-test';
import * as admin from 'firebase-admin';
import { defaultNotificationSettings, defaultPrivacySettings, makeAvatarUrlSchema } from '../src/types';

const testEnv = functionsTest({ projectId: 'demo-vfit-test' });

// Lazy import after env init
let profileModule: typeof import('../src/users/profile');

beforeEach(async () => {
  vi.resetModules();
  profileModule = await import('../src/users/profile');
  // These tests assert exact audit-entry counts, and nothing else clears the emulator
  // between runs — without this the second run against a warm emulator counts the first
  // run's documents too and fails on a number, not a behaviour.
  for (const name of ['users', 'audit_logs']) {
    const snap = await admin.firestore().collection(name).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
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

  it('writes one audit_logs entry per successful call', async () => {
    const uid = 'user-4';
    await admin.firestore().collection('users').doc(uid).set({ uid, role: 'customer' });
    const wrapped = testEnv.wrap(profileModule.updateNotificationSettings);
    await wrapped({
      data: { settings: defaultNotificationSettings },
      auth: { uid, token: {} as admin.auth.DecodedIdToken },
    });
    const logs = await admin.firestore()
      .collection('audit_logs')
      .where('entityId', '==', uid)
      .where('reason', '==', 'profile.notifications.update')
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
      .collection('audit_logs')
      .where('entityId', '==', uid)
      .where('reason', '==', 'profile.privacy.update')
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

describe('updateAvatar', () => {
  const bucket = 'demo-vfit-test.appspot.com';

  beforeEach(() => {
    // Stub Storage so old-avatar deletion attempts don't error.
    vi.spyOn(admin.storage(), 'bucket').mockReturnValue({
      file: vi.fn().mockReturnValue({ delete: vi.fn().mockResolvedValue([]) }),
    } as any);
  });

  it('accepts a valid bucket+uid URL and writes to user doc', async () => {
    const uid = 'av-1';
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/avatars%2F${uid}%2F1234-abc.jpg?alt=media&token=xyz`;
    await admin.firestore().collection('users').doc(uid).set({ uid, role: 'customer' });
    const wrapped = testEnv.wrap(profileModule.updateAvatar);
    const result = await wrapped({
      data: { avatarUrl: url },
      auth: { uid, token: {} as admin.auth.DecodedIdToken },
    });
    expect(result.success).toBe(true);
    expect(result.avatarUrl).toBe(url);
    const after = await admin.firestore().collection('users').doc(uid).get();
    expect(after.data()?.avatarUrl).toBe(url);
  });

  it('rejects a URL pointing at someone else\'s avatar', async () => {
    const uid = 'av-2';
    const otherUid = 'av-other';
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/avatars%2F${otherUid}%2Ffoo.jpg`;
    await admin.firestore().collection('users').doc(uid).set({ uid, role: 'customer' });
    const wrapped = testEnv.wrap(profileModule.updateAvatar);
    await expect(
      wrapped({ data: { avatarUrl: url }, auth: { uid, token: {} as admin.auth.DecodedIdToken } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects a non-bucket URL', async () => {
    const uid = 'av-3';
    await admin.firestore().collection('users').doc(uid).set({ uid, role: 'customer' });
    const wrapped = testEnv.wrap(profileModule.updateAvatar);
    await expect(
      wrapped({
        data: { avatarUrl: 'https://evil.example.com/me.jpg' },
        auth: { uid, token: {} as admin.auth.DecodedIdToken },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('succeeds even when old-avatar deletion fails', async () => {
    const uid = 'av-4';
    const oldUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/avatars%2F${uid}%2Fold.jpg`;
    const newUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/avatars%2F${uid}%2Fnew.jpg`;
    await admin.firestore().collection('users').doc(uid).set({
      uid, role: 'customer', avatarUrl: oldUrl,
    });
    // Make delete fail
    (admin.storage().bucket as any).mockReturnValue({
      file: vi.fn().mockReturnValue({ delete: vi.fn().mockRejectedValue(new Error('boom')) }),
    });
    const wrapped = testEnv.wrap(profileModule.updateAvatar);
    const result = await wrapped({
      data: { avatarUrl: newUrl },
      auth: { uid, token: {} as admin.auth.DecodedIdToken },
    });
    expect(result.success).toBe(true);
  });
});
