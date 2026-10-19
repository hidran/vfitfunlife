import { render, screen } from '@testing-library/react';
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
vi.mock('@/hooks/useFirestoreDocQuery', () => ({
  useFirestoreDocQuery: () => ({ data: mockProvider, isLoading: false }),
}));

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

import { ProviderDetailView } from './ProviderDetailView';

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
  it('shows the company badge and block, with the approve action still there', () => {
    renderView('biz');

    expect(screen.getByText('Azienda')).toBeInTheDocument();
    expect(screen.getByTestId('business-card')).toHaveTextContent('biz:false');
    expect(screen.getByRole('button', { name: /Verifica/ })).toBeInTheDocument();
  });

  it('tells the card when the company is already verified', () => {
    mockProvider = {
      ...company, providerStatus: 'verified', providerProfile: { isVerified: true },
    } as unknown as AdminProvider;
    renderView('biz');

    expect(screen.getByTestId('business-card')).toHaveTextContent('biz:true');
    expect(screen.queryByRole('button', { name: /^Verifica/ })).not.toBeInTheDocument();
  });

  it('shows nothing company-related for an individual', () => {
    mockProvider = individual;
    renderView('solo');

    expect(screen.queryByText('Azienda')).not.toBeInTheDocument();
    expect(screen.queryByTestId('business-card')).not.toBeInTheDocument();
  });
});
