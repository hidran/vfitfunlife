import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegisterClient } from './RegisterClient';
import { canAccessProviderArea } from '@/lib/providerStatus';
import type { ProviderStatus } from '@/types/firebase';

// Business (company / association) signup — plan 2026-10-04, task B5. The individual path is
// covered by page.email-register.test.tsx, which must keep passing unchanged.

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

const mockRegisterWithEmail = vi.fn();
const mockClearError = vi.fn();
const mockSubmitProviderApplication = vi.fn();
const mockCompleteRegistration = vi.fn();
const mockRefreshUserProfile = vi.fn();

type MockAuthState = {
  firebaseUser: { uid: string; email: string | null } | null;
  user: { providerStatus?: ProviderStatus; providerType?: string; role?: string; fullName?: string } | null;
  refreshUserProfile: typeof mockRefreshUserProfile;
  registerWithEmail: typeof mockRegisterWithEmail;
  clearError: typeof mockClearError;
  error: string | null;
  isLoading: boolean;
};

let mockAuthState: MockAuthState;

vi.mock('@/stores/authStore', () => {
  const useAuthStore = (selector?: (state: unknown) => unknown) =>
    selector ? selector(mockAuthState) : mockAuthState;
  useAuthStore.getState = () => ({
    ...mockAuthState,
    firebaseUser: mockAuthState.firebaseUser ?? { uid: 'new-uid', email: 'new@example.com' },
  });
  // Like zustand's: a partial merged into the state (what the provider layout then reads).
  useAuthStore.setState = (partial: Partial<MockAuthState>) => {
    mockAuthState = { ...mockAuthState, ...partial };
  };
  return { useAuthStore };
});

vi.mock('@/lib/firebase/auth', () => ({
  completeRegistration: (...args: unknown[]) => mockCompleteRegistration(...args),
}));

vi.mock('@/lib/firebase/providerApplication', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/firebase/providerApplication')>()),
  submitProviderApplication: (...args: unknown[]) => mockSubmitProviderApplication(...args),
}));

vi.mock('@/hooks/useServiceCategories', () => ({
  useServiceCategoryGroups: () => [
    {
      group: { id: 'combat', name: 'Arti marziali', icon: '🥋' },
      leaves: [{ id: 'karate', name: 'Karate', icon: '🥋' }],
    },
  ],
}));

const VALID_PIVA = '00743110157';

const BUSINESS = {
  legalName: 'ASD Karate Roma',
  vatNumber: VALID_PIVA,
  legalForm: 'association',
  displayName: 'ASD Karate Roma',
  website: 'https://www.karateroma.it',
};

function fillAccount() {
  fireEvent.change(screen.getByLabelText(/Nome completo/i), { target: { value: 'Mia Rossi' } });
  fireEvent.change(screen.getByLabelText(/^Email/i), { target: { value: 'mia@example.com' } });
  fireEvent.change(screen.getByLabelText(/^Password/i), { target: { value: 'StrongPassword123!' } });
  fireEvent.change(screen.getByLabelText(/Conferma Password/i), { target: { value: 'StrongPassword123!' } });
}

function chooseCompany() {
  fireEvent.click(screen.getByRole('radio', { name: 'Azienda o associazione' }));
}

function fillBusiness(vat = VALID_PIVA) {
  fireEvent.change(screen.getByLabelText(/^Ragione sociale/), { target: { value: 'ASD Karate Roma' } });
  fireEvent.change(screen.getByLabelText(/^P\.IVA \/ Codice fiscale/), { target: { value: vat } });
  fireEvent.change(screen.getByLabelText(/^Forma giuridica/), { target: { value: 'association' } });
  fireEvent.change(screen.getByLabelText(/^Sito web/), { target: { value: 'www.karateroma.it' } });
}

function pickKarateAcceptAndSubmit(buttonName: RegExp = /Crea account/i) {
  fireEvent.click(screen.getByRole('button', { name: /Karate/ }));
  fireEvent.click(screen.getByLabelText(/Termini/i));
  fireEvent.click(screen.getByRole('button', { name: buttonName }));
}

describe('Register as a company or association', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams('as=provider');
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

  it('offers individual or company once professional is chosen; the company form shows only for a company', async () => {
    const user = userEvent.setup();
    render(<RegisterClient />);

    const individual = screen.getByRole('radio', { name: 'Singolo professionista' });
    expect(individual).toBeChecked();
    expect(screen.queryByRole('group', { name: "Dati dell'attività" })).toBeNull();

    // Keyboard: the two options are one radio group.
    individual.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Azienda o associazione' })).toBeChecked();
    expect(screen.getByRole('group', { name: "Dati dell'attività" })).toBeVisible();
    expect(screen.getByText('Seleziona i servizi che offri')).toBeVisible();

    await user.keyboard('{ArrowLeft}');
    expect(individual).toBeChecked();
    expect(screen.queryByRole('group', { name: "Dati dell'attività" })).toBeNull();
  });

  it('keeps what was typed when switching away and back', () => {
    render(<RegisterClient />);
    chooseCompany();
    fireEvent.change(screen.getByLabelText(/^Ragione sociale/), { target: { value: 'ASD Karate Roma' } });

    fireEvent.click(screen.getByRole('radio', { name: 'Singolo professionista' }));
    chooseCompany();

    expect(screen.getByLabelText(/^Ragione sociale/)).toHaveValue('ASD Karate Roma');
  });

  it('creates the account, then applies as a business with the details', async () => {
    // Registering loads a customer profile into the store; the reload after applying lags.
    mockRegisterWithEmail.mockImplementationOnce(async () => {
      mockAuthState.user = { role: 'customer', fullName: 'Mia Rossi', providerStatus: 'none' };
    });
    mockSubmitProviderApplication.mockResolvedValueOnce({ success: true, providerId: 'new-uid', autoApproved: false });
    render(<RegisterClient />);

    fillAccount();
    chooseCompany();
    fillBusiness();
    pickKarateAcceptAndSubmit();

    await waitFor(() =>
      expect(mockSubmitProviderApplication).toHaveBeenCalledWith({
        fullName: 'Mia Rossi',
        categoryIds: ['karate'],
        providerType: 'business',
        business: BUSINESS,
      })
    );
    expect(mockRegisterWithEmail).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/auth/permissions'));
    // The reloaded profile lagged: the callable's answer is in the store for the next screens.
    expect(mockAuthState.user).toMatchObject({ providerStatus: 'pending', providerType: 'business' });
  });

  it('sends exactly the individual payload after switching back from a company with a bad tax id', async () => {
    mockRegisterWithEmail.mockResolvedValueOnce(undefined);
    mockSubmitProviderApplication.mockResolvedValueOnce({ success: true, providerId: 'new-uid', autoApproved: true });
    render(<RegisterClient />);

    fillAccount();
    chooseCompany();
    fillBusiness('12345678904');
    fireEvent.click(screen.getByRole('radio', { name: 'Singolo professionista' }));
    pickKarateAcceptAndSubmit();

    await waitFor(() => expect(mockSubmitProviderApplication).toHaveBeenCalledTimes(1));
    const [payload] = mockSubmitProviderApplication.mock.calls[0];
    expect(payload).toEqual({ categoryIds: ['karate'], fullName: 'Mia Rossi' });
    expect(Object.keys(payload).sort()).toEqual(['categoryIds', 'fullName']);
  });

  it('stays on the form when the profile loads after a failed company application', async () => {
    mockRegisterWithEmail.mockResolvedValueOnce(undefined);
    mockSubmitProviderApplication.mockRejectedValueOnce(new Error('vat_already_registered'));
    const { rerender } = render(<RegisterClient />);

    fillAccount();
    chooseCompany();
    fillBusiness();
    pickKarateAcceptAndSubmit();
    await waitFor(() => expect(screen.getByLabelText(/^P\.IVA \/ Codice fiscale/)).toHaveFocus());

    // The auth listener reloads the new profile a moment later.
    mockAuthState = { ...mockAuthState, user: { role: 'customer', fullName: 'Mia Rossi', providerStatus: 'none' } };
    rerender(<RegisterClient />);

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Ragione sociale/)).toHaveValue('ASD Karate Roma');
  });

  it('still sends an already-registered visitor away from the form', () => {
    mockAuthState.user = { role: 'customer', fullName: 'Mia Rossi', providerStatus: 'none' };
    render(<RegisterClient />);
    expect(mockReplace).toHaveBeenCalledWith('/profile');
  });

  it('checks the company details before creating the account, focusing the first bad field', async () => {
    render(<RegisterClient />);

    fillAccount();
    chooseCompany();
    fillBusiness('12345678904');
    pickKarateAcceptAndSubmit();

    const vat = screen.getByLabelText(/^P\.IVA \/ Codice fiscale/);
    await waitFor(() => expect(vat).toHaveFocus());
    expect(vat).toHaveAccessibleDescription(expect.stringContaining('P.IVA o codice fiscale non valido'));
    expect(mockRegisterWithEmail).not.toHaveBeenCalled();
    expect(mockSubmitProviderApplication).not.toHaveBeenCalled();
  });

  it('shows a duplicate tax id on its field, and a retry re-sends only the application', async () => {
    mockRegisterWithEmail.mockResolvedValueOnce(undefined);
    mockSubmitProviderApplication
      .mockRejectedValueOnce(Object.assign(new Error('vat_already_registered'), { code: 'functions/already-exists' }))
      .mockResolvedValueOnce({ success: true, providerId: 'new-uid', autoApproved: false });
    render(<RegisterClient />);

    fillAccount();
    chooseCompany();
    fillBusiness();
    pickKarateAcceptAndSubmit();

    const vat = screen.getByLabelText(/^P\.IVA \/ Codice fiscale/);
    await waitFor(() => expect(vat).toHaveFocus());
    expect(vat).toHaveAccessibleDescription(expect.stringContaining('già registrato da un altro account'));
    expect(screen.queryByText('vat_already_registered')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();

    // The account exists now: its fields are read-only, pointing at the hint that says why.
    for (const label of [/Nome completo/i, /^Email/i, /^Password/i, /Conferma Password/i, /Data di nascita/i]) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveAttribute('readonly');
      expect(input).toHaveAccessibleDescription(
        'Account già creato: ora puoi modificare solo i dati professionali.'
      );
    }
    expect(screen.getByRole('button', { name: 'VFun' })).toBeDisabled();
    // The professional part stays editable.
    expect(vat).not.toHaveAttribute('readonly');
    expect(vat).toBeEnabled();

    // Fixing the tax id and submitting again must not re-register.
    fireEvent.change(vat, { target: { value: '12345678903' } });
    fireEvent.click(screen.getByRole('button', { name: /Crea account/i }));

    await waitFor(() => expect(mockSubmitProviderApplication).toHaveBeenCalledTimes(2));
    expect(mockSubmitProviderApplication.mock.calls[1][0].business.vatNumber).toBe('12345678903');
    expect(mockRegisterWithEmail).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/auth/permissions'));
  });

  it.each([
    ['concurrent_update', 'Qualcosa è cambiato durante il salvataggio. Riprova.'],
    ['business_already_approved', /La tua attività è già approvata/],
    ['invalid_business', /Dati dell'attività mancanti o non validi/],
  ])('shows %s as a localised form error, never the raw code', async (code, text) => {
    mockRegisterWithEmail.mockResolvedValueOnce(undefined);
    mockSubmitProviderApplication.mockRejectedValueOnce(new Error(code));
    render(<RegisterClient />);

    fillAccount();
    chooseCompany();
    fillBusiness();
    pickKarateAcceptAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.queryByText(code)).toBeNull();
  });

  it('maps business_account_exists for an individual too', async () => {
    mockRegisterWithEmail.mockResolvedValueOnce(undefined);
    mockSubmitProviderApplication.mockRejectedValueOnce(new Error('business_account_exists'));
    render(<RegisterClient />);

    fillAccount();
    pickKarateAcceptAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent(/già registrato come azienda o associazione/);
    expect(mockSubmitProviderApplication).toHaveBeenCalledWith({ fullName: 'Mia Rossi', categoryIds: ['karate'] });
  });

  it('keeps the generic message for the older plain-sentence errors', async () => {
    mockRegisterWithEmail.mockResolvedValueOnce(undefined);
    mockSubmitProviderApplication.mockRejectedValueOnce(new Error('Pick at least one category'));
    render(<RegisterClient />);

    fillAccount();
    pickKarateAcceptAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Errore durante la registrazione. Riprova.');
    expect(screen.queryByText('Pick at least one category')).toBeNull();
  });

  describe('profile completion (phone / social sign-up)', () => {
    beforeEach(() => {
      mockSearchParams = new URLSearchParams();
      mockAuthState.firebaseUser = { uid: 'social-uid', email: null };
      mockCompleteRegistration.mockResolvedValue(undefined);
      mockRefreshUserProfile.mockResolvedValue(undefined);
    });

    function fillSocial() {
      fireEvent.change(screen.getByPlaceholderText('Mario Rossi'), { target: { value: 'Mia Rossi' } });
      fireEvent.click(screen.getByRole('checkbox', { name: /professionista/i }));
    }

    it('applies as a business and, while the profile lags, lands on the pending provider area', async () => {
      mockSubmitProviderApplication.mockResolvedValueOnce({ success: true, providerId: 'social-uid', autoApproved: false });
      // The reloaded profile does not show the application yet.
      mockAuthState.user = { role: 'customer', fullName: '' };
      render(<RegisterClient />);

      fillSocial();
      chooseCompany();
      fillBusiness();
      pickKarateAcceptAndSubmit(/Completa registrazione/i);

      await waitFor(() =>
        expect(mockSubmitProviderApplication).toHaveBeenCalledWith({
          fullName: 'Mia Rossi',
          categoryIds: ['karate'],
          providerType: 'business',
          business: BUSINESS,
        })
      );
      await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/provider/dashboard'));
      // ...and the store says so too: the provider layout reads it, so it lets them in instead
      // of bouncing them to /profile.
      expect(mockAuthState.user).toMatchObject({ providerStatus: 'pending', providerType: 'business' });
      expect(canAccessProviderArea(mockAuthState.user?.providerStatus)).toBe(true);
    });

    it('shows an invalid website on its field', async () => {
      mockSubmitProviderApplication.mockRejectedValueOnce(new Error('invalid_website'));
      render(<RegisterClient />);

      fillSocial();
      chooseCompany();
      fillBusiness();
      pickKarateAcceptAndSubmit(/Completa registrazione/i);

      const website = screen.getByLabelText(/^Sito web/);
      await waitFor(() => expect(website).toHaveFocus());
      expect(website).toHaveAccessibleDescription('Indirizzo del sito non valido. Esempio: www.tuosito.it');
      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});
