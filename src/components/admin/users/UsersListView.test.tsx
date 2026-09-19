import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdminUser } from '@/types/admin';
import type { BulkDeleteJobView } from '@/lib/firebase/bulkDelete';

const mockUsers: AdminUser[] = [
  {
    id: 'u1',
    uid: 'u1',
    fullName: 'Anna Utente',
    email: 'anna@example.com',
    phone: null,
    avatarUrl: null,
    role: 'customer',
    isSuspended: false,
    loginCount: 0,
    actionsCount: 0,
    createdAt: new Date('2024-01-01'),
  } as unknown as AdminUser,
];

const mockAdminState = {
  users: mockUsers,
  usersTotal: mockUsers.length,
  isLoadingUsers: false,
  error: null as string | null,
  fetchUsers: vi.fn(),
  bulkUpdateUsersAction: vi.fn(),
  bulkUpdateUserRoleAction: vi.fn(),
  exportDataAction: vi.fn(),
  clearError: vi.fn(),
};
vi.mock('@/stores/adminStore', () => ({ useAdminStore: () => mockAdminState }));

const mockAuthState = { user: { id: 'admin1', role: 'superadmin' } };
vi.mock('@/stores/authStore', () => ({
  // UsersListView/SuperadminOnly always call this with a selector.
  useAuthStore: (selector: (s: typeof mockAuthState) => unknown) => selector(mockAuthState),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const mockBulkDelete = {
  startBulkDelete: vi.fn((_uids: string[], _reason: string): Promise<string> => Promise.resolve('job-x')),
  watchBulkDeleteJob: vi.fn(
    (_jobId: string, _onChange: (job: BulkDeleteJobView) => void, _onError?: (e: Error) => void) => vi.fn()
  ),
  findRunningBulkDelete: vi.fn((_actorUid: string): Promise<string | null> => Promise.resolve(null)),
};
vi.mock('@/lib/firebase/bulkDelete', () => ({
  startBulkDelete: (uids: string[], reason: string) => mockBulkDelete.startBulkDelete(uids, reason),
  watchBulkDeleteJob: (
    jobId: string,
    onChange: (job: BulkDeleteJobView) => void,
    onError?: (e: Error) => void
  ) => mockBulkDelete.watchBulkDeleteJob(jobId, onChange, onError),
  findRunningBulkDelete: (actorUid: string) => mockBulkDelete.findRunningBulkDelete(actorUid),
}));

import { UsersListView } from './UsersListView';

/** Each row's quick-actions menu uses useEntityMutation, which needs a query client. */
function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <UsersListView />
    </QueryClientProvider>
  );
}

/** The row's selection checkbox has no accessible name — it's an icon-only toggle. */
function tickFirstRow() {
  const checkbox = document.querySelector('tbody tr td button');
  if (!checkbox) throw new Error('No selectable row found');
  fireEvent.click(checkbox);
}

function openFilterPanel() {
  fireEvent.click(screen.getByRole('button', { name: /Filtri/i }));
}

/** Role filter renders first, status second — same order as the `filters` array. */
function statusSelect(): HTMLSelectElement {
  return screen.getAllByRole('combobox')[1] as HTMLSelectElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAdminState.users = mockUsers;
  mockAdminState.usersTotal = mockUsers.length;
  mockAdminState.error = null;
  mockBulkDelete.findRunningBulkDelete.mockResolvedValue(null);
  mockBulkDelete.watchBulkDeleteJob.mockReturnValue(vi.fn());
});

describe('UsersListView', () => {
  it('clears the selection when the status filter changes', () => {
    renderView();

    tickFirstRow();
    expect(screen.getByText(/selezionat/i)).toBeInTheDocument();

    openFilterPanel();
    fireEvent.change(statusSelect(), { target: { value: 'suspended' } });

    expect(screen.queryByText(/selezionat/i)).toBeNull();
  });

  it('shows a localized message when a bulk delete is already running', async () => {
    mockBulkDelete.startBulkDelete.mockRejectedValue({ code: 'functions/failed-precondition', message: 'nope' });
    renderView();

    tickFirstRow();
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));
    fireEvent.change(screen.getByLabelText(/Digita/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'pulizia test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Elimina definitivamente' }));

    expect(
      await screen.findByText("Hai già un'eliminazione in corso: attendi che finisca")
    ).toBeInTheDocument();
  });

  it('surfaces a watch failure without treating the job as stopped', async () => {
    mockBulkDelete.findRunningBulkDelete.mockResolvedValue('job1');
    renderView();

    await waitFor(() => expect(mockBulkDelete.watchBulkDeleteJob).toHaveBeenCalled());
    const [, , onError] = mockBulkDelete.watchBulkDeleteJob.mock.calls[0];
    if (!onError) throw new Error('watchBulkDeleteJob was not given an onError callback');

    act(() => onError(new Error('permission-denied')));

    expect(
      await screen.findByText("L'eliminazione prosegue sul server, ma non riesco a mostrarne l'avanzamento")
    ).toBeInTheDocument();
  });
});
