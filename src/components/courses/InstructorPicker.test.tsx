import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  links: [] as unknown[],
  search: vi.fn(),
  role: 'provider',
}));

vi.mock('@/lib/firebase/venueSpaces', () => ({ fetchVenueInstructorLinks: async () => mocks.links }));
vi.mock('@/lib/firebookings', () => ({ searchProviders: mocks.search }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (s: unknown) => unknown) =>
    select({ user: { uid: 'me', fullName: 'Marta Me', role: mocks.role }, firebaseUser: { uid: 'me' } }),
}));
vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, locale: 'en' }) }));

import { InstructorPicker, type InstructorValue } from './InstructorPicker';

function Harness({ venueId, initial, mode, onValue, currentInstructorId }: {
  venueId: string | null; initial?: InstructorValue; mode?: 'course' | 'substitute';
  onValue?: (v: InstructorValue) => void; currentInstructorId?: string | null;
}) {
  const [value, setValue] = useState<InstructorValue>(initial ?? { instructorId: null, name: '' });
  return <InstructorPicker venueId={venueId} value={value} mode={mode} currentInstructorId={currentInstructorId}
    onChange={(v) => { setValue(v); onValue?.(v); }} />;
}

const renderPicker = (props: Parameters<typeof Harness>[0]) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Harness {...props} />
  </QueryClientProvider>,
);

beforeEach(() => {
  mocks.links = [
    { id: 'a', name: 'Anna Rossi', isActive: true },
    { id: 'b', name: 'Bruno Neri', isActive: true },
    { id: 'c', name: 'Closed Coach', isActive: false },
  ];
  mocks.search.mockReset();
  mocks.role = 'provider';
});

describe('InstructorPicker, venue-linked', () => {
  it('offers the active linked instructors and "other"', async () => {
    renderPicker({ venueId: 'v1' });
    const select = await screen.findByLabelText('courses.instructorSelect');
    await screen.findByRole('option', { name: 'Anna Rossi' });
    expect(screen.getByRole('option', { name: 'Bruno Neri' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Closed Coach' })).toBeNull();
    expect(screen.getByRole('option', { name: 'courses.instructorOther' })).toBeInTheDocument();
    expect(select).toBeInTheDocument();
  });

  it('picking a linked instructor reports id and name', async () => {
    const onValue = vi.fn();
    renderPicker({ venueId: 'v1', onValue });
    await screen.findByRole('option', { name: 'Anna Rossi' });
    fireEvent.change(screen.getByLabelText('courses.instructorSelect'), { target: { value: 'a' } });
    expect(onValue).toHaveBeenLastCalledWith({ instructorId: 'a', name: 'Anna Rossi' });
    expect(screen.queryByLabelText('courses.instructor')).toBeNull();
  });

  it('"other" clears the id and shows a free-text name', async () => {
    const onValue = vi.fn();
    renderPicker({ venueId: 'v1', onValue, initial: { instructorId: 'a', name: 'Anna Rossi' } });
    await screen.findByRole('option', { name: 'Bruno Neri' });
    fireEvent.change(screen.getByLabelText('courses.instructorSelect'), { target: { value: '__other' } });
    expect(onValue).toHaveBeenLastCalledWith({ instructorId: null, name: '' });
    fireEvent.change(await screen.findByLabelText('courses.instructor'), { target: { value: 'Guest Coach' } });
    expect(onValue).toHaveBeenLastCalledWith({ instructorId: null, name: 'Guest Coach' });
  });

  it('starts on "other" for a course that only has a free-text name', async () => {
    renderPicker({ venueId: 'v1', initial: { instructorId: null, name: 'Guest Coach' } });
    expect(await screen.findByLabelText('courses.instructor')).toHaveValue('Guest Coach');
  });

  it('substitute mode has no "other" and leaves out the lesson\'s current instructor', async () => {
    renderPicker({ venueId: 'v1', mode: 'substitute', currentInstructorId: 'a' });
    await screen.findByRole('option', { name: 'Bruno Neri' });
    expect(screen.queryByRole('option', { name: 'courses.instructorOther' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Anna Rossi' })).toBeNull();
  });

  it('disables the controls when frozen', async () => {
    render(<QueryClientProvider client={new QueryClient()}>
      <InstructorPicker venueId="v1" disabled value={{ instructorId: 'a', name: 'Anna Rossi' }} onChange={vi.fn()} />
    </QueryClientProvider>);
    expect(await screen.findByLabelText('courses.instructorSelect')).toBeDisabled();
  });
});

describe('InstructorPicker, unlinked course', () => {
  it('a provider types a name and can link only their own profile', () => {
    const onValue = vi.fn();
    renderPicker({ venueId: null, onValue });
    fireEvent.change(screen.getByLabelText('courses.instructor'), { target: { value: 'Marta' } });
    expect(onValue).toHaveBeenLastCalledWith({ instructorId: null, name: 'Marta' });
    fireEvent.click(screen.getByLabelText('courses.linkMyself'));
    expect(onValue).toHaveBeenLastCalledWith({ instructorId: 'me', name: 'Marta' });
    expect(screen.queryByLabelText('courses.linkInstructor')).toBeNull();
    fireEvent.click(screen.getByLabelText('courses.linkMyself'));
    expect(onValue).toHaveBeenLastCalledWith({ instructorId: null, name: 'Marta' });
  });

  it('an admin searches registered instructors (debounced) and picks one', async () => {
    mocks.role = 'admin';
    mocks.search.mockResolvedValue([{ id: 'z', fullName: 'Zoe Verdi' }]);
    const onValue = vi.fn();
    renderPicker({ venueId: null, onValue });
    fireEvent.change(screen.getByLabelText('courses.linkInstructor'), { target: { value: 'zo' } });
    expect(mocks.search).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Zoe Verdi' }));
    expect(mocks.search).toHaveBeenCalledWith({ query: 'zo' });
    expect(onValue).toHaveBeenLastCalledWith({ instructorId: 'z', name: 'Zoe Verdi' });
    expect(screen.queryByLabelText('courses.linkMyself')).toBeNull();
  });

  it('substitute mode for a provider offers only themselves', async () => {
    const onValue = vi.fn();
    renderPicker({ venueId: null, mode: 'substitute', onValue });
    fireEvent.change(screen.getByLabelText('courses.instructorSelect'), { target: { value: 'me' } });
    await waitFor(() => expect(onValue).toHaveBeenLastCalledWith({ instructorId: 'me', name: 'Marta Me' }));
    expect(screen.queryByLabelText('courses.instructor')).toBeNull();
  });
});
