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

// Mock useAuthStore
const mockLoginWithEmail = vi.fn();
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
      loginWithEmail: mockLoginWithEmail,
      clearError: mockClearError,
      initPhoneAuth: vi.fn(),
      sendPhoneOtp: vi.fn(),
      verifyPhoneOtp: vi.fn(),
      loginWithGoogle: vi.fn(),
      loginWithApple: vi.fn(),
    };
    return selector ? selector(state) : state;
  },
}));

describe('LoginPage Email Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login method selection screen', () => {
    render(<LoginPage />);

    expect(screen.getByText('Benvenuto')).toBeInTheDocument();
    expect(screen.getByText('Telefono')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText(/Continua con Google/i)).toBeInTheDocument();
  });

  it('navigates to email login when Email option is clicked', () => {
    render(<LoginPage />);

    const emailOption = screen.getByText('Email');
    fireEvent.click(emailOption);

    expect(screen.getByText('Accedi con Email')).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
  });

  it('calls loginWithEmail when form is submitted', async () => {
    mockLoginWithEmail.mockResolvedValueOnce(undefined);

    render(<LoginPage />);

    // Navigate to email login
    fireEvent.click(screen.getByText('Email'));

    // Fill in form
    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'password123' },
    });

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: /Accedi/i }));

    await waitFor(() => {
      expect(mockLoginWithEmail).toHaveBeenCalledWith('test@example.com', 'password123');
    });
  });

  it('shows password when toggle is clicked', () => {
    render(<LoginPage />);

    // Navigate to email login
    fireEvent.click(screen.getByText('Email'));

    const passwordInput = screen.getByLabelText(/Password/i) as HTMLInputElement;
    const toggleButton = screen.getByText('Mostra');

    expect(passwordInput.type).toBe('password');

    fireEvent.click(toggleButton);

    expect(passwordInput.type).toBe('text');
    expect(screen.getByText('Nascondi')).toBeInTheDocument();
  });

  it('has link to forgot password page', () => {
    render(<LoginPage />);

    // Navigate to email login
    fireEvent.click(screen.getByText('Email'));

    const forgotPasswordLink = screen.getByText(/Password dimenticata/i);
    expect(forgotPasswordLink).toHaveAttribute('href', '/auth/forgot-password');
  });

  it('has link to registration page', () => {
    render(<LoginPage />);

    // Navigate to email login
    fireEvent.click(screen.getByText('Email'));

    const registerLink = screen.getByText(/Registrati/i);
    expect(registerLink).toHaveAttribute('href', '/auth/register');
  });

  it('disables submit button when form is empty', () => {
    render(<LoginPage />);

    // Navigate to email login
    fireEvent.click(screen.getByText('Email'));

    const submitButton = screen.getByRole('button', { name: /Accedi/i });
    expect(submitButton).toBeDisabled();
  });

  it('enables submit button when form is valid', () => {
    render(<LoginPage />);

    // Navigate to email login
    fireEvent.click(screen.getByText('Email'));

    fireEvent.change(screen.getByLabelText(/Email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'password123' },
    });

    const submitButton = screen.getByRole('button', { name: /Accedi/i });
    expect(submitButton).not.toBeDisabled();
  });

  it('clears errors when navigating back', () => {
    render(<LoginPage />);

    // Navigate to email login
    fireEvent.click(screen.getByText('Email'));

    // Click back button
    fireEvent.click(screen.getByText(/Indietro/i));

    expect(mockClearError).toHaveBeenCalled();
  });
});
