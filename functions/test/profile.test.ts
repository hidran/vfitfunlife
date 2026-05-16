import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import functionsTest from 'firebase-functions-test';
import * as admin from 'firebase-admin';
import { defaultNotificationSettings } from '../src/types';

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
});
