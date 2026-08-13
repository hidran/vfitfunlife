import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The service CRUD is thin, but the two things it gets wrong break silently:
 * writing to the wrong path (the old code wrote a top-level `services` collection nothing
 * read) and sending `undefined` for an omitted description (Firestore rejects the whole
 * write). Both are asserted here.
 */

const addDoc = vi.fn(async () => ({ id: 'generated-id' }));
const updateDoc = vi.fn(async () => undefined);
const deleteDoc = vi.fn(async () => undefined);

vi.mock('firebase/firestore', () => ({
  // Path builders return the segments so assertions can read the target directly.
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  addDoc: (...args: unknown[]) => addDoc(...(args as [])),
  updateDoc: (...args: unknown[]) => updateDoc(...(args as [])),
  deleteDoc: (...args: unknown[]) => deleteDoc(...(args as [])),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
}));

vi.mock('./config', () => ({ db: {} }));

import {
  createProviderService,
  updateProviderService,
  deleteProviderService,
} from './providers';

beforeEach(() => {
  addDoc.mockClear();
  updateDoc.mockClear();
  deleteDoc.mockClear();
});

describe('createProviderService', () => {
  it('writes to the subcollection the booking flow reads', async () => {
    await createProviderService('trainer-1', {
      name: 'Personal Training',
      description: '60 minutes one to one',
      price: 50,
      durationMinutes: 60,
      isActive: true,
    });

    expect(addDoc).toHaveBeenCalledTimes(1);
    const [ref, data] = addDoc.mock.calls[0] as unknown as [{ path: string }, object];
    expect(ref.path).toBe('instructors/trainer-1/services');
    expect(data).toEqual({
      name: 'Personal Training',
      description: '60 minutes one to one',
      price: 50,
      durationMinutes: 60,
      isActive: true,
    });
  });

  it('returns the generated document id', async () => {
    const id = await createProviderService('trainer-1', {
      name: 'X',
      price: 10,
      durationMinutes: 30,
      isActive: true,
    });
    expect(id).toBe('generated-id');
  });

  it('strips an undefined description rather than letting Firestore reject the write', async () => {
    await createProviderService('trainer-1', {
      name: 'No description',
      description: undefined,
      price: 20,
      durationMinutes: 45,
      isActive: true,
    });

    const [, data] = addDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect('description' in data).toBe(false);
  });

  it('does not write a providerId field — the path carries the relationship', async () => {
    await createProviderService('trainer-1', {
      name: 'X',
      price: 10,
      durationMinutes: 30,
      isActive: true,
    });
    const [, data] = addDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect('providerId' in data).toBe(false);
  });
});

describe('updateProviderService', () => {
  it('targets the service document by path', async () => {
    await updateProviderService('trainer-1', 'svc-9', { price: 75 });

    const [ref, data] = updateDoc.mock.calls[0] as unknown as [{ path: string }, object];
    expect(ref.path).toBe('instructors/trainer-1/services/svc-9');
    expect(data).toEqual({ price: 75 });
  });

  it('supports a partial update, so a toggle does not rewrite the whole service', async () => {
    await updateProviderService('trainer-1', 'svc-9', { isActive: false });
    const [, data] = updateDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(data).toEqual({ isActive: false });
  });

  it('strips undefined values from a partial update', async () => {
    await updateProviderService('trainer-1', 'svc-9', {
      price: 30,
      description: undefined,
    });
    const [, data] = updateDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(data).toEqual({ price: 30 });
  });
});

describe('deleteProviderService', () => {
  it('deletes by path', async () => {
    await deleteProviderService('trainer-1', 'svc-9');
    const [ref] = deleteDoc.mock.calls[0] as unknown as [{ path: string }];
    expect(ref.path).toBe('instructors/trainer-1/services/svc-9');
  });
});

describe('error propagation', () => {
  it('lets a rejection reach the caller — a swallowed error is what made the old page lie', async () => {
    addDoc.mockRejectedValueOnce(new Error('permission-denied') as never);
    await expect(
      createProviderService('trainer-1', {
        name: 'X',
        price: 10,
        durationMinutes: 30,
        isActive: true,
      })
    ).rejects.toThrow('permission-denied');
  });
});
