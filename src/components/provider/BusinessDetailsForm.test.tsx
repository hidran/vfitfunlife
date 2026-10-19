import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BusinessDetailsForm, focusFirstBusinessError } from './BusinessDetailsForm';
import { EMPTY_BUSINESS_DETAILS, type BusinessDetailsErrors, type BusinessDetailsValues } from '@/lib/businessDetails';

function Harness({ errors, onChange }: { errors?: BusinessDetailsErrors; onChange?: (v: BusinessDetailsValues) => void }) {
  const [values, setValues] = useState(EMPTY_BUSINESS_DETAILS);
  return (
    <BusinessDetailsForm
      values={values}
      errors={errors}
      onChange={(v) => {
        setValues(v);
        onChange?.(v);
      }}
    />
  );
}

describe('BusinessDetailsForm', () => {
  it('renders every company field with the venue type defaulting to gym', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Ragione sociale')).toBeInTheDocument();
    expect(screen.getByLabelText('Partita IVA')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome pubblico')).toBeInTheDocument();
    expect((screen.getByLabelText('Tipo di sede') as HTMLSelectElement).value).toBe('gym');
    expect(screen.getByLabelText('Indirizzo')).toBeInTheDocument();
    expect(screen.getByLabelText('Città')).toBeInTheDocument();
    expect(screen.getByLabelText('Sito web (facoltativo)')).toBeInTheDocument();
  });

  it('hides address and city when there are no fixed premises', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Tipo di sede'), { target: { value: 'none' } });
    expect(screen.queryByLabelText('Indirizzo')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Città')).not.toBeInTheDocument();
  });

  it('shows an inline error tied to the input', () => {
    render(<Harness errors={{ vatNumber: 'provider.business.error.vatInvalid' }} />);
    const vat = screen.getByLabelText('Partita IVA');
    expect(vat).toHaveAttribute('aria-invalid', 'true');
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent(/Partita IVA non valida/);
    expect(vat.getAttribute('aria-describedby')).toContain(error.id);
  });

  it('keeps the public name equal to the legal name until it is edited', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const legal = screen.getByLabelText('Ragione sociale');
    const display = screen.getByLabelText('Nome pubblico') as HTMLInputElement;

    fireEvent.change(legal, { target: { value: 'Palestra Rossi S.r.l.' } });
    expect(display.value).toBe('Palestra Rossi S.r.l.');

    fireEvent.change(display, { target: { value: 'Palestra Rossi' } });
    fireEvent.change(legal, { target: { value: 'Palestra Rossi & C. S.r.l.' } });
    expect(display.value).toBe('Palestra Rossi');

    // Emptied, it follows the legal name again.
    fireEvent.change(display, { target: { value: '' } });
    expect(display.value).toBe('Palestra Rossi & C. S.r.l.');
  });

  it('normalises the P.IVA on blur', () => {
    render(<Harness />);
    const vat = screen.getByLabelText('Partita IVA') as HTMLInputElement;
    fireEvent.change(vat, { target: { value: 'IT 01234 567 897' } });
    fireEvent.blur(vat);
    expect(vat.value).toBe('01234567897');
  });

  it('focuses the first field in error', () => {
    render(<Harness errors={{ city: 'provider.business.error.cityRequired', legalName: 'provider.business.error.legalNameRequired' }} />);
    expect(focusFirstBusinessError({ city: 'provider.business.error.cityRequired', legalName: 'provider.business.error.legalNameRequired' })).toBe(true);
    expect(screen.getByLabelText('Ragione sociale')).toHaveFocus();
    expect(focusFirstBusinessError({})).toBe(false);
  });
});
