import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ search: 'id=c1&lesson=s1' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mocks.search) }));
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, locale: 'en' }) }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: (select: (s: unknown) => unknown) => select({ firebaseUser: { uid: 'u1' } }) }));
vi.mock('@/hooks/usePaymentSettings', () => ({ usePaymentSettings: () => ({ courseCheckoutEnabled: false, isLoading: false }) }));
vi.mock('@/hooks/useServiceCategories', () => ({ useServiceCategoryLeaves: () => [] }));
vi.mock('@/hooks/useCourses', () => ({
  useCourses: () => ({ data: { pages: [{ courses: [] }] }, isLoading: false, isError: false, hasNextPage: false }),
  useCourseSessions: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock('@/lib/firebase/courses', () => ({ fetchCourse: async () => ({ id: 'c1', name: 'Karate', description: '', equipment: '' }) }));
vi.mock('@/components/courses/CourseEnrollments', () => ({ CourseEnrollments: () => null }));
vi.mock('@/components/courses/CourseBooking', () => ({
  CourseBooking: ({ initialSessionId, onBusyChange }: { initialSessionId?: string; onBusyChange?: (busy: boolean) => void }) => <div>
    <p data-testid="lesson">{initialSessionId}</p>
    <button onClick={() => onBusyChange?.(true)}>start</button><button onClick={() => onBusyChange?.(false)}>stop</button></div>,
}));

import CoursesPage from './page';

const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CoursesPage /></QueryClientProvider>);

describe('course sheet', () => {
  beforeEach(() => { mocks.search = 'id=c1&lesson=s1'; });

  it('opens the linked course and hands the linked lesson to the booking', async () => {
    renderPage();
    expect(await screen.findByRole('dialog', { name: 'Karate' })).toBeInTheDocument();
    expect(screen.getByTestId('lesson')).toHaveTextContent('s1');
  });

  it('cannot be closed while a booking request is in flight, and can afterwards', async () => {
    renderPage();
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByText('start'));
    expect(screen.getByRole('button', { name: 'common.close' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByText('stop'));
    expect(screen.getByRole('button', { name: 'common.close' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
