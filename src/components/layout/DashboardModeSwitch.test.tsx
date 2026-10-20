import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  user: null as { role: string; providerStatus?: string } | null,
  venues: [] as { id: string }[],
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (state: { user: typeof auth.user }) => unknown) =>
    select({ user: auth.user }),
}));
vi.mock('@/hooks/useManagedVenues', () => ({
  useManagedVenues: () => ({ venues: auth.venues, isLoading: false }),
}));
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

import { DashboardModeSwitch } from './DashboardModeSwitch';

describe('DashboardModeSwitch', () => {
  beforeEach(() => {
    auth.user = null;
    auth.venues = [];
  });

  it('lets a provider move between customer browsing and the provider dashboard', () => {
    auth.user = { role: 'provider', providerStatus: 'verified' };
    render(<DashboardModeSwitch mode="professional" />);

    expect(screen.getByRole('link', { name: 'dashboard.mode.customer' })).toHaveAttribute('href', '/home');
    expect(screen.getByRole('link', { name: 'dashboard.mode.professional' })).toHaveAttribute(
      'href',
      '/provider/dashboard',
    );
    expect(screen.getByRole('link', { name: 'dashboard.mode.professional' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it.each([undefined, 'none'])(
    'lets a legacy provider with status %s open the provider dashboard',
    (providerStatus) => {
      auth.user = { role: 'provider', providerStatus };
      render(<DashboardModeSwitch mode="customer" />);

      expect(screen.getByRole('link', { name: 'dashboard.mode.professional' })).toHaveAttribute(
        'href',
        '/provider/dashboard',
      );
    },
  );

  it('keeps the private destination visible without granting a rejected provider dashboard access', () => {
    auth.user = { role: 'provider', providerStatus: 'rejected' };
    render(<DashboardModeSwitch mode="customer" />);

    expect(screen.getByRole('link', { name: 'dashboard.mode.customer' })).toHaveAttribute('href', '/home');
    expect(screen.queryByRole('link', { name: 'dashboard.mode.professional' })).not.toBeInTheDocument();
  });

  it('closes the hamburger drawer when switching to private mode', () => {
    auth.user = { role: 'provider', providerStatus: 'verified' };
    const onNavigate = vi.fn();
    render(<DashboardModeSwitch mode="professional" onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('link', { name: 'dashboard.mode.customer' }));
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it('uses the profile private/pro labels when requested', () => {
    auth.user = { role: 'provider', providerStatus: 'verified' };
    render(
      <DashboardModeSwitch
        mode="customer"
        customerLabelKey="profile.mode.private"
        professionalLabelKey="profile.mode.professional"
      />,
    );

    expect(screen.getByRole('link', { name: 'profile.mode.private' })).toHaveAttribute('href', '/home');
    expect(screen.getByRole('link', { name: 'profile.mode.professional' })).toHaveAttribute(
      'href',
      '/provider/dashboard',
    );
  });

  it.each(['admin', 'superadmin'])('returns a %s to the admin dashboard from customer mode', (role) => {
    auth.user = { role };
    render(<DashboardModeSwitch mode="customer" />);

    expect(screen.getByRole('link', { name: 'dashboard.mode.customer' })).toHaveAttribute('href', '/home');
    expect(screen.getByRole('link', { name: 'dashboard.mode.management' })).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('link', { name: 'dashboard.mode.customer' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows regular customers the private destination without a privileged dashboard link', () => {
    auth.user = { role: 'customer', providerStatus: 'none' };
    render(<DashboardModeSwitch mode="customer" />);

    expect(screen.getByRole('link', { name: 'dashboard.mode.customer' })).toHaveAttribute('href', '/home');
    expect(screen.queryByRole('link', { name: 'dashboard.mode.professional' })).not.toBeInTheDocument();
  });

  it('opens venue courses for a customer who owns a venue', () => {
    auth.user = { role: 'customer', providerStatus: 'none' };
    auth.venues = [{ id: 'biz_x' }, { id: 'v2' }];
    render(<DashboardModeSwitch mode="customer" />);

    const link = screen.getByRole('link', { name: 'courses.venueCourses' });
    expect(link).toHaveAttribute('href', '/provider/courses?venue=biz_x');
    expect(screen.queryByRole('link', { name: 'dashboard.mode.professional' })).not.toBeInTheDocument();
  });

  it('marks the venue courses tab current in professional mode', () => {
    auth.user = { role: 'customer' };
    auth.venues = [{ id: 'v1' }];
    render(<DashboardModeSwitch mode="professional" />);

    expect(screen.getByRole('link', { name: 'courses.venueCourses' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the provider dashboard for a provider who also manages a venue', () => {
    auth.user = { role: 'provider', providerStatus: 'verified' };
    auth.venues = [{ id: 'v1' }];
    render(<DashboardModeSwitch mode="customer" />);

    expect(screen.getByRole('link', { name: 'dashboard.mode.professional' })).toHaveAttribute('href', '/provider/dashboard');
    expect(screen.queryByRole('link', { name: 'courses.venueCourses' })).not.toBeInTheDocument();
  });

  it('keeps the admin dashboard for an admin who also manages a venue', () => {
    auth.user = { role: 'admin' };
    auth.venues = [{ id: 'v1' }];
    render(<DashboardModeSwitch mode="customer" />);

    expect(screen.getByRole('link', { name: 'dashboard.mode.management' })).toHaveAttribute('href', '/admin');
  });
});
