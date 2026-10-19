import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ col, id })),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'TS'),
}));
vi.mock('./functions', () => ({
  applyAsProvider: vi.fn().mockResolvedValue({
    success: true,
    providerId: 'u1',
    draftServicesSeeded: 2,
  }),
}));

import { updateDoc } from 'firebase/firestore';
import { applyAsProvider } from './functions';
import { submitProviderApplication, updateRequestedCategories } from './providerApplication';

beforeEach(() => vi.clearAllMocks());

describe('submitProviderApplication', () => {
  it('delegates to the callable, which approves the applicant server-side', async () => {
    await submitProviderApplication({ fullName: 'Mia Rossi', categoryIds: ['yoga', 'pilates'] });

    expect(applyAsProvider).toHaveBeenCalledWith({
      fullName: 'Mia Rossi',
      categoryIds: ['yoga', 'pilates'],
    });
  });

  it('sends an individual exactly as before companies existed: no providerType key at all', async () => {
    await submitProviderApplication({ fullName: 'Mia Rossi', categoryIds: ['yoga'] });
    await submitProviderApplication({ fullName: 'Mia Rossi', categoryIds: ['yoga'], providerType: 'individual' });

    for (const [payload] of vi.mocked(applyAsProvider).mock.calls) {
      expect(Object.keys(payload).sort()).toEqual(['categoryIds', 'fullName']);
    }
  });

  it('sends a company with providerType business and its details', async () => {
    const business = {
      legalName: 'Karate Club Roma SRL',
      vatNumber: '00743110157',
      legalForm: 'company' as const,
      displayName: 'Karate Club Roma',
      website: 'https://karateroma.it',
    };
    await submitProviderApplication({
      fullName: 'Mia Rossi',
      categoryIds: ['karate'],
      providerType: 'business',
      business,
    });

    expect(applyAsProvider).toHaveBeenCalledWith({
      fullName: 'Mia Rossi',
      categoryIds: ['karate'],
      providerType: 'business',
      business,
    });
  });

  it("returns the callable's answer", async () => {
    vi.mocked(applyAsProvider).mockResolvedValueOnce({
      success: true,
      providerId: 'u1',
      autoApproved: false,
      draftServicesSeeded: 0,
    });

    await expect(
      submitProviderApplication({ fullName: 'Mia Rossi', categoryIds: ['yoga'] })
    ).resolves.toMatchObject({ autoApproved: false });
  });

  it('writes nothing to Firestore from the browser', async () => {
    // The verification flag the public read rule keys on is server-only for a reason: a
    // client batch that set it would let anyone list themselves in the marketplace. If this
    // ever starts touching Firestore directly again, the rules will reject the write at
    // runtime and this test says so first.
    await submitProviderApplication({ fullName: 'Mia Rossi', categoryIds: ['yoga'] });

    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('surfaces a failed application rather than reporting success', async () => {
    vi.mocked(applyAsProvider).mockRejectedValueOnce(new Error('permission-denied'));

    await expect(
      submitProviderApplication({ fullName: 'Mia Rossi', categoryIds: ['yoga'] })
    ).rejects.toThrow('permission-denied');
  });
});

describe('updateRequestedCategories', () => {
  it('updates the requested category ids on the instructor doc', async () => {
    await updateRequestedCategories('u1', ['boxing']);

    expect(updateDoc).toHaveBeenCalledWith(
      { col: 'instructors', id: 'u1' },
      { requestedCategoryIds: ['boxing'], updatedAt: 'TS' }
    );
  });
});
