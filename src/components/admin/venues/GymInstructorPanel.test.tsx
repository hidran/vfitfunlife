import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  venueCall: vi.fn(async () => ({ success: true })),
  fetchVenueInstructorLinks: vi.fn(async () => [] as unknown[]),
  getProviders: vi.fn(async () => ({ providers: [] as unknown[], total: 0, cursors: new Map() })),
}));
vi.mock('@/lib/firebase/venueSpaces', () => ({
  venueCall: h.venueCall,
  fetchVenueInstructorLinks: h.fetchVenueInstructorLinks,
}));
vi.mock('@/lib/firebase/admin', () => ({ getProviders: h.getProviders }));

import { GymInstructorPanel } from './GymInstructorPanel';

function renderPanel() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <GymInstructorPanel venueId="v1" />
    </QueryClientProvider>,
  );
}

const anna = { id: 'p1', fullName: 'Anna Verdi', email: 'anna@x.it', avatarUrl: null, providerType: 'individual' };

async function pickAnna() {
  h.getProviders.mockResolvedValue({ providers: [anna], total: 1, cursors: new Map() });
  fireEvent.change(screen.getByRole('combobox', { name: 'Cerca un istruttore verificato' }), { target: { value: 'anna' } });
  fireEvent.click(within(await screen.findByRole('option', { name: /Anna Verdi/ })).getByRole('button'));
}

describe('GymInstructorPanel', () => {
  beforeEach(() => {
    h.venueCall.mockClear();
    h.venueCall.mockResolvedValue({ success: true });
    h.fetchVenueInstructorLinks.mockReset();
    h.fetchVenueInstructorLinks.mockResolvedValue([]);
    h.getProviders.mockReset();
    h.getProviders.mockResolvedValue({ providers: [], total: 0, cursors: new Map() });
  });

  it('searches verified providers by name and shows name and kind', async () => {
    renderPanel();
    h.getProviders.mockResolvedValue({ providers: [anna], total: 1, cursors: new Map() });
    fireEvent.change(screen.getByRole('combobox', { name: 'Cerca un istruttore verificato' }), { target: { value: 'anna' } });

    const option = await screen.findByRole('option', { name: /Anna Verdi/ });
    expect(option).toHaveTextContent('Professionista');
    expect(h.getProviders).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'anna', verificationStatus: 'verified', status: 'active' }),
    );
  });

  it('links the picked provider with the chosen partnership status and active flag', async () => {
    renderPanel();
    await pickAnna();
    expect(screen.getByText('Anna Verdi')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Stato partnership'), { target: { value: 'active' } });
    fireEvent.click(screen.getByRole('button', { name: 'Collega istruttore' }));

    await waitFor(() => expect(h.venueCall).toHaveBeenCalledWith('configureGymInstructor', {
      venueId: 'v1', instructorId: 'p1', partnerStatus: 'active', isActive: true,
    }));
    // The selection is cleared for the next link.
    await screen.findByRole('combobox', { name: 'Cerca un istruttore verificato' });
  });

  it('shows the callable error code as a real message, not "operation failed"', async () => {
    renderPanel();
    await pickAnna();
    h.venueCall.mockRejectedValueOnce(Object.assign(new Error('verified_instructor_required'), { code: 'functions/failed-precondition' }));
    fireEvent.click(screen.getByRole('button', { name: 'Collega istruttore' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('L’istruttore deve essere un fornitore verificato.');
    expect(screen.queryByText('Operazione non riuscita.')).not.toBeInTheDocument();
  });

  it('explains a venue that cannot host instructors', async () => {
    renderPanel();
    await pickAnna();
    h.venueCall.mockRejectedValueOnce(new Error('gym_not_found'));
    fireEvent.click(screen.getByRole('button', { name: 'Collega istruttore' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Struttura non trovata.');
  });

  it('lists the linked instructors with their partnership status and toggles one off', async () => {
    h.fetchVenueInstructorLinks.mockResolvedValue([
      { id: 'p1', name: 'Anna Verdi', isActive: true, partnerStatus: 'active' },
      { id: 'p2', name: 'Bruno Neri', isActive: false, partnerStatus: 'suspended' },
    ]);
    renderPanel();
    const anna = (await screen.findByText('Anna Verdi')).closest('li') as HTMLElement;
    expect(anna).toHaveTextContent('Stato partnership: Attivo');
    const bruno = screen.getByText('Bruno Neri').closest('li') as HTMLElement;
    expect(bruno).toHaveTextContent('Stato partnership: Sospeso');
    expect(bruno).toHaveTextContent('Non attivo');

    fireEvent.click(screen.getByRole('button', { name: 'Disattiva: Anna Verdi' }));
    await waitFor(() => expect(h.venueCall).toHaveBeenCalledWith('configureGymInstructor', {
      venueId: 'v1', instructorId: 'p1', partnerStatus: 'active', isActive: false,
    }));
  });

  it('says so when nobody is linked yet', async () => {
    renderPanel();
    expect(await screen.findByText('Nessun istruttore collegato a questa sede.')).toBeInTheDocument();
  });
});
