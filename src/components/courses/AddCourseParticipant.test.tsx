import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AddCourseParticipant } from './AddCourseParticipant';
import type { Course, CourseSession } from '@/types/course';
const mocks = vi.hoisted(() => ({ clients: vi.fn(), create: vi.fn(), call: vi.fn() }));
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, locale: 'en' }) }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: (select: (s: unknown) => unknown) => select({ firebaseUser: { uid: 'p' } }) }));
vi.mock('@/lib/firebase/provider', () => ({ getProviderClients: mocks.clients }));
vi.mock('@/lib/firebase/functions', () => ({ createClientAccount: mocks.create }));
vi.mock('@/lib/firebase/courses', () => ({ courseCall: mocks.call }));
const course = { id: 'c', lessonPriceCents: 1000, seriesPriceCents: 5000 } as Course;
function mount(value = course) {
  const onAdded = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AddCourseParticipant course={value} session={{ id: 's' } as CourseSession} onAdded={onAdded} />
  </QueryClientProvider>);
  return onAdded;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.clients.mockResolvedValue([{ userId: 'u', name: 'Anna', email: 'anna@example.com' }]);
  mocks.create.mockResolvedValue({ client: { userId: 'new' } });
  mocks.call.mockResolvedValue({ enrollmentId: 'e' });
});
describe('provider adds course participants', () => {
  it('searches linked clients and enrolls the selected identity', async () => {
    const added = mount();
    await waitFor(() => expect(mocks.clients).toHaveBeenCalled());
    fireEvent.focus(screen.getByRole('combobox', { name: 'courses.participant' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Anna · anna@example.com' }));
    fireEvent.click(screen.getByRole('button', { name: 'courses.addParticipant' }));
    await waitFor(() => expect(added).toHaveBeenCalled());
    expect(mocks.call).toHaveBeenCalledWith('enrollCourseParticipant', expect.objectContaining({ userId: 'u', courseId: 'c', sessionId: 's', scope: 'lesson' }));
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('accepts just full name and email, with optional notifications after booking', async () => {
    const added = mount();
    fireEvent.click(screen.getByRole('button', { name: 'courses.newParticipant' }));
    fireEvent.change(screen.getByLabelText('courses.participantName'), { target: { value: 'Anna Smith' } });
    fireEvent.change(screen.getByLabelText('courses.participantEmail'), { target: { value: 'anna@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'courses.addParticipant' }));
    await waitFor(() => expect(added).toHaveBeenCalled());
    expect(mocks.create).toHaveBeenCalledWith({ fullName: 'Anna Smith', email: 'anna@example.com', notifyByEmail: false });
    expect(mocks.call).toHaveBeenCalledWith('enrollCourseParticipant', expect.objectContaining({ userId: 'new' }));
    expect(screen.getByRole('button', { name: 'courses.inviteEmail' })).toBeVisible();
  });
  it('retains the created identity after a full-class failure and retries without creating it again', async () => {
    mount();
    mocks.call.mockRejectedValueOnce(new Error('session_full'));
    fireEvent.click(screen.getByRole('button', { name: 'courses.newParticipant' }));
    fireEvent.change(screen.getByLabelText('courses.participantName'), { target: { value: 'Anna Smith' } });
    fireEvent.change(screen.getByLabelText('courses.participantEmail'), { target: { value: 'anna@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'courses.addParticipant' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('courses.full');
    fireEvent.click(screen.getByRole('button', { name: 'courses.addParticipant' }));
    await screen.findByText('courses.participantAdded');
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.call.mock.calls[1][1].requestId).toBe(mocks.call.mock.calls[0][1].requestId);
  });
  it('discards a cached identity when new-participant details change after a failed reservation', async () => {
    mount(); mocks.call.mockRejectedValueOnce(new Error('session_full'));
    fireEvent.click(screen.getByRole('button', { name: 'courses.newParticipant' }));
    fireEvent.change(screen.getByLabelText('courses.participantName'), { target: { value: 'Anna Smith' } });
    fireEvent.change(screen.getByLabelText('courses.participantEmail'), { target: { value: 'anna@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'courses.addParticipant' }));
    await screen.findByRole('alert');
    mocks.create.mockResolvedValueOnce({ client: { userId: 'bob' } });
    fireEvent.change(screen.getByLabelText('courses.participantEmail'), { target: { value: 'bob@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'courses.addParticipant' }));
    await screen.findByText('courses.participantAdded');
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.call.mock.calls[1][1].userId).toBe('bob');
  });
  it('defaults to whole-course booking for a series-only course', () => {
    mount({ ...course, lessonPriceCents: null });
    expect(screen.getByRole('combobox', { name: 'courses.reservationType' })).toHaveValue('series');
  });
});
