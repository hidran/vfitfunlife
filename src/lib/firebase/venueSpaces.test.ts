import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getDocs: vi.fn(),
  getDoc: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  getDocs: h.getDocs,
  getDoc: h.getDoc,
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

import { fetchVenueInstructorLinks } from './venueSpaces';

describe('fetchVenueInstructorLinks', () => {
  it('joins each link with the partnerStatus of instructors/{id}, leaving it undefined when unknown', async () => {
    h.getDocs.mockResolvedValue({ docs: [
      { id: 'p1', data: () => ({ name: 'Anna', isActive: true }) },
      { id: 'p2', data: () => ({ name: 'Bruno', isActive: false }) },
      { id: 'p3', data: () => ({ name: 'Carla', isActive: true }) },
    ] });
    h.getDoc.mockImplementation(async (ref: { path: string }) => {
      if (ref.path === 'instructors/p1') return { data: () => ({ partnerStatus: 'active' }) };
      if (ref.path === 'instructors/p2') return { data: () => ({ partnerStatus: 'bogus' }) };
      throw new Error('permission-denied');
    });

    const links = await fetchVenueInstructorLinks('v1');
    expect(links).toEqual([
      { id: 'p1', name: 'Anna', isActive: true, partnerStatus: 'active' },
      { id: 'p2', name: 'Bruno', isActive: false },
      { id: 'p3', name: 'Carla', isActive: true },
    ]);
    expect(h.getDocs).toHaveBeenCalledWith({ path: 'venues/v1/instructors' });
  });
});
