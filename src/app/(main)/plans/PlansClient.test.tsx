import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { makeQueryClientWrapper } from '@/test-utils/queryClientWrapper';

vi.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (k: string) => k, locale: 'it' }) }));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { uid: 'cust-1' } }),
}));

const plan = (id: string, clientId: string, title: string, exercise: string) => ({
  id, clientId, title, status: 'published', durationWeeks: 1, daysPerWeek: 1, source: 'manual',
  weeks: [{ weekNumber: 1, days: [{ label: 'Giorno A', exercises: [{ name: exercise, sets: 3, reps: '10' }] }] }],
});

const getMyWorkoutPlans = vi.fn();
const getPlanProgress = vi.fn();
vi.mock('@/lib/firebase/workoutPlans', () => ({
  getMyWorkoutPlans: (...a: unknown[]) => getMyWorkoutPlans(...a),
  getExerciseLibrary: async () => ({}),
  getPlanProgress: (...a: unknown[]) => getPlanProgress(...a),
  saveDayProgress: vi.fn(),
  weekCompletion: () => ({ done: 0, total: 1 }),
}));

import PlansClient from './PlansClient';

describe('PlansClient plan selector', () => {
  beforeEach(() => {
    getMyWorkoutPlans.mockReset();
    getPlanProgress.mockReset().mockResolvedValue({});
  });

  it('shows no selector with a single plan', async () => {
    getMyWorkoutPlans.mockResolvedValue([plan('p1', 'c1', 'Solo', 'Squat')]);
    render(<PlansClient />, { wrapper: makeQueryClientWrapper().wrapper });
    expect(await screen.findByRole('heading', { name: 'Solo' })).toBeTruthy();
    expect(screen.queryByRole('tablist', { name: 'plans.choosePlan' })).toBeNull();
  });

  it('lets the client switch between published plans, loading each plan\'s progress', async () => {
    // Same plan id under two trainers: selection must be keyed by clientId + id.
    getMyWorkoutPlans.mockResolvedValue([
      plan('p1', 'c1', 'Nuovo blocco', 'Squat'),
      plan('p1', 'c2', 'Blocco precedente', 'Panca'),
    ]);
    render(<PlansClient />, { wrapper: makeQueryClientWrapper().wrapper });

    expect(await screen.findByRole('heading', { name: 'Nuovo blocco' })).toBeTruthy();
    expect(screen.getByText('Squat')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Blocco precedente' }));

    expect(await screen.findByRole('heading', { name: 'Blocco precedente' })).toBeTruthy();
    expect(screen.getByText('Panca')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Blocco precedente' }).getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(getPlanProgress).toHaveBeenCalledWith('c2', 'p1'));
  });

  it('shows the saved RPE of the selected plan, even though progress loads after first render', async () => {
    getMyWorkoutPlans.mockResolvedValue([
      plan('p1', 'c1', 'Nuovo blocco', 'Squat'),
      plan('p2', 'c1', 'Blocco precedente', 'Panca'),
    ]);
    getPlanProgress.mockImplementation(async (_c: string, planId: string) =>
      planId === 'p2'
        ? { 'p2__w1__Giorno_A': { id: 'p2__w1__Giorno_A', planId: 'p2', weekNumber: 1, dayLabel: 'Giorno A', exercises: {}, rpe: 6, notes: 'Bene' } }
        : {});
    render(<PlansClient />, { wrapper: makeQueryClientWrapper().wrapper });

    await screen.findByRole('heading', { name: 'Nuovo blocco' });
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('');

    fireEvent.click(screen.getByRole('tab', { name: 'Blocco precedente' }));
    await waitFor(() => expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('6'));
    expect((screen.getByPlaceholderText('plans.sessionNotes') as HTMLTextAreaElement).value).toBe('Bene');
  });
});
