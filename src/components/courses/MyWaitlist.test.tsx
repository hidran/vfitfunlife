import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const stamp = (iso: string) => ({ toDate: () => new Date(iso), toMillis: () => new Date(iso).getTime() });
const mocks = vi.hoisted(() => ({
  entries: [] as unknown[], sessions: {} as Record<string, unknown[] | Error>, refresh: vi.fn(), leave: vi.fn(), missingCourse: false,
}));
vi.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (k: string, values?: Record<string, unknown>) => values ? `${k}:${JSON.stringify(values)}` : k, locale: 'en' }),
}));
vi.mock('@/hooks/useCourses', () => ({
  useMyWaitlist: (uid?: string) => ({ data: uid ? mocks.entries : undefined }),
  useRefreshCourses: () => mocks.refresh,
}));
vi.mock('@/lib/firebase/courses', () => ({
  fetchCourse: async (id: string) => mocks.missingCourse ? null : ({ id, name: `Course ${id}`, timezone: 'Europe/Rome' }),
  fetchCourseSessions: async (id: string) => { const s = mocks.sessions[id]; if (s instanceof Error) throw s; return s ?? []; },
  leaveCourseWaitlist: (...args: unknown[]) => mocks.leave(...args),
}));

import { MyWaitlist } from './MyWaitlist';

const entry = (courseId: string, sessionId: string, position: number) => ({ id: 'me', userId: 'me', courseId, sessionId, position,
  courseName: `Course ${courseId}`, createdAt: stamp('2026-10-01T00:00:00Z') });
const renderIt = (props: { showEmpty?: boolean } = {}) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MyWaitlist uid="me" {...props} /></QueryClientProvider>);
const FUTURE = '2099-10-12T17:00:00Z';

beforeEach(() => {
  mocks.entries = []; mocks.sessions = {}; mocks.refresh.mockReset().mockResolvedValue(undefined); mocks.leave.mockReset().mockResolvedValue({ success: true });
});

describe('MyWaitlist', () => {
  it('shows the course link, the lesson date in the course zone and the position', async () => {
    mocks.entries = [entry('c1', 's1', 2)];
    mocks.sessions = { c1: [{ id: 's1', startsAt: stamp(FUTURE) }] };
    renderIt();
    const row = await screen.findByRole('listitem');
    expect(within(row).getByRole('link', { name: 'Course c1' })).toHaveAttribute('href', '/courses?id=c1');
    await waitFor(() => expect(within(row).getByText(/Oct 12, 2099/)).toBeInTheDocument());
    expect(within(row).getByText(/7:00 PM/)).toBeInTheDocument();
    expect(within(row).getByText('courses.position:{"position":2}')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'courses.waitlistSection' })).toBeInTheDocument();
  });

  it('hides entries whose lesson already started, and the whole section when none is left', async () => {
    mocks.entries = [entry('c1', 's1', 1)];
    mocks.sessions = { c1: [{ id: 's1', startsAt: stamp('2020-01-01T10:00:00Z') }] };
    renderIt();
    await waitFor(() => expect(mocks.sessions.c1).toBeDefined());
    await new Promise(r => setTimeout(r, 50));
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'courses.waitlistSection' })).not.toBeInTheDocument();
  });

  it('leaves after a confirmation and refreshes', async () => {
    mocks.entries = [entry('c1', 's1', 1)];
    mocks.sessions = { c1: [{ id: 's1', startsAt: stamp(FUTURE) }] };
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'courses.leaveWaitlist' }));
    expect(mocks.leave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'courses.confirmLeaveWaitlist' }));
    await waitFor(() => expect(mocks.leave).toHaveBeenCalledWith('c1', 's1'));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it('shows a translated error when leaving fails', async () => {
    mocks.entries = [entry('c1', 's1', 1)];
    mocks.sessions = { c1: [{ id: 's1', startsAt: stamp(FUTURE) }] };
    mocks.leave.mockRejectedValue(Object.assign(new Error('session_not_found'), {}));
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'courses.leaveWaitlist' }));
    fireEvent.click(screen.getByRole('button', { name: 'courses.confirmLeaveWaitlist' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('courses.err.session_not_found');
  });

  it('still lets the user leave when the lesson cannot be loaded', async () => {
    mocks.entries = [entry('c1', 's1', 3)];
    mocks.sessions = { c1: new Error('permission-denied') };
    renderIt();
    expect(await screen.findByRole('button', { name: 'courses.leaveWaitlist' })).toBeInTheDocument();
  });

  it('says "no bookings" when asked to and every entry is for a lesson that already started', async () => {
    mocks.entries = [entry('c1', 's1', 1)];
    mocks.sessions = { c1: [{ id: 's1', startsAt: stamp('2020-01-01T10:00:00Z') }] };
    renderIt({ showEmpty: true });
    expect(await screen.findByText('courses.emptyBookings')).toBeInTheDocument();
  });

  it('does not say it before the lessons are known, nor when the caller has bookings to show', async () => {
    mocks.entries = [entry('c1', 's1', 1)];
    mocks.sessions = { c1: [{ id: 's1', startsAt: stamp(FUTURE) }] };
    const first = renderIt({ showEmpty: true });
    expect(screen.queryByText('courses.emptyBookings')).not.toBeInTheDocument();
    await screen.findByRole('listitem');
    expect(screen.queryByText('courses.emptyBookings')).not.toBeInTheDocument();
    first.unmount();
    mocks.entries = [entry('c1', 's1', 1)];
    mocks.sessions = { c1: [{ id: 's1', startsAt: stamp('2020-01-01T10:00:00Z') }] };
    renderIt();
    await new Promise(r => setTimeout(r, 50));
    expect(screen.queryByText('courses.emptyBookings')).not.toBeInTheDocument();
  });

  it('asks its own question before leaving and cancels with a Cancel button', async () => {
    mocks.entries = [entry('c1', 's1', 1)];
    mocks.sessions = { c1: [{ id: 's1', startsAt: stamp(FUTURE) }] };
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'courses.leaveWaitlist' }));
    expect(screen.getByText('courses.leaveWaitlistConfirm')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    expect(screen.queryByText('courses.leaveWaitlistConfirm')).not.toBeInTheDocument();
  });

  it('shows no lesson time when the course (and so its time zone) cannot be read', async () => {
    mocks.entries = [entry('c9', 's1', 1)];
    mocks.sessions = { c9: [{ id: 's1', startsAt: stamp(FUTURE) }] };
    mocks.missingCourse = true;
    renderIt();
    await screen.findByRole('listitem');
    await new Promise(r => setTimeout(r, 50));
    expect(screen.queryByText(/2099/)).not.toBeInTheDocument();
    mocks.missingCourse = false;
  });

  it('renders nothing without entries', () => {
    const { container } = renderIt();
    expect(container).toBeEmptyDOMElement();
  });
});
