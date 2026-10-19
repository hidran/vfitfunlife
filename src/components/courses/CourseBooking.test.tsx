import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CourseBooking } from './CourseBooking';
import type { Course, CourseSession } from '@/types/course';
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (k: string) => k, locale: 'en' }) }));
const stamp = (date: string) => ({ toDate: () => new Date(date), toMillis: () => new Date(date).getTime() });
const course = { id: 'c', name: 'Karate', providerName: 'Anna', providerId: 'p', capacity: 2, state: 'published',
  lessonPriceCents: 1000, seriesPriceCents: 2500, bookingNoticeHours: 2, cancellationHours: 24,
  firstStartsAt: stamp('2099-10-12T18:00Z'), timezone: 'Europe/Rome', location: 'Torino', sessionIds: ['s1','s2'] } as Course;
const sessions = [{ id: 's1', startsAt: stamp('2099-10-12T18:00Z'), state: 'scheduled', capacity: 2, occupied: 1, held: 1 },
  { id: 's2', startsAt: stamp('2099-10-13T18:00Z'), state: 'scheduled', capacity: 2, occupied: 0, held: 0 }] as CourseSession[];
describe('course booking', () => {
  it('hides checkout while off and disables series when any lesson is full', () => {
    render(<CourseBooking course={course} sessions={sessions} checkoutEnabled={false} onBook={vi.fn()} busy={false} />);
    expect(screen.queryByText('courses.online')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /courses.series/ })).toBeDisabled();
  });
  it('submits the chosen lesson and direct payment mode', () => {
    const book = vi.fn();
    render(<CourseBooking course={course} sessions={sessions} checkoutEnabled={false} onBook={book} busy={false} />);
    fireEvent.click(screen.getAllByRole('button', { name: /courses.bookLesson/ })[1]);
    expect(book).toHaveBeenCalledWith('lesson', 's2', 'direct');
  });
  it('offers online payment only when enabled and never offers escrow', () => {
    render(<CourseBooking course={course} sessions={sessions} checkoutEnabled onBook={vi.fn()} busy={false} />);
    expect(screen.getByText('courses.online')).toBeInTheDocument();
    expect(screen.queryByText(/escrow/i)).not.toBeInTheDocument();
  });
});
