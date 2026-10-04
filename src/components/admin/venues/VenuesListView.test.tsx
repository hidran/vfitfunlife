import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { itMessages } from '@/i18n/messages/it';

/** The read-only "Owner" column (business-accounts plan B8; owners arrive in phase 4). */

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
  h.venues = [venue('v1', 'Palestra Centrale'), venue('v2', 'Spa Navigli', { ownerUid: '' })];
});

describe('VenuesListView owner column', () => {
  it('has an Owner column showing "—" (announced as "no owner") for every venue today', () => {
    render(<VenuesListView />);
    expect(screen.getByRole('columnheader', { name: itMessages['admin.venues.col.owner'] })).toBeInTheDocument();
    for (const name of ['Palestra Centrale', 'Spa Navigli']) {
      const cell = ownerCell(name);
      expect(within(cell).getByText('—')).toHaveAttribute('aria-hidden', 'true');
      expect(within(cell).getByText(itMessages['admin.venues.owner.none'])).toHaveClass('sr-only');
    }
  });

  it('shows the owner uid once one is set (phase 4)', () => {
    h.venues = [venue('v1', 'Palestra Centrale', { ownerUid: 'uid-123' })];
    render(<VenuesListView />);
    expect(ownerCell('Palestra Centrale')).toHaveTextContent('uid-123');
  });
});
