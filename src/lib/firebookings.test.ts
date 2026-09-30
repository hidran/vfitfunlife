import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(() => ({ __q: true })),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAt: vi.fn(),
  endAt: vi.fn(),
  Timestamp: { fromDate: vi.fn((d) => d) },
  serverTimestamp: vi.fn(() => null),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    update: vi.fn(),
    commit: vi.fn(),
  })),
}));

vi.mock('./firebase/availability', () => ({ fetchProviderSlots: vi.fn() }));

import { getDocs, where } from 'firebase/firestore';
import { fetchProviderSlots } from './firebase/availability';
import {
  bookingFromDoc,
  getProviderAvailability,
  providerSearchKey,
  searchProviders,
  searchProvidersNear,
} from './firebookings';

const mockGetDocs = vi.mocked(getDocs);
beforeEach(() => vi.clearAllMocks());

describe('searchProviders activity exclusion', () => {
  it('omits verified docs that are VFun activities', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        { id: 'trainer-1', data: () => ({ fullName: 'Real Trainer', providerProfile: { isVerified: true } }) },
        { id: 'event-1', data: () => ({ fullName: 'Sunset Party', activityKind: 'event', providerProfile: { isVerified: true } }) },
      ],
    } as never);
    const results = await searchProviders({});
    expect(results.map((p) => p.id)).toEqual(['trainer-1']);
  });
});

describe('searchProviders text query', () => {
  it('normalizes the typed text the way searchTerms are stored', () => {
    expect(providerSearchKey('  Luca  Bianchì ')).toBe('luca bianchi');
    expect(providerSearchKey('')).toBe('');
    expect(providerSearchKey(undefined)).toBe('');
  });

  it('looks the text up in searchTerms, so providers beyond the first 50 by id are found', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          id: 'zz-new-trainer',
          data: () => ({ fullName: 'Luca Bianchi', providerProfile: { isVerified: true }, searchTerms: ['luca bianchi'] }),
        },
      ],
    } as never);
    const results = await searchProviders({ query: 'Luca Bianchi' });
    expect(vi.mocked(where)).toHaveBeenCalledWith('searchTerms', 'array-contains', 'luca bianchi');
    expect(vi.mocked(where)).not.toHaveBeenCalledWith('categoryIds', 'array-contains', expect.anything());
    expect(results.map((p) => p.id)).toEqual(['zz-new-trainer']);
  });

  it('keeps a match found through a category word, and applies the category in memory', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [
        {
          id: 'a',
          data: () => ({
            fullName: 'Anna',
            providerProfile: { isVerified: true },
            categoryIds: ['personal_training', 'strength_conditioning'],
            searchTerms: ['training'],
          }),
        },
        {
          id: 'b',
          data: () => ({ fullName: 'Bea', providerProfile: { isVerified: true }, categoryIds: ['yoga'], searchTerms: ['training'] }),
        },
      ],
    } as never);
    const results = await searchProviders({ query: 'training', category: 'strength_conditioning' });
    expect(results.map((p) => p.id)).toEqual(['a']);
  });

  it('pushes the category into the query when there is no text', async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [] } as never);
    await searchProviders({ category: 'yoga' });
    expect(vi.mocked(where)).toHaveBeenCalledWith('categoryIds', 'array-contains', 'yoga');
  });
});

describe('searchProvidersNear', () => {
  it('returns verified providers in the radius, nearest-first, excluding activities, filtered in memory', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        { id: 'far', data: () => ({ fullName: 'Far Trainer', lat: 41.2, lng: 16.9, providerProfile: { isVerified: true, rating: 5 } }) },
        { id: 'near', data: () => ({ fullName: 'Near Trainer', lat: 41.12, lng: 16.875, providerProfile: { isVerified: true, rating: 3 } }) },
        { id: 'party', data: () => ({ fullName: 'Party', activityKind: 'event', lat: 41.118, lng: 16.872, providerProfile: { isVerified: true } }) },
        { id: 'napoli', data: () => ({ fullName: 'Napoli Trainer', lat: 40.85, lng: 14.27, providerProfile: { isVerified: true } }) },
      ],
    } as never);
    const bari = { lat: 41.1171, lng: 16.8719 };

    const all = await searchProvidersNear({}, bari, 25);
    expect(all.map((p) => p.id)).toEqual(['near', 'far']);
    expect(all[0].distanceKm).toBeLessThan(1);

    // sortBy doesn't override distance; rating still filters.
    const rated = await searchProvidersNear({ rating: 4, sortBy: 'rating' }, bari, 25);
    expect(rated.map((p) => p.id)).toEqual(['far']);
  });
});

describe('getProviderAvailability', () => {
  it('asks the server for the picker day and returns only offered, bookable slots', async () => {
    vi.mocked(fetchProviderSlots).mockResolvedValueOnce([
      { time: '09:00', startsAt: '2026-09-21T07:00:00.000Z' },
      { time: '09:30', startsAt: '2026-09-21T07:30:00.000Z' },
    ]);
    // A picker cell is local midnight; the key must be that calendar day, not its UTC date.
    const slots = await getProviderAvailability('p1', 's1', new Date(2026, 8, 21));

    expect(fetchProviderSlots).toHaveBeenCalledWith({ instructorId: 'p1', serviceId: 's1', date: '2026-09-21' });
    expect(slots).toEqual([
      { time: '09:00', startsAt: '2026-09-21T07:00:00.000Z', isAvailable: true, isBooked: false },
      { time: '09:30', startsAt: '2026-09-21T07:30:00.000Z', isAvailable: true, isBooked: false },
    ]);
  });
});

describe('bookingFromDoc', () => {
  it('reads the length and price the server actually writes', () => {
    const booking = bookingFromDoc('b1', { durationMinutes: 90, finalPrice: 55, serviceName: 'PT 1:1' });

    expect(booking.id).toBe('b1');
    expect(booking.duration).toBe(90);
    expect(booking.totalPrice).toBe(55);
    expect(booking.serviceName).toBe('PT 1:1');
  });

  it('keeps the legacy names when a document still carries them', () => {
    const booking = bookingFromDoc('b2', { duration: 45, totalPrice: 30, durationMinutes: 90, finalPrice: 55 });

    expect(booking.duration).toBe(45);
    expect(booking.totalPrice).toBe(30);
  });

  it('falls back rather than rendering undefined or NaN', () => {
    const booking = bookingFromDoc('b3', {});

    expect(booking.duration).toBe(60);
    expect(booking.totalPrice).toBe(0);
  });
});

describe('bookingFromDoc provider name', () => {
  it("shows a trainer session's instructorName where cards read providerName", () => {
    expect(bookingFromDoc('b1', { instructorName: 'Luca Bianchi' }).providerName).toBe('Luca Bianchi');
    expect(bookingFromDoc('b2', { providerName: 'Gym Milano', instructorName: 'X' }).providerName).toBe('Gym Milano');
    expect(bookingFromDoc('b3', {}).providerName).toBeUndefined();
  });
});
