import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ts = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) });
const mocks = vi.hoisted(() => ({ search: '' as string, replace: vi.fn(), push: vi.fn(), courses: [] as unknown[] }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mocks.search),
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}));
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, locale: 'en' }) }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: (select: (s: unknown) => unknown) => select({ firebaseUser: { uid: 'u1' } }) }));
vi.mock('@/hooks/useServiceCategories', () => ({ useServiceCategoryLeaves: () => [] }));
vi.mock('@/hooks/useCourses', () => ({
  useCourses: () => ({ data: { pages: [{ courses: mocks.courses }] }, isLoading: false, isError: false, hasNextPage: false }),
}));
vi.mock('@/components/courses/CourseEnrollments', () => ({ CourseEnrollments: () => <div data-testid="enrollments" /> }));

import CoursesPage from './page';

const course = (over: Record<string, unknown> = {}) => ({ id: 'c1', name: 'Karate', providerName: 'Anna', level: 'beginner',
  location: 'Dojo', city: 'Torino', categoryIds: ['martial-arts'], lessonPriceCents: 2500, seriesPriceCents: null,
  capacity: 8, nextAvailableSeats: 3, state: 'published', providerEligible: true, nextStartsAt: ts(Date.now() + 86400000),
  timezone: 'Europe/Rome', ...over });

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CoursesPage /></QueryClientProvider>);

beforeEach(() => {
  mocks.replace.mockReset(); mocks.push.mockReset();
  mocks.search = ''; mocks.courses = [course()];
});

describe('course list', () => {
  it('links each course to its routed detail page instead of opening a sheet', async () => {
    renderPage();
    expect(await screen.findByRole('link', { name: 'courses.sessions' })).toHaveAttribute('href', '/courses/detail?id=c1');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sends an older /courses?id= link to the detail page, keeping the lesson', () => {
    mocks.search = 'id=c1&lesson=s1';
    renderPage();
    expect(mocks.replace).toHaveBeenCalledWith('/courses/detail?id=c1&lesson=s1');
  });

  it('does not redirect without a linked course', () => {
    renderPage();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('names a completed booking on the bookings tab', async () => {
    mocks.search = 'tab=bookings&booked=1';
    renderPage();
    expect(await screen.findByRole('status')).toHaveTextContent('courses.booked');
    expect(screen.getByTestId('enrollments')).toBeInTheDocument();
  });
});
