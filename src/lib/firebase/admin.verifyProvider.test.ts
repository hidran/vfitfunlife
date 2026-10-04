import { describe, it, expect, vi, beforeEach } from 'vitest';

const decideProviderApplication = vi.fn(async (_data: unknown) => ({ success: true, draftServicesSeeded: 0 }));
vi.mock('./config', () => ({ auth: {}, db: {}, functions: {} }));
vi.mock('./functions', () => ({
  cancelBooking: vi.fn(),
  decideProviderApplication: (data: unknown) => decideProviderApplication(data),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('firebase/firestore', async () => (await import('./adminListFake.testutil')).firestoreFake);

import { verifyProvider, rejectProvider } from './admin';

beforeEach(() => {
  decideProviderApplication.mockClear();
});

describe('verifyProvider (the approve path of every admin screen)', () => {
  it("sends an individual's approval exactly as before: no expectedReview", async () => {
    await verifyProvider('p1', { status: 'verified' });
    expect(decideProviderApplication.mock.calls[0][0]).toEqual({ providerId: 'p1', decision: 'verified' });

    await verifyProvider('p1', { status: 'verified', notes: 'ok' });
    expect(decideProviderApplication.mock.calls[1][0]).toEqual({
      providerId: 'p1',
      decision: 'verified',
      notes: 'ok',
    });
  });

  it('sends the tax id and legal name the admin saw for a company', async () => {
    await verifyProvider('c1', {
      status: 'verified',
      expectedReview: { vatNumber: '12345678903', legalName: 'Karate Club Milano S.r.l.' },
    });
    expect(decideProviderApplication.mock.calls[0][0]).toEqual({
      providerId: 'c1',
      decision: 'verified',
      expectedReview: { vatNumber: '12345678903', legalName: 'Karate Club Milano S.r.l.' },
    });
  });

  it('lets a stale_review refusal reach the caller, which reloads and explains it', async () => {
    decideProviderApplication.mockRejectedValueOnce(
      Object.assign(new Error('stale_review'), { code: 'functions/failed-precondition' })
    );
    await expect(
      verifyProvider('c1', { status: 'verified', expectedReview: { vatNumber: '1', legalName: 'X' } })
    ).rejects.toThrow('stale_review');
  });

  it('rejections never carry a review', async () => {
    await rejectProvider('c1', 'Documenti mancanti');
    expect(decideProviderApplication.mock.calls[0][0]).toEqual({
      providerId: 'c1',
      decision: 'rejected',
      notes: 'Documenti mancanti',
    });
  });
});
