import { describe, it, expect, vi, beforeEach } from 'vitest';

const signInWithGoogleMock = vi.fn();
const signInWithAppleMock = vi.fn();
vi.mock('@capacitor-firebase/authentication', () => ({
  FirebaseAuthentication: {
    signInWithGoogle: (...a: unknown[]) => signInWithGoogleMock(...a),
    signInWithApple: (...a: unknown[]) => signInWithAppleMock(...a),
  },
}));

const signInWithCredentialMock = vi.fn();
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: { credential: (idToken: string) => ({ providerId: 'google.com', idToken }) },
  OAuthProvider: class {
    providerId: string;
    constructor(id: string) { this.providerId = id; }
    credential(opts: { idToken?: string; rawNonce?: string }) { return { providerId: this.providerId, ...opts }; }
  },
  signInWithCredential: (...a: unknown[]) => signInWithCredentialMock(...a),
}));

import { nativeGoogleSignIn, nativeAppleSignIn } from './nativeAuth';

beforeEach(() => vi.clearAllMocks());

describe('nativeGoogleSignIn', () => {
  it('bridges the native Google idToken into signInWithCredential and returns the user', async () => {
    signInWithGoogleMock.mockResolvedValue({ credential: { idToken: 'google-id-token' } });
    signInWithCredentialMock.mockResolvedValue({ user: { uid: 'u1' } });
    const authInstance = {} as never;
    const user = await nativeGoogleSignIn(authInstance);
    expect(signInWithGoogleMock).toHaveBeenCalled();
    expect(signInWithCredentialMock).toHaveBeenCalledWith(authInstance, { providerId: 'google.com', idToken: 'google-id-token' });
    expect(user).toEqual({ uid: 'u1' });
  });
  it('throws when no idToken is returned', async () => {
    signInWithGoogleMock.mockResolvedValue({ credential: {} });
    await expect(nativeGoogleSignIn({} as never)).rejects.toThrow(/Google ID token/);
    expect(signInWithCredentialMock).not.toHaveBeenCalled();
  });
});

describe('nativeAppleSignIn', () => {
  it('bridges the native Apple idToken + nonce into signInWithCredential', async () => {
    signInWithAppleMock.mockResolvedValue({ credential: { idToken: 'apple-id-token', nonce: 'abc' } });
    signInWithCredentialMock.mockResolvedValue({ user: { uid: 'u2' } });
    const authInstance = {} as never;
    const user = await nativeAppleSignIn(authInstance);
    expect(signInWithCredentialMock).toHaveBeenCalledWith(authInstance, { providerId: 'apple.com', idToken: 'apple-id-token', rawNonce: 'abc' });
    expect(user).toEqual({ uid: 'u2' });
  });
  it('throws when no Apple idToken is returned', async () => {
    signInWithAppleMock.mockResolvedValue({ credential: {} });
    await expect(nativeAppleSignIn({} as never)).rejects.toThrow(/Apple ID token/);
  });
});
