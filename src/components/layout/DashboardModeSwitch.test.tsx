import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  user: null as { role: string; providerStatus?: string } | null,
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (state: { user: typeof auth.user }) => unknown) =>
    select({ user: auth.user }),
}));
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

import { DashboardModeSwitch } from './DashboardModeSwitch';

describe('DashboardModeSwitch', () => {
  beforeEach(() => {
    auth.user = null;
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
});
