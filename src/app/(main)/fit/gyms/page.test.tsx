import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  useNearbyVenues: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/hooks/useVenues', () => ({ useNearbyVenues: mocks.useNearbyVenues }));
vi.mock('@/hooks/useNearMe', () => ({
  useNearMe: () => ({
    userLocation: null,
    radiusKm: 25,
    isLocating: false,
    error: null,
    requestLocation: vi.fn(),
    clearLocation: vi.fn(),
    setRadiusKm: vi.fn(),
  }),
}));
vi.mock('@/hooks/useCustomerSearchLocation', () => ({ useCustomerSearchLocation: () => ({ data: null }) }));
vi.mock('@/components/map/RadiusFilter', () => ({ RadiusFilter: () => null }));
vi.mock('@/components/gallery/PhotoCover', () => ({ PhotoCover: () => null }));

import GymsPage from './page';

beforeEach(() => {
  mocks.useNearbyVenues.mockReset().mockReturnValue({ data: [], isLoading: false });
});

describe('/fit/gyms', () => {
  it('lists every venue type that hosts a timetable, not only gyms', () => {
    render(<GymsPage />);
    const opts = mocks.useNearbyVenues.mock.calls[0][0];
    expect(opts.types).toEqual(['gym', 'school', 'studio']);
    expect(opts.type).toBeUndefined();
  });

  it('is titled for gyms and schools', () => {
    render(<GymsPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Palestre e scuole');
  });
});
