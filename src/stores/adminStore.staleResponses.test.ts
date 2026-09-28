import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase/admin', () => ({
  getUsers: vi.fn(),
  getProviders: vi.fn(),
}));

import { getUsers, getProviders } from '@/lib/firebase/admin';
import { useAdminStore, resetAdminListPaging } from './adminStore';
import type { AdminProvider, AdminUser } from '@/types/admin';

type UsersResult = Awaited<ReturnType<typeof getUsers>>;
type ProvidersResult = Awaited<ReturnType<typeof getProviders>>;

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
  resetAdminListPaging();
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
    const slow = deferred<UsersResult>();
    const fast = deferred<UsersResult>();
    vi.mocked(getUsers).mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);

    const first = useAdminStore.getState().fetchUsers({ search: 'm' });
    const second = useAdminStore.getState().fetchUsers({ search: 'mario' });

    fast.resolve({ users: [user('mario')], total: 1, cursors: new Map() });
    await second;
    slow.resolve({ users: [user('mario'), user('marta')], total: 2, cursors: new Map() });
    await first;

    const state = useAdminStore.getState();
    expect(state.users.map((u) => u.id)).toEqual(['mario']);
    expect(state.usersTotal).toBe(1);
    expect(state.isLoadingUsers).toBe(false);
  });

  it('fetchUsers: a stale failure does not raise an error over fresh results', async () => {
    const slow = deferred<UsersResult>();
    vi.mocked(getUsers)
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce({ users: [user('a')], total: 1, cursors: new Map() });

    const first = useAdminStore.getState().fetchUsers({ search: 'x' });
    await useAdminStore.getState().fetchUsers({ search: 'xy' });
    slow.reject(new Error('network'));
    await first;

    expect(useAdminStore.getState().error).toBeNull();
    expect(useAdminStore.getState().users.map((u) => u.id)).toEqual(['a']);
  });

  it('fetchProviders: keeps the latest response and remembers its filters', async () => {
    const slow = deferred<ProvidersResult>();
    vi.mocked(getProviders)
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce({ providers: [provider('p2')], total: 1, cursors: new Map() });

    const first = useAdminStore.getState().fetchProviders({ search: 'p' });
    await useAdminStore.getState().fetchProviders({ verificationStatus: 'pending' });
    slow.resolve({ providers: [provider('p1'), provider('p2')], total: 2, cursors: new Map() });
    await first;

    expect(useAdminStore.getState().providers.map((p) => p.id)).toEqual(['p2']);
    expect(useAdminStore.getState().providersFilters).toEqual({ verificationStatus: 'pending' });
  });

  it('fetchProviders without filters reuses the last ones', async () => {
    vi.mocked(getProviders).mockResolvedValue({ providers: [], total: 0, cursors: new Map() });

    await useAdminStore.getState().fetchProviders({ status: 'suspended' });
    await useAdminStore.getState().fetchProviders();

    expect(getProviders).toHaveBeenLastCalledWith({ status: 'suspended' }, expect.any(Map));
  });
});

describe('adminStore list paging', () => {
  it('hands each page the cursors the previous pages returned, and keeps them for going back', async () => {
    const cursorsAfterPage1 = new Map([[1, { id: 'u20' }]]) as unknown as UsersResult['cursors'];
    const cursorsAfterPage2 = new Map([
      [1, { id: 'u20' }],
      [2, { id: 'u40' }],
    ]) as unknown as UsersResult['cursors'];
    vi.mocked(getUsers)
      .mockResolvedValueOnce({ users: [user('a')], total: 50, cursors: cursorsAfterPage1 })
      .mockResolvedValueOnce({ users: [user('b')], total: 50, cursors: cursorsAfterPage2 })
      .mockResolvedValueOnce({ users: [user('a')], total: 50, cursors: cursorsAfterPage2 });

    await useAdminStore.getState().fetchUsers({ role: 'customer', page: 1, limit: 20 });
    await useAdminStore.getState().fetchUsers({ role: 'customer', page: 2, limit: 20 });
    await useAdminStore.getState().fetchUsers({ role: 'customer', page: 1, limit: 20 });

    expect(vi.mocked(getUsers).mock.calls[1][1]).toBe(cursorsAfterPage1);
    expect(vi.mocked(getUsers).mock.calls[2][1]).toBe(cursorsAfterPage2);
  });

  it('starts a fresh cursor stack when anything but the page changes', async () => {
    vi.mocked(getUsers).mockResolvedValue({
      users: [],
      total: 0,
      cursors: new Map([[1, { id: 'x' }]]) as unknown as UsersResult['cursors'],
    });

    await useAdminStore.getState().fetchUsers({ role: 'customer', page: 1 });
    await useAdminStore.getState().fetchUsers({ role: 'admin', page: 2 });

    expect(vi.mocked(getUsers).mock.calls[1][1]?.size).toBe(0);
  });
});
