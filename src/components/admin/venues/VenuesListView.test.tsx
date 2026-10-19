import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { itMessages } from '@/i18n/messages/it';

/** The read-only "Owner" column (business-accounts plan B8; `venues.ownerId`) and the school/studio type filter. */

const h = vi.hoisted(() => ({ venues: [] as unknown[] }));
vi.mock('@/hooks/useVenues', () => ({
  useVenues: () => ({ data: h.venues, isLoading: false }),
}));
vi.mock('@/hooks/usePhotoUpload', () => ({
  useUpdateVenuePhotos: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { VenuesListView } from './VenuesListView';

const venue = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  type: 'gym',
  address: 'Via Roma 1',
  city: 'Milano',
  rating: 4.5,
  reviewCount: 10,
  isActive: true,
  isPartner: false,
  photoUrls: [],
  ...extra,
});

function ownerCell(name: string): HTMLElement {
  const headers = Array.from(document.querySelectorAll('thead th')).map((th) => th.textContent);
  const index = headers.indexOf(itMessages['admin.venues.col.owner']);
  expect(index).toBeGreaterThanOrEqual(0);
  const row = screen.getByText(name).closest('tr') as HTMLElement;
  return row.querySelectorAll('td')[index] as HTMLElement;
}

beforeEach(() => {
  h.venues = [venue('v1', 'Palestra Centrale'), venue('v2', 'Spa Navigli', { ownerId: '' })];
});

describe('VenuesListView owner column', () => {
  it('has an Owner column showing "—" (announced as "no owner") for every venue today', () => {
    render(<VenuesListView />);
    expect(screen.getByRole('columnheader', { name: itMessages['admin.venues.col.owner'] })).toBeInTheDocument();
    for (const name of ['Palestra Centrale', 'Spa Navigli']) {
      const cell = ownerCell(name);
      expect(within(cell).getByText('—')).toHaveAttribute('aria-hidden', 'true');
      expect(within(cell).getByText(itMessages['admin.venues.owner.none'])).toHaveClass('sr-only');
      // sr-only is position:absolute: it must sit inside a positioned wrapper or it escapes the
      // table's scroll container and widens the page on phones.
      expect(within(cell).getByText(itMessages['admin.venues.owner.none']).parentElement).toHaveClass('relative');
    }
  });

  it('shows the owner uid once one is set, as a link to the provider', () => {
    h.venues = [venue('v1', 'Palestra Centrale', { ownerId: 'uid-123' })];
    render(<VenuesListView />);
    const cell = ownerCell('Palestra Centrale');
    expect(cell).toHaveTextContent('uid-123');
    expect(within(cell).getByRole('link').getAttribute('href')).toMatch(/^\/admin\/providers\/?\?id=uid-123$/);
  });

  it('shortens a long owner uid and keeps the full one as the title', () => {
    h.venues = [
      venue('v1', 'Palestra Rossi', { type: 'school', address: { street: 'Via Roma 1', city: 'Torino' }, ownerId: 'abcdefghijklmnopqrstuvwxyz12' }),
      venue('v2', 'Centro Benessere Blu', { type: 'wellness_center' }),
    ];
    render(<VenuesListView />);
    const owned = ownerCell('Palestra Rossi');
    expect(owned).toHaveTextContent('abcdefgh…');
    const link = owned.querySelector('[title="abcdefghijklmnopqrstuvwxyz12"]');
    expect(link?.getAttribute('href')).toMatch(/^\/admin\/providers\/?\?id=abcdefghijklmnopqrstuvwxyz12$/);
    expect(ownerCell('Centro Benessere Blu')).toHaveTextContent('—');
  });
});

describe('VenuesListView type filter', () => {
  it('offers school and studio, and filters by them', () => {
    h.venues = [
      venue('v1', 'Palestra Rossi', { type: 'school' }),
      venue('v2', 'Centro Benessere Blu', { type: 'wellness_center' }),
    ];
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
