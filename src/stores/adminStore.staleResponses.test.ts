import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase/admin', () => ({
  getUsers: vi.fn(),
  getProviders: vi.fn(),
}));

import { getUsers, getProviders } from '@/lib/firebase/admin';
import { useAdminStore } from './adminStore';
import type { AdminProvider, AdminUser } from '@/types/admin';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const user = (id: string) => ({ id, uid: id, fullName: id }) as unknown as AdminUser;
const provider = (id: string) => ({ id, uid: id, fullName: id }) as unknown as AdminProvider;

beforeEach(() => {
  vi.clearAllMocks();
  useAdminStore.setState({
    users: [],
    usersTotal: 0,
    usersFilters: {},
    providers: [],
    providersTotal: 0,
    providersFilters: {},
    error: null,
  });
});

describe('adminStore list fetches drop out-of-order responses', () => {
  it('fetchUsers: a slow earlier search never overwrites a later one', async () => {
    const slow = deferred<{ users: AdminUser[]; total: number }>();
    const fast = deferred<{ users: AdminUser[]; total: number }>();
    vi.mocked(getUsers).mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);

    const first = useAdminStore.getState().fetchUsers({ search: 'm' });
    const second = useAdminStore.getState().fetchUsers({ search: 'mario' });

    fast.resolve({ users: [user('mario')], total: 1 });
    await second;
    slow.resolve({ users: [user('mario'), user('marta')], total: 2 });
    await first;

    const state = useAdminStore.getState();
    expect(state.users.map((u) => u.id)).toEqual(['mario']);
    expect(state.usersTotal).toBe(1);
    expect(state.isLoadingUsers).toBe(false);
  });

  it('fetchUsers: a stale failure does not raise an error over fresh results', async () => {
    const slow = deferred<{ users: AdminUser[]; total: number }>();
    vi.mocked(getUsers)
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce({ users: [user('a')], total: 1 });

    const first = useAdminStore.getState().fetchUsers({ search: 'x' });
    await useAdminStore.getState().fetchUsers({ search: 'xy' });
    slow.reject(new Error('network'));
    await first;

    expect(useAdminStore.getState().error).toBeNull();
    expect(useAdminStore.getState().users.map((u) => u.id)).toEqual(['a']);
  });

  it('fetchProviders: keeps the latest response and remembers its filters', async () => {
    const slow = deferred<{ providers: AdminProvider[]; total: number }>();
    vi.mocked(getProviders)
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce({ providers: [provider('p2')], total: 1 });

    const first = useAdminStore.getState().fetchProviders({ search: 'p' });
    await useAdminStore.getState().fetchProviders({ verificationStatus: 'pending' });
    slow.resolve({ providers: [provider('p1'), provider('p2')], total: 2 });
    await first;

    expect(useAdminStore.getState().providers.map((p) => p.id)).toEqual(['p2']);
    expect(useAdminStore.getState().providersFilters).toEqual({ verificationStatus: 'pending' });
  });

  it('fetchProviders without filters reuses the last ones', async () => {
    vi.mocked(getProviders).mockResolvedValue({ providers: [], total: 0 });

    await useAdminStore.getState().fetchProviders({ status: 'suspended' });
    await useAdminStore.getState().fetchProviders();

    expect(getProviders).toHaveBeenLastCalledWith({ status: 'suspended' });
  });
});
