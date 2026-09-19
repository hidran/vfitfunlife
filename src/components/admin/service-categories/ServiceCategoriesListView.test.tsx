import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
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
  it('labels seeded categories from their names map, not with a bare emoji', async () => {
    render(<ServiceCategoriesListView />);

    expect(await screen.findByText('Boxe')).toBeInTheDocument();
    expect(screen.getByText('Yoga')).toBeInTheDocument();
    expect(screen.getByText('boxing')).toBeInTheDocument();
  });
});
