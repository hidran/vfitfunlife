import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ProviderTypeToggle } from './ProviderTypeToggle';

describe('ProviderTypeToggle keyboard model', () => {
  it('makes only the checked radio a tab stop', () => {
    const { rerender } = render(<ProviderTypeToggle value="individual" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Privato' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Azienda' })).toHaveAttribute('tabindex', '-1');

    rerender(<ProviderTypeToggle value="business" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Privato' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('radio', { name: 'Azienda' })).toHaveAttribute('tabindex', '0');
  });

  it.each(['ArrowRight', 'ArrowDown'])('%s selects the next option and moves focus to it', (key) => {
    const onChange = vi.fn();
    render(<ProviderTypeToggle value="individual" onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('radio', { name: 'Privato' }), { key });

    expect(onChange).toHaveBeenCalledWith('business');
    expect(screen.getByRole('radio', { name: 'Azienda' })).toHaveFocus();
  });

  it.each(['ArrowLeft', 'ArrowUp'])('%s selects the previous option, wrapping around', (key) => {
    const onChange = vi.fn();
    render(<ProviderTypeToggle value="individual" onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('radio', { name: 'Privato' }), { key });

    expect(onChange).toHaveBeenCalledWith('business');
  });

  it('wraps from the last option to the first on ArrowRight', () => {
    const onChange = vi.fn();
    render(<ProviderTypeToggle value="business" onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('radio', { name: 'Azienda' }), { key: 'ArrowRight' });

    expect(onChange).toHaveBeenCalledWith('individual');
    expect(screen.getByRole('radio', { name: 'Privato' })).toHaveFocus();
  });

  it('ignores other keys and a disabled group', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ProviderTypeToggle value="individual" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Privato' }), { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();

    rerender(<ProviderTypeToggle value="individual" onChange={onChange} disabled />);
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Privato' }), { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Home selects the first option and End the last', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ProviderTypeToggle value="business" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Azienda' }), { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith('individual');
    expect(screen.getByRole('radio', { name: 'Privato' })).toHaveFocus();

    rerender(<ProviderTypeToggle value="individual" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Privato' }), { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('business');
    expect(screen.getByRole('radio', { name: 'Azienda' })).toHaveFocus();
  });

  it.each(['altKey', 'metaKey', 'ctrlKey', 'shiftKey'])(
    'leaves arrow keys with %s held to the browser (no selection, not prevented)',
    (modifier) => {
      const onChange = vi.fn();
      render(<ProviderTypeToggle value="individual" onChange={onChange} />);

      const notPrevented = fireEvent.keyDown(screen.getByRole('radio', { name: 'Privato' }), {
        key: 'ArrowLeft',
        [modifier]: true,
      });

      expect(notPrevented).toBe(true);
      expect(onChange).not.toHaveBeenCalled();
    },
  );

  it('prevents the default of a handled arrow key (no page scroll)', () => {
    render(<ProviderTypeToggle value="individual" onChange={() => {}} />);
    const notPrevented = fireEvent.keyDown(screen.getByRole('radio', { name: 'Privato' }), { key: 'ArrowDown' });
    expect(notPrevented).toBe(false);
  });
});
