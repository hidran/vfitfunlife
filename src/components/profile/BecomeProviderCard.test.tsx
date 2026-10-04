import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BecomeProviderCard } from './BecomeProviderCard';

const mockSubmitProviderApplication = vi.fn();
const mockLoadUserData = vi.fn();

type MockUser = {
  uid: string;
  fullName: string;
  role: string;
  providerStatus?: string;
  providerType?: string;
};
let mockUser: MockUser;

vi.mock('@/stores/authStore', () => {
  const state = () => ({ user: mockUser, loadUserData: mockLoadUserData });
  const useAuthStore = (selector?: (s: unknown) => unknown) => (selector ? selector(state()) : state());
  useAuthStore.getState = state;
  return { useAuthStore };
});

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

function renderCard() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BecomeProviderCard />
    </QueryClientProvider>
  );
}

function openAndPickKarate() {
  fireEvent.click(screen.getByRole('button', { name: 'Inizia' }));
  fireEvent.click(screen.getByRole('button', { name: /Karate/ }));
}

function chooseCompanyAndFill() {
  fireEvent.click(screen.getByRole('radio', { name: 'Azienda o associazione' }));
  fireEvent.change(screen.getByLabelText(/^Ragione sociale/), { target: { value: 'Karate Club Roma SRL' } });
  fireEvent.change(screen.getByLabelText(/^P\.IVA \/ Codice fiscale/), { target: { value: VALID_PIVA } });
  fireEvent.change(screen.getByLabelText(/^Sito web/), { target: { value: 'www.karateroma.it' } });
}

const submitButton = () => screen.getByRole('button', { name: 'Invia richiesta' });

describe('BecomeProviderCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { uid: 'u1', fullName: 'Mia Rossi', role: 'customer', providerStatus: 'none' };
    mockLoadUserData.mockResolvedValue(null);
  });

  it('offers individual or company, individual selected, and reveals the company form only for a company', () => {
    renderCard();
    openAndPickKarate();

    expect(screen.getByRole('radio', { name: 'Singolo professionista' })).toBeChecked();
    // Hidden, so out of the accessibility tree too.
    expect(screen.queryByRole('group', { name: "Dati dell'attività" })).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Azienda o associazione' }));
    expect(screen.getByRole('group', { name: "Dati dell'attività" })).toBeVisible();
    // The categories picker stays.
    expect(screen.getByText('Seleziona i servizi che offri')).toBeVisible();

    fireEvent.click(screen.getByRole('radio', { name: 'Singolo professionista' }));
    // Hidden, so out of the accessibility tree too.
    expect(screen.queryByRole('group', { name: "Dati dell'attività" })).toBeNull();
  });

  it('keeps the individual application unchanged', async () => {
    mockSubmitProviderApplication.mockResolvedValueOnce({ success: true, providerId: 'u1', autoApproved: true });
    renderCard();
    openAndPickKarate();

    fireEvent.click(submitButton());

    await waitFor(() => expect(mockSubmitProviderApplication).toHaveBeenCalledTimes(1));
    const [payload] = mockSubmitProviderApplication.mock.calls[0];
    expect(payload).toEqual({ categoryIds: ['karate'], fullName: 'Mia Rossi' });
    expect(Object.keys(payload).sort()).toEqual(['categoryIds', 'fullName']);
    // Approved on the spot: the card turns into the way in, even before the user reloads.
    expect(await screen.findByRole('link', { name: /Sei un professionista/ })).toHaveAttribute(
      'href',
      '/provider/dashboard'
    );
    expect(mockLoadUserData).toHaveBeenCalledWith('u1');
  });

  it('sends a company with its details and lands on the pending card that mentions the tax id', async () => {
    mockSubmitProviderApplication.mockResolvedValueOnce({ success: true, providerId: 'u1', autoApproved: false });
    renderCard();
    openAndPickKarate();
    chooseCompanyAndFill();

    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(mockSubmitProviderApplication).toHaveBeenCalledWith({
        categoryIds: ['karate'],
        fullName: 'Mia Rossi',
        providerType: 'business',
        business: {
          legalName: 'Karate Club Roma SRL',
          vatNumber: VALID_PIVA,
          legalForm: 'company',
          displayName: 'Karate Club Roma SRL',
          website: 'https://www.karateroma.it',
        },
      })
    );
    expect(await screen.findByText('Richiesta in revisione')).toBeInTheDocument();
    expect(screen.getByText(/Stiamo verificando la P\.IVA \/ il codice fiscale/)).toBeInTheDocument();
  });

  it('shows the business copy on the pending card for a stored company', () => {
    mockUser = { ...mockUser, providerStatus: 'pending', providerType: 'business' };
    renderCard();
    expect(screen.getByText(/Stiamo verificando la P\.IVA \/ il codice fiscale/)).toBeInTheDocument();
  });

  it('keeps the original pending copy for an individual', () => {
    mockUser = { ...mockUser, providerStatus: 'pending' };
    renderCard();
    expect(screen.getByText("Sarai visibile dopo l'approvazione di un amministratore.")).toBeInTheDocument();
  });

  it('does not submit an invalid company and focuses the first invalid field', async () => {
    renderCard();
    openAndPickKarate();
    fireEvent.click(screen.getByRole('radio', { name: 'Azienda o associazione' }));
    fireEvent.change(screen.getByLabelText(/^Ragione sociale/), { target: { value: 'Karate Club Roma SRL' } });
    fireEvent.change(screen.getByLabelText(/^P\.IVA \/ Codice fiscale/), { target: { value: '12345678904' } });

    fireEvent.click(submitButton());

    await waitFor(() => expect(screen.getByLabelText(/^P\.IVA \/ Codice fiscale/)).toHaveFocus());
    expect(screen.getByText('P.IVA o codice fiscale non valido: controlla le 11 cifre.')).toBeInTheDocument();
    expect(mockSubmitProviderApplication).not.toHaveBeenCalled();
  });

  it('shows a duplicate tax id on the tax id field, focused', async () => {
    mockSubmitProviderApplication.mockRejectedValueOnce(
      Object.assign(new Error('vat_already_registered'), { code: 'functions/already-exists' })
    );
    renderCard();
    openAndPickKarate();
    chooseCompanyAndFill();

    fireEvent.click(submitButton());

    const vat = screen.getByLabelText(/^P\.IVA \/ Codice fiscale/);
    await waitFor(() => expect(vat).toHaveFocus());
    expect(vat).toHaveAccessibleDescription(expect.stringContaining('già registrato da un altro account'));
    expect(screen.queryByText('vat_already_registered')).toBeNull();
    expect(screen.queryByText('Qualcosa è andato storto. Riprova.')).toBeNull();
  });

  it('shows a concurrent update as "try again" under the form', async () => {
    mockSubmitProviderApplication.mockRejectedValueOnce(new Error('concurrent_update'));
    renderCard();
    openAndPickKarate();
    chooseCompanyAndFill();

    fireEvent.click(submitButton());

    expect(await screen.findByText('Qualcosa è cambiato durante il salvataggio. Riprova.')).toBeInTheDocument();
    expect(screen.queryByText('concurrent_update')).toBeNull();
  });

  it('keeps the generic message for the older plain-sentence errors', async () => {
    mockSubmitProviderApplication.mockRejectedValueOnce(new Error('Pick at least one category'));
    renderCard();
    openAndPickKarate();

    fireEvent.click(submitButton());

    expect(await screen.findByText('Qualcosa è andato storto. Riprova.')).toBeInTheDocument();
    expect(screen.queryByText('Pick at least one category')).toBeNull();
  });
});
