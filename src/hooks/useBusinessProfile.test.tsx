import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { queryKeys } from '@/lib/queryKeys';

vi.mock('@/lib/firebase/businessProfile', () => ({
  fetchBusinessDetails: vi.fn(),
  updateBusinessDisplayFields: vi.fn(async () => undefined),
}));

import { useUpdateBusinessDetails } from './useBusinessProfile';

describe('useUpdateBusinessDetails', () => {
  it("refreshes the owner's public profile page along with the provider caches", async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdateBusinessDetails('u1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ displayName: 'Nuovo nome' });
    });

    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    const keys = invalidate.mock.calls.map(([filters]) => (filters as { queryKey: unknown }).queryKey);
    expect(keys).toContainEqual(queryKeys.providerPublicProfile('u1'));
    expect(keys).toContainEqual(['provider', 'u1']);
    expect(keys).toContainEqual(['providers']);
  });
});
