import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ addDoc: vi.fn(async () => ({ id: 'new1' })) }));
vi.mock('firebase/firestore', () => ({
  addDoc: h.addDoc,
  collection: (_db: unknown, name: string) => ({ name }),
  serverTimestamp: () => 'ts',
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/components/admin/auditLog', () => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock('@googlemaps/js-api-loader', () => ({ Loader: vi.fn() }));

import { VenueCreateView } from './VenueCreateView';

// No NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in tests: the picker runs in its no-map fallback
// (coordinate fields only), which is also what a misconfigured build shows.
beforeEach(() => {
  h.addDoc.mockClear();
  delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
});

function renderView() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <VenueCreateView />
    </QueryClientProvider>,
  );
}

function fillAddress() {
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Palestra Rossi' } });
  fireEvent.change(screen.getByLabelText('Via'), { target: { value: 'Via Po 2' } });
  fireEvent.change(screen.getByLabelText('Città'), { target: { value: 'Torino' } });
  fireEvent.change(screen.getByLabelText('CAP'), { target: { value: '10100' } });
}

describe('VenueCreateView', () => {
  it('writes the full venue shape: string address, top-level city, numeric lat/lng, slug and the public-page defaults', async () => {
    renderView();
    fillAddress();
    fireEvent.change(screen.getByLabelText('Latitudine'), { target: { value: '45.0703' } });
    fireEvent.change(screen.getByLabelText('Longitudine'), { target: { value: '7.6869' } });
    fireEvent.click(screen.getByRole('button', { name: /Salva/ }));

    await waitFor(() => expect(h.addDoc).toHaveBeenCalledTimes(1));
    const written = (h.addDoc.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(written.address).toBe('Via Po 2');
    expect(written.city).toBe('Torino');
    expect(written.zipCode).toBe('10100');
    expect(written.country).toBe('IT');
    expect(written.name).toBe('Palestra Rossi');
    expect(written.lat).toBe(45.0703);
    expect(written.lng).toBe(7.6869);
    expect(written.slug).toBe('palestra-rossi-torino');
    expect(written.description).toBe('');
    expect(written.heroGradients).toEqual(['from-vfit-secondary/40 via-vfit-primary/30 to-transparent']);
    expect(written.amenities).toEqual([]);
    expect(written.hours).toEqual([]);
    expect(written.photoUrls).toEqual([]);
    expect(written.rating).toBe(0);
    expect(written.reviewCount).toBe(0);
    expect(written.updatedAt).toBe('ts');
  });

  it('refuses a venue without a location and says so inline', async () => {
    renderView();
    fillAddress();
    fireEvent.click(screen.getByRole('button', { name: /Salva/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Imposta la posizione della sede');
    expect(h.addDoc).not.toHaveBeenCalled();
  });

  it('refuses (0, 0) and out-of-range coordinates, which are what a failed geocode looks like', async () => {
    renderView();
    fillAddress();
    fireEvent.change(screen.getByLabelText('Latitudine'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Longitudine'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /Salva/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Imposta la posizione della sede');
    expect(h.addDoc).not.toHaveBeenCalled();
  });
});
