import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  fetchSchedule: vi.fn(),
  getProviderClients: vi.fn(),
  fetchProviderServices: vi.fn(),
}));

vi.mock('@/stores/providerStore', () => ({
  useProviderStore: (select: (s: unknown) => unknown) =>
    select({ schedule: [], fetchSchedule: h.fetchSchedule, isLoadingSchedule: false }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (s: unknown) => unknown) => select({ user: { id: 'trainer-1' } }),
}));
// The real calendar is a big grid; a single day button is all these tests need from it.
vi.mock('@/components/provider/Calendar', () => ({
  Calendar: ({ onDateSelect }: { onDateSelect: (d: Date) => void }) => (
    <button type="button" onClick={() => onDateSelect(new Date(2099, 0, 5))}>giorno 5</button>
  ),
}));
vi.mock('@/lib/firebase/provider', () => ({
  getProviderClients: h.getProviderClients,
  getUpcomingConfirmedSessions: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/firebase/providers', () => ({ fetchProviderServices: h.fetchProviderServices }));
vi.mock('@/lib/firebase/availability', () => ({ fetchProviderSlots: vi.fn(), applyDateOverride: vi.fn() }));
vi.mock('@/lib/firebase/functions', () => ({ createBookingAsTrainer: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notify: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import ProviderSchedulePage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  h.getProviderClients.mockResolvedValue([]);
  h.fetchProviderServices.mockResolvedValue([]);
});

describe('/provider/schedule day actions', () => {
  it('"Aggiungi appuntamento" opens the new-appointment sheet for the tapped day', async () => {
    render(<ProviderSchedulePage />);
    fireEvent.click(screen.getByRole('button', { name: 'giorno 5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi appuntamento' }));

    expect(screen.getByRole('dialog', { name: 'Nuovo appuntamento' })).toBeInTheDocument();
    // The day menu closes behind it.
    expect(screen.queryByRole('button', { name: 'Imposta giorno libero' })).toBeNull();
    expect(await screen.findByLabelText('Data')).toHaveValue('2099-01-05');
    expect(h.getProviderClients).toHaveBeenCalled();
  });

  it('"Blocca orario" and "Imposta giorno libero" open their own dialogs', () => {
    render(<ProviderSchedulePage />);
    fireEvent.click(screen.getByRole('button', { name: 'giorno 5' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Blocca orario' }).at(-1)!);
    expect(screen.getByRole('dialog', { name: 'Blocca orario' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Data')).toBeNull(); // the day is already chosen
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));

    fireEvent.click(screen.getByRole('button', { name: 'giorno 5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Imposta giorno libero' }));
    expect(screen.getByRole('dialog', { name: 'Imposta giorno libero' })).toBeInTheDocument();
  });

  it('the header "Blocca orario" asks for the date', () => {
    render(<ProviderSchedulePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Blocca orario' }));
    expect(screen.getByRole('dialog', { name: 'Blocca orario' })).toBeInTheDocument();
    expect(screen.getByLabelText('Data')).toBeInTheDocument();
  });
});
