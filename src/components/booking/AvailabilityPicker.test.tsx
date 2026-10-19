import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AvailabilityPicker } from './AvailabilityPicker';
import type { TimeSlot } from '@/types/booking';

const onSelectDate = vi.fn();
const onSelectTime = vi.fn();
const onMonthChange = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 5, 12));
  onSelectDate.mockClear();
  onSelectTime.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

function renderPicker(bookableDays: Record<string, boolean> | undefined, isCheckingDays: boolean) {
  return render(
    <AvailabilityPicker
      availability={[]}
      selectedDate={null}
      selectedTime={null}
      onSelectDate={onSelectDate}
      onSelectTime={onSelectTime}
      bookableDays={bookableDays}
      isCheckingDays={isCheckingDays}
      onMonthChange={onMonthChange}
    />,
  );
}

describe('AvailabilityPicker progressive day loading', () => {
  it('allows an unknown future date to be selected while availability checks are still running', () => {
    renderPicker({ '2026-10-06': true }, true);

    const date = screen.getAllByRole('button', { name: /^7$/ }).find((button) => !button.hasAttribute('disabled'));
    expect(date).toBeDefined();
    expect(date).toBeEnabled();
    expect(date).toHaveAttribute('aria-busy', 'true');

    fireEvent.click(date!);
    expect(onSelectDate).toHaveBeenCalledWith(new Date(2026, 9, 7));
  });

  it('disables a date once its availability check confirms there are no slots', () => {
    renderPicker({ '2026-10-06': true, '2026-10-07': false }, true);

    const sixth = screen.getAllByRole('button', { name: /^6$/ });
    const seventh = screen.getAllByRole('button', { name: /^7$/ });
    expect(sixth[0]).toBeEnabled();
    expect(seventh[0]).toBeDisabled();
  });

  it('opens a loading sheet immediately and closes it after a time is selected', () => {
    const selectedDate = new Date(2026, 9, 7);
    const slot: TimeSlot = { time: '10:30', isAvailable: true, isBooked: false };
    const view = renderPicker({ '2026-10-06': true }, true);

    fireEvent.click(screen.getAllByRole('button', { name: /^7$/ })[0]);
    expect(onSelectDate).toHaveBeenCalledWith(selectedDate);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();

    view.rerender(
      <AvailabilityPicker
        availability={[]}
        selectedDate={selectedDate}
        selectedTime={null}
        onSelectDate={onSelectDate}
        onSelectTime={onSelectTime}
        isLoading
        bookableDays={{ '2026-10-06': true }}
        isCheckingDays
      />,
    );
    view.rerender(
      <AvailabilityPicker
        availability={[slot]}
        selectedDate={selectedDate}
        selectedTime={null}
        onSelectDate={onSelectDate}
        onSelectTime={onSelectTime}
        bookableDays={{ '2026-10-06': true }}
        isCheckingDays
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '10:30' }));
    expect(onSelectTime).toHaveBeenCalledWith('10:30');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
