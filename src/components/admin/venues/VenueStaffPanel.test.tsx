import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  fetchVenueStaff: vi.fn(async () => [] as unknown[]),
  fetchVenueStaffLink: vi.fn(async () => null as unknown),
  setVenueStaff: vi.fn(async () => undefined),
  removeVenueStaff: vi.fn(async () => undefined),
  getUsers: vi.fn(async () => ({ users: [] as unknown[], total: 0, cursors: new Map() })),
  recordAudit: vi.fn(async () => undefined),
}));
vi.mock('@/lib/firebase/venues', () => ({
  fetchVenueStaff: h.fetchVenueStaff,
  fetchVenueStaffLink: h.fetchVenueStaffLink,
  setVenueStaff: h.setVenueStaff,
  removeVenueStaff: h.removeVenueStaff,
}));
vi.mock('@/lib/firebase/admin', () => ({ getUsers: h.getUsers }));
vi.mock('@/components/admin/auditLog', () => ({ recordAudit: h.recordAudit }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: string; role: string } }) => unknown) =>
    selector({ user: { id: 'admin-1', role: 'admin' } }),
}));

import { VenueStaffPanel } from './VenueStaffPanel';

const anna = { uid: 'u1', venueId: 'v1', isActive: true, name: 'Anna Verdi', email: 'anna@x.it', avatarUrl: null };
const bruno = { id: 'u2', fullName: 'Bruno Neri', email: 'bruno@x.it', avatarUrl: null };
const actor = { id: 'admin-1', role: 'admin' };

function renderPanel() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <VenueStaffPanel venueId="v1" />
    </QueryClientProvider>,
  );
}

async function pickBruno() {
  h.getUsers.mockResolvedValue({ users: [bruno], total: 1, cursors: new Map() });
  fireEvent.change(screen.getByRole('combobox', { name: 'Aggiungi un utente allo staff' }), { target: { value: 'bruno' } });
  fireEvent.click(within(await screen.findByRole('option', { name: /Bruno Neri/ })).getByRole('button'));
}

describe('VenueStaffPanel', () => {
  beforeEach(() => {
    Object.values(h).forEach((fn) => fn.mockClear());
    h.fetchVenueStaff.mockResolvedValue([anna]);
    h.fetchVenueStaffLink.mockResolvedValue(null);
    h.getUsers.mockResolvedValue({ users: [], total: 0, cursors: new Map() });
  });

  it('lists the current staff with name and email resolved from users', async () => {
    renderPanel();
    const row = (await screen.findByText('Anna Verdi')).closest('li') as HTMLElement;
    expect(row).toHaveTextContent('anna@x.it');
    expect(row).toHaveTextContent('Attivo');
  });

  it('adds a user found in the users search as active staff and audits it against the venue', async () => {
    renderPanel();
    await screen.findByText('Anna Verdi');
    await pickBruno();

    await waitFor(() => expect(h.setVenueStaff).toHaveBeenCalledWith('u2', 'v1', true));
    expect(h.getUsers).toHaveBeenCalledWith(expect.objectContaining({ search: 'bruno', status: 'active' }));
    await waitFor(() => expect(h.recordAudit).toHaveBeenCalledWith(actor, {
      action: 'update',
      entityType: 'venue',
      entityId: 'v1',
      after: { venueStaff: { uid: 'u2', venueId: 'v1', isActive: true } },
      reason: 'venue_staff_added',
    }));
  });

  it('refuses an account that already staffs another venue (one venue per account)', async () => {
    h.fetchVenueStaffLink.mockResolvedValue({ venueId: 'v9', isActive: true });
    renderPanel();
    await screen.findByText('Anna Verdi');
    await pickBruno();

    expect(await screen.findByRole('alert')).toHaveTextContent('già staff di un’altra sede (v9)');
    expect(h.setVenueStaff).not.toHaveBeenCalled();
    expect(h.recordAudit).not.toHaveBeenCalled();
  });

  it('toggles a member inactive and audits before/after', async () => {
    renderPanel();
    await screen.findByText('Anna Verdi');
    fireEvent.click(screen.getByRole('button', { name: 'Disattiva: Anna Verdi' }));

    await waitFor(() => expect(h.setVenueStaff).toHaveBeenCalledWith('u1', 'v1', false));
    await waitFor(() => expect(h.recordAudit).toHaveBeenCalledWith(actor, expect.objectContaining({
      action: 'suspend',
      entityType: 'venue',
      entityId: 'v1',
      before: { venueStaff: { uid: 'u1', venueId: 'v1', isActive: true } },
      after: { venueStaff: { uid: 'u1', venueId: 'v1', isActive: false } },
    })));
  });

  it('removes a member and audits the removal', async () => {
    renderPanel();
    await screen.findByText('Anna Verdi');
    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi: Anna Verdi' }));

    await waitFor(() => expect(h.removeVenueStaff).toHaveBeenCalledWith('u1'));
    await waitFor(() => expect(h.recordAudit).toHaveBeenCalledWith(actor, expect.objectContaining({
      entityType: 'venue',
      entityId: 'v1',
      before: { venueStaff: { uid: 'u1', venueId: 'v1', isActive: true } },
      reason: 'venue_staff_removed',
    })));
  });

  it('says so when the venue has no staff', async () => {
    h.fetchVenueStaff.mockResolvedValue([]);
    renderPanel();
    expect(await screen.findByText('Nessun membro dello staff per questa sede.')).toBeInTheDocument();
  });
});
