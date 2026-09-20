import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { NoHoursBanner } from './NoHoursBanner';

describe('NoHoursBanner', () => {
  it('tells an unreviewed provider they are bookable on the default hours', () => {
    render(<NoHoursBanner kind="review" />);
    const link = screen.getByRole('link', { name: /Sei prenotabile lun–ven 9:00–17:00/ });
    expect(link).toHaveAttribute('href', '/provider/availability');
  });

  it('warns a provider who switched every day off that they cannot receive bookings', () => {
    render(<NoHoursBanner kind="allOff" />);
    const link = screen.getByRole('link', { name: /Hai disattivato tutti gli orari/ });
    expect(link).toHaveAttribute('href', '/provider/availability');
  });
});
