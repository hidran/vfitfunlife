import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AdminProvider } from '@/types/admin';

const mockProviders: AdminProvider[] = [
  {
    id: 'p1',
    uid: 'p1',
    fullName: 'Paola Pendente',
    email: 'paola@example.com',
    role: 'customer',
    providerStatus: 'pending',
  } as unknown as AdminProvider,
  {
    id: 'p2',
    uid: 'p2',
    fullName: 'Rita Respinta',
    email: 'rita@example.com',
    role: 'customer',
    providerStatus: 'rejected',
  } as unknown as AdminProvider,
  {
    id: 'p3',
    uid: 'p3',
    fullName: 'Vera Verificata',
    email: 'vera@example.com',
    role: 'provider',
    providerProfile: { isVerified: true, rating: 4.8 },
  } as unknown as AdminProvider,
];

const mockAdminState = {
  providers: mockProviders,
  providersTotal: mockProviders.length,
  pendingVerifications: [] as AdminProvider[],
  isLoadingProviders: false,
  fetchProviders: vi.fn(),
  fetchPendingVerifications: vi.fn(),
};
// The views subscribe through a selector (useShallow): run it, so a field it forgets fails here.
vi.mock('@/stores/adminStore', () => ({
  useAdminStore: (selector: (s: typeof mockAdminState) => unknown) => selector(mockAdminState),
}));

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

// Both panels read Firestore on their own; not what this suite is about.
vi.mock('@/components/admin/settings/ProviderOnboardingSettings', () => ({
  ProviderOnboardingSettings: () => null,
}));
vi.mock('@/components/admin/ProviderApplicationsPanel', () => ({
  ProviderApplicationsPanel: () => null,
}));

import { ProvidersListView } from './ProvidersListView';

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams = new URLSearchParams();
  window.history.replaceState(null, '', '/admin/providers/');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ProvidersListView', () => {
  it('seeds the filters from the URL, so a reload keeps them', () => {
    mockSearchParams = new URLSearchParams('verification=pending&status=suspended&q=anna');
    render(<ProvidersListView />);

    expect(mockAdminState.fetchProviders).toHaveBeenCalledWith(
      expect.objectContaining({ verificationStatus: 'pending', status: 'suspended', search: 'anna' })
    );
    expect(screen.getByPlaceholderText(/cerca provider/i)).toHaveValue('anna');
  });

  it('takes the page and page size from the URL and keeps them there', () => {
    mockSearchParams = new URLSearchParams('page=2&size=5');
    render(<ProvidersListView />);

    expect(mockAdminState.fetchProviders).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 5 })
    );
    expect(window.location.search).toBe('?page=2&size=5');
  });

  it('writes filter changes back to the URL', () => {
    render(<ProvidersListView />);

    fireEvent.click(screen.getByRole('button', { name: /Filtri/i }));
    const [verification, status] = screen.getAllByRole('combobox') as HTMLSelectElement[];
    fireEvent.change(verification, { target: { value: 'rejected' } });
    fireEvent.change(status, { target: { value: 'active' } });

    expect(window.location.search).toBe('?verification=rejected&status=active');
    expect(mockAdminState.fetchProviders).toHaveBeenLastCalledWith(
      expect.objectContaining({ verificationStatus: 'rejected', status: 'active', page: 1 })
    );
  });

  it('debounces the search and never reloads the pending-verification counter for it', () => {
    vi.useFakeTimers();
    render(<ProvidersListView />);
    expect(mockAdminState.fetchProviders).toHaveBeenCalledTimes(1);
    expect(mockAdminState.fetchPendingVerifications).toHaveBeenCalledTimes(1);

    const box = screen.getByPlaceholderText(/cerca provider/i);
    for (const text of ['v', 've', 'ver', 'vera']) {
      fireEvent.change(box, { target: { value: text } });
      act(() => vi.advanceTimersByTime(50));
    }
    expect(mockAdminState.fetchProviders).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(300));
    expect(mockAdminState.fetchProviders).toHaveBeenCalledTimes(2);
    expect(mockAdminState.fetchProviders).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'vera', page: 1 })
    );
    expect(mockAdminState.fetchPendingVerifications).toHaveBeenCalledTimes(1);
  });

  it('shows three verification states: a rejected applicant is not "pending"', () => {
    render(<ProvidersListView />);

    const cellText = (name: string) =>
      screen.getByText(name).closest('tr')?.querySelectorAll('td')[2]?.textContent;
    expect(cellText('Paola Pendente')).toBe('In attesa');
    expect(cellText('Rita Respinta')).toBe('Rifiutato');
    expect(cellText('Vera Verificata')).toBe('Verificato');
  });

  it('sorts by verification state, work to do first', () => {
    render(<ProvidersListView />);

    fireEvent.click(screen.getByText('Verifica'));
    const names = Array.from(document.querySelectorAll('tbody tr')).map(
      (tr) => tr.querySelector('p')?.textContent
    );
    expect(names).toEqual(['Paola Pendente', 'Rita Respinta', 'Vera Verificata']);
  });
});
