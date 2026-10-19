import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ProviderTypeChoice } from './ProviderTypeChoice';
import type { ProviderType } from '@/types/firebase';

function Harness({ onChange }: { onChange?: (value: ProviderType) => void }) {
  const [value, setValue] = useState<ProviderType>('individual');
  return (
    <ProviderTypeChoice
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe('ProviderTypeChoice', () => {
  it('is a labelled group of two radios, individual first and selected', () => {
    render(<Harness />);

    const group = screen.getByRole('group', { name: 'Offri i servizi come' });
    expect(group).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(screen.getByRole('radio', { name: 'Singolo professionista' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Azienda o associazione' })).not.toBeChecked();
    // One shared name: the browser treats them as one group (one tab stop, arrow keys).
    expect(radios[0]).toHaveAttribute('name', radios[1].getAttribute('name')!);
  });

  it('switches with a click', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: 'Azienda o associazione' }));

    expect(onChange).toHaveBeenLastCalledWith('business');
    expect(screen.getByRole('radio', { name: 'Azienda o associazione' })).toBeChecked();
  });

  it('moves between the options with the arrow keys', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);

    await user.tab();
    const individual = screen.getByRole('radio', { name: 'Singolo professionista' });
    const business = screen.getByRole('radio', { name: 'Azienda o associazione' });
    expect(individual).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(business).toBeChecked();
    expect(business).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith('business');

    await user.keyboard('{ArrowLeft}');
    expect(individual).toBeChecked();
    expect(onChange).toHaveBeenLastCalledWith('individual');
  });

  it('can be disabled', () => {
    render(<ProviderTypeChoice value="individual" onChange={vi.fn()} disabled />);
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
  });
});
