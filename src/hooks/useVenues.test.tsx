import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({
  fetchVenues: vi.fn(),
  fetchVenuesNear: vi.fn(),
}));
vi.mock('@/lib/firebase/venues', () => ({
  fetchVenue: vi.fn(),
  fetchVenues: mocks.fetchVenues,
  fetchVenuesNear: mocks.fetchVenuesNear,
  fetchVenueServices: vi.fn(),
}));

import { useNearbyVenues, NEARBY_FALLBACK_LIMIT } from './useVenues';

const TYPES = ['gym', 'school', 'studio'] as const;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mocks.fetchVenues.mockReset().mockResolvedValue([]);
  mocks.fetchVenuesNear.mockReset().mockResolvedValue([]);
});

describe('useNearbyVenues with several types', () => {
  it('reads up to 200 venues, ordered by rating only, so unreviewed venues are not cut off', () => {
    expect(NEARBY_FALLBACK_LIMIT).toBe(200);
  });

  it('without a location, reads the bounded top-rated list for all the types', async () => {
    const { result } = renderHook(
      () => useNearbyVenues({ types: [...TYPES], userLocation: null, radiusKm: 25 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(mocks.fetchVenues).toHaveBeenCalledWith({
      type: undefined,
      types: [...TYPES],
      orderByRating: true,
      limit: NEARBY_FALLBACK_LIMIT,
    });
    expect(mocks.fetchVenuesNear).not.toHaveBeenCalled();
  });

  it('with a location and radius, runs the geohash search for all the types', async () => {
    const { result } = renderHook(
      () => useNearbyVenues({ types: [...TYPES], userLocation: { lat: 45.46, lng: 9.19 }, radiusKm: 25 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(mocks.fetchVenuesNear).toHaveBeenCalledWith(
      expect.objectContaining({ types: [...TYPES], radiusKm: 25 }),
    );
    expect(mocks.fetchVenues).not.toHaveBeenCalled();
  });

  it('still supports a single type', async () => {
    const { result } = renderHook(
      () => useNearbyVenues({ type: 'spa', userLocation: null, radiusKm: null }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(mocks.fetchVenues).toHaveBeenCalledWith(expect.objectContaining({ type: 'spa' }));
  });
});
