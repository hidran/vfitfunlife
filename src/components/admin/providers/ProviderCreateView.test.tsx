import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  addDoc: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace }),
}));
vi.mock('@/lib/firebase/config', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => ({
  addDoc: mocks.addDoc,
  collection: vi.fn((_db, name: string) => ({ name })),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: { user: null }) => unknown) => selector({ user: null }),
}));

import { ProviderCreateView } from './ProviderCreateView';

beforeEach(() => {
  mocks.addDoc.mockReset();
  mocks.addDoc.mockResolvedValue({ id: 'new-provider' });
});

describe('ProviderCreateView', () => {
  it('creates the account as an individual provider, so the Privati filter finds it', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProviderCreateView />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Anna Bianchi' } });
    fireEvent.click(screen.getByRole('button', { name: /salva/i }));

    await waitFor(() => expect(mocks.addDoc).toHaveBeenCalled());
    const [target, payload] = mocks.addDoc.mock.calls[0];
    expect(target).toEqual({ name: 'users' });
    expect(payload).toMatchObject({
      fullName: 'Anna Bianchi',
      role: 'provider',
      providerStatus: 'pending',
      providerType: 'individual',
    });
  });
});
