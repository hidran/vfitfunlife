import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ call: vi.fn(), refresh: vi.fn() }));
vi.mock('@/lib/firebase/courses', () => ({ courseCall: mocks.call }));
vi.mock('@/hooks/useCourses', () => ({ useRefreshCourses: () => mocks.refresh }));
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, locale: 'en' }) }));

import { LessonCapacity } from './LessonCapacity';

const session = { id: 's1', capacity: 6, occupied: 3, held: 1 };

beforeEach(() => {
  mocks.call.mockReset(); mocks.call.mockResolvedValue({ success: true });
  mocks.refresh.mockReset(); mocks.refresh.mockResolvedValue(undefined);
});

describe('LessonCapacity', () => {
  it('starts at the current capacity with occupied + held as the minimum', () => {
    render(<LessonCapacity courseId="c1" session={session as never} />);
    fireEvent.click(screen.getByRole('button', { name: 'courses.capacityAction' }));
    const input = screen.getByLabelText('courses.capacity');
    expect(input).toHaveValue(6);
    expect(input).toHaveAttribute('min', '4');
    expect(input).toHaveAttribute('max', '500');
  });

  it('posts the capacity action and refreshes', async () => {
    render(<LessonCapacity courseId="c1" session={session as never} />);
    fireEvent.click(screen.getByRole('button', { name: 'courses.capacityAction' }));
    fireEvent.change(screen.getByLabelText('courses.capacity'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('manageCourseSession',
      { courseId: 'c1', sessionId: 's1', action: 'capacity', capacity: 9 }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it('translates capacity_below_bookings', async () => {
    mocks.call.mockRejectedValue(new Error('capacity_below_bookings'));
    render(<LessonCapacity courseId="c1" session={session as never} />);
    fireEvent.click(screen.getByRole('button', { name: 'courses.capacityAction' }));
    fireEvent.change(screen.getByLabelText('courses.capacity'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('courses.err.capacity_below_bookings');
  });

  it('does not post when nothing changed', () => {
    render(<LessonCapacity courseId="c1" session={session as never} />);
    fireEvent.click(screen.getByRole('button', { name: 'courses.capacityAction' }));
    expect(screen.getByRole('button', { name: 'common.save' })).toBeDisabled();
  });
});
