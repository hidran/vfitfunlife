import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AvailabilityEditor, nextSlotDefault, problemDays } from './AvailabilityEditor';
import { toSettings } from '@/lib/availability/adapter';

const { settings } = toSettings({
  schedule: [{ dayOfWeek: 1, startTime: '09:00', endTime: '12:00', isAvailable: true }],
  bookingRules: null,
  overrides: [{ date: '2026-12-24', isAvailable: false, windows: [] }],
});

describe('AvailabilityEditor date exceptions', () => {
  it('edits custom hours for an exception and saves them', () => {
    const onSave = vi.fn();
    render(<AvailabilityEditor settings={settings} onSave={onSave} />);

    fireEvent.click(screen.getByText('Eccezioni date'));
    fireEvent.click(screen.getByLabelText('Orari personalizzati'));
    // Switching to custom hours seeds one 09:00–17:00 range; move its end to 13:00.
    const [, end] = screen.getAllByRole('combobox'); // [start, end] of that range come first
    fireEvent.change(end, { target: { value: '13:00' } });
    fireEvent.click(screen.getByText('Salva impostazioni disponibilità'));

    expect(onSave.mock.calls[0][0].dateOverrides[0]).toMatchObject({
      date: '2026-12-24',
      isAvailable: true,
      slots: [{ start: '09:00', end: '13:00' }],
    });
  });

  it('does not add a second exception for the same date', () => {
    const { container } = render(<AvailabilityEditor settings={settings} onSave={vi.fn()} />);
    fireEvent.click(screen.getByText('Eccezioni date'));
    fireEvent.change(container.querySelector('input[type="date"]')!, { target: { value: '2026-12-24' } });
    fireEvent.click(screen.getByRole('button', { name: /Aggiungi$/ }));

    expect(screen.getAllByPlaceholderText('Motivo (opzionale)')).toHaveLength(1);
  });
});

describe('nextSlotDefault', () => {
  it('defaults the first window of a day to 09:00-17:00', () => {
    expect(nextSlotDefault([])).toEqual({ start: '09:00', end: '17:00' });
  });

  it('starts a new window where the previous one ended, one hour long', () => {
    expect(nextSlotDefault([{ start: '09:00', end: '12:00' }])).toEqual({ start: '12:00', end: '13:00' });
  });

  it('clamps to the last selectable time instead of overflowing past midnight', () => {
    expect(nextSlotDefault([{ start: '09:00', end: '23:00' }])).toEqual({ start: '23:00', end: '23:30' });
  });
});

describe('problemDays', () => {
  const week = (overrides: Record<string, { isAvailable: boolean; slots: { start: string; end: string }[] }>) =>
    ({
      sunday: { isAvailable: false, slots: [] },
      monday: { isAvailable: false, slots: [] },
      tuesday: { isAvailable: false, slots: [] },
      wednesday: { isAvailable: false, slots: [] },
      thursday: { isAvailable: false, slots: [] },
      friday: { isAvailable: false, slots: [] },
      saturday: { isAvailable: false, slots: [] },
      ...overrides,
    }) as any;

  it('flags a window whose end is at or before its start', () => {
    expect(problemDays(week({ monday: { isAvailable: true, slots: [{ start: '12:00', end: '09:00' }] } })))
      .toEqual(new Set(['monday']));
  });

  it('flags two overlapping windows on the same day', () => {
    const slots = [{ start: '09:00', end: '12:00' }, { start: '11:00', end: '13:00' }];
    expect(problemDays(week({ tuesday: { isAvailable: true, slots } }))).toEqual(new Set(['tuesday']));
  });

  it('ignores a switched-off day and a well-formed one', () => {
    expect(problemDays(week({
      monday: { isAvailable: false, slots: [{ start: '12:00', end: '09:00' }] }, // off: not checked
      tuesday: { isAvailable: true, slots: [{ start: '09:00', end: '12:00' }, { start: '12:00', end: '13:00' }] },
    }))).toEqual(new Set());
  });
});

describe('AvailabilityEditor weekly schedule validation', () => {
  it("adding a slot doesn't duplicate the default and overlap it — it starts where the last one ends", () => {
    render(<AvailabilityEditor settings={settings} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Lunedì/ }));
    fireEvent.click(screen.getByText('Aggiungi fascia'));

    // Monday's two time-range selects come before the always-visible buffer/notice selects.
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    // Monday started with one 09:00-12:00 window; the new one should pick up from there.
    expect(selects.slice(0, 4).map((s) => s.value)).toEqual(['09:00', '12:00', '12:00', '13:00']);
  });

  it('disables Save and marks the day when a window is invalid, and explains why', () => {
    const bad = toSettings({
      schedule: [{ dayOfWeek: 1, startTime: '12:00', endTime: '09:00', isAvailable: true }],
      bookingRules: null,
      overrides: [],
    }).settings;
    render(<AvailabilityEditor settings={bad} onSave={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Salva impostazioni disponibilità' })).toBeDisabled();
    expect(screen.getByText('Correggi gli orari evidenziati prima di salvare.')).toBeInTheDocument();
  });

  it('clamps maxBookingsPerDay to the valid range instead of accepting a value the server would reject', () => {
    render(<AvailabilityEditor settings={settings} onSave={vi.fn()} />);
    const input = screen.getByDisplayValue(String(settings.maxBookingsPerDay)) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '999' } });
    expect(input.value).toBe('50');

    fireEvent.change(input, { target: { value: '0' } });
    expect(input.value).toBe('1');
  });
});
