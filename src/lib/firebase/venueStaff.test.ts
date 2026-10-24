import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(async () => undefined),
  deleteDoc: vi.fn(async () => undefined),
}));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  query: (ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: vi.fn(),
  limit: vi.fn(),
  updateDoc: vi.fn(),
  getDoc: h.getDoc,
  getDocs: h.getDocs,
  setDoc: h.setDoc,
  deleteDoc: h.deleteDoc,
  serverTimestamp: () => 'ts',
}));
vi.mock('./geoQuery', () => ({ geoRangeQuery: vi.fn() }));

import { fetchVenueStaff, fetchVenueStaffLink, removeVenueStaff, setVenueStaff } from './venues';

beforeEach(() => {
  h.getDoc.mockReset();
  h.getDocs.mockReset();
  h.setDoc.mockClear();
  h.deleteDoc.mockClear();
});

describe('venue staff helpers', () => {
  it('lists the staff of a venue with name and email from users/{uid}', async () => {
    h.getDocs.mockResolvedValue({ docs: [
      { id: 'u1', data: () => ({ venueId: 'v1', isActive: true }) },
      { id: 'u2', data: () => ({ venueId: 'v1', isActive: false }) },
    ] });
    h.getDoc.mockImplementation(async (ref: { path: string }) =>
      ref.path === 'users/u1'
        ? { data: () => ({ fullName: 'Anna Verdi', email: 'anna@x.it', avatarUrl: null }) }
        : { data: () => undefined });

    const staff = await fetchVenueStaff('v1');
    expect(staff).toEqual([
      { uid: 'u1', venueId: 'v1', isActive: true, name: 'Anna Verdi', email: 'anna@x.it', avatarUrl: null },
      { uid: 'u2', venueId: 'v1', isActive: false, name: 'u2', email: '', avatarUrl: null },
    ]);
    const q = h.getDocs.mock.calls[0][0] as { ref: { path: string }; constraints: unknown[] };
    expect(q.ref.path).toBe('venueStaff');
    expect(q.constraints).toEqual([{ field: 'venueId', op: '==', value: 'v1' }]);
  });

  it('reads the venue an account already staffs', async () => {
    h.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ venueId: 'v9', isActive: true }) });
    expect(await fetchVenueStaffLink('u1')).toEqual({ venueId: 'v9', isActive: true });
    h.getDoc.mockResolvedValue({ exists: () => false });
    expect(await fetchVenueStaffLink('u1')).toBeNull();
  });

  it('writes venueStaff/{uid} = { venueId, isActive } and deletes it on removal', async () => {
    await setVenueStaff('u1', 'v1', true);
    expect(h.setDoc).toHaveBeenCalledWith({ path: 'venueStaff/u1' }, { venueId: 'v1', isActive: true, updatedAt: 'ts' });
    await removeVenueStaff('u1');
    expect(h.deleteDoc).toHaveBeenCalledWith({ path: 'venueStaff/u1' });
  });
});
