import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ call: vi.fn(), refresh: vi.fn(), entries: [] as unknown[], loading: false }));
vi.mock('@/lib/firebase/courses', () => ({ courseCall: mocks.call }));
vi.mock('@/hooks/useCourses', () => ({
  useWaitlist: () => ({ data: mocks.entries, isLoading: mocks.loading, isError: false }),
  useRefreshCourses: () => mocks.refresh,
}));
vi.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key, locale: 'en' }),
}));

import { LessonWaitlist } from './LessonWaitlist';

const entry = (userId: string, name: string, position: number) => ({ id: userId, userId, customerName: name, position });

beforeEach(() => {
  mocks.call.mockReset(); mocks.call.mockResolvedValue({ success: true });
  mocks.refresh.mockReset(); mocks.refresh.mockResolvedValue(undefined);
  mocks.entries = [entry('u1', 'Ada', 1), entry('u2', 'Bob', 2)]; mocks.loading = false;
});

describe('LessonWaitlist', () => {
  it('lists the entries in position order', () => {
    render(<LessonWaitlist courseId="c1" sessionId="s1" />);
    expect(screen.getByText('courses.waitlistTitle')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Ada');
    expect(items[0]).toHaveTextContent('courses.position:{"position":1}');
    expect(items[1]).toHaveTextContent('Bob');
  });

  it('renders nothing when nobody waits', () => {
    mocks.entries = [];
    const { container } = render(<LessonWaitlist courseId="c1" sessionId="s1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('asks for confirmation, then posts removeWaitlistEntry and refreshes', async () => {
    render(<LessonWaitlist courseId="c1" sessionId="s1" />);
    fireEvent.click(screen.getByRole('button', { name: 'courses.removeEntry Bob' }));
    expect(mocks.call).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'courses.confirmRemove' }));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('manageCourseSession',
      { courseId: 'c1', sessionId: 's1', action: 'removeWaitlistEntry', userId: 'u2' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it('can back out of the confirmation', () => {
    render(<LessonWaitlist courseId="c1" sessionId="s1" />);
    fireEvent.click(screen.getByRole('button', { name: 'courses.removeEntry Ada' }));
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    expect(screen.queryByRole('button', { name: 'courses.confirmRemove' })).toBeNull();
    expect(mocks.call).not.toHaveBeenCalled();
  });

  it('shows the renumbered positions after a refetch', () => {
    const view = render(<LessonWaitlist courseId="c1" sessionId="s1" />);
    mocks.entries = [entry('u2', 'Bob', 1)];
    view.rerender(<LessonWaitlist courseId="c1" sessionId="s1" />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('listitem')).toHaveTextContent('courses.position:{"position":1}');
  });

  it('surfaces a server error through the catalog', async () => {
    mocks.call.mockRejectedValue(Object.assign(new Error('course_owner_required'), {}));
    render(<LessonWaitlist courseId="c1" sessionId="s1" />);
    fireEvent.click(screen.getByRole('button', { name: 'courses.removeEntry Ada' }));
    fireEvent.click(screen.getByRole('button', { name: 'courses.confirmRemove' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('courses.err.course_owner_required');
  });
});
