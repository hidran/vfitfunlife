import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  updateDoc: vi.fn(async () => undefined),
  venue: {} as Record<string, unknown>,
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  updateDoc: h.updateDoc,
  deleteDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: [] })),
  collection: vi.fn(),
  serverTimestamp: () => 'ts',
}));
vi.mock('@googlemaps/js-api-loader', () => ({ Loader: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/components/admin/auditLog', () => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock('@/hooks/useFirestoreDocQuery', () => ({
  useFirestoreDocQuery: () => ({ data: h.venue, isLoading: false }),
}));

import { VenueDetailView } from './VenueDetailView';

function renderView() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <VenueDetailView venueId="v1" />
    </QueryClientProvider>,
  );
}

describe('VenueDetailView', () => {
  beforeEach(() => {
    h.updateDoc.mockClear();
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  });

  it('saves a string address plus top-level city, zipCode and country, replacing a legacy object', async () => {
    h.venue = {
      id: 'v1',
      name: 'Spa Bianchi',
      type: 'wellness_center',
      address: { street: 'Via Po 2', city: 'Torino', zipCode: '10100', country: 'IT' },
      lat: 45.0703,
      lng: 7.6869,
    };
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /Modifica/ }));
    // The legacy object pre-fills the form.
    expect(screen.getByLabelText('Via')).toHaveValue('Via Po 2');
    fireEvent.change(screen.getByLabelText('Via'), { target: { value: 'Via Roma 9' } });
    fireEvent.click(screen.getByRole('button', { name: /Salva/ }));

    await waitFor(() => expect(h.updateDoc).toHaveBeenCalledTimes(1));
    const patch = (h.updateDoc.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(patch.address).toBe('Via Roma 9');
    expect(patch.city).toBe('Torino');
    expect(patch.zipCode).toBe('10100');
    expect(patch.country).toBe('IT');
    expect(patch.lat).toBe(45.0703);
    expect(patch.lng).toBe(7.6869);
  });

  it('shows the current coordinates and saves a moved pin', async () => {
    h.venue = { id: 'v1', name: 'Spa Bianchi', type: 'spa', address: 'Via Po 2', city: 'Torino', zipCode: '10100', country: 'IT', lat: 45.0703, lng: 7.6869 };
    renderView();
    expect(screen.getByText('Posizione selezionata: 45.07030, 7.68690')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Modifica/ }));
    expect(screen.getByLabelText('Latitudine')).toHaveValue('45.0703');
    fireEvent.change(screen.getByLabelText('Latitudine'), { target: { value: '45.08' } });
    fireEvent.click(screen.getByRole('button', { name: /Salva/ }));

    await waitFor(() => expect(h.updateDoc).toHaveBeenCalledTimes(1));
    const patch = (h.updateDoc.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(patch.lat).toBe(45.08);
    expect(patch.lng).toBe(7.6869);
  });

  it('refuses to save a venue whose coordinates were cleared', async () => {
    h.venue = { id: 'v1', name: 'Spa Bianchi', type: 'spa', address: 'Via Po 2', city: 'Torino', zipCode: '10100', country: 'IT', lat: 45.0703, lng: 7.6869 };
    renderView();
    fireEvent.click(screen.getByRole('button', { name: /Modifica/ }));
    fireEvent.change(screen.getByLabelText('Latitudine'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Salva/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Imposta la posizione della sede');
    expect(h.updateDoc).not.toHaveBeenCalled();
  });
});
