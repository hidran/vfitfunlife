import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeQueryClientWrapper } from '@/test-utils/queryClientWrapper';
import { itMessages } from '@/i18n/messages/it';
import type { Provider } from '@/types/instructor';

/** The pending-applications panel approves a company for the details in its row (B8b). */

const h = vi.hoisted(() => ({
  apps: [] as unknown[],
  fetchProviderApplications: vi.fn(),
  decideProviderApplication: vi.fn(async (_d: unknown) => ({ success: true, draftServicesSeeded: 0 })),
}));
vi.mock('@/lib/firebase/providers', () => ({
  fetchProviderApplications: () => h.fetchProviderApplications(),
}));
vi.mock('@/lib/firebase/functions', () => ({
  decideProviderApplication: (d: unknown) => h.decideProviderApplication(d),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: { user: { role: string } }) => unknown) => selector({ user: { role: 'admin' } }),
}));

import { ProviderApplicationsPanel } from './ProviderApplicationsPanel';

const it_ = (key: keyof typeof itMessages) => itMessages[key] as string;

const company = {
  id: 'c1',
  fullName: 'Karate Club Milano',
  isBusiness: true,
  business: { legalName: 'Karate Club Milano S.r.l.', vatNumber: '12345678903', displayName: 'Karate Club Milano' },
  requestedCategoryIds: [],
} as unknown as Provider;
const person = { id: 'p1', fullName: 'Paola Pendente', requestedCategoryIds: [] } as unknown as Provider;

function renderPanel() {
  const { wrapper: Wrapper } = makeQueryClientWrapper();
  return render(
    <Wrapper>
      <ProviderApplicationsPanel />
    </Wrapper>
  );
}

const row = (name: string) => screen.getByText(name).closest('li') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  h.apps = [company, person];
  h.fetchProviderApplications.mockImplementation(async () => h.apps);
});

describe('ProviderApplicationsPanel', () => {
  it("shows a company's badge, legal name and tax id in its row", async () => {
    renderPanel();
    const r = await waitFor(() => row('Karate Club Milano'));
    expect(within(r).getByText(it_('provider.badge.business'))).toBeInTheDocument();
    expect(within(r).getByText('Karate Club Milano S.r.l.')).toBeInTheDocument();
    expect(within(r).getByText('12345678903')).toBeInTheDocument();
    expect(within(row('Paola Pendente')).queryByText(it_('provider.badge.business'))).not.toBeInTheDocument();
  });

  it('approves a company with the shown tax id and legal name', async () => {
    renderPanel();
    const r = await waitFor(() => row('Karate Club Milano'));
    fireEvent.click(within(r).getByRole('button', { name: it_('admin.applications.verify') }));
    await waitFor(() => expect(h.decideProviderApplication).toHaveBeenCalledTimes(1));
    expect(h.decideProviderApplication.mock.calls[0][0]).toEqual({
      providerId: 'c1',
      decision: 'verified',
      expectedReview: { vatNumber: '12345678903', legalName: 'Karate Club Milano S.r.l.' },
    });
  });

  it('keeps the individual and rejection payloads unchanged', async () => {
    renderPanel();
    const r = await waitFor(() => row('Paola Pendente'));
    fireEvent.click(within(r).getByRole('button', { name: it_('admin.applications.verify') }));
    await waitFor(() => expect(h.decideProviderApplication).toHaveBeenCalledTimes(1));
    expect(h.decideProviderApplication.mock.calls[0][0]).toEqual({ providerId: 'p1', decision: 'verified' });

    fireEvent.click(within(row('Karate Club Milano')).getByRole('button', { name: it_('admin.applications.reject') }));
    await waitFor(() => expect(h.decideProviderApplication).toHaveBeenCalledTimes(2));
    expect(h.decideProviderApplication.mock.calls[1][0]).toEqual({ providerId: 'c1', decision: 'rejected' });
  });

  it('stale_review: explains it in the row and reloads the list with the new details', async () => {
    renderPanel();
    const r = await waitFor(() => row('Karate Club Milano'));
    expect(h.fetchProviderApplications).toHaveBeenCalledTimes(1);

    h.apps = [{ ...company, business: { ...company.business!, vatNumber: '00743110157' } }, person];
    h.decideProviderApplication.mockRejectedValueOnce(
      Object.assign(new Error('stale_review'), { code: 'functions/failed-precondition' })
    );
    fireEvent.click(within(r).getByRole('button', { name: it_('admin.applications.verify') }));

    expect(await screen.findByRole('alert')).toHaveTextContent(it_('admin.business.error.staleReview'));
    await waitFor(() => expect(h.fetchProviderApplications).toHaveBeenCalledTimes(2));
    expect(await within(row('Karate Club Milano')).findByText('00743110157')).toBeInTheDocument();
  });

  it('keeps the generic message for anything that is not a code', async () => {
    h.decideProviderApplication.mockRejectedValueOnce(new Error('Admin access required'));
    renderPanel();
    const r = await waitFor(() => row('Paola Pendente'));
    fireEvent.click(within(r).getByRole('button', { name: it_('admin.applications.verify') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(it_('admin.applications.error'));
  });
});
