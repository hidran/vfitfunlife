import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { role: 'customer', providerStatus: 'none' } as { role: string; providerStatus?: string } | null,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
// eslint-disable-next-line @next/next/no-img-element -- plain element standing in for next/image in jsdom
vi.mock('next/image', () => ({ default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img alt="" {...props} /> }));
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/contexts/SectionContext', () => ({ useSection: () => ({ section: 'fit' }) }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (state: { user: typeof mocks.user }) => unknown) => select({ user: mocks.user }),
}));
vi.mock('@/stores/assistantStore', () => ({ useAssistantStore: (select: (state: { open: () => void }) => unknown) => select({ open: vi.fn() }) }));

import { Header } from './Header';

beforeEach(() => {
  mocks.user = { role: 'customer', providerStatus: 'none' };
});

describe('Header', () => {
  it('shows a signed-in user the bell and the profile link, no sign-in CTA', () => {
    render(<Header onMenuClick={vi.fn()} notificationCount={2} />);
    expect(screen.getByRole('link', { name: 'header.goToProfile' })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('link', { name: 'header.notificationsUnread' })).toHaveAttribute('href', '/notifications');
    expect(screen.queryByTestId('header-sign-in')).toBeNull();
  });

  it('shows a visitor a sign-in CTA that returns to the page, and neither the bell nor the profile', () => {
    mocks.user = null;
    render(<Header onMenuClick={vi.fn()} signInHref="/auth/login?next=%2Fvenue%3Fid%3Dv1" />);
    const cta = screen.getByTestId('header-sign-in');
    expect(cta).toHaveTextContent('auth.common.login');
    expect(cta).toHaveAttribute('href', '/auth/login?next=%2Fvenue%3Fid%3Dv1');
    expect(cta).toHaveClass('touch-target', 'text-section-on-gradient');
    expect(screen.queryByRole('link', { name: 'header.goToProfile' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'header.notifications' })).toBeNull();
    expect(screen.queryByTestId('header-assistant')).toBeNull();
  });

  it('falls back to the plain login page when no return address is given', () => {
    mocks.user = null;
    render(<Header onMenuClick={vi.fn()} />);
    expect(screen.getByTestId('header-sign-in')).toHaveAttribute('href', '/auth/login');
  });
});
