import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchProvider, fetchProviders, fetchProviderServices, fetchProviderApplications, fetchFunActivities } from './providers';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(() => ({ __query: true })),
  where: vi.fn(),
  limit: vi.fn(),
}));

import { getDoc, getDocs } from 'firebase/firestore';

const mockGetDoc = vi.mocked(getDoc);
const mockGetDocs = vi.mocked(getDocs);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchProvider', () => {
  it('returns null when missing', async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => false } as never);
    expect(await fetchProvider('x')).toBeNull();
  });

  it('flattens providerProfile into Provider shape', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      id: 'provider-1',
      data: () => ({
        fullName: 'Marco Rossi',
        avatarUrl: null,
        providerProfile: {
          isVerified: true,
          rating: 4.8,
          reviewCount: 127,
          specialties: ['Personal Training'],
          yearsOfExperience: 8,
        },
      }),
    } as never);
    const p = await fetchProvider('provider-1');
    expect(p).toEqual(expect.objectContaining({
      id: 'provider-1',
      fullName: 'Marco Rossi',
      isVerified: true,
      rating: 4.8,
      specialties: ['Personal Training'],
      yearsOfExperience: 8,
    }));
  });
});

describe('fetchProviders', () => {
  it('returns active verified providers only when onlyVerified is set', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { id: 'a', data: () => ({ fullName: 'A', providerProfile: { isVerified: true, isActive: true, rating: 5 } }) },
        { id: 'b', data: () => ({ fullName: 'B', providerProfile: { isVerified: false } }) },
      ],
    } as never);
    const all = await fetchProviders({ onlyVerified: true });
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('a');
  });

  it('filters out inactive providers regardless of onlyVerified', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { id: 'a', data: () => ({ fullName: 'A', isActive: true, providerProfile: { isVerified: true, rating: 5 } }) },
        { id: 'b', data: () => ({ fullName: 'B', isActive: false, providerProfile: { isVerified: true, rating: 4 } }) },
      ],
    } as never);
    const all = await fetchProviders({ onlyVerified: true });
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('a');
  });

  it('filters by specialty when provided', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { id: 'a', data: () => ({ fullName: 'A', isActive: true, specialties: ['Yoga'] }) },
        { id: 'b', data: () => ({ fullName: 'B', isActive: true, specialties: ['Pilates'] }) },
      ],
    } as never);
    const result = await fetchProviders({ specialty: 'Yoga' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });
});

describe('fetchProviderServices', () => {
  it('returns services from instructors/{id}/services', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [{ id: 'svc-1', data: () => ({ name: 'PT 1-to-1', price: 60, durationMinutes: 60, isActive: true }) }],
    } as never);
    const result = await fetchProviderServices('provider-1');
    expect(result[0].name).toBe('PT 1-to-1');
  });
});

describe('fetchProviders activity exclusion', () => {
  it('excludes docs with an activityKind (VFun activities, not trainers)', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { id: 'trainer-1', data: () => ({ fullName: 'Real Trainer', isActive: true, providerProfile: { isVerified: true, rating: 5 } }) },
        { id: 'event-1', data: () => ({ fullName: 'Sunset Party', isActive: true, activityKind: 'event', providerProfile: { isVerified: true } }) },
      ],
    } as never);
    const all = await fetchProviders();
    expect(all.map((p) => p.id)).toEqual(['trainer-1']);
  });
});

describe('fetchFunActivities', () => {
  it('returns only active activities of the requested kind, mapping activity fields', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { id: 'event-1', data: () => ({ fullName: 'Sunset Sessions', isActive: true, activityKind: 'event', eventDate: '16 Feb', tag: 'hot', providerProfile: { isVerified: true } }) },
      ],
    } as never);
    const events = await fetchFunActivities('event');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({ id: 'event-1', activityKind: 'event', eventDate: '16 Feb', tag: 'hot' }));
  });
});

describe('fetchProviderApplications', () => {
  it('returns instructors with a pending application', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { id: 'u1', data: () => ({ fullName: 'Mia', isActive: true, applicationStatus: 'pending', providerProfile: { isVerified: false, specialties: ['Yoga'] } }) },
      ],
    } as never);
    const apps = await fetchProviderApplications();
    expect(apps).toHaveLength(1);
    expect(apps[0].id).toBe('u1');
    expect(apps[0].applicationStatus).toBe('pending');
  });
});
