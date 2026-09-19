import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RegisterPage from './page';

// Mock useRouter
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock useAuthStore
const mockRegisterWithEmail = vi.fn();
const mockClearError = vi.fn();
const mockSubmitProviderApplication = vi.fn();

vi.mock('@/stores/authStore', () => {
  const useAuthStore = (selector?: (state: unknown) => unknown) => {
    const state = {
      firebaseUser: null,
      refreshUserProfile: vi.fn(),
      registerWithEmail: mockRegisterWithEmail,
      clearError: mockClearError,
      error: null,
      isLoading: false,
    };
    return selector ? selector(state) : state;
  };
  // The page reads the freshly-created user imperatively after registerWithEmail.
  useAuthStore.getState = () => ({ firebaseUser: { uid: 'new-uid' }, error: null });
  return { useAuthStore };
});

vi.mock('@/lib/firebase/providerApplication', () => ({
  submitProviderApplication: (...args: unknown[]) => mockSubmitProviderApplication(...args),
}));

describe('RegisterPage Email Registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders registration method selection when no firebaseUser', () => {
    render(<RegisterPage />);

    expect(screen.getByText('Crea un account')).toBeInTheDocument();
    expect(screen.getByText('Email e Password')).toBeInTheDocument();
    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText('Apple')).toBeInTheDocument();
  });

  it('navigates to email registration form when Email option is clicked', () => {
    render(<RegisterPage />);

    fireEvent.click(screen.getByText('Email e Password'));

    expect(screen.getByText('Crea il tuo account')).toBeInTheDocument();
    expect(screen.getByLabelText(/Nome completo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Conferma Password/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /professionista/i })).not.toBeChecked();
  });

  it('shows error when passwords do not match', async () => {
    render(<RegisterPage />);

    // Navigate to email registration
    fireEvent.click(screen.getByText('Email e Password'));

    // Fill form with mismatched passwords
    fireEvent.change(screen.getByLabelText(/Nome completo/i), {
      target: { value: 'Test User' },
    });
    fireEvent.change(screen.getByLabelText(/^Email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Password/i), {
      target: { value: 'StrongPassword123!' },
    });
    fireEvent.change(screen.getByLabelText(/Conferma Password/i), {
      target: { value: 'DifferentPassword123!' },
    });

    // Accept terms
    fireEvent.click(screen.getByLabelText(/Termini/i));

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /Crea Account/i }));

    await waitFor(() => {
      expect(screen.getByText(/Le password non coincidono/i)).toBeInTheDocument();
    });

    expect(mockRegisterWithEmail).not.toHaveBeenCalled();
  });

  it('calls registerWithEmail when form is valid', async () => {
    mockRegisterWithEmail.mockResolvedValueOnce(undefined);

    render(<RegisterPage />);

    // Navigate to email registration
    fireEvent.click(screen.getByText('Email e Password'));

    // Fill form
    fireEvent.change(screen.getByLabelText(/Nome completo/i), {
      target: { value: 'Test User' },
    });
    fireEvent.change(screen.getByLabelText(/^Email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Password/i), {
      target: { value: 'StrongPassword123!' },
    });
    fireEvent.change(screen.getByLabelText(/Conferma Password/i), {
      target: { value: 'StrongPassword123!' },
    });

    fireEvent.change(screen.getByLabelText(/Data di nascita/i), {
      target: { value: '1990-05-12' },
    });
    fireEvent.click(screen.getByText('VLife'));

    // Accept terms
    fireEvent.click(screen.getByLabelText(/Termini/i));

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /Crea Account/i }));

    await waitFor(() => {
      expect(mockRegisterWithEmail).toHaveBeenCalledWith(
        'test@example.com',
        'StrongPassword123!',
        'Test User',
        'it',
        { dateOfBirth: new Date('1990-05-12'), preferredSection: 'life' }
      );
    });
  });

  it('requires a category when professional opt-in is selected', async () => {
    render(<RegisterPage />);

    fireEvent.click(screen.getByText('Email e Password'));
    fireEvent.change(screen.getByLabelText(/Nome completo/i), {
      target: { value: 'Professional User' },
    });
    fireEvent.change(screen.getByLabelText(/^Email/i), {
      target: { value: 'professional@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Password/i), {
      target: { value: 'StrongPassword123!' },
    });
    fireEvent.change(screen.getByLabelText(/Conferma Password/i), {
      target: { value: 'StrongPassword123!' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /professionista/i }));
    fireEvent.click(screen.getByLabelText(/Termini/i));
    fireEvent.click(screen.getByRole('button', { name: /Crea account/i }));

    await waitFor(() => {
      expect(screen.getByText('Seleziona il tipo di servizio che offri.')).toBeInTheDocument();
    });
    expect(mockRegisterWithEmail).not.toHaveBeenCalled();
  });

  it('submits the picked categories as taxonomy ids, not display names', async () => {
    mockRegisterWithEmail.mockResolvedValueOnce(undefined);
    mockSubmitProviderApplication.mockResolvedValueOnce(undefined);

    render(<RegisterPage />);

    fireEvent.click(screen.getByText('Email e Password'));
    fireEvent.change(screen.getByLabelText(/Nome completo/i), {
      target: { value: 'Professional User' },
    });
    fireEvent.change(screen.getByLabelText(/^Email/i), {
      target: { value: 'professional@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Password/i), {
      target: { value: 'StrongPassword123!' },
    });
    fireEvent.change(screen.getByLabelText(/Conferma Password/i), {
      target: { value: 'StrongPassword123!' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /professionista/i }));
    fireEvent.click(screen.getByRole('button', { name: /Personal Training/i }));
    fireEvent.click(screen.getByLabelText(/Termini/i));
    fireEvent.click(screen.getByRole('button', { name: /Crea account/i }));

    await waitFor(() => {
      expect(mockSubmitProviderApplication).toHaveBeenCalledWith('new-uid', {
        fullName: 'Professional User',
        categoryIds: ['personal_training'],
      });
    });
  });

  it('requires all mandatory fields', async () => {
    render(<RegisterPage />);

    // Navigate to email registration
    fireEvent.click(screen.getByText('Email e Password'));

    // Accept terms only
    fireEvent.click(screen.getByLabelText(/Termini/i));

    // Try submit with empty fields (bypass native required-field validation)
    fireEvent.submit(document.querySelector('form')!);

    await waitFor(() => {
      expect(screen.getByText(/Il nome completo è obbligatorio/i)).toBeInTheDocument();
    });

    expect(mockRegisterWithEmail).not.toHaveBeenCalled();
  });

  it('requires terms acceptance', async () => {
    render(<RegisterPage />);

    // Navigate to email registration
    fireEvent.click(screen.getByText('Email e Password'));

    // Fill form without accepting terms
    fireEvent.change(screen.getByLabelText(/Nome completo/i), {
      target: { value: 'Test User' },
    });
    fireEvent.change(screen.getByLabelText(/^Email/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Password/i), {
      target: { value: 'StrongPassword123!' },
    });
    fireEvent.change(screen.getByLabelText(/Conferma Password/i), {
      target: { value: 'StrongPassword123!' },
    });

    // Submit without accepting terms (bypass native required-field validation)
    fireEvent.submit(document.querySelector('form')!);

    await waitFor(() => {
      expect(screen.getByText(/Devi accettare i Termini/i)).toBeInTheDocument();
    });

    expect(mockRegisterWithEmail).not.toHaveBeenCalled();
  });

  it('allows selecting preferred section', () => {
    render(<RegisterPage />);

    // Navigate to email registration
    fireEvent.click(screen.getByText('Email e Password'));

    // Default is VFit
    expect(screen.getByRole('button', { name: 'VFit' })).toHaveClass('scale-105');

    // Click VFun
    fireEvent.click(screen.getByText('VFun'));

    // VFun should be selected
    expect(screen.getByRole('button', { name: 'VFun' })).toHaveClass('scale-105');
  });

  it('shows password strength hint', () => {
    render(<RegisterPage />);

    // Navigate to email registration
    fireEvent.click(screen.getByText('Email e Password'));

    expect(screen.getByText(/Almeno 12 caratteri/i)).toBeInTheDocument();
  });

  it('toggles password visibility', () => {
    render(<RegisterPage />);

    // Navigate to email registration
    fireEvent.click(screen.getByText('Email e Password'));

    const passwordInput = screen.getByLabelText(/^Password/i) as HTMLInputElement;
    const toggleButton = screen.getByText('Mostra');

    expect(passwordInput.type).toBe('password');

    fireEvent.click(toggleButton);

    expect(passwordInput.type).toBe('text');
  });
});
