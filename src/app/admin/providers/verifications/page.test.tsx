import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeQueryClientWrapper } from '@/test-utils/queryClientWrapper';
import { itMessages } from '@/i18n/messages/it';
import type { AdminProvider } from '@/types/admin';

/**
 * The verification queue approves what the admin saw (plan 2026-10-04, B8b): an open company
 * row shows its business details and its approval carries them as `expectedReview`; a
 * `stale_review` refusal is explained and the queue reloads. Individuals are unchanged.
 */

const h = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>() }));
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  doc: (_db: unknown, collection: string, id: string) => ({ path: `${collection}/${id}` }),
  getDoc: async (ref: { path: string }) => {
    const data = h.docs.get(ref.path);
    return { id: ref.path.split('/')[1], exists: () => data !== undefined, data: () => data };
  },
}));

const store = vi.hoisted(() => ({
  pendingVerifications: [] as unknown[],
  fetchPendingVerifications: vi.fn(async () => {}),
  verifyProviderAction: vi.fn(async (_id: string, _data: unknown) => {}),
  rejectProviderAction: vi.fn(async () => {}),
}));
vi.mock('@/stores/adminStore', () => ({
  useAdminStore: (selector: (s: typeof store) => unknown) => selector(store),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import ProviderVerificationsPage from './page';

const it_ = (key: keyof typeof itMessages) => itMessages[key] as string;

const COMPANY = {
  legalName: 'Karate Club Milano S.r.l.',
  vatNumber: '12345678903',
  legalForm: 'company',
  affiliationNumber: '',
  displayName: 'Karate Club Milano',
};

const company = {
  id: 'c1',
  uid: 'c1',
  fullName: 'Karate Club Milano',
  email: 'karate@example.it',
  role: 'customer',
  providerStatus: 'pending',
  providerType: 'business',
} as unknown as AdminProvider;
const person = {
  id: 'p1',
  uid: 'p1',
  fullName: 'Paola Pendente',
  email: 'paola@example.it',
  role: 'customer',
  providerStatus: 'pending',
} as unknown as AdminProvider;

function renderPage() {
  const { wrapper: Wrapper } = makeQueryClientWrapper();
  return render(
    <Wrapper>
      <ProviderVerificationsPage />
    </Wrapper>
  );
}

const open = (name: string) => fireEvent.click(screen.getByText(name));
const approveButton = () => screen.getByRole('button', { name: it_('admin.verifications.approve') });

beforeEach(() => {
  vi.clearAllMocks();
  h.docs.clear();
  h.docs.set('instructors/c1', { applicationStatus: 'pending', business: { ...COMPANY } });
  store.pendingVerifications = [company, person];
});

describe('ProviderVerificationsPage', () => {
  it('marks a company with the "Azienda" badge as text', () => {
    renderPage();
    const row = screen.getByText('Karate Club Milano').closest('div.bg-surface') as HTMLElement;
    expect(within(row).getByText(it_('provider.badge.business'))).toBeInTheDocument();
    const personRow = screen.getByText('Paola Pendente').closest('div.bg-surface') as HTMLElement;
    expect(within(personRow).queryByText(it_('provider.badge.business'))).not.toBeInTheDocument();
  });

  it('shows an open company\'s legal details and approves with exactly those', async () => {
    renderPage();
    open('Karate Club Milano');
    const card = await screen.findByRole('region', { name: it_('admin.business.title') });
    expect(within(card).getByText(COMPANY.legalName)).toBeInTheDocument();
    expect(within(card).getByText(COMPANY.vatNumber)).toBeInTheDocument();
    await waitFor(() => expect(approveButton()).toBeEnabled());

    fireEvent.click(approveButton());
    await waitFor(() => expect(store.verifyProviderAction).toHaveBeenCalledTimes(1));
    expect(store.verifyProviderAction.mock.calls[0][0]).toBe('c1');
    expect(store.verifyProviderAction.mock.calls[0][1]).toMatchObject({
      status: 'verified',
      expectedReview: { vatNumber: COMPANY.vatNumber, legalName: COMPANY.legalName },
    });
  });

  it("approves an individual with the payload it always had", async () => {
    renderPage();
    open('Paola Pendente');
    expect(screen.queryByRole('region', { name: it_('admin.business.title') })).not.toBeInTheDocument();
    fireEvent.click(approveButton());

    await waitFor(() => expect(store.verifyProviderAction).toHaveBeenCalledTimes(1));
    const [id, data] = store.verifyProviderAction.mock.calls[0];
    expect(id).toBe('p1');
    expect(Object.keys(data as object).sort()).toEqual(['status', 'verifiedAt']);
  });

  it('stale_review: explains it, reloads the queue, and the reopened row shows the new tax id', async () => {
    renderPage();
    expect(store.fetchPendingVerifications).toHaveBeenCalledTimes(1);
    open('Karate Club Milano');
    await screen.findByRole('region', { name: it_('admin.business.title') });
    await waitFor(() => expect(approveButton()).toBeEnabled());

    h.docs.set('instructors/c1', { business: { ...COMPANY, vatNumber: '00743110157' } });
    store.verifyProviderAction.mockRejectedValueOnce(
      Object.assign(new Error('stale_review'), { code: 'functions/failed-precondition' })
    );
    fireEvent.click(approveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(it_('admin.business.error.staleReview'));
    expect(screen.getByRole('alert')).not.toHaveTextContent('stale_review');
    await waitFor(() => expect(store.fetchPendingVerifications).toHaveBeenCalledTimes(2));

    open('Karate Club Milano');
    const card = await screen.findByRole('region', { name: it_('admin.business.title') });
    await waitFor(() => expect(within(card).getByText('00743110157')).toBeInTheDocument());

    await waitFor(() => expect(approveButton()).toBeEnabled());
    fireEvent.click(approveButton());
    await waitFor(() => expect(store.verifyProviderAction).toHaveBeenCalledTimes(2));
    expect(store.verifyProviderAction.mock.calls[1][1]).toMatchObject({
      expectedReview: { vatNumber: '00743110157', legalName: COMPANY.legalName },
    });
  });

  it('review_required (approved without a review) is explained too', async () => {
    store.verifyProviderAction.mockRejectedValueOnce(new Error('review_required'));
    renderPage();
    open('Karate Club Milano');
    await waitFor(() => expect(approveButton()).toBeEnabled());
    fireEvent.click(approveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(it_('admin.business.error.reviewRequired'));
  });
});
