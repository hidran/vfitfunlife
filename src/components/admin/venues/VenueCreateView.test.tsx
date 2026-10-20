import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({ addDoc: vi.fn(async () => ({ id: 'new1' })) }));
vi.mock('firebase/firestore', () => ({
  addDoc: h.addDoc,
  collection: (_db: unknown, name: string) => ({ name }),
  serverTimestamp: () => 'ts',
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/components/admin/auditLog', () => ({ recordAudit: vi.fn(async () => undefined) }));

import { VenueCreateView } from './VenueCreateView';

describe('VenueCreateView', () => {
  it('writes a string address plus top-level city, zipCode and country - never an object address', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <VenueCreateView />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Palestra Rossi' } });
    fireEvent.change(screen.getByLabelText('Via'), { target: { value: 'Via Po 2' } });
    fireEvent.change(screen.getByLabelText('Città'), { target: { value: 'Torino' } });
    fireEvent.change(screen.getByLabelText('CAP'), { target: { value: '10100' } });
    fireEvent.click(screen.getByRole('button', { name: /Salva/ }));

    await waitFor(() => expect(h.addDoc).toHaveBeenCalledTimes(1));
    const written = (h.addDoc.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(written.address).toBe('Via Po 2');
    expect(written.city).toBe('Torino');
    expect(written.zipCode).toBe('10100');
    expect(written.country).toBe('IT');
    expect(written.name).toBe('Palestra Rossi');
  });
});
