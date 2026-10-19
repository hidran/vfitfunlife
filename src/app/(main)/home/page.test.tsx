import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ section: 'fit' as 'fit' | 'fun' | 'life' }));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock('@/contexts/SectionContext', () => ({ useSection: () => ({ section: state.section }) }));
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, locale: 'en' }) }));
vi.mock('@/hooks/useVenues', () => ({
  useVenues: () => ({ data: [], isLoading: false }),
  useNearbyVenues: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useProviders', () => ({ useProviders: () => ({ data: [], isLoading: false }) }));
vi.mock('@/hooks/useCustomerSearchLocation', () => ({ useCustomerSearchLocation: () => ({ data: { coords: null } }) }));
vi.mock('@/hooks/useNearMe', () => ({ useNearMe: () => ({ userLocation: null }) }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [], isLoading: false }) }));
vi.mock('@/hooks', () => ({
  useTodayClasses: () => ({ data: [], isLoading: false }),
  useTestimonials: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/useFunActivities', () => ({ useFunActivities: () => ({ data: [], isLoading: false }) }));

import HomePage from './page';

beforeEach(() => {
  state.section = 'fit';
});

describe('HomePage catalog data', () => {
  it('shows real-catalog empty states instead of invented gyms, trainers, or classes', () => {
    render(<HomePage />);

    expect(screen.getByText('home.fit.gyms.empty')).toBeInTheDocument();
    expect(screen.getByText('home.fit.trainers.empty')).toBeInTheDocument();
    expect(screen.getByText('home.fit.classes.emptyToday')).toBeInTheDocument();
    expect(screen.queryByText(/demo|sample|placeholder/i)).not.toBeInTheDocument();
  });

  it('does not invent customer reviews when the review catalog is empty', () => {
    state.section = 'life';
    render(<HomePage />);

    expect(screen.getByText('home.life.recentReviews.title')).toBeInTheDocument();
    expect(screen.queryByText(/".+"/)).not.toBeInTheDocument();
    expect(screen.queryByText(/demo|sample|placeholder/i)).not.toBeInTheDocument();
  });
});
