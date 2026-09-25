import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoginPage from './page';

const mockReplace = vi.fn();
const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
  }),
}));

const mockInitPhoneAuth = vi.fn();
const mockSendPhoneOtp = vi.fn();
const mockVerifyPhoneOtp = vi.fn();
const mockClearError = vi.fn();

type MockAuthState = {
  firebaseUser: null;
  user: null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
  isOtpSent: boolean;
  phoneNumber: string | null;
  initPhoneAuth: typeof mockInitPhoneAuth;
  sendPhoneOtp: typeof mockSendPhoneOtp;
  verifyPhoneOtp: typeof mockVerifyPhoneOtp;
  loginWithGoogle: ReturnType<typeof vi.fn>;
  loginWithApple: ReturnType<typeof vi.fn>;
  loginWithEmail: ReturnType<typeof vi.fn>;
  clearError: typeof mockClearError;
};

let mockAuthState: MockAuthState;

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector?: (state: unknown) => unknown) =>
    selector ? selector(mockAuthState) : mockAuthState,
}));

describe('LoginPage phone authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendPhoneOtp.mockResolvedValue(false);
    mockAuthState = {
      firebaseUser: null,
      user: null,
      isLoading: false,
      isInitialized: true,
      error: null,
      isOtpSent: false,
      phoneNumber: null,
      initPhoneAuth: mockInitPhoneAuth,
      sendPhoneOtp: mockSendPhoneOtp,
      verifyPhoneOtp: mockVerifyPhoneOtp,
      loginWithGoogle: vi.fn(),
      loginWithApple: vi.fn(),
      loginWithEmail: vi.fn(),
      clearError: mockClearError,
    };
  });

  it('normalizes a pasted Italian 00-prefix number before sending the OTP', async () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: /Telefono/i }));
    fireEvent.change(screen.getByPlaceholderText('Numero di telefono'), {
      target: { value: '00393755805819' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Invia codice/i }));

    await waitFor(() => {
      expect(mockSendPhoneOtp).toHaveBeenCalledWith('+393755805819');
    });
  });

  it('keeps the reCAPTCHA container mounted while sending an OTP', () => {
    const { rerender } = render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: /Telefono/i }));
    expect(screen.getByPlaceholderText('Numero di telefono')).toBeInTheDocument();

    mockAuthState.isLoading = true;
    rerender(<LoginPage />);

    expect(screen.getByPlaceholderText('Numero di telefono')).toBeInTheDocument();
    expect(document.getElementById('recaptcha-container')).toBeInTheDocument();
  });

  it('translates an invalid OTP error key on the phone verification form', () => {
    mockAuthState.isOtpSent = true;
    mockAuthState.phoneNumber = '+393755805819';
    mockAuthState.error = 'auth.login.phone.error.invalidCode';

    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: /Telefono/i }));

    expect(screen.getByText('Il codice non è valido. Riprova.')).toBeInTheDocument();
    expect(screen.queryByText('auth.login.phone.error.invalidCode')).not.toBeInTheDocument();
  });
});
