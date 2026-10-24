import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { safeReturnTo } from '@/lib/auth/returnTo';

type AuthState = {
  firebaseUser: { uid: string; photoURL: string | null; displayName: string | null; email: string | null } | null;
  user: { id: string; fullName: string; email: string; avatarUrl?: string; pointsBalance?: number; walletBalance?: number } | null;
  isLoading: boolean;
  isInitialized: boolean;
};

const mocks = vi.hoisted(() => ({
  pathname: '/home',
  replace: vi.fn(),
  auth: { firebaseUser: null, user: null, isLoading: false, isInitialized: true } as AuthState,
  startInbox: vi.fn(() => () => undefined),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
}));
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (state: AuthState) => unknown) => select(mocks.auth),
}));
vi.mock('@/stores/notificationStore', () => ({
  startNotificationInbox: mocks.startInbox,
  useNotificationStore: (select: (state: { unreadCount: number }) => unknown) => select({ unreadCount: 3 }),
}));
vi.mock('@/components/auth/EmailVerificationBanner', () => ({ EmailVerificationBanner: () => <div data-testid="verify-banner" /> }));
vi.mock('@/components/layout/MainLayout', () => ({
  MainLayout: ({ children, signInHref, userName }: { children: React.ReactNode; signInHref?: string; userName?: string }) => (
    <div data-testid="shell" data-sign-in-href={signInHref ?? ''} data-user-name={userName ?? ''}>{children}</div>
  ),
}));

import MainAppLayout from './layout';

const visit = (path: string, search = '') => {
  mocks.pathname = path;
  window.history.replaceState({}, '', `${path}${search}`);
};

beforeEach(() => {
  mocks.replace.mockReset();
  mocks.startInbox.mockClear();
  mocks.auth = { firebaseUser: null, user: null, isLoading: false, isInitialized: true };
  visit('/home');
});

describe('(main) layout for a signed-out visitor', () => {
  it.each(['/fit/gyms', '/fit/gyms/timetable', '/venue', '/courses', '/courses/detail'])('renders %s without redirecting', (path) => {
    visit(path);
    render(<MainAppLayout><p>page</p></MainAppLayout>);
    expect(screen.getByText('page')).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('gives the shell a sign-in link that returns to the page with its query', async () => {
    visit('/courses/detail', '?id=c1&lesson=s2');
    render(<MainAppLayout><p>page</p></MainAppLayout>);
    const href = await screen.findByTestId('shell').then((el) => el.getAttribute('data-sign-in-href'));
    expect(href).toBe(`/auth/login?next=${encodeURIComponent('/courses/detail?id=c1&lesson=s2')}`);
    // The login page reads it back as the same path (round trip through safeReturnTo).
    expect(safeReturnTo(new URL(href!, 'http://x').searchParams.get('next'))).toBe('/courses/detail?id=c1&lesson=s2');
    expect(screen.getByTestId('shell')).toHaveAttribute('data-user-name', '');
    expect(screen.queryByTestId('verify-banner')).toBeNull();
  });

  it.each(['/home', '/bookings', '/profile', '/booking'])('sends %s to sign-in, carrying the page as ?next=', (path) => {
    visit(path, '?tab=x');
    render(<MainAppLayout><p>page</p></MainAppLayout>);
    expect(mocks.replace).toHaveBeenCalledWith(`/auth/login?next=${encodeURIComponent(`${path}?tab=x`)}`);
    expect(screen.queryByText('page')).toBeNull();
    expect(screen.getByText('common.redirecting')).toBeInTheDocument();
  });

  it('does not start the notification inbox', () => {
    visit('/fit/gyms');
    render(<MainAppLayout><p>page</p></MainAppLayout>);
    expect(mocks.startInbox).not.toHaveBeenCalled();
  });
});

describe('(main) layout for signed-in users', () => {
  it('waits for auth to initialise before deciding', () => {
    mocks.auth = { firebaseUser: null, user: null, isLoading: true, isInitialized: false };
    visit('/home');
    render(<MainAppLayout><p>page</p></MainAppLayout>);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });

  it('sends a Firebase user without a profile to register, even on a public page', () => {
    mocks.auth = { ...mocks.auth, firebaseUser: { uid: 'u1', photoURL: null, displayName: null, email: null } };
    visit('/fit/gyms');
    render(<MainAppLayout><p>page</p></MainAppLayout>);
    expect(mocks.replace).toHaveBeenCalledWith('/auth/register');
    expect(screen.queryByText('page')).toBeNull();
  });

  it('renders the signed-in shell with the profile and no sign-in link', () => {
    mocks.auth = {
      ...mocks.auth,
      firebaseUser: { uid: 'u1', photoURL: null, displayName: null, email: 'a@b.c' },
      user: { id: 'u1', fullName: 'Anna', email: 'a@b.c' },
    };
    visit('/fit/gyms');
    render(<MainAppLayout><p>page</p></MainAppLayout>);
    expect(screen.getByText('page')).toBeInTheDocument();
    expect(screen.getByTestId('shell')).toHaveAttribute('data-user-name', 'Anna');
    expect(screen.getByTestId('shell')).toHaveAttribute('data-sign-in-href', '');
    expect(screen.getByTestId('verify-banner')).toBeInTheDocument();
    expect(mocks.startInbox).toHaveBeenCalledWith('u1');
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
