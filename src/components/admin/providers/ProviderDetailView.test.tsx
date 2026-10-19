import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

const mockFetchProvider = vi.fn();
vi.mock('@/lib/firebase/providers', () => ({
  fetchProvider: (id: string) => mockFetchProvider(id),
}));

const mockReleaseBusinessVat = vi.fn();
vi.mock('@/lib/firebase/functions', () => ({
  releaseBusinessVat: (data: unknown) => mockReleaseBusinessVat(data),
}));

const mockNotify = { success: vi.fn(), error: vi.fn() };
vi.mock('@/lib/notify', () => ({ notify: mockNotify }));

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
  mockFetchProvider.mockResolvedValue({
    id: 'biz',
    providerType: 'business',
    business: {
      legalName: 'Palestra Rossi S.r.l.',
      vatNumber: '01234567897',
      displayName: 'Palestra Rossi',
      venueType: 'studio',
      address: 'Via Roma 1',
      city: 'Torino',
      website: 'https://palestrarossi.it',
      logoUrl: 'https://cdn.example.com/logo.png',
    },
  });
  mockReleaseBusinessVat.mockResolvedValue({
    success: true, providerId: 'biz', vatNumber: '01234567897', released: true,
  });
});

describe('ProviderDetailView — company', () => {
  it('shows the company block from instructors/{uid}, with the approve action still there', async () => {
    renderView('biz');

    expect(await screen.findByText('Palestra Rossi S.r.l.')).toBeInTheDocument();
    expect(mockFetchProvider).toHaveBeenCalledWith('biz');
    expect(screen.getByText('01234567897')).toBeInTheDocument();
    expect(screen.getByText('Via Roma 1')).toBeInTheDocument();
    expect(screen.getByText('Torino')).toBeInTheDocument();
    expect(screen.getByText('Studio')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /palestrarossi\.it/ });
    expect(link).toHaveAttribute('href', 'https://palestrarossi.it');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('img', { name: 'Logo' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/logo.png',
    );
    // Header badge + the block heading.
    expect(screen.getAllByText('Azienda').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: /Verifica/ })).toBeInTheDocument();
  });

  it('releases the P.IVA claim after a confirmation, with the reason', async () => {
    renderView('biz');
    await screen.findByText('Palestra Rossi S.r.l.');

    fireEvent.click(screen.getByRole('button', { name: /Libera P\.IVA/ }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('01234567897');
    expect(mockReleaseBusinessVat).not.toHaveBeenCalled();

    fireEvent.change(dialog.querySelector('textarea')!, { target: { value: 'Azienda chiusa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Libera' }));

    await waitFor(() =>
      expect(mockReleaseBusinessVat).toHaveBeenCalledWith({ providerId: 'biz', reason: 'Azienda chiusa' }),
    );
    await waitFor(() => expect(mockNotify.success).toHaveBeenCalledWith('P.IVA liberata'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Only the claim went: the number is still shown.
    expect(screen.getByText('01234567897')).toBeInTheDocument();
  });

  it('tells the admin when the claim was already free, and reports failures', async () => {
    mockReleaseBusinessVat.mockResolvedValueOnce({ success: true, providerId: 'biz', vatNumber: '01234567897', released: false });
    renderView('biz');
    await screen.findByText('Palestra Rossi S.r.l.');

    fireEvent.click(screen.getByRole('button', { name: /Libera P\.IVA/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Libera' }));
    await waitFor(() => expect(mockNotify.success).toHaveBeenCalledWith('La P.IVA era già libera'));
    expect(mockReleaseBusinessVat).toHaveBeenCalledWith({ providerId: 'biz' });

    mockReleaseBusinessVat.mockRejectedValueOnce(new Error('permission-denied'));
    fireEvent.click(screen.getByRole('button', { name: /Libera P\.IVA/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Libera' }));
    await waitFor(() => expect(mockNotify.error).toHaveBeenCalled());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('never turns a non-http(s) website into a link', async () => {
    mockFetchProvider.mockResolvedValueOnce({
      id: 'biz',
      providerType: 'business',
      business: { legalName: 'Evil S.r.l.', vatNumber: '01234567897', displayName: 'Evil', website: 'javascript:alert(1)' },
    });
    renderView('biz');
    await screen.findByText('Evil S.r.l.');

    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /javascript/ })).not.toBeInTheDocument();
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it('shows nothing company-related for an individual, and never reads instructors/', () => {
    mockProvider = individual;
    renderView('solo');

    expect(screen.queryByText('Azienda')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Libera P\.IVA/ })).not.toBeInTheDocument();
    expect(mockFetchProvider).not.toHaveBeenCalled();
  });
});
