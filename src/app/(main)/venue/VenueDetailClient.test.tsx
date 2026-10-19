import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockVenue: Record<string, unknown>;

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('id=v1') }));
vi.mock('@/hooks/useVenues', () => ({
  useVenue: () => ({ data: mockVenue, isLoading: false, refetch: vi.fn() }),
  useVenueServices: () => ({ data: [] }),
  useVenueCourses: () => ({ data: [] }),
}));
vi.mock('@/components/gallery/PhotoGallery', () => ({ PhotoGallery: () => null }));

import VenueDetailClient from './VenueDetailClient';

const venue = (patch: Record<string, unknown>) => ({
  id: 'v1',
  name: 'Palestra Rossi',
  slug: 'palestra-rossi',
  type: 'gym',
  city: 'Torino',
  address: 'Via Po 2',
  rating: 0,
  reviewCount: 0,
  isPartner: true,
  partnerStatus: 'active',
  isActive: true,
  description: '',
  heroGradients: [],
  amenities: [],
  hours: [],
  ...patch,
});

beforeEach(() => {
  mockVenue = venue({});
});

describe('VenueDetailClient timetable button', () => {
  it.each(['gym', 'school', 'studio'])('shows the timetable for an active partner %s', (type) => {
    mockVenue = venue({ type });
    render(<VenueDetailClient />);
    expect(screen.getByRole('link', { name: 'Palinsesto palestra' })).toHaveAttribute(
      'href',
      '/fit/gyms/timetable?id=v1',
    );
  });

  it('hides it for venues that do not host courses', () => {
    mockVenue = venue({ type: 'spa' });
    render(<VenueDetailClient />);
    expect(screen.queryByRole('link', { name: 'Palinsesto palestra' })).toBeNull();
  });

  it('hides it until the partnership is active', () => {
    mockVenue = venue({ type: 'school', partnerStatus: 'pending' });
    render(<VenueDetailClient />);
    expect(screen.queryByRole('link', { name: 'Palinsesto palestra' })).toBeNull();
  });
});

describe('VenueDetailClient opening hours', () => {
  it('renders the block when the venue has hours', () => {
    mockVenue = venue({ hours: [{ day: 'Lun - Ven', time: '06:00 - 22:00' }] });
    render(<VenueDetailClient />);
    expect(screen.getByText('Orari')).toBeInTheDocument();
    expect(screen.getByText('06:00 - 22:00')).toBeInTheDocument();
  });

  it('omits the block for a venue with no hours, such as a freshly approved business', () => {
    mockVenue = venue({ hours: [] });
    render(<VenueDetailClient />);
    expect(screen.queryByText('Orari')).toBeNull();
  });

  it('does not throw when hours and amenities are absent altogether', () => {
    mockVenue = venue({ hours: undefined, amenities: undefined });
    expect(() => render(<VenueDetailClient />)).not.toThrow();
    expect(screen.queryByText('Orari')).toBeNull();
  });
});
