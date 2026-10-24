import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pathname: '/home',
  user: { role: 'provider', providerStatus: 'verified' } as { role: string; providerStatus?: string } | null,
  push: vi.fn(),
  logout: vi.fn(),
  openAssistant: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('next/link', () => ({
  default: ({ href, onClick, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} onClick={onClick} {...props}>{children}</a>
  ),
}));
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, locale: 'it' }) }));
vi.mock('@/hooks/useManagedVenues', () => ({ useManagedVenues: () => ({ venues: [], isLoading: false }) }));
vi.mock('@/hooks/useVisibleSections', () => ({ useVisibleSections: () => ['fit', 'fun', 'life'] }));
vi.mock('@/hooks/usePilotFlags', () => ({ useVisibleSections: () => ['fit', 'fun', 'life'] }));
vi.mock('@/hooks/usePaymentSettings', () => ({ usePaymentSettings: () => ({ stripePaymentsEnabled: false }) }));
vi.mock('@/contexts/SectionContext', () => ({ useSection: () => ({ section: 'fit', setSection: vi.fn() }) }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (state: { user: typeof mocks.user; isLoading: boolean; logout: typeof mocks.logout }) => unknown) =>
    select({ user: mocks.user, isLoading: false, logout: mocks.logout }),
}));
vi.mock('@/stores/assistantStore', () => ({ useAssistantStore: (select: (state: { open: typeof mocks.openAssistant }) => unknown) => select({ open: mocks.openAssistant }) }));
vi.mock('@/components/ui/Avatar', () => ({ Avatar: () => <div /> }));
vi.mock('@/components/ui/ThemeToggle', () => ({ ThemeToggle: () => <div /> }));
vi.mock('@/components/i18n/LanguageSwitcher', () => ({ LanguageSwitcher: () => <div /> }));

import { SideDrawer } from './SideDrawer';

beforeEach(() => {
  mocks.pathname = '/home';
  mocks.user = { role: 'provider', providerStatus: 'verified' };
  vi.clearAllMocks();
});

describe('SideDrawer dashboard mode switch', () => {
  it('lets a provider on home switch to Private and closes the hamburger drawer', () => {
    const onClose = vi.fn();
    render(<SideDrawer isOpen onClose={onClose} />);

    const privateLink = screen.getByRole('link', { name: 'profile.mode.private' });
    expect(privateLink).toHaveAttribute('href', '/home');
    fireEvent.click(privateLink);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('returns staff users from the drawer to customer home', () => {
    mocks.user = { role: 'admin' };
    mocks.pathname = '/admin';
    render(<SideDrawer isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('link', { name: 'profile.mode.private' })).toHaveAttribute('href', '/home');
    expect(screen.getByRole('link', { name: 'dashboard.mode.management' })).toHaveAttribute('href', '/admin');
  });

  it('shows regular customers the Private destination in the homepage hamburger', () => {
    mocks.user = { role: 'customer', providerStatus: 'none' };
    render(<SideDrawer isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('link', { name: 'profile.mode.private' })).toHaveAttribute('href', '/home');
    expect(screen.queryByRole('link', { name: 'profile.mode.professional' })).not.toBeInTheDocument();
  });
});

describe('SideDrawer for a signed-out visitor', () => {
  it('shows a guest header with a sign-in button that returns to the page, and no logout or mode switch', () => {
    mocks.user = null;
    const onClose = vi.fn();
    render(<SideDrawer isOpen onClose={onClose} signInHref="/auth/login?next=%2Ffit%2Fgyms" />);

    expect(screen.getByText('drawer.visitor.name')).toBeInTheDocument();
    expect(screen.getByText('drawer.visitor.hint')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('drawer-sign-in'));
    expect(mocks.push).toHaveBeenCalledWith('/auth/login?next=%2Ffit%2Fgyms');
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByText('profile.logout.action')).toBeNull();
    expect(screen.queryByRole('link', { name: 'profile.mode.private' })).toBeNull();
    expect(screen.queryByTestId('drawer-assistant')).toBeNull();
  });

  it('lists only the public links and no account items', () => {
    mocks.user = null;
    render(<SideDrawer isOpen onClose={vi.fn()} />);

    expect(screen.getByText('courses.title')).toBeInTheDocument();
    expect(screen.queryByText('common.bookings')).toBeNull();
    expect(screen.queryByText('common.profile')).toBeNull();
    expect(screen.queryByText('profile.stats.points')).toBeNull();
    // Categories (gyms, …) stay: they lead to public pages.
    expect(screen.getByText('drawer.category.gyms')).toBeInTheDocument();
  });
});
