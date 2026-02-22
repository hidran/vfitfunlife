import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LoginPage from './page';

// Mock useRouter
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock useAuthStore
vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    firebaseUser: null,
    user: null,
    isLoading: false,
    isInitialized: true,
    error: null,
    isOtpSent: false,
    phoneNumber: '',
    initPhoneAuth: vi.fn(),
    sendPhoneOtp: vi.fn(),
    verifyPhoneOtp: vi.fn(),
    loginWithGoogle: vi.fn(),
    loginWithApple: vi.fn(),
    loginWithEmail: vi.fn(),
    clearError: vi.fn(),
  }),
}));

describe('LoginPage', () => {
  it('renders the registration link', () => {
    render(<LoginPage />);
    const link = screen.getByRole('link', { name: /Registrati/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/auth/register');
  });
});
