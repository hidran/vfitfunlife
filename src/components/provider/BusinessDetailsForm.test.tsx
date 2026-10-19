import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BusinessDetailsForm } from './BusinessDetailsForm';
import {
  EMPTY_BUSINESS_DETAILS,
  focusBusinessField,
  type BusinessDetailsErrors,
  type BusinessDetailsValues,
} from '@/lib/businessDetails';

function Harness({
  errors,
  onChange,
  mode,
  initial = EMPTY_BUSINESS_DETAILS,
}: {
  errors?: BusinessDetailsErrors;
  onChange?: (v: BusinessDetailsValues) => void;
  mode?: 'apply' | 'edit';
  initial?: BusinessDetailsValues;
}) {
  const [values, setValues] = useState(initial);
  return (
    <BusinessDetailsForm
      mode={mode}
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

  it('shows the legal name as the public name placeholder until one is typed', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const legal = screen.getByLabelText('Ragione sociale');
    const display = screen.getByLabelText('Nome pubblico') as HTMLInputElement;

    fireEvent.change(legal, { target: { value: 'Palestra Rossi S.r.l.' } });
    expect(display.value).toBe('');
    expect(display.placeholder).toBe('Palestra Rossi S.r.l.');

    fireEvent.change(display, { target: { value: 'Palestra Rossi' } });
    expect(display.value).toBe('Palestra Rossi');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ legalName: 'Palestra Rossi S.r.l.', displayName: 'Palestra Rossi' }));
  });

  it('normalises the P.IVA on blur', () => {
    render(<Harness />);
    const vat = screen.getByLabelText('Partita IVA') as HTMLInputElement;
    fireEvent.change(vat, { target: { value: 'IT 01234 567 897' } });
    fireEvent.blur(vat);
    expect(vat.value).toBe('01234567897');
  });

  it('exposes stable ids so a field can be focused by name', () => {
    render(<Harness />);
    expect(focusBusinessField('legalName')).toBe(true);
    expect(screen.getByLabelText('Ragione sociale')).toHaveFocus();
    expect(focusBusinessField('legalName', 'other-prefix')).toBe(false);
  });

  it('does not show the description at signup', () => {
    render(<Harness />);
    expect(screen.queryByLabelText('Descrizione (facoltativa)')).not.toBeInTheDocument();
  });

  describe('edit mode', () => {
    const stored: BusinessDetailsValues = {
      legalName: 'Palestra Rossi S.r.l.',
      vatNumber: '01234567897',
      displayName: 'Palestra Rossi',
      venueType: 'gym',
      address: 'Via Roma 1',
      city: 'Milano',
      website: '',
      description: '',
    };

    it('renders the admin-verified fields read-only with a hint, keeps the rest editable and adds a description', () => {
      const onChange = vi.fn();
      render(<Harness mode="edit" initial={stored} onChange={onChange} />);

      const legal = screen.getByLabelText('Ragione sociale') as HTMLInputElement;
      const vat = screen.getByLabelText('Partita IVA') as HTMLInputElement;
      const venue = screen.getByLabelText('Tipo di sede') as HTMLInputElement;
      const address = screen.getByLabelText('Indirizzo') as HTMLInputElement;
      for (const frozen of [legal, vat, venue, address]) {
        expect(frozen).toHaveAttribute('readonly');
        expect(frozen).not.toBeDisabled();
        expect(frozen).toHaveAccessibleDescription(/Verificato da un amministratore/);
      }
      expect(vat.value).toBe('01234567897');
      expect(venue.value).toBe('Palestra');

      // Typing into a frozen field changes nothing.
      fireEvent.change(vat, { target: { value: '99999999999' } });
      expect(onChange).not.toHaveBeenCalled();
      expect(vat.value).toBe('01234567897');

      const display = screen.getByLabelText('Nome pubblico') as HTMLInputElement;
      expect(display).not.toHaveAttribute('placeholder');
      expect(display).toHaveAccessibleDescription('Il nome mostrato ai clienti.');

      const description = screen.getByLabelText('Descrizione (facoltativa)');
      expect(description).not.toHaveAttribute('readonly');
      fireEvent.change(description, { target: { value: 'Dal 1990' } });
      expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ description: 'Dal 1990' }));

      fireEvent.change(screen.getByLabelText('Città'), { target: { value: 'Torino' } });
      expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ city: 'Torino' }));
    });

    it('keeps the city editable even when there are no fixed premises', () => {
      render(<Harness mode="edit" initial={{ ...stored, venueType: 'none', address: '' }} />);
      expect(screen.getByLabelText('Città')).not.toHaveAttribute('readonly');
      expect(screen.queryByLabelText('Indirizzo')).not.toBeInTheDocument();
    });
  });
});
