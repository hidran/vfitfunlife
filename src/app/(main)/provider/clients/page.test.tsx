import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  fetchClients: vi.fn(),
  addClientByEmail: vi.fn(),
  inviteClientToPlatform: vi.fn(),
}));

vi.mock('@/stores/providerStore', () => ({
  useProviderStore: (select: (s: unknown) => unknown) =>
    select({ clients: [], isLoadingClients: false, fetchClients: h.fetchClients }),
}));
vi.mock('@/lib/firebase/functions', () => ({
  addClientByEmail: h.addClientByEmail,
  inviteClientToPlatform: h.inviteClientToPlatform,
}));

import ProviderClientsPage from './page';

beforeEach(() => vi.clearAllMocks());

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
});
