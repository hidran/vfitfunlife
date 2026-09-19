import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AvailabilityEditor } from './AvailabilityEditor';
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
