import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockVenues = [
  {
    id: 'v1',
    name: 'Palestra Rossi',
    type: 'school',
    address: { street: 'Via Roma 1', city: 'Torino' },
    rating: 4.5,
    reviewCount: 3,
    isActive: true,
    isPartner: false,
    ownerId: 'abcdefghijklmnopqrstuvwxyz12',
  },
  {
    id: 'v2',
    name: 'Centro Benessere Blu',
    type: 'wellness_center',
    address: 'Corso Italia 9',
    city: 'Milano',
    rating: 4.0,
    reviewCount: 1,
    isActive: true,
    isPartner: true,
  },
];

vi.mock('@/hooks/useVenues', () => ({
  useVenues: () => ({ data: mockVenues, isLoading: false }),
}));
vi.mock('@/hooks/usePhotoUpload', () => ({
  useUpdateVenuePhotos: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/components/gallery/PhotoUploader', () => ({ PhotoUploader: () => null }));
vi.mock('@/components/gallery/PhotoEditorOverlay', () => ({ PhotoEditorOverlay: () => null }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: { user: { role: string } }) => unknown) =>
    selector({ user: { role: 'admin' } }),
}));

import { VenuesListView } from './VenuesListView';

beforeEach(() => {
  vi.clearAllMocks();
});

const rowOf = (name: string) => screen.getByText(name).closest('tr')!;

describe('VenuesListView', () => {
  it('shows the owner uid, shortened, and a dash for venues nobody owns', () => {
    render(<VenuesListView />);

    expect(screen.getByText('Proprietario')).toBeInTheDocument();
    const owned = rowOf('Palestra Rossi');
    expect(owned).toHaveTextContent('abcdefgh…');
    const ownerLink = owned.querySelector('[title="abcdefghijklmnopqrstuvwxyz12"]');
    expect(ownerLink?.getAttribute('href')).toMatch(/^\/admin\/providers\/?\?id=abcdefghijklmnopqrstuvwxyz12$/);
    expect(rowOf('Centro Benessere Blu')).toHaveTextContent('—');
  });

  it('offers school and studio in the type filter, and filters by them', () => {
    render(<VenuesListView />);

    fireEvent.click(screen.getByRole('button', { name: /Filtri/i }));
    const [type] = screen.getAllByRole('combobox') as HTMLSelectElement[];
    const values = Array.from(type.options).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['gym', 'school', 'studio']));

    fireEvent.change(type, { target: { value: 'school' } });
    expect(screen.getByText('Palestra Rossi')).toBeInTheDocument();
    expect(screen.queryByText('Centro Benessere Blu')).not.toBeInTheDocument();

    fireEvent.change(type, { target: { value: 'studio' } });
    expect(screen.queryByText('Palestra Rossi')).not.toBeInTheDocument();
  });
});
