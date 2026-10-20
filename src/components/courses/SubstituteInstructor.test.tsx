import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ call: vi.fn(), refresh: vi.fn(), links: [] as unknown[], role: 'provider' }));
vi.mock('@/lib/firebase/courses', () => ({ courseCall: mocks.call }));
vi.mock('@/hooks/useCourses', () => ({ useRefreshCourses: () => mocks.refresh }));
vi.mock('@/lib/firebase/venueSpaces', () => ({ fetchVenueInstructorLinks: async () => mocks.links }));
vi.mock('@/lib/firebookings', () => ({ searchProviders: vi.fn(async () => []) }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (s: unknown) => unknown) => select({ user: { uid: 'me', fullName: 'Me', role: mocks.role } }),
}));
vi.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key, locale: 'en' }),
}));

import { SubstituteInstructor } from './SubstituteInstructor';

const course = { id: 'c1', venueId: 'v1', instructorId: 'a' };
const session = { id: 's1', instructorId: 'a' };
const renderIt = (over: { course?: object; session?: object } = {}) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <SubstituteInstructor course={{ ...course, ...over.course } as never} session={{ ...session, ...over.session } as never} />
  </QueryClientProvider>);

beforeEach(() => {
  mocks.call.mockReset(); mocks.call.mockResolvedValue({ success: true });
  mocks.refresh.mockReset(); mocks.refresh.mockResolvedValue(undefined);
  mocks.role = 'provider';
  mocks.links = [{ id: 'a', name: 'Anna', isActive: true }, { id: 'b', name: 'Bruno', isActive: true }];
});

async function open() {
  fireEvent.click(screen.getByRole('button', { name: 'courses.substitute' }));
  await screen.findByRole('option', { name: 'Bruno' });
}

describe('SubstituteInstructor', () => {
  it('is not offered on an independent course the provider already teaches, unless an admin (it would be a dead end)', () => {
    const { container, unmount } = renderIt({ course: { venueId: null, instructorId: 'me' }, session: { instructorId: 'me' } });
    expect(container).toBeEmptyDOMElement();
    unmount();
    mocks.role = 'admin';
    renderIt({ course: { venueId: null, instructorId: 'me' }, session: { instructorId: 'me' } });
    expect(screen.getByRole('button', { name: 'courses.substitute' })).toBeInTheDocument();
  });

  it('is offered on a venue course to the venue staff', () => {
    renderIt();
    expect(screen.getByRole('button', { name: 'courses.substitute' })).toBeInTheDocument();
  });

  it('offers the other venue instructors and posts substitute with the reason', async () => {
    renderIt(); await open();
    expect(screen.queryByRole('option', { name: 'Anna' })).toBeNull();
    fireEvent.change(screen.getByLabelText('courses.instructorSelect'), { target: { value: 'b' } });
    fireEvent.change(screen.getByLabelText('courses.reason'), { target: { value: 'Anna is ill' } });
    fireEvent.click(screen.getByRole('button', { name: 'courses.substituteConfirm' }));
    await waitFor(() => expect(mocks.call).toHaveBeenCalledWith('manageCourseSession',
      { courseId: 'c1', sessionId: 's1', action: 'substitute', instructorId: 'b', reason: 'Anna is ill' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  });

  it('leaves the reason out when empty', async () => {
    renderIt(); await open();
    fireEvent.change(screen.getByLabelText('courses.instructorSelect'), { target: { value: 'b' } });
    fireEvent.click(screen.getByRole('button', { name: 'courses.substituteConfirm' }));
    await waitFor(() => expect(mocks.call).toHaveBeenCalled());
    expect(mocks.call.mock.calls[0][1]).not.toHaveProperty('reason');
  });

  it('keeps the confirm button off until an instructor is chosen', async () => {
    renderIt(); await open();
    expect(screen.getByRole('button', { name: 'courses.substituteConfirm' })).toBeDisabled();
  });

  it('shows instructor_overlap with the conflicting class', async () => {
    mocks.call.mockRejectedValue(Object.assign(new Error('instructor_overlap'),
      { details: { courseName: 'Yoga Mattina', startsAt: '2030-01-01T10:00:00.000Z' } }));
    renderIt(); await open();
    fireEvent.change(screen.getByLabelText('courses.instructorSelect'), { target: { value: 'b' } });
    fireEvent.click(screen.getByRole('button', { name: 'courses.substituteConfirm' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('courses.err.instructor_overlap');
    expect(alert).toHaveTextContent('Yoga Mattina');
  });

  it('an unlinked course offers only the provider themselves', async () => {
    renderIt({ course: { venueId: null, instructorId: null }, session: { instructorId: null } });
    fireEvent.click(screen.getByRole('button', { name: 'courses.substitute' }));
    expect(await screen.findByRole('option', { name: 'Me' })).toBeInTheDocument();
  });
});
