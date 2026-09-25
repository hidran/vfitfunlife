import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoginPage from './page';

// Mock useRouter
const mockReplace = vi.fn();
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
  }),
}));

// Mock Firebase Auth
const mockSignInWithRedirect = vi.fn();
const mockGetRedirectResult = vi.fn();
const mockOnAuthStateChanged = vi.fn();

vi.mock('firebase/auth', () => ({
  getAuth: () => ({
    currentUser: null,
  }),
  signInWithRedirect: (...args: unknown[]) => mockSignInWithRedirect(...args),
  getRedirectResult: () => mockGetRedirectResult(),
  onAuthStateChanged: (...args: unknown[]) => mockOnAuthStateChanged(...args),
  GoogleAuthProvider: vi.fn(() => ({
    addScope: vi.fn(),
  })),
  OAuthProvider: vi.fn(() => ({
    addScope: vi.fn(),
  })),
}));

// Mock Capacitor
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => 'web',
  },
}));

// Mock useAuthStore
const mockLoginWithGoogle = vi.fn();
const mockLoginWithApple = vi.fn();
const mockLoginWithEmail = vi.fn();
const mockClearError = vi.fn();
const mockInitPhoneAuth = vi.fn();
const mockSendPhoneOtp = vi.fn();
const mockVerifyPhoneOtp = vi.fn();

type MockAuthState = {
  firebaseUser: { uid: string; email: string } | null;
  user: { id: string; fullName: string; role?: string; providerStatus?: string } | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  isOtpSent: boolean;
  phoneNumber: string | null;
  loginWithGoogle: typeof mockLoginWithGoogle;
  loginWithApple: typeof mockLoginWithApple;
  loginWithEmail: typeof mockLoginWithEmail;
  clearError: typeof mockClearError;
  initPhoneAuth: typeof mockInitPhoneAuth;
  sendPhoneOtp: typeof mockSendPhoneOtp;
  verifyPhoneOtp: typeof mockVerifyPhoneOtp;
};

let mockAuthState: MockAuthState;

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector?: (state: unknown) => unknown) => {
    return selector ? selector(mockAuthState) : mockAuthState;
  },
}));

describe('LoginPage Google Sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState = {
      firebaseUser: null,
      user: null,
      isLoading: false,
      isInitialized: true,
      error: null,
      isOtpSent: false,
      phoneNumber: null,
      loginWithGoogle: mockLoginWithGoogle,
      loginWithApple: mockLoginWithApple,
      loginWithEmail: mockLoginWithEmail,
      clearError: mockClearError,
      initPhoneAuth: mockInitPhoneAuth,
      sendPhoneOtp: mockSendPhoneOtp,
      verifyPhoneOtp: mockVerifyPhoneOtp,
    };
  });

  it('calls loginWithGoogle when Google button is clicked', async () => {
    render(<LoginPage />);

    // Find and click Google button
    const googleButton = screen.getByText(/Continua con Google/i);
    fireEvent.click(googleButton);

    await waitFor(() => {
      expect(mockLoginWithGoogle).toHaveBeenCalledTimes(1);
    });
  });

  it('redirects to home when user is authenticated', async () => {
    mockAuthState.firebaseUser = { uid: '123', email: 'test@example.com' };
    mockAuthState.user = { id: '123', fullName: 'Test User' };

    render(<LoginPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/home');
    });
  });

  it('redirects a provider to their dashboard', async () => {
    mockAuthState.firebaseUser = { uid: '123', email: 'trainer@example.com' };
    mockAuthState.user = { id: '123', fullName: 'Trainer', role: 'provider', providerStatus: 'verified' };

    render(<LoginPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/provider/dashboard');
    });
  });

  it('redirects to registration when firebaseUser exists but profile is incomplete', async () => {
    mockAuthState.firebaseUser = { uid: '123', email: 'test@example.com' };
    mockAuthState.user = null;

    render(<LoginPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/auth/register');
    });
  });

  it('shows loading state during Google sign-in', async () => {
    mockAuthState.isLoading = true;

    render(<LoginPage />);

    // Should show loading spinner
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('clears error when Google sign-in is clicked', async () => {
    mockAuthState.error = 'Previous error message';

    render(<LoginPage />);

    const googleButton = screen.getByText(/Continua con Google/i);
    fireEvent.click(googleButton);

    await waitFor(() => {
      expect(mockClearError).toHaveBeenCalled();
    });
  });
});
