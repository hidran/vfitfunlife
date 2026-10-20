import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  user: null as { role: string; providerStatus?: string } | null,
  venues: [] as { id: string }[],
  loading: false,
  failed: false,
  pathname: '/provider/courses',
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ replace: state.replace }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (s: { user: typeof state.user; isInitialized: boolean }) => unknown) =>
    select({ user: state.user, isInitialized: true }),
}));
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/hooks/useManagedVenues', () => ({
  useManagedVenues: () => ({ venues: state.venues, isLoading: state.loading, isError: state.failed }),
}));
vi.mock('@/components/ui/ThemeToggle', () => ({ ThemeToggle: () => null }));
vi.mock('@/components/i18n/LanguageSwitcher', () => ({ LanguageSwitcher: () => null }));
vi.mock('@/components/assistant/AssistantMenuButton', () => ({ AssistantMenuButton: () => null }));
vi.mock('@/components/layout/DashboardModeSwitch', () => ({ DashboardModeSwitch: () => null }));

import ProviderLayout from './layout';

describe('ProviderLayout', () => {
  beforeEach(() => {
    state.user = null;
    state.venues = [];
    state.loading = false;
    state.failed = false;
    state.pathname = '/provider/courses';
    state.replace.mockReset();
  });

  it('shows the full provider navigation to a verified provider', () => {
    state.user = { role: 'provider', providerStatus: 'verified' };
    render(<ProviderLayout><p>page</p></ProviderLayout>);

    expect(screen.getAllByRole('link', { name: 'provider.layout.nav.dashboard' }).length).toBeGreaterThan(0);
    expect(screen.getByText('page')).toBeInTheDocument();
    expect(state.replace).not.toHaveBeenCalled();
  });

  it('redirects a plain customer to the profile', () => {
    state.user = { role: 'customer', providerStatus: 'none' };
    const { container } = render(<ProviderLayout><p>page</p></ProviderLayout>);

    expect(state.replace).toHaveBeenCalledWith('/profile');
    expect(container).toBeEmptyDOMElement();
  });

  it('does not redirect a customer while their venues are still loading', () => {
    state.user = { role: 'customer', providerStatus: 'none' };
    state.loading = true;
    render(<ProviderLayout><p>page</p></ProviderLayout>);

    expect(state.replace).not.toHaveBeenCalled();
    // The provider pages are never shown to someone who may turn out not to be allowed in.
    expect(screen.queryByText('page')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('keeps showing a provider their page while venues load', () => {
    state.user = { role: 'provider', providerStatus: 'verified' };
    state.loading = true;
    render(<ProviderLayout><p>page</p></ProviderLayout>);

    expect(screen.getByText('page')).toBeInTheDocument();
  });

  it('treats a failed venue lookup as "not a manager" at once', () => {
    state.user = { role: 'customer', providerStatus: 'none' };
    state.failed = true;
    const { container } = render(<ProviderLayout><p>page</p></ProviderLayout>);

    expect(state.replace).toHaveBeenCalledWith('/profile');
    expect(container).toBeEmptyDOMElement();
  });

  it('lets a venue manager in and reduces the navigation to the venue courses entry', () => {
    state.user = { role: 'customer', providerStatus: 'none' };
    state.venues = [{ id: 'biz_x' }, { id: 'v2' }];
    render(<ProviderLayout><p>page</p></ProviderLayout>);

    expect(state.replace).not.toHaveBeenCalled();
    expect(screen.getByText('page')).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/provider/courses?venue=biz_x']);
    expect(screen.queryByText('provider.layout.nav.dashboard')).not.toBeInTheDocument();
  });

  it('sends a venue manager away from provider pages other than courses', () => {
    state.user = { role: 'customer', providerStatus: 'none' };
    state.venues = [{ id: 'biz_x' }];
    state.pathname = '/provider/dashboard';
    render(<ProviderLayout><p>page</p></ProviderLayout>);

    expect(state.replace).toHaveBeenCalledWith('/provider/courses?venue=biz_x');
  });

  it('does not reduce the navigation of an admin who manages a venue', () => {
    state.user = { role: 'admin' };
    state.venues = [{ id: 'v1' }];
    render(<ProviderLayout><p>page</p></ProviderLayout>);

    expect(screen.getAllByRole('link', { name: 'provider.layout.nav.dashboard' }).length).toBeGreaterThan(0);
  });
});
