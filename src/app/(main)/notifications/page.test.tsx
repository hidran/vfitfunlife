import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { normalizeNotification } from '@/lib/notifications/inbox';
import { useNotificationStore } from '@/stores/notificationStore';

vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (k: string) => k, locale: 'it' }) }));
vi.mock('@/lib/notify', () => ({ notify: { success: vi.fn(), error: vi.fn() } }));

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const resolveNotificationHref = vi.fn();
vi.mock('@/lib/firebase/notifications', () => ({
  resolveNotificationHref: (...a: unknown[]) => resolveNotificationHref(...a),
  setNotificationRead: vi.fn(async () => {}),
  markAllInboxRead: vi.fn(async () => 0),
}));

import NotificationsPage from './page';

const markRead = vi.fn(async () => {});

function seed() {
  const notifications = [
    normalizeNotification('n1', {
      title: 'Nuova richiesta',
      body: 'Giulia ha richiesto una sessione',
      type: 'booking_new_request',
      data: { bookingId: 'b1' },
      isRead: false,
      createdAt: { seconds: 1_790_000_000 },
    }),
    normalizeNotification('n2', { title: 'VIP scaduto', type: 'vip', isRead: true }),
  ];
  useNotificationStore.setState({
    uid: 'trainer-1',
    status: 'ready',
    notifications,
    unreadCount: 1,
    markRead,
  });
}

describe('NotificationsPage', () => {
  beforeEach(() => {
    push.mockClear();
    markRead.mockClear();
    resolveNotificationHref.mockReset();
    seed();
  });

  it('renders the realtime inbox with localized chrome', () => {
    render(<NotificationsPage />);
    expect(screen.getByText('Nuova richiesta')).toBeInTheDocument();
    expect(screen.getByText('Giulia ha richiesto una sessione')).toBeInTheDocument();
    expect(screen.getByText('VIP scaduto')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'notifications.inbox.markRead' })).toBeInTheDocument();
  });

  it('tapping a booking notification marks it read and opens the resolved detail route', async () => {
    resolveNotificationHref.mockResolvedValue('/provider/bookings/detail?id=b1');
    render(<NotificationsPage />);
    fireEvent.click(screen.getByText('Nuova richiesta'));
    expect(markRead).toHaveBeenCalledWith('n1', true);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/provider/bookings/detail?id=b1'));
    expect(resolveNotificationHref).toHaveBeenCalledWith(
      'trainer-1',
      expect.objectContaining({ id: 'n1', bookingId: 'b1' })
    );
  });

  it('the unread-only filter hides read items', () => {
    render(<NotificationsPage />);
    const toggle = screen.getByRole('button', { name: 'notifications.unreadOnly' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('VIP scaduto')).not.toBeInTheDocument();
  });

  it('shows the empty state for an empty inbox', () => {
    useNotificationStore.setState({ notifications: [], unreadCount: 0 });
    render(<NotificationsPage />);
    expect(screen.getByText('notifications.inbox.emptyTitle')).toBeInTheDocument();
  });
});
