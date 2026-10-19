import { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useBusinessDetails } from './useBusinessDetails';
import { BusinessDetailsForm } from '@/components/provider/BusinessDetailsForm';

type Api = ReturnType<typeof useBusinessDetails>;

function Harness({ disabled, expose }: { disabled: boolean; expose: (api: Api) => void }) {
  const business = useBusinessDetails('t', { disabled });
  expose(business);
  return (
    <BusinessDetailsForm
      idPrefix="t"
      values={business.values}
      onChange={business.setValues}
      errors={business.errors}
      onClearError={business.clearError}
      disabled={disabled}
    />
  );
}

function Toggle({ expose, setDisabled }: { expose: (api: Api) => void; setDisabled: (fn: (d: boolean) => void) => void }) {
  const [disabled, set] = useState(false);
  setDisabled(set);
  return <Harness disabled={disabled} expose={expose} />;
}

describe('useBusinessDetails', () => {
  it('validate() shows errors, focuses the first bad field and returns null; valid input returns the payload', () => {
    let api!: Api;
    render(<Harness disabled={false} expose={(a) => { api = a; }} />);

    let result: unknown;
    act(() => { result = api.validate(); });
    expect(result).toBeNull();
    expect(screen.getByLabelText('Ragione sociale')).toHaveFocus();
    expect(screen.getByLabelText('Ragione sociale')).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(screen.getByLabelText('Ragione sociale'), { target: { value: 'Palestra Rossi S.r.l.' } });
    expect(screen.getByLabelText('Ragione sociale')).not.toHaveAttribute('aria-invalid');
    fireEvent.change(screen.getByLabelText('Partita IVA'), { target: { value: '01234567897' } });
    fireEvent.change(screen.getByLabelText('Tipo di sede'), { target: { value: 'none' } });

    act(() => { result = api.validate(); });
    expect(result).toEqual({
      legalName: 'Palestra Rossi S.r.l.',
      vatNumber: '01234567897',
      displayName: 'Palestra Rossi S.r.l.',
      venueType: 'none',
    });
  });

  it('applyServerError() puts the message under its field and defers focus until the inputs are enabled', () => {
    let api!: Api;
    let setDisabled!: (d: boolean) => void;
    render(<Toggle expose={(a) => { api = a; }} setDisabled={(fn) => { setDisabled = fn; }} />);

    act(() => setDisabled(true));
    expect(screen.getByLabelText('Partita IVA')).toBeDisabled();

    let key: string | undefined;
    act(() => {
      key = api.applyServerError(Object.assign(new Error('business_vat_taken'), { code: 'functions/already-exists' }));
    });
    expect(key).toBe('provider.business.error.vatTaken');
    expect(screen.getByLabelText('Partita IVA')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Partita IVA')).not.toHaveFocus();

    act(() => setDisabled(false));
    expect(screen.getByLabelText('Partita IVA')).toHaveFocus();
  });

  it('returns the generic message for an unknown failure without touching any field', () => {
    let api!: Api;
    render(<Harness disabled={false} expose={(a) => { api = a; }} />);
    const spy = vi.fn();
    act(() => spy(api.applyServerError(new Error('boom'))));
    expect(spy).toHaveBeenCalledWith('provider.card.error');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
