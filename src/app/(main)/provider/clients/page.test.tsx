import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  fetchClients: vi.fn(),
  addClientByEmail: vi.fn(),
  inviteClientToPlatform: vi.fn(),
  createClientAccount: vi.fn(),
  clients: [] as unknown[],
}));

vi.mock('@/stores/providerStore', () => ({
  useProviderStore: (select: (s: unknown) => unknown) =>
    select({ clients: h.clients, isLoadingClients: false, fetchClients: h.fetchClients }),
}));
vi.mock('@/lib/firebase/functions', () => ({
  addClientByEmail: h.addClientByEmail,
  inviteClientToPlatform: h.inviteClientToPlatform,
  createClientAccount: h.createClientAccount,
}));

import ProviderClientsPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  h.clients = [];
});

describe('/provider/clients — add a client by email', () => {
  it('reveals the email field and reloads the roster after adding', async () => {
    h.addClientByEmail.mockResolvedValue({
      status: 'added',
      alreadyClient: false,
      client: { id: 't_u', userId: 'u', name: 'Anna', email: 'anna@example.com' },
    });
    render(<ProviderClientsPage />);
    expect(h.fetchClients).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Nuovo cliente' }));
    fireEvent.change(screen.getByLabelText('Email del cliente'), { target: { value: 'anna@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cerca e aggiungi' }));

    expect(await screen.findByText('Anna è ora tra i tuoi clienti.')).toBeInTheDocument();
    await waitFor(() => expect(h.fetchClients).toHaveBeenCalledTimes(2));
  });

  it('creates the account of an unknown address and reloads the roster', async () => {
    h.addClientByEmail.mockResolvedValue({ status: 'not_found' });
    h.createClientAccount.mockResolvedValue({
      status: 'created',
      emailSent: true,
      client: { id: 't_u2', userId: 'u2', name: 'Bea Neri', email: 'bea@example.com' },
    });
    render(<ProviderClientsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Nuovo cliente' }));
    fireEvent.change(screen.getByLabelText('Email del cliente'), { target: { value: 'bea@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cerca e aggiungi' }));
    fireEvent.change(await screen.findByLabelText('Nome e cognome'), { target: { value: 'Bea Neri' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aggiungi cliente e invia email' }));

    expect(await screen.findByText(/Bea Neri è ora tra i tuoi clienti/)).toBeInTheDocument();
    await waitFor(() => expect(h.fetchClients).toHaveBeenCalledTimes(2));
  });

  it('marks clients whose account is not confirmed yet', () => {
    h.clients = [
      { id: 'a', userId: 'ua', name: 'Anna', email: 'anna@example.com', totalBookings: 0, totalSpent: 0, accountStatus: 'invited' },
      { id: 'b', userId: 'ub', name: 'Bruno', email: 'bruno@example.com', totalBookings: 0, totalSpent: 0 },
    ];
    render(<ProviderClientsPage />);
    expect(screen.getAllByText('In attesa di conferma')).toHaveLength(1);
  });
});
