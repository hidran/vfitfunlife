import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { makeQueryClientWrapper } from '@/test-utils/queryClientWrapper';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, col, id) => ({ col, id })),
  getDoc: vi.fn(),
}));

import { getDoc } from 'firebase/firestore';
import { useFirestoreDocQuery } from './useFirestoreDocQuery';

describe('useFirestoreDocQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps an existing doc through the caller-supplied `map`', async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      id: 'doc-1',
      data: () => ({ name: 'Acme Gym' }),
    } as never);

    const { wrapper } = makeQueryClientWrapper();
    const { result } = renderHook(
      () =>
        useFirestoreDocQuery(['venues', 'doc-1'], 'venues', 'doc-1', (id, data) => ({
          id,
          uid: id,
          ...data,
        })),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: 'doc-1', uid: 'doc-1', name: 'Acme Gym' });
  });

  it('resolves to null when the document does not exist', async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);

    const { wrapper } = makeQueryClientWrapper();
    const { result } = renderHook(
      () => useFirestoreDocQuery(['venues', 'missing'], 'venues', 'missing', (id, data) => ({ id, ...data })),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
