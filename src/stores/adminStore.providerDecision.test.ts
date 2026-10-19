import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase/admin', () => ({
  verifyProvider: vi.fn(),
  rejectProvider: vi.fn(),
  getProviders: vi.fn(),
  getPendingVerifications: vi.fn(),
}));

import { verifyProvider, rejectProvider, getProviders, getPendingVerifications } from '@/lib/firebase/admin';
import { useAdminStore, resetAdminListPaging } from './adminStore';

beforeEach(() => {
  vi.clearAllMocks();
  resetAdminListPaging();
  useAdminStore.setState({ providers: [], providersFilters: {}, error: null });
});

describe('adminStore provider decisions', () => {
  it('verifyProviderAction resolves once the decision is made, not when the lists have reloaded', async () => {
    vi.mocked(verifyProvider).mockResolvedValueOnce(undefined);
    // A list reload that never answers must not hold the caller (and its toast) back.
    vi.mocked(getProviders).mockReturnValue(new Promise(() => {}));
    vi.mocked(getPendingVerifications).mockReturnValue(new Promise(() => {}));

    await useAdminStore.getState().verifyProviderAction('p1', { status: 'verified' } as never);

    expect(verifyProvider).toHaveBeenCalledWith('p1', { status: 'verified' });
    // ...but the lists are still refreshed.
    expect(getProviders).toHaveBeenCalled();
    expect(getPendingVerifications).toHaveBeenCalled();
  });

  it('rejectProviderAction resolves once the decision is made, not when the lists have reloaded', async () => {
    vi.mocked(rejectProvider).mockResolvedValueOnce(undefined);
    vi.mocked(getProviders).mockReturnValue(new Promise(() => {}));
    vi.mocked(getPendingVerifications).mockReturnValue(new Promise(() => {}));

    await useAdminStore.getState().rejectProviderAction('p1', 'no');

    expect(rejectProvider).toHaveBeenCalledWith('p1', 'no');
    expect(getProviders).toHaveBeenCalled();
  });

  it('a failed decision still throws and records the error', async () => {
    vi.mocked(verifyProvider).mockRejectedValueOnce(new Error('venue_exists'));
    await expect(
      useAdminStore.getState().verifyProviderAction('p1', { status: 'verified' } as never)
    ).rejects.toThrow('venue_exists');
    expect(useAdminStore.getState().error).toBe('venue_exists');
    expect(getProviders).not.toHaveBeenCalled();
  });
});
