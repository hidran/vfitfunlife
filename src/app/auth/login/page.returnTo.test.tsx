import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './page';

const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mockReplace, push: vi.fn() }) }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector?: (state: unknown) => unknown) => {
    const state = {
      firebaseUser: { uid: 'u1' }, user: { uid: 'u1', role: 'customer', providerStatus: 'none' }, isLoading: false, isInitialized: true,
      error: null, isOtpSent: false, phoneNumber: null, initPhoneAuth: vi.fn(), sendPhoneOtp: vi.fn(), verifyPhoneOtp: vi.fn(),
      loginWithGoogle: vi.fn(), loginWithApple: vi.fn(), loginWithEmail: vi.fn(), clearError: vi.fn(),
    };
    return selector ? selector(state) : state;
  },
}));

describe('LoginPage return path', () => {
  beforeEach(() => mockReplace.mockReset());
  afterEach(() => window.history.pushState({}, '', '/'));

  it('sends a signed-in user back to ?next= (a visitor who wanted to book a lesson)', () => {
    window.history.pushState({}, '', `/auth/login?next=${encodeURIComponent('/courses?id=c1&lesson=2099-01-05')}`);
    render(<LoginPage />);
    expect(mockReplace).toHaveBeenCalledWith('/courses?id=c1&lesson=2099-01-05');
  });

  it.each(['https://evil.example/', '//evil.example', '/auth/login'])('ignores an unsafe next (%s)', (next) => {
    window.history.pushState({}, '', `/auth/login?next=${encodeURIComponent(next)}`);
    render(<LoginPage />);
    expect(mockReplace).toHaveBeenCalledWith('/home');
  });

  it('goes to the role home without next', () => {
    render(<LoginPage />);
    expect(mockReplace).toHaveBeenCalledWith('/home');
  });
});
