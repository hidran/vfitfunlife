import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
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
const mockClearError = vi.fn();

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector?: (state: unknown) => unknown) => {
    const state = {
      firebaseUser: null,
      user: null,
      isLoading: false,
      isInitialized: true,
      error: null,
      isOtpSent: false,
      phoneNumber: null,
      loginWithGoogle: mockLoginWithGoogle,
      loginWithApple: mockLoginWithApple,
      clearError: mockClearError,
      initPhoneAuth: vi.fn(),
      sendPhoneOtp: vi.fn(),
      verifyPhoneOtp: vi.fn(),
    };
    return selector ? selector(state) : state;
  },
}));

describe('LoginPage Google Sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    // Mock authenticated state
    const mockUseAuthStore = vi.fn();
    vi.mocked(mockUseAuthStore).mockImplementation((selector: (state: unknown) => unknown) => {
      const state = {
        firebaseUser: { uid: '123', email: 'test@example.com' },
        user: { id: '123', fullName: 'Test User' },
        isLoading: false,
        isInitialized: true,
        error: null,
        isOtpSent: false,
        phoneNumber: null,
        loginWithGoogle: mockLoginWithGoogle,
        loginWithApple: mockLoginWithApple,
        clearError: mockClearError,
        initPhoneAuth: vi.fn(),
        sendPhoneOtp: vi.fn(),
        verifyPhoneOtp: vi.fn(),
      };
      return selector ? selector(state) : state;
    });

    render(<LoginPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/home');
    });
  });

  it('redirects to registration when firebaseUser exists but profile is incomplete', async () => {
    // Mock incomplete profile state
    const mockUseAuthStore = vi.fn();
    vi.mocked(mockUseAuthStore).mockImplementation((selector: (state: unknown) => unknown) => {
      const state = {
        firebaseUser: { uid: '123', email: 'test@example.com' },
        user: null,
        isLoading: false,
        isInitialized: true,
        error: null,
        isOtpSent: false,
        phoneNumber: null,
        loginWithGoogle: mockLoginWithGoogle,
        loginWithApple: mockLoginWithApple,
        clearError: mockClearError,
        initPhoneAuth: vi.fn(),
        sendPhoneOtp: vi.fn(),
        verifyPhoneOtp: vi.fn(),
      };
      return selector ? selector(state) : state;
    });

    render(<LoginPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/auth/register');
    });
  });

  it('shows loading state during Google sign-in', async () => {
    // Mock loading state
    const mockUseAuthStore = vi.fn();
    vi.mocked(mockUseAuthStore).mockImplementation((selector: (state: unknown) => unknown) => {
      const state = {
        firebaseUser: null,
        user: null,
        isLoading: true,
        isInitialized: true,
        error: null,
        isOtpSent: false,
        phoneNumber: null,
        loginWithGoogle: mockLoginWithGoogle,
        loginWithApple: mockLoginWithApple,
        clearError: mockClearError,
        initPhoneAuth: vi.fn(),
        sendPhoneOtp: vi.fn(),
        verifyPhoneOtp: vi.fn(),
      };
      return selector ? selector(state) : state;
    });

    render(<LoginPage />);

    // Should show loading spinner
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('clears error when Google sign-in is clicked', async () => {
    // Mock error state
    const mockUseAuthStore = vi.fn();
    vi.mocked(mockUseAuthStore).mockImplementation((selector: (state: unknown) => unknown) => {
      const state = {
        firebaseUser: null,
        user: null,
        isLoading: false,
        isInitialized: true,
        error: 'Previous error message',
        isOtpSent: false,
        phoneNumber: null,
        loginWithGoogle: mockLoginWithGoogle,
        loginWithApple: mockLoginWithApple,
        clearError: mockClearError,
        initPhoneAuth: vi.fn(),
        sendPhoneOtp: vi.fn(),
        verifyPhoneOtp: vi.fn(),
      };
      return selector ? selector(state) : state;
    });

    render(<LoginPage />);

    const googleButton = screen.getByText(/Continua con Google/i);
    fireEvent.click(googleButton);

    await waitFor(() => {
      expect(mockClearError).toHaveBeenCalled();
    });
  });
});
