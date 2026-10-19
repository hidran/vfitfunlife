import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdminProvider } from '@/types/admin';

const company = {
  id: 'biz',
  uid: 'biz',
  fullName: 'Palestra Rossi',
  email: 'rossi@example.com',
  role: 'customer',
  providerStatus: 'pending',
  providerType: 'business',
  providerProfile: { isVerified: false },
} as unknown as AdminProvider;

const individual = {
  id: 'solo',
  uid: 'solo',
  fullName: 'Anna Bianchi',
  email: 'anna@example.com',
  role: 'provider',
  providerType: 'individual',
  providerProfile: { isVerified: true },
} as unknown as AdminProvider;

let mockProvider: AdminProvider = company;
// A real query over the mutable fixture, so the view's cache updates and refetches are exercised.
vi.mock('@/hooks/useFirestoreDocQuery', async () => {
  const { useQuery } = await import('@tanstack/react-query');
  return {
    useFirestoreDocQuery: (queryKey: readonly unknown[]) =>
      useQuery({ queryKey, queryFn: async () => mockProvider }),
  };
});

// The card reads instructors/{uid} and has its own suite (BusinessDetailsCard.test.tsx).
vi.mock('./BusinessDetailsCard', () => ({
  BusinessDetailsCard: ({ providerId, isVerified }: { providerId: string; isVerified: boolean }) => (
    <div data-testid="business-card">{`${providerId}:${isVerified}`}</div>
  ),
}));

const mockAdminState = {
  verifyProviderAction: vi.fn(),
  rejectProviderAction: vi.fn(),
};
vi.mock('@/stores/adminStore', () => ({
  useAdminStore: (selector: (s: typeof mockAdminState) => unknown) => selector(mockAdminState),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (s: { user: { role: string } }) => unknown) =>
    selector({ user: { role: 'admin' } }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/admin/providers/',
}));
vi.mock('@/lib/firebase/config', () => ({ db: {}, auth: {}, getFunctionsInstance: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  Timestamp: { now: () => ({}) },
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
// The tabs read bookings/services on their own; not what this suite is about.
vi.mock('./ProviderTabsContent', () => ({
  ProviderTabBar: () => null,
  ProviderTabContent: () => null,
}));

const mockNotify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notify: mockNotify }));

import { ProviderDetailView } from './ProviderDetailView';
import { itMessages } from '@/i18n/messages/it';

function renderView(id: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProviderDetailView providerId={id} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockProvider = company;
});

describe('ProviderDetailView — company', () => {
  it('shows the company badge and block, with the approve action still there', async () => {
    renderView('biz');

    expect(await screen.findByText('Azienda')).toBeInTheDocument();
    expect(screen.getByTestId('business-card')).toHaveTextContent('biz:false');
    expect(screen.getByRole('button', { name: /Verifica/ })).toBeInTheDocument();
  });

  it('tells the card when the company is already verified', async () => {
    mockProvider = {
      ...company, providerStatus: 'verified', providerProfile: { isVerified: true },
    } as unknown as AdminProvider;
    renderView('biz');

    expect(await screen.findByTestId('business-card')).toHaveTextContent('biz:true');
    expect(screen.queryByRole('button', { name: /^Verifica/ })).not.toBeInTheDocument();
  });

  it('shows nothing company-related for an individual', async () => {
    mockProvider = individual;
    renderView('solo');
    await screen.findByText('Anna Bianchi');

    expect(screen.queryByText('Azienda')).not.toBeInTheDocument();
    expect(screen.queryByTestId('business-card')).not.toBeInTheDocument();
  });
});

describe('ProviderDetailView — approval errors', () => {
  it('explains a venue_exists refusal instead of the generic failure', async () => {
    mockAdminState.verifyProviderAction.mockRejectedValueOnce(
      Object.assign(new Error('venue_exists'), { code: 'functions/already-exists' }),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderView('biz');

    await userEvent.click(await screen.findByRole('button', { name: /Verifica/ }));

    await waitFor(() => expect(mockNotify.error).toHaveBeenCalledWith(
      itMessages['admin.providerDecision.error.venueExists'],
    ));
  });

  it('keeps the generic message for other failures', async () => {
    mockAdminState.verifyProviderAction.mockRejectedValueOnce(new Error('Admin required'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderView('biz');

    await userEvent.click(await screen.findByRole('button', { name: /Verifica/ }));

    await waitFor(() => expect(mockNotify.error).toHaveBeenCalledWith(
      itMessages['admin.providerDetail.actionError'],
    ));
  });
});

describe('ProviderDetailView — after approval', () => {
  it('flips the badge, hides the decision buttons and toasts, for an applicant with no providerProfile yet', async () => {
    // A pending applicant has no providerProfile on users/{uid} until the decision creates it.
    mockProvider = {
      id: 'biz', uid: 'biz', fullName: 'Palestra Rossi', role: 'customer',
      providerStatus: 'pending', providerType: 'business',
    } as unknown as AdminProvider;
    mockAdminState.verifyProviderAction.mockImplementationOnce(async () => {
      // What a refetch of the document would see once the callable has run.
      mockProvider = {
        ...mockProvider, role: 'provider', providerStatus: 'verified', providerProfile: { isVerified: true },
      } as unknown as AdminProvider;
    });
    renderView('biz');

    expect(await screen.findByText('In attesa')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Verifica/ }));

    await waitFor(() => expect(mockNotify.success).toHaveBeenCalledWith(
      itMessages['admin.providerDetail.verifiedSuccess'],
    ));
    expect(await screen.findByText('Verificato')).toBeInTheDocument();
    expect(screen.queryByText('In attesa')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Verifica/ })).not.toBeInTheDocument();
  });
});
