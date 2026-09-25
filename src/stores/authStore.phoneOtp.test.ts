import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockVerifyOtp = vi.fn();

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  setPersistence: vi.fn(),
  indexedDBLocalPersistence: {},
  RecaptchaVerifier: vi.fn(),
}));

vi.mock('@/lib/firebase/config', () => ({ auth: {} }));

vi.mock('@/lib/capacitor', () => ({
  isNativePlatform: () => false,
}));

vi.mock('@/lib/firebase/auth', () => ({
  signInWithGoogle: vi.fn(),
  signInWithApple: vi.fn(),
  sendOtp: vi.fn(),
  verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
  signOut: vi.fn(),
  getUserData: vi.fn(),
  isProfileComplete: vi.fn(),
  initRecaptcha: vi.fn(),
  handleAuthRedirect: vi.fn(),
  registerWithEmail: vi.fn(),
  signInWithEmail: vi.fn(),
  resetPassword: vi.fn(),
  sendVerificationEmail: vi.fn(),
  syncEmailVerification: vi.fn(),
}));

describe('authStore.verifyPhoneOtp', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { useAuthStore } = await import('./authStore');
    useAuthStore.setState({
      firebaseUser: null,
      user: null,
      isLoading: false,
      isInitialized: true,
      error: null,
      recaptchaVerifier: null,
      isOtpSent: true,
      phoneNumber: '+393755805819',
    });
  });

  it('maps a wrong OTP Firebase error to a translatable message key', async () => {
    const { useAuthStore } = await import('./authStore');
    mockVerifyOtp.mockRejectedValue(
      Object.assign(new Error('Firebase: Error (auth/invalid-verification-code).'), {
        code: 'auth/invalid-verification-code',
      }),
    );

    await useAuthStore.getState().verifyPhoneOtp('000000');

    expect(useAuthStore.getState().error).toBe('auth.login.phone.error.invalidCode');
    expect(useAuthStore.getState().isLoading).toBe(false);
  });
});
