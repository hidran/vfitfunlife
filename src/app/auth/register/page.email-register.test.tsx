import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegisterClient } from './RegisterClient';

// Mock useRouter
const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => mockSearchParams,
}));

// Mock useAuthStore
const mockRegisterWithEmail = vi.fn();
const mockClearError = vi.fn();
const mockSubmitProviderApplication = vi.fn();
const mockCompleteRegistration = vi.fn();
const mockRefreshUserProfile = vi.fn();

type MockFirebaseUser = {
  uid: string;
  email: string | null;
};

type MockAuthState = {
  firebaseUser: MockFirebaseUser | null;
  user: { providerStatus?: string; role?: string } | null;
  refreshUserProfile: typeof mockRefreshUserProfile;
  registerWithEmail: typeof mockRegisterWithEmail;
  clearError: typeof mockClearError;
  error: string | null;
  isLoading: boolean;
};

let mockAuthState: MockAuthState;

vi.mock('@/stores/authStore', () => {
  const useAuthStore = (selector?: (state: unknown) => unknown) => {
    return selector ? selector(mockAuthState) : mockAuthState;
  };
  // The page reads the freshly-created user imperatively after registerWithEmail.
  useAuthStore.getState = () => ({
    ...mockAuthState,
    firebaseUser: mockAuthState.firebaseUser ?? { uid: 'new-uid', email: 'new@example.com' },
  });
  return { useAuthStore };
});

vi.mock('@/lib/firebase/auth', () => ({
  completeRegistration: (...args: unknown[]) => mockCompleteRegistration(...args),
}));

vi.mock('@/lib/firebase/providerApplication', () => ({
  submitProviderApplication: (...args: unknown[]) => mockSubmitProviderApplication(...args),
}));

vi.mock('@/hooks/useServiceCategories', () => ({
  useServiceCategoryGroups: () => [
    {
      group: { id: 'strength_conditioning', name: 'Forza e Condizionamento', icon: '💪' },
      leaves: [{ id: 'personal_training', name: 'Personal Training', icon: '💪' }],
    },
    {
      group: { id: 'cardio_endurance', name: 'Cardio e Resistenza', icon: '🏃' },
      leaves: [{ id: 'swimming', name: 'Nuoto', icon: '🏊' }],
    },
  ],
}));

describe('RegisterPage Email Registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockAuthState = {
      firebaseUser: null,
      user: null,
      refreshUserProfile: mockRefreshUserProfile,
      registerWithEmail: mockRegisterWithEmail,
      clearError: mockClearError,
      error: null,
      isLoading: false,
    };
  });

  it('renders registration method selection when no firebaseUser', () => {
    render(<RegisterClient />);

    expect(screen.getByText('Crea un account')).toBeInTheDocument();
    expect(screen.getByText('Email e Password')).toBeInTheDocument();
    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.getByText('Apple')).toBeInTheDocument();
  });

  it('navigates to email registration form when Email option is clicked', () => {
    render(<RegisterClient />);

    fireEvent.click(screen.getByText('Email e Password'));

    expect(screen.getByText('Crea il tuo account')).toBeInTheDocument();
    expect(screen.getByLabelText(/Nome completo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Conferma Password/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /professionista/i })).not.toBeChecked();
  });

  it('opens the email form with provider opt-in enabled from the provider CTA', () => {
    mockSearchParams = new URLSearchParams('as=provider');

    render(<RegisterClient />);

    expect(screen.getByText('Crea il tuo account')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /professionista/i })).toBeChecked();
    expect(screen.getByText('Seleziona uno o più servizi che offri')).toBeInTheDocument();
  });

  it('keeps provider categories compact by showing one category group at a time', async () => {
    mockSearchParams = new URLSearchParams('as=provider');

    render(<RegisterClient />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Forza e Condizionamento/i })).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('tab', { name: /Cardio e Resistenza/i })).toHaveAttribute('aria-expanded', 'false');
    });
    expect(screen.getByRole('button', { name: /Personal Training/i })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Nuoto/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Cardio e Resistenza/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Nuoto/i })).toBeVisible();
      expect(screen.queryByRole('button', { name: /Personal Training/i })).not.toBeInTheDocument();
    });
  });

  it('shows error when passwords do not match', async () => {
    render(<RegisterClient />);

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

    render(<RegisterClient />);

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
    render(<RegisterClient />);

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

    render(<RegisterClient />);

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
      // No uid: the application is a callable that acts on the authenticated caller, so
      // passing one would suggest a client can apply on someone else's behalf.
      expect(mockSubmitProviderApplication).toHaveBeenCalledWith({
        fullName: 'Professional User',
        categoryIds: ['personal_training'],
      });
    });
  });

  it('lets an authenticated phone or social user opt in as a provider during profile completion', async () => {
    mockAuthState.firebaseUser = { uid: 'phone-or-social-uid', email: null };
    mockCompleteRegistration.mockResolvedValueOnce(undefined);
    mockSubmitProviderApplication.mockResolvedValueOnce(undefined);
    mockRefreshUserProfile.mockResolvedValueOnce(undefined);

    render(<RegisterClient />);

    expect(screen.getByText('Completa il profilo')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /professionista/i })).not.toBeChecked();

    fireEvent.change(screen.getByPlaceholderText('Mario Rossi'), {
      target: { value: 'Provider User' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /professionista/i }));
    fireEvent.click(screen.getByRole('button', { name: /Personal Training/i }));
    fireEvent.click(screen.getByLabelText(/Termini/i));
    fireEvent.click(screen.getByRole('button', { name: /Completa registrazione/i }));

    await waitFor(() => {
      expect(mockCompleteRegistration).toHaveBeenCalledWith(
        'phone-or-social-uid',
        expect.objectContaining({
          fullName: 'Provider User',
          preferredSection: 'fit',
          preferredLanguage: 'it',
        })
      );
      expect(mockSubmitProviderApplication).toHaveBeenCalledWith({
        fullName: 'Provider User',
        categoryIds: ['personal_training'],
      });
    });
  });

  it('requires all mandatory fields', async () => {
    render(<RegisterClient />);

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
    render(<RegisterClient />);

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
    render(<RegisterClient />);

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
    render(<RegisterClient />);

    // Navigate to email registration
    fireEvent.click(screen.getByText('Email e Password'));

    expect(screen.getByText(/Almeno 12 caratteri/i)).toBeInTheDocument();
  });

  it('toggles password visibility', () => {
    render(<RegisterClient />);

    // Navigate to email registration
    fireEvent.click(screen.getByText('Email e Password'));

    const passwordInput = screen.getByLabelText(/^Password/i) as HTMLInputElement;
    const toggleButton = screen.getByText('Mostra');

    expect(passwordInput.type).toBe('password');

    fireEvent.click(toggleButton);

    expect(passwordInput.type).toBe('text');
  });
});
