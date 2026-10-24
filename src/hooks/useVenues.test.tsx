import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({
  fetchTopRatedVenuesPage: vi.fn(),
  fetchVenuesNear: vi.fn(),
}));
vi.mock('@/lib/firebase/venues', () => ({
  fetchVenue: vi.fn(),
  fetchVenues: vi.fn(),
  fetchTopRatedVenuesPage: mocks.fetchTopRatedVenuesPage,
  fetchVenuesNear: mocks.fetchVenuesNear,
  fetchVenueServices: vi.fn(),
}));

import { useNearbyVenues } from './useVenues';

const TYPES = ['gym', 'school', 'studio'] as const;
const venue = (id: string, rating: number, lat = 45, lng = 9) =>
  ({ id, name: id, type: 'gym', rating, lat, lng }) as unknown as Record<string, unknown>;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mocks.fetchTopRatedVenuesPage.mockReset().mockResolvedValue({ venues: [], nextCursor: null });
  mocks.fetchVenuesNear.mockReset().mockResolvedValue([]);
});

describe('useNearbyVenues without a location (paged top-rated list)', () => {
  it('reads the first page for all the types, with no cursor', async () => {
    const { result } = renderHook(
      () => useNearbyVenues({ types: [...TYPES], userLocation: null, radiusKm: 25 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(mocks.fetchTopRatedVenuesPage).toHaveBeenCalledWith({ type: undefined, types: [...TYPES], cursor: null });
    expect(mocks.fetchVenuesNear).not.toHaveBeenCalled();
    expect(result.current.hasNextPage).toBe(false);
  });

  it('offers the next page while a cursor comes back, and appends it after the first', async () => {
    mocks.fetchTopRatedVenuesPage
      .mockResolvedValueOnce({ venues: [venue('a', 5), venue('b', 4.8)], nextCursor: { rating: 4.8, id: 'b' } })
      .mockResolvedValueOnce({ venues: [venue('c', 4.5)], nextCursor: null });
    const { result } = renderHook(
      () => useNearbyVenues({ type: 'gym', userLocation: null, radiusKm: null }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data?.map((v) => v.id)).toEqual(['a', 'b']));
    expect(result.current.hasNextPage).toBe(true);

    act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data?.map((v) => v.id)).toEqual(['a', 'b', 'c']));
    expect(mocks.fetchTopRatedVenuesPage).toHaveBeenLastCalledWith({ type: 'gym', types: undefined, cursor: { rating: 4.8, id: 'b' } });
    expect(result.current.hasNextPage).toBe(false);
  });

  it('with a location but radius "all", sorts the loaded pages by distance', async () => {
    mocks.fetchTopRatedVenuesPage.mockResolvedValueOnce({
      venues: [venue('far', 5, 41.9, 12.5), venue('near', 4, 45.47, 9.19)],
      nextCursor: null,
    });
    const { result } = renderHook(
      () => useNearbyVenues({ type: 'gym', userLocation: { lat: 45.46, lng: 9.19 }, radiusKm: null }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data?.map((v) => v.id)).toEqual(['near', 'far']));
    expect(result.current.data?.[0].distanceKm).toBeLessThan(5);
  });
});

describe('useNearbyVenues with a location and radius', () => {
  it('runs the geohash search for all the types and never pages', async () => {
    const { result } = renderHook(
      () => useNearbyVenues({ types: [...TYPES], userLocation: { lat: 45.46, lng: 9.19 }, radiusKm: 25 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(mocks.fetchVenuesNear).toHaveBeenCalledWith(
      expect.objectContaining({ types: [...TYPES], radiusKm: 25 }),
    );
    expect(mocks.fetchTopRatedVenuesPage).not.toHaveBeenCalled();
    expect(result.current.hasNextPage).toBe(false);
    expect(result.current.isFetchingNextPage).toBe(false);
  });
});
