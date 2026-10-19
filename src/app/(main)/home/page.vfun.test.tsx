import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  activities: [] as Array<Record<string, unknown>>,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock('@/contexts/SectionContext', () => ({ useSection: () => ({ section: 'fun' }) }));
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, locale: 'en' }) }));
vi.mock('@/hooks/useFunActivities', () => ({
  useFunActivities: () => ({ data: state.activities, isLoading: false }),
}));

import HomePage from './page';

beforeEach(() => {
  state.activities = [];
});

describe('VFun home catalog data', () => {
  it('shows an honest empty state when no published events exist', () => {
    render(<HomePage />);

    expect(screen.getByText('funRoute.events.empty')).toBeInTheDocument();
    expect(screen.queryByText(/live event|streaming|exclusive/i)).not.toBeInTheDocument();
  });

  it('renders published activities and only their actual optional details', () => {
    state.activities = [{ id: 'activity-1', fullName: 'Community event' }];
    render(<HomePage />);

    expect(screen.getByText('Community event')).toBeInTheDocument();
    expect(screen.queryByText(/\d{1,2}:\d{2}|€|attendees/i)).not.toBeInTheDocument();
  });
});
