import { fireEvent, render, screen } from '@testing-library/react';
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

const fetchNextPage = vi.fn();
const result = (over: Record<string, unknown> = {}) => ({
  data: [],
  isLoading: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage,
  ...over,
});

beforeEach(() => {
  fetchNextPage.mockReset();
  mocks.useNearbyVenues.mockReset().mockReturnValue(result());
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

describe('/fit/gyms pagination of the location-less list', () => {
  it('shows a 44px+ Load more button while another page exists, and loads it on tap', () => {
    mocks.useNearbyVenues.mockReturnValue(result({ hasNextPage: true }));
    render(<GymsPage />);
    const button = screen.getByTestId('gyms-load-more');
    expect(button).toHaveTextContent('Carica altre palestre');
    expect(button).toHaveClass('min-h-[48px]', 'touch-target');
    fireEvent.click(button);
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });

  it('hides Load more on the last page and while the first page loads', () => {
    render(<GymsPage />);
    expect(screen.queryByTestId('gyms-load-more')).toBeNull();
    mocks.useNearbyVenues.mockReturnValue(result({ hasNextPage: true, isLoading: true }));
    render(<GymsPage />);
    expect(screen.queryByTestId('gyms-load-more')).toBeNull();
  });

  it('disables the button while the next page is fetching', () => {
    mocks.useNearbyVenues.mockReturnValue(result({ hasNextPage: true, isFetchingNextPage: true }));
    render(<GymsPage />);
    expect(screen.getByTestId('gyms-load-more')).toBeDisabled();
  });
});
