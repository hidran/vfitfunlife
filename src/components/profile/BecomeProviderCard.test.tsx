import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BecomeProviderCard } from './BecomeProviderCard';

const mockSubmitProviderApplication = vi.fn();
const mockLoadUserData = vi.fn();

type MockUser = { uid: string; fullName: string; role: string; providerStatus?: string; providerType?: string };
let mockUser: MockUser | null;

vi.mock('@/stores/authStore', () => {
  const useAuthStore = (selector?: (state: unknown) => unknown) => {
    const state = { user: mockUser };
    return selector ? selector(state) : state;
  };
  useAuthStore.getState = () => ({ user: mockUser, loadUserData: mockLoadUserData });
  return { useAuthStore };
});

vi.mock('@/lib/firebase/providerApplication', () => ({
  submitProviderApplication: (...args: unknown[]) => mockSubmitProviderApplication(...args),
}));

vi.mock('@/hooks/useServiceCategories', () => ({
  useServiceCategoryGroups: () => [
    {
      group: { id: 'strength_conditioning', name: 'Forza e Condizionamento', icon: '💪' },
      leaves: [{ id: 'personal_training', name: 'Personal Training', icon: '💪' }],
    },
  ],
}));

function renderCard() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BecomeProviderCard />
    </QueryClientProvider>
  );
}

function openAndPickService() {
  fireEvent.click(screen.getByRole('button', { name: 'Inizia' }));
  fireEvent.click(screen.getByRole('button', { name: /Personal Training/i }));
}

describe('BecomeProviderCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { uid: 'u1', fullName: 'Mario Rossi', role: 'customer' };
    mockLoadUserData.mockResolvedValue(null);
  });

  it('has a live announcer for errors as soon as the form opens', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Inizia' }));
    const announcer = document.querySelector('[aria-live="polite"]');
    expect(announcer).toBeInTheDocument();
    expect(announcer).toBeEmptyDOMElement();
  });

  it('submits an individual application by default', async () => {
    mockSubmitProviderApplication.mockResolvedValueOnce({ success: true, status: 'verified' });
    renderCard();

    openAndPickService();
    expect(screen.getByRole('radio', { name: 'Privato' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Invia richiesta' }));

    await waitFor(() => {
      expect(mockSubmitProviderApplication).toHaveBeenCalledWith(
        expect.objectContaining({
          fullName: 'Mario Rossi',
          categoryIds: ['personal_training'],
          providerType: 'individual',
        })
      );
      expect(mockSubmitProviderApplication.mock.calls[0][0].business).toBeUndefined();
    });
    expect(mockLoadUserData).toHaveBeenCalledWith('u1');
  });

  it('submits a company application with the business payload', async () => {
    mockSubmitProviderApplication.mockResolvedValueOnce({ success: true, status: 'pending' });
    renderCard();

    openAndPickService();
    fireEvent.click(screen.getByRole('radio', { name: 'Azienda' }));
    fireEvent.change(screen.getByLabelText('Ragione sociale'), { target: { value: 'Studio Pilates S.r.l.' } });
    fireEvent.change(screen.getByLabelText('Partita IVA'), { target: { value: '01234567897' } });
    fireEvent.change(screen.getByLabelText('Tipo di sede'), { target: { value: 'none' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invia richiesta' }));

    await waitFor(() => {
      expect(mockSubmitProviderApplication).toHaveBeenCalledWith({
        fullName: 'Mario Rossi',
        categoryIds: ['personal_training'],
        providerType: 'business',
        business: {
          legalName: 'Studio Pilates S.r.l.',
          vatNumber: '01234567897',
          displayName: 'Studio Pilates S.r.l.',
          venueType: 'none',
        },
      });
    });
  });

  it('shows the inline P.IVA error instead of submitting a company with a bad number', async () => {
    renderCard();

    openAndPickService();
    fireEvent.click(screen.getByRole('radio', { name: 'Azienda' }));
    fireEvent.change(screen.getByLabelText('Ragione sociale'), { target: { value: 'Studio Pilates S.r.l.' } });
    fireEvent.change(screen.getByLabelText('Partita IVA'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invia richiesta' }));

    expect(await screen.findByText(/Partita IVA non valida/)).toBeInTheDocument();
    expect(mockSubmitProviderApplication).not.toHaveBeenCalled();
  });

  it('clears the "check the company details" banner once the bad field is corrected', async () => {
    renderCard();

    openAndPickService();
    fireEvent.click(screen.getByRole('radio', { name: 'Azienda' }));
    fireEvent.change(screen.getByLabelText('Ragione sociale'), { target: { value: 'Studio Pilates S.r.l.' } });
    fireEvent.change(screen.getByLabelText('Partita IVA'), { target: { value: '123' } });
    fireEvent.change(screen.getByLabelText('Tipo di sede'), { target: { value: 'none' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invia richiesta' }));

    expect(await screen.findByText("Controlla i dati dell'azienda evidenziati.", { selector: 'p' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Partita IVA'), { target: { value: '01234567897' } });

    await waitFor(() => {
      expect(screen.queryByText("Controlla i dati dell'azienda evidenziati.", { selector: 'p' })).not.toBeInTheDocument();
    });
  });

  it('maps a duplicate P.IVA from the server to the inline message', async () => {
    mockSubmitProviderApplication.mockRejectedValueOnce(
      Object.assign(new Error('business_vat_taken'), { code: 'functions/already-exists' })
    );
    renderCard();

    openAndPickService();
    fireEvent.click(screen.getByRole('radio', { name: 'Azienda' }));
    fireEvent.change(screen.getByLabelText('Ragione sociale'), { target: { value: 'Studio Pilates S.r.l.' } });
    fireEvent.change(screen.getByLabelText('Partita IVA'), { target: { value: '01234567897' } });
    fireEvent.change(screen.getByLabelText('Tipo di sede'), { target: { value: 'none' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invia richiesta' }));

    await waitFor(() => {
      expect(screen.getAllByText('Questa partita IVA è già registrata').length).toBeGreaterThan(0);
    });
    expect(screen.getByLabelText('Partita IVA')).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(screen.getByLabelText('Partita IVA')).toHaveFocus());
  });

  it('tells a pending company that its P.IVA is being verified', () => {
    mockUser = { uid: 'u1', fullName: 'Mario Rossi', role: 'customer', providerStatus: 'pending', providerType: 'business' };
    renderCard();
    expect(screen.getByText(/Stiamo verificando la partita IVA/)).toBeInTheDocument();
  });

  it('keeps the generic pending copy for an individual', () => {
    mockUser = { uid: 'u1', fullName: 'Mario Rossi', role: 'customer', providerStatus: 'pending' };
    renderCard();
    expect(screen.getByText(/Sarai visibile dopo l'approvazione/)).toBeInTheDocument();
  });
});
