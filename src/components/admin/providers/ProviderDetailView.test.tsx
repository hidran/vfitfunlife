import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeQueryClientWrapper } from '@/test-utils/queryClientWrapper';
import { itMessages } from '@/i18n/messages/it';

/**
 * ProviderDetailView for a company (plan 2026-10-04, B8b): the business card, approving what
 * the admin saw (`expectedReview`), a stale review that reloads, and the three admin actions.
 * Firestore is a map of documents read through getDoc, so "reload" means a fresh read that can
 * return different data.
 */

const h = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  reads: [] as string[],
}));

vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  doc: (_db: unknown, collection: string, id: string) => ({ path: `${collection}/${id}` }),
  getDoc: async (ref: { path: string }) => {
    h.reads.push(ref.path);
    const data = h.docs.get(ref.path);
    return { id: ref.path.split('/')[1], exists: () => data !== undefined, data: () => data };
  },
  updateDoc: vi.fn(),
  addDoc: vi.fn(),
  collection: vi.fn(),
  serverTimestamp: () => 'NOW',
}));

const fns = vi.hoisted(() => ({
  releaseBusinessVat: vi.fn(async (_d: unknown) => ({ success: true, vatNumber: '', releasedFrom: null })),
  convertBusinessToIndividual: vi.fn(async (_d: unknown) => ({ success: true, providerId: '', releasedClaims: [] })),
  updateBusinessTaxId: vi.fn(async (_d: unknown) => ({ success: true, providerId: '', vatNumber: '', releasedClaims: [] })),
}));
vi.mock('@/lib/firebase/functions', () => ({
  cancelBooking: vi.fn(),
  decideProviderApplication: vi.fn(),
  releaseBusinessVat: (d: unknown) => fns.releaseBusinessVat(d),
  convertBusinessToIndividual: (d: unknown) => fns.convertBusinessToIndividual(d),
  updateBusinessTaxId: (d: unknown) => fns.updateBusinessTaxId(d),
}));

const store = vi.hoisted(() => ({
  verifyProviderAction: vi.fn(async (_id: string, _data: unknown) => {}),
  rejectProviderAction: vi.fn(async () => {}),
}));
vi.mock('@/stores/adminStore', () => ({
  useAdminStore: (selector: (s: typeof store) => unknown) => selector(store),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: string; role: string } }) => unknown) =>
    selector({ user: { id: 'admin-1', role: 'admin' } }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
const notify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notify }));

import { ProviderDetailView } from './ProviderDetailView';

const it_ = (key: keyof typeof itMessages, vars: Record<string, string> = {}) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replace(`{{${k}}}`, v), itMessages[key] as string);

const COMPANY = {
  legalName: 'Karate Club Milano S.r.l.',
  vatNumber: '12345678903',
  legalForm: 'association',
  affiliationNumber: 'CONI-778',
  displayName: 'Karate Club Milano',
  description: 'Karate per bambini e adulti',
  website: 'https://karate.example.it/corsi',
  logoUrl: 'https://cdn.example.it/logo.png',
  city: 'Milano',
};

function seedCompany(status: 'pending' | 'rejected' = 'pending') {
  h.docs.set('users/c1', {
    fullName: 'Karate Club Milano',
    email: 'karate@example.it',
    role: 'customer',
    providerStatus: status,
    providerType: 'business',
    providerProfile: { isVerified: false },
  });
  h.docs.set('instructors/c1', { applicationStatus: status, business: { ...COMPANY } });
}

function renderView(providerId = 'c1') {
  const { wrapper: Wrapper } = makeQueryClientWrapper();
  return render(
    <Wrapper>
      <ProviderDetailView providerId={providerId} />
    </Wrapper>
  );
}

const businessCard = () => screen.getByRole('region', { name: it_('admin.business.title') });

beforeEach(() => {
  h.docs.clear();
  h.reads.length = 0;
  vi.clearAllMocks();
});

describe('ProviderDetailView — individuals are unchanged', () => {
  it('shows no business card and approves without a review', async () => {
    h.docs.set('users/p1', { fullName: 'Paola Pendente', role: 'customer', providerStatus: 'pending' });
    h.docs.set('instructors/p1', { applicationStatus: 'pending' });
    renderView('p1');

    const approve = await screen.findByRole('button', { name: it_('admin.providerDetail.verify') });
    await waitFor(() => expect(approve).toBeEnabled());
    expect(screen.queryByRole('region', { name: it_('admin.business.title') })).not.toBeInTheDocument();
    expect(screen.queryByText(it_('provider.badge.business'))).not.toBeInTheDocument();

    fireEvent.click(approve);
    await waitFor(() => expect(store.verifyProviderAction).toHaveBeenCalledTimes(1));
    const [id, data] = store.verifyProviderAction.mock.calls[0];
    expect(id).toBe('p1');
    expect(Object.keys(data as object).sort()).toEqual(['status', 'verifiedAt']);
  });
});

describe('ProviderDetailView — a company', () => {
  it('shows the business card: legal and public details, safe website link, logo', async () => {
    seedCompany();
    renderView();

    const card = await waitFor(businessCard);
    const value = (label: keyof typeof itMessages) =>
      within(card).getByText(it_(label)).nextElementSibling?.textContent;
    expect(value('provider.business.reviewed.legalName')).toBe(COMPANY.legalName);
    expect(value('provider.business.reviewed.vatNumber')).toBe(COMPANY.vatNumber);
    expect(value('provider.business.reviewed.legalForm')).toBe(it_('provider.business.legalForm.association'));
    expect(value('provider.business.reviewed.affiliationNumber')).toBe(COMPANY.affiliationNumber);
    expect(value('admin.business.field.displayName')).toBe(COMPANY.displayName);
    expect(value('admin.business.field.city')).toBe(COMPANY.city);
    expect(value('admin.business.field.description')).toBe(COMPANY.description);
    const link = within(card).getByRole('link');
    expect(link).toHaveAttribute('href', COMPANY.website);
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(card).getByAltText(it_('provider.business.logo.alt', { name: COMPANY.displayName }))).toBeInTheDocument();
    // "Azienda" as text (with an icon), not colour alone — in the header and on the card.
    expect(screen.getAllByText(it_('provider.badge.business')).length).toBeGreaterThanOrEqual(2);
  });

  it('never renders a javascript: website as a link', async () => {
    seedCompany();
    h.docs.set('instructors/c1', { business: { ...COMPANY, website: 'javascript:alert(1)' } });
    renderView();
    const card = await waitFor(businessCard);
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
  });

  it('approves with the tax id and legal name shown on screen', async () => {
    seedCompany();
    renderView();
    await waitFor(businessCard);

    fireEvent.click(screen.getByRole('button', { name: it_('admin.providerDetail.verify') }));
    await waitFor(() => expect(store.verifyProviderAction).toHaveBeenCalledTimes(1));
    expect(store.verifyProviderAction.mock.calls[0][1]).toMatchObject({
      status: 'verified',
      expectedReview: { vatNumber: COMPANY.vatNumber, legalName: COMPANY.legalName },
    });
  });

  it('refreshes rejection so a rejected business immediately offers claim release', async () => {
    seedCompany();
    store.rejectProviderAction.mockImplementationOnce(async () => {
      h.docs.set('users/c1', { ...h.docs.get('users/c1'), providerStatus: 'rejected' });
    });
    renderView();
    await waitFor(businessCard);
    fireEvent.click(screen.getByRole('button', { name: it_('admin.providerDetail.reject') }));
    fireEvent.change(screen.getByPlaceholderText(it_('admin.providerDetail.rejectionPlaceholder')), { target: { value: 'QA rejection' } });
    fireEvent.click(screen.getByRole('button', { name: it_('admin.providerDetail.confirmReject') }));
    expect(await screen.findByRole('button', { name: it_('admin.business.action.release') })).toBeInTheDocument();
  });

  it('shows approval for a provider whose nested profile was absent', async () => {
    seedCompany();
    h.docs.set('users/c1', { fullName: 'Karate Club Milano', role: 'customer', providerStatus: 'pending', providerType: 'business' });
    renderView();
    await waitFor(businessCard);
    fireEvent.click(screen.getByRole('button', { name: it_('admin.providerDetail.verify') }));
    expect(await screen.findByText(it_('admin.badge.verified'), { exact: true })).toBeInTheDocument();
  });

  it('stale_review: says so and reloads, so the new tax id is what the next approval sends', async () => {
    seedCompany();
    renderView();
    await waitFor(businessCard);

    // The company re-applies with another tax id after the admin opened the page.
    h.docs.set('instructors/c1', { business: { ...COMPANY, vatNumber: '00743110157' } });
    store.verifyProviderAction.mockRejectedValueOnce(
      Object.assign(new Error('stale_review'), { code: 'functions/failed-precondition' })
    );
    fireEvent.click(screen.getByRole('button', { name: it_('admin.providerDetail.verify') }));

    expect(await screen.findByRole('alert')).toHaveTextContent(it_('admin.business.error.staleReview'));
    await waitFor(() => expect(within(businessCard()).getByText('00743110157')).toBeInTheDocument());
    expect(notify.success).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: it_('admin.providerDetail.verify') }));
    await waitFor(() => expect(store.verifyProviderAction).toHaveBeenCalledTimes(2));
    expect(store.verifyProviderAction.mock.calls[1][1]).toMatchObject({
      expectedReview: { vatNumber: '00743110157', legalName: COMPANY.legalName },
    });
  });

  it('offers "release tax-id claim" only for a rejected company', async () => {
    seedCompany('pending');
    const { unmount } = renderView();
    const card = await waitFor(businessCard);
    expect(within(card).getByRole('button', { name: it_('admin.business.action.changeTaxId') })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: it_('admin.business.action.convert') })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: it_('admin.business.action.release') })).not.toBeInTheDocument();
    unmount();

    seedCompany('rejected');
    renderView();
    const rejected = await waitFor(businessCard);
    expect(within(rejected).getByRole('button', { name: it_('admin.business.action.release') })).toBeInTheDocument();
  });
});

describe('ProviderDetailView — admin actions', () => {
  async function openAction(label: keyof typeof itMessages, status: 'pending' | 'rejected' = 'pending') {
    seedCompany(status);
    renderView();
    const card = await waitFor(businessCard);
    fireEvent.click(within(card).getByRole('button', { name: it_(label) }));
    return screen.getByRole('dialog');
  }

  it('change tax id: an accessible dialog prefilled with the stored data, sends the new data and refreshes', async () => {
    const dialog = await openAction('admin.business.action.changeTaxId');
    expect(dialog).toHaveAccessibleName(it_('admin.business.change.title'));
    expect(dialog).toHaveAccessibleDescription(it_('admin.business.change.description'));

    const vat = within(dialog).getByLabelText(it_('provider.business.field.vatNumber'));
    expect(vat).toHaveValue(COMPANY.vatNumber);
    expect(within(dialog).getByLabelText(it_('provider.business.field.legalName'))).toHaveValue(COMPANY.legalName);
    expect(within(dialog).getByLabelText(it_('provider.business.field.legalForm'))).toHaveValue('association');

    fireEvent.change(vat, { target: { value: 'IT 00743110157' } });
    fireEvent.change(within(dialog).getByLabelText(it_('provider.business.field.affiliationNumber')), {
      target: { value: '  ' },
    });
    fireEvent.change(within(dialog).getByLabelText(it_('admin.business.dialog.reasonLabel')), {
      target: { value: '  Visura camerale aggiornata  ' },
    });
    const readsBefore = h.reads.length;
    fireEvent.click(within(dialog).getByRole('button', { name: it_('admin.business.change.confirm') }));

    await waitFor(() => expect(fns.updateBusinessTaxId).toHaveBeenCalledTimes(1));
    expect(fns.updateBusinessTaxId.mock.calls[0][0]).toEqual({
      providerId: 'c1',
      vatNumber: '00743110157',
      legalName: COMPANY.legalName,
      legalForm: 'association',
      affiliationNumber: null,
      reason: 'Visura camerale aggiornata',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(notify.success).toHaveBeenCalledWith(it_('admin.business.change.success'));
    await waitFor(() => expect(h.reads.slice(readsBefore)).toContain('instructors/c1'));
  });

  it('change tax id: an invalid number is refused on its field, with no call', async () => {
    const dialog = await openAction('admin.business.action.changeTaxId');
    const vat = within(dialog).getByLabelText(it_('provider.business.field.vatNumber'));
    fireEvent.change(vat, { target: { value: '12345678900' } });
    fireEvent.click(within(dialog).getByRole('button', { name: it_('admin.business.change.confirm') }));

    expect(await within(dialog).findByText(it_('provider.business.error.vatInvalid'))).toBeInTheDocument();
    expect(vat).toHaveAttribute('aria-invalid', 'true');
    expect(vat).toHaveFocus();
    expect(fns.updateBusinessTaxId).not.toHaveBeenCalled();
  });

  it('change tax id: vat_already_registered shows its text in the dialog, which stays open', async () => {
    fns.updateBusinessTaxId.mockRejectedValueOnce(
      Object.assign(new Error('vat_already_registered'), { code: 'functions/already-exists' })
    );
    const dialog = await openAction('admin.business.action.changeTaxId');
    fireEvent.change(within(dialog).getByLabelText(it_('provider.business.field.vatNumber')), {
      target: { value: '00743110157' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: it_('admin.business.change.confirm') }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(it_('admin.business.error.vatTaken'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(notify.success).not.toHaveBeenCalled();
  });

  it('release: sends the tax id with the reason and refreshes', async () => {
    const dialog = await openAction('admin.business.action.release', 'rejected');
    expect(dialog).toHaveAccessibleDescription(it_('admin.business.release.description', { vat: COMPANY.vatNumber }));
    fireEvent.change(within(dialog).getByLabelText(it_('admin.business.dialog.reasonLabel')), {
      target: { value: 'Respinta, P.IVA richiesta dal titolare' },
    });
    const readsBefore = h.reads.length;
    fireEvent.click(within(dialog).getByRole('button', { name: it_('admin.business.release.confirm') }));

    await waitFor(() => expect(fns.releaseBusinessVat).toHaveBeenCalledTimes(1));
    expect(fns.releaseBusinessVat.mock.calls[0][0]).toEqual({
      vatNumber: COMPANY.vatNumber,
      reason: 'Respinta, P.IVA richiesta dal titolare',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(notify.success).toHaveBeenCalledWith(it_('admin.business.release.success'));
    await waitFor(() => expect(h.reads.slice(readsBefore)).toContain('instructors/c1'));
  });

  it('release: claim_in_use is explained, not shown as a code', async () => {
    fns.releaseBusinessVat.mockRejectedValueOnce(
      Object.assign(new Error('claim_in_use'), { code: 'functions/failed-precondition' })
    );
    const dialog = await openAction('admin.business.action.release', 'rejected');
    fireEvent.click(within(dialog).getByRole('button', { name: it_('admin.business.release.confirm') }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(it_('admin.business.error.claimInUse'));
    expect(alert).not.toHaveTextContent('claim_in_use');
  });

  it('convert: warns what is removed, sends no reason when none is typed, refreshes', async () => {
    const dialog = await openAction('admin.business.action.convert');
    expect(dialog).toHaveAccessibleName(it_('admin.business.convert.title'));
    expect(dialog).toHaveAccessibleDescription(it_('admin.business.convert.warning'));
    const readsBefore = h.reads.length;
    fireEvent.click(within(dialog).getByRole('button', { name: it_('admin.business.convert.confirm') }));

    await waitFor(() => expect(fns.convertBusinessToIndividual).toHaveBeenCalledTimes(1));
    expect(fns.convertBusinessToIndividual.mock.calls[0][0]).toEqual({ providerId: 'c1' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(notify.success).toHaveBeenCalledWith(it_('admin.business.convert.success'));
    await waitFor(() => expect(h.reads.slice(readsBefore)).toEqual(expect.arrayContaining(['users/c1', 'instructors/c1'])));
  });

  it('caps the reason at 200 characters and closes on Escape', async () => {
    const dialog = await openAction('admin.business.action.convert');
    const reason = within(dialog).getByLabelText(it_('admin.business.dialog.reasonLabel'));
    fireEvent.change(reason, { target: { value: 'x'.repeat(250) } });
    expect((reason as HTMLTextAreaElement).value).toHaveLength(200);
    expect(within(dialog).getByText(it_('admin.business.dialog.reasonCounter', { count: '200', max: '200' }))).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(fns.convertBusinessToIndividual).not.toHaveBeenCalled();
  });

  it('keeps the dialog open and its buttons disabled while the call runs', async () => {
    let finish: () => void = () => {};
    fns.convertBusinessToIndividual.mockImplementationOnce(
      () => new Promise((resolve) => (finish = () => resolve({ success: true, providerId: 'c1', releasedClaims: [] })))
    );
    const dialog = await openAction('admin.business.action.convert');
    fireEvent.click(within(dialog).getByRole('button', { name: it_('admin.business.convert.confirm') }));

    await waitFor(() => expect(within(dialog).getByRole('button', { name: it_('common.cancel') })).toBeDisabled());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    finish();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
