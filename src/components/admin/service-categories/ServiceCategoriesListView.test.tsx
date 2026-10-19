import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';

const auth = vi.hoisted(() => ({ role: 'admin' }));
const seedServiceCategoryCatalog = vi.hoisted(() => vi.fn().mockResolvedValue({
  created: 2,
  updated: 1,
  unknown: [],
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) =>
    selector({ user: { role: auth.role } }),
}));
vi.mock('@/lib/firebase/admin', () => ({ seedServiceCategoryCatalog }));
vi.mock('@/lib/notify', () => ({
  notify: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({
    docs: [
      // Seeded by the taxonomy: per-locale `names` only.
      {
        id: 'boxing',
        data: () => ({ names: { it: 'Boxe', en: 'Boxing' }, icon: '🥊', isActive: true, order: 31 }),
      },
      // Pre-taxonomy document: still carries the flat `name` alongside `names`.
      {
        id: 'yoga',
        data: () => ({ name: 'Yoga', names: { it: 'Yoga' }, icon: '🧘', isActive: true, order: 1 }),
      },
    ],
  }),
}));

import { ServiceCategoriesListView } from './ServiceCategoriesListView';

describe('ServiceCategoriesListView', () => {
  function renderView() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
      <QueryClientProvider client={client}>
        <ServiceCategoriesListView />
      </QueryClientProvider>,
    );
  }

  it('labels seeded categories from their names map, not with a bare emoji', async () => {
    renderView();

    expect(await screen.findByText('Boxe')).toBeInTheDocument();
    expect(screen.getByText('Yoga')).toBeInTheDocument();
    expect(screen.getByText('boxing')).toBeInTheDocument();
  });

  it.each(['admin', 'superadmin'])('%s can persist the category catalog', async (role) => {
    auth.role = role;
    seedServiceCategoryCatalog.mockClear();
    renderView();

    const button = await screen.findByRole('button', { name: 'Salva catalogo categorie' });
    fireEvent.click(button);

    await waitFor(() => expect(seedServiceCategoryCatalog).toHaveBeenCalledOnce());
  });
});
