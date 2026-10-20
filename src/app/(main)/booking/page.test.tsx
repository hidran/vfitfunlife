import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchProviders: vi.fn(async () => undefined),
  setSearchFilters: vi.fn(),
  selectProvider: vi.fn(),
  filters: {} as Record<string, unknown>,
  courses: [] as unknown[],
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...props}>{children}</a> }));
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, locale: 'en' }) }));
vi.mock('@/hooks/useServiceCategories', () => ({
  useServiceCategoryGroups: () => [{
    group: { id: 'home_services', name: 'Home Services', icon: '🏠' },
    leaves: [],
  }],
}));
vi.mock('@/hooks/useCustomerSearchLocation', () => ({ useCustomerSearchLocation: () => ({ data: { coords: null }, isLoading: false }) }));
vi.mock('@/hooks/useNearMe', () => ({
  useNearMe: () => ({ userLocation: null, radiusKm: null, isLocating: false, error: null, requestLocation: vi.fn(), clearLocation: vi.fn(), setRadiusKm: vi.fn() }),
}));
vi.mock('@/components/booking/CustomerLocationPrompt', () => ({
  CustomerLocationPrompt: () => null,
  CUSTOMER_LOCATION_PROMPT_DISMISSED_KEY: 'dismissed',
}));
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, locale: 'en' }) }));
vi.mock('@/stores/bookingStore', () => ({
  useBookingStore: () => ({
    searchResults: [],
    isSearching: false,
    searchFilters: mocks.filters,
    searchProviders: mocks.searchProviders,
    setSearchFilters: mocks.setSearchFilters,
    selectProvider: mocks.selectProvider,
  }),
}));
vi.mock('@/hooks/useCourses', () => ({ useCourses: () => ({ data: { pages: [{ courses: mocks.courses }] }, isLoading: false }) }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [], isLoading: false }) }));
vi.mock('@/lib/firebookings', () => ({
  searchProviders: mocks.searchProviders,
  searchProvidersNear: vi.fn(async () => []),
  applyProviderSearchFilters: (items: unknown[]) => items,
}));
vi.mock('@/lib/geo', () => ({ annotateAndSortByDistance: (items: unknown[]) => items, roundLocation: (value: unknown) => value }));
vi.mock('@/components/map/GoogleMap', () => ({ GoogleMap: () => null }));
vi.mock('@/components/map/MapPlaceholder', () => ({ MapPlaceholder: () => null }));
vi.mock('@/components/map/RadiusFilter', () => ({ RadiusFilter: () => null }));
vi.mock('@/components/ui/Avatar', () => ({ Avatar: () => null }));
vi.mock('@/components/ui/input', () => ({ Input: ({ leftIcon: _leftIcon, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { leftIcon?: React.ReactNode }) => <input type="search" {...props} /> }));
vi.mock('@/components/ui/Spinner', () => ({ Spinner: () => null }));
vi.mock('@/components/ui/button', () => ({ Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button> }));

import BookingPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.filters = {};
  window.history.replaceState({}, '', '/booking?query=plumber&category=home_services');
});

describe('booking page URL search', () => {
  it('seeds the search action from query and category parameters', async () => {
    render(<BookingPage />);

    await waitFor(() => expect(mocks.searchProviders).toHaveBeenCalledWith({ query: 'plumber', category: 'home_services' }));
    expect(screen.getByRole('searchbox')).toHaveValue('plumber');
  });

  it('keeps URL queries and categories when the user changes a category', async () => {
    render(<BookingPage />);

    fireEvent.click(screen.getByRole('button', { name: /booking\.category\.all/i }));
    expect(mocks.setSearchFilters).toHaveBeenCalledWith({ category: undefined });
    expect(mocks.replace).toHaveBeenCalledWith('/booking?query=plumber');
  });
});

it('shows matching group courses in general search even without provider results', () => {
  window.history.replaceState({}, '', '/booking?query=Demo%20Karate');
  mocks.courses = [{ id: 'karate', name: 'Demo Karate', providerName: 'Anna', categoryId: 'combat', categoryIds: ['combat'],
    state: 'published', providerEligible: true, enrollmentClosed: false, nextAvailableSeats: 3, capacity: 5,
    lessonPriceCents: 2500, seriesPriceCents: null }];
  render(<BookingPage />);
  expect(screen.getByRole('heading', { name: 'Demo Karate' })).toBeVisible();
  expect(screen.queryByText('booking.noResults.title')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'courses.sessions' })).toHaveAttribute('href', '/courses/detail?id=karate');
  mocks.courses = [];
});
