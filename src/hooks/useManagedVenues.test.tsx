import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ uid: 'u1' as string | undefined, fetch: vi.fn() }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (s: { user: { uid: string } | null }) => unknown) =>
    select({ user: state.uid ? { uid: state.uid } : null }),
}));
vi.mock('@/lib/firebase/venues', () => ({ fetchManagedVenues: state.fetch }));

import { useManagedVenues } from './useManagedVenues';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
);

describe('useManagedVenues', () => {
  beforeEach(() => { state.uid = 'u1'; state.fetch.mockReset(); });

  it('exposes the venues the signed-in user owns or staffs, loading first', async () => {
    state.fetch.mockResolvedValue([{ id: 'biz_u1' }, { id: 'v2' }]);
    const { result } = renderHook(() => useManagedVenues(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.venues).toEqual([]);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.venues.map(v => v.id)).toEqual(['biz_u1', 'v2']);
    expect(state.fetch).toHaveBeenCalledWith('u1');
  });

  it('does not fetch and is not loading without a signed-in user', () => {
    state.uid = undefined;
    const { result } = renderHook(() => useManagedVenues(), { wrapper });
    expect(result.current).toEqual({ venues: [], isLoading: false, isError: false });
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it('degrades to no venues when the lookup fails', async () => {
    state.fetch.mockRejectedValue(new Error('denied'));
    const { result } = renderHook(() => useManagedVenues(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.venues).toEqual([]);
    expect(result.current.isError).toBe(true);
  });

  it('does not retry a failed lookup: callers need the answer now, not after the backoff', async () => {
    state.fetch.mockRejectedValue(new Error('denied'));
    const retrying = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: 3, retryDelay: 10000 } } })}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useManagedVenues(), { wrapper: retrying });
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 1500 });
    expect(state.fetch).toHaveBeenCalledTimes(1);
  });

  it('goes stale after a minute and refetches on focus, so a revoked staff member loses the venue quickly', async () => {
    state.fetch.mockResolvedValue([{ id: 'v1' }]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const withClient = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useManagedVenues(), { wrapper: withClient });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const options = client.getQueryCache().find({ queryKey: ['managed-venues', 'u1'] })?.options as
      { staleTime?: number; refetchOnWindowFocus?: boolean } | undefined;
    expect(options?.staleTime).toBe(60_000);
    expect(options?.refetchOnWindowFocus).toBe(true);
  });
});
