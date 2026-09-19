import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRegisterWithEmail = vi.fn();
const mockCompleteRegistration = vi.fn();
const mockGetUserData = vi.fn();

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  setPersistence: vi.fn(),
  indexedDBLocalPersistence: {},
  RecaptchaVerifier: vi.fn(),
}));

vi.mock('@/lib/firebase/config', () => ({ auth: {} }));

vi.mock('@/lib/firebase/auth', () => ({
  registerWithEmail: (...args: unknown[]) => mockRegisterWithEmail(...args),
  completeRegistration: (...args: unknown[]) => mockCompleteRegistration(...args),
  getUserData: (...args: unknown[]) => mockGetUserData(...args),
  signInWithGoogle: vi.fn(),
  signInWithApple: vi.fn(),
  sendOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
  isProfileComplete: vi.fn(),
  initRecaptcha: vi.fn(),
  handleAuthRedirect: vi.fn(),
}));

describe('authStore.registerWithEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegisterWithEmail.mockResolvedValue({ uid: 'u1' });
    mockCompleteRegistration.mockResolvedValue(undefined);
    mockGetUserData.mockResolvedValue({ id: 'u1', uid: 'u1', fullName: 'Mia Rossi' });
  });

  it('persists the date of birth and preferred section entered on the form', async () => {
    const { useAuthStore } = await import('./authStore');
    const dateOfBirth = new Date('1990-05-12');

    await useAuthStore
      .getState()
      .registerWithEmail('mia@example.com', 'StrongPassword123!', 'Mia Rossi', 'it', {
        dateOfBirth,
        preferredSection: 'life',
      });

    expect(mockCompleteRegistration).toHaveBeenCalledWith('u1', {
      fullName: 'Mia Rossi',
      email: 'mia@example.com',
      dateOfBirth,
      preferredSection: 'life',
      preferredLanguage: 'it',
    });
  });

  it('defaults the preferred section to fit when none is given', async () => {
    const { useAuthStore } = await import('./authStore');

    await useAuthStore.getState().registerWithEmail('mia@example.com', 'StrongPassword123!', 'Mia Rossi', 'it');

    expect(mockCompleteRegistration).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ preferredSection: 'fit', dateOfBirth: undefined })
    );
  });
});
