import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The company profile write (plan 2026-10-04, B6). The rules accept an owner update only when
 * it leaves the reviewed keys and the shape of the `business` map alone, so the exact
 * `updateDoc` payload is the contract.
 */

const SERVER_TS = { __serverTimestamp: true };
const getDoc = vi.fn();
const updateDoc = vi.fn(async () => undefined);
const setDoc = vi.fn(async () => undefined);

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  getDoc: (...args: unknown[]) => getDoc(...args),
  updateDoc: (...args: unknown[]) => updateDoc(...(args as [])),
  setDoc: (...args: unknown[]) => setDoc(...(args as [])),
  serverTimestamp: () => SERVER_TS,
}));

import { businessDisplayPatch, fetchBusinessDetails, updateBusinessDisplayFields } from './businessProfile';

const REVIEWED_KEYS = ['legalName', 'vatNumber', 'legalForm', 'affiliationNumber'];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('businessDisplayPatch', () => {
  it('turns every editable change into a business.* field path', () => {
    expect(
      businessDisplayPatch({
        description: 'Karate e animazione',
        website: 'https://karateroma.it',
        city: 'Roma',
        logoUrl: 'https://firebasestorage.googleapis.com/x',
      })
    ).toEqual({
      'business.description': 'Karate e animazione',
      'business.website': 'https://karateroma.it',
      'business.city': 'Roma',
      'business.logoUrl': 'https://firebasestorage.googleapis.com/x',
    });
  });

  it('mirrors the public name to name and fullName', () => {
    expect(businessDisplayPatch({ displayName: 'Karate Roma' })).toEqual({
      'business.displayName': 'Karate Roma',
      name: 'Karate Roma',
      fullName: 'Karate Roma',
    });
  });

  it('keeps null (a removed website or logo) and leaves out what did not change', () => {
    expect(businessDisplayPatch({ website: null, logoUrl: null })).toEqual({
      'business.website': null,
      'business.logoUrl': null,
    });
    expect(businessDisplayPatch({})).toEqual({});
  });

  it('never copies a reviewed key, even when one is smuggled in', () => {
    const smuggled = {
      displayName: 'Karate Roma',
      legalName: 'Altro SRL',
      vatNumber: '12345678903',
      legalForm: 'other',
      affiliationNumber: 'X',
      business: { vatNumber: '12345678903' },
    } as unknown as Parameters<typeof businessDisplayPatch>[0];

    const patch = businessDisplayPatch(smuggled);

    expect(Object.keys(patch).sort()).toEqual(['business.displayName', 'fullName', 'name']);
    for (const key of REVIEWED_KEYS) {
      expect(patch).not.toHaveProperty(key);
      expect(patch).not.toHaveProperty(`business.${key}`);
    }
    expect(patch).not.toHaveProperty('business');
  });
});

describe('updateBusinessDisplayFields', () => {
  it('updates instructors/{uid} through updateDoc (field paths), never setDoc', async () => {
    await expect(updateBusinessDisplayFields('u1', { displayName: 'Karate Roma', city: 'Milano' })).resolves.toBe(true);

    expect(setDoc).not.toHaveBeenCalled();
    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'instructors/u1' },
      {
        'business.displayName': 'Karate Roma',
        'business.city': 'Milano',
        name: 'Karate Roma',
        fullName: 'Karate Roma',
        updatedAt: SERVER_TS,
      }
    );
  });

  it('writes nothing when there is nothing to change', async () => {
    await expect(updateBusinessDisplayFields('u1', {})).resolves.toBe(false);
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('lets a rules refusal through to the caller', async () => {
    updateDoc.mockRejectedValueOnce(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    await expect(updateBusinessDisplayFields('u1', { city: 'Roma' })).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('fetchBusinessDetails', () => {
  const snap = (data: Record<string, unknown> | null) => ({ exists: () => data !== null, data: () => data });

  it('returns null without an instructors doc or without a business map', async () => {
    getDoc.mockResolvedValueOnce(snap(null));
    await expect(fetchBusinessDetails('u1')).resolves.toBeNull();

    getDoc.mockResolvedValueOnce(snap({ name: 'Mia Rossi' }));
    await expect(fetchBusinessDetails('u1')).resolves.toBeNull();

    getDoc.mockResolvedValueOnce(snap({ name: 'Mia Rossi', business: null }));
    await expect(fetchBusinessDetails('u1')).resolves.toBeNull();
  });

  it('reads the map from instructors/{uid}, filling absent optional fields', async () => {
    getDoc.mockResolvedValueOnce(
      snap({
        business: { legalName: 'Karate Club Roma SRL', vatNumber: '00743110157', displayName: 'Karate Club Roma' },
      })
    );

    await expect(fetchBusinessDetails('u1')).resolves.toEqual({
      legalName: 'Karate Club Roma SRL',
      vatNumber: '00743110157',
      affiliationNumber: '',
      displayName: 'Karate Club Roma',
      description: '',
      website: null,
      logoUrl: null,
      city: '',
    });
    expect(getDoc).toHaveBeenCalledWith({ path: 'instructors/u1' });
  });

  it('keeps the legal form when present', async () => {
    getDoc.mockResolvedValueOnce(
      snap({ business: { legalName: 'ASD Karate', vatNumber: '97123456788', legalForm: 'association', displayName: 'ASD Karate' } })
    );
    await expect(fetchBusinessDetails('u1')).resolves.toMatchObject({ legalForm: 'association' });
  });

  it('throws when the read fails, so "could not load" is not mistaken for "not a company"', async () => {
    getDoc.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }));
    await expect(fetchBusinessDetails('u1')).rejects.toMatchObject({ code: 'unavailable' });
  });
});
