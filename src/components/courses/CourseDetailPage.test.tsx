import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ search: '' as string, course: null as unknown, push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mocks.search),
  useRouter: () => ({ push: mocks.push, replace: vi.fn() }),
}));
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, locale: 'en' }) }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: (select: (s: unknown) => unknown) => select({ firebaseUser: { uid: 'u1' } }) }));
vi.mock('@/hooks/usePaymentSettings', () => ({ usePaymentSettings: () => ({ courseCheckoutEnabled: false, isLoading: false }) }));
vi.mock('@/hooks/useCourses', () => ({ useCourseSessions: (id?: string) => ({ data: id ? [] : undefined, isLoading: false, isError: false }) }));
vi.mock('@/lib/firebase/courses', () => ({ fetchCourse: async () => mocks.course }));
vi.mock('@/components/courses/CourseBooking', () => ({
  CourseBooking: ({ initialSessionId }: { initialSessionId?: string }) => <div data-testid="booking">{initialSessionId}</div>,
}));

import { CourseDetailPage } from './CourseDetailPage';

const course = { id: 'c1', name: 'Karate', description: 'Beginners', equipment: 'Mat', providerName: 'Anna',
  level: 'beginner', location: 'Dojo', timezone: 'Europe/Rome' };

const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CourseDetailPage /></QueryClientProvider>);

beforeEach(() => { mocks.search = 'id=c1&lesson=s1'; mocks.course = course; mocks.push.mockReset(); });

describe('course detail page', () => {
  it('shows the course on its own page and hands the linked lesson to the booking', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Karate' })).toBeInTheDocument();
    expect(screen.getByText('Beginners')).toBeInTheDocument();
    expect(screen.getByTestId('booking')).toHaveTextContent('s1');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('link', { name: 'courses.back' })).toHaveAttribute('href', '/courses');
  });

  it('shows a readable error when the course cannot be read', async () => {
    mocks.course = null;
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('courses.loadError');
  });
});
